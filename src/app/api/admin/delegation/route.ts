// 委任の設定API（指示書183）— **院長（app_metadata.role === "admin"）のみ**
//   GET → { items: [...], karte: {...}, roster, deepResearchLimit }
//   PUT { items?, karte?, deepResearchLimit? } → 保存（送られた分だけ）
//
// 226 §3: ディープリサーチの月の上限（初期値30）も**院長だけ**がここで変える。
//   保存先はサーバー専用キー deep_research_config（/api/content-store からは触れない）。
//
// 【自己昇格の防止（183 B-4）】
// このルートは requireAdmin（app_metadata.role）だけを通す。requireAdminItem は使わない＝
// どの項目を委任された幹部でも、ここには一切到達できない（proxy でも "delegation" は院長のみ）。
// 委任できない項目（delegable: false）は、送られてきても保存しない。
// 担当スタッフに幹部自身は入れない（自分のカルテは見られない・A-2）。

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  loadDelegationSnapshot,
  saveItemDelegation,
  saveKarteAssignment,
} from "@/lib/admin-delegation-server";
import { ADMIN_ITEMS, findAdminItem } from "@/lib/admin-items";
import {
  loadDeepResearchLimit,
  saveDeepResearchLimit,
} from "@/lib/deep-research/quota-server";
import { deepResearchDelegationReason, normalizeLimit } from "@/lib/deep-research/quota";
import { loadProfilesIndexServer } from "@/lib/staff-growth-roster-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { mixedSeedAssignment } from "@/lib/test-seed";
import { authorizeGrowth, recordGrowthLog } from "@/lib/staff-growth-server";

export const runtime = "nodejs";

type Roster = { userId: string; name: string; isAdmin: boolean; retired: boolean; testSeed?: boolean }[];

/** 名簿（有効なアカウントのみ・氏名はプロフィール→表示名の順） */
async function loadRoster(): Promise<Roster> {
  const out = new Map<string, Roster[number]>();
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users ?? []) {
      const meta = u.user_metadata as Record<string, unknown> | null;
      const app = u.app_metadata as Record<string, unknown> | null;
      const until = (u as { banned_until?: string | null }).banned_until;
      out.set(u.id, {
        userId: u.id,
        name: (typeof meta?.display_name === "string" && meta.display_name.trim()) || u.email || "名前未設定",
        isAdmin: app?.role === "admin",
        retired: !!until && new Date(until).getTime() > Date.now(),
        // 191 B: 検証用（担当指定の候補から外す。検証用どうしの指定は除く）
        ...(app?.test_seed === true ? { testSeed: true } : {}),
      });
    }
  } catch {
    /* 名簿が取れないときはプロフィールだけ */
  }
  for (const p of await loadProfilesIndexServer()) {
    const cur = out.get(p.userId);
    if (cur) cur.name = p.name || cur.name;
    else out.set(p.userId, { userId: p.userId, name: p.name || "名前未設定", isAdmin: false, retired: false });
  }
  return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const [snap, roster, deepResearchLimit] = await Promise.all([
    loadDelegationSnapshot(),
    loadRoster(),
    loadDeepResearchLimit(),
  ]);
  return NextResponse.json({
    items: ADMIN_ITEMS.map((i) => ({
      key: i.key,
      label: i.label,
      href: i.href,
      delegable: i.delegable,
      // 226 §1: ディープリサーチの説明に、設定してある上限の数字を出す
      reason:
        i.key === "deep-research"
          ? deepResearchDelegationReason(deepResearchLimit)
          : i.reason,
      userIds: snap.items[i.key] ?? [],
    })),
    karte: snap.karte,
    roster,
    deepResearchLimit,
  });
}

function idList(v: unknown): string[] {
  return Array.isArray(v)
    ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && x.trim() !== "")))
    : [];
}

export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  let body: { items?: unknown; karte?: unknown; deepResearchLimit?: unknown };
  try {
    body = (await req.json()) as {
      items?: unknown;
      karte?: unknown;
      deepResearchLimit?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const by = auth.user.email || auth.user.id;
  const before = await loadDelegationSnapshot();
  const changes: { field: string; before: string; after: string }[] = [];
  const rejected: string[] = [];
  /** 207: 検証用と実在が混ざっていて保存しなかった幹部 */
  const rejectedKarte: string[] = [];

  if (body.items && typeof body.items === "object") {
    for (const [key, raw] of Object.entries(body.items as Record<string, unknown>)) {
      const item = findAdminItem(key);
      if (!item || !item.delegable) {
        rejected.push(key); // 🔒の項目は保存しない
        continue;
      }
      const ids = idList(raw);
      const ok = await saveItemDelegation(key, ids, by);
      if (!ok) return NextResponse.json({ error: `${item.label} の保存に失敗しました` }, { status: 500 });
      const prev = before.items[key] ?? [];
      if ([...prev].sort().join() !== [...ids].sort().join()) {
        changes.push({ field: `管理画面「${item.label}」を開ける幹部`, before: `${prev.length}人`, after: `${ids.length}人` });
      }
    }
  }

  if (body.karte && typeof body.karte === "object") {
    // 207-1/207-5: 検証用と実在の組み合わせは**ここで**断る（画面の絞り込みだけに頼らない）。
    //   ・🧪 検証用の幹部には 🧪 検証用のスタッフだけ
    //   ・実在の幹部に 🧪 検証用のスタッフは付けられない
    //   名簿に無いidは、検証用の幹部に対しては通さない（確かめられないものは許可しない）。
    const testOf = new Map((await loadRoster()).map((r) => [r.userId, r.testSeed === true]));
    for (const [managerId, raw] of Object.entries(body.karte as Record<string, unknown>)) {
      if (!managerId) continue;
      const ids = idList(raw).filter((id) => id !== managerId);
      const mixed = mixedSeedAssignment(managerId, ids, testOf);
      if (mixed.length > 0) {
        rejectedKarte.push(managerId);
        continue;
      }
      const ok = await saveKarteAssignment(managerId, ids, by);
      if (!ok) return NextResponse.json({ error: "担当スタッフの保存に失敗しました" }, { status: 500 });
      const prev = before.karte[managerId] ?? [];
      if ([...prev].sort().join() !== [...ids].sort().join()) {
        changes.push({ field: "可能性ノートの担当スタッフ（幹部1人分）", before: `${prev.length}人`, after: `${ids.length}人` });
      }
    }
  }

  // 226 §3: ディープリサーチの月の上限（院長だけが変えられる）
  if (body.deepResearchLimit !== undefined) {
    const prev = await loadDeepResearchLimit();
    const next = normalizeLimit(body.deepResearchLimit);
    if (next !== prev) {
      await saveDeepResearchLimit(next);
      changes.push({
        field: "ディープリサーチの月の上限（任された幹部1人あたり）",
        before: `${prev}回`,
        after: `${next}回`,
      });
    }
  }

  // 操作ログ（本文＝誰を指名したかは残さず、件数だけ）。テーブル未作成なら記録できない（サーバーログのみ）
  if (changes.length > 0) {
    const g = await authorizeGrowth();
    if (g.ok) {
      await recordGrowthLog(g.admin, { by, action: "設定変更", kind: "権限設定", target: "委任", changes });
    }
  }

  const [after, deepResearchLimit] = await Promise.all([
    loadDelegationSnapshot(),
    loadDeepResearchLimit(),
  ]);
  return NextResponse.json({
    ok: true,
    items: after.items,
    karte: after.karte,
    deepResearchLimit,
    rejected,
    rejectedKarte,
    ...(rejectedKarte.length > 0
      ? { error: "🧪 検証用の幹部には 🧪 検証用のスタッフだけを指定できます（実在のスタッフとは組み合わせられません）" }
      : {}),
  });
}
