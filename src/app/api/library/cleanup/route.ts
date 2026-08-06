// 資料庫のお掃除API（指示書147・管理者のみ）
// GET  : 重複候補をスキャンしてグループで返す（判定は決定的ルールのみ・AI不使用）
// POST : { action: "delete", docIds }  承認された分だけ削除（レコード＋Storage実体・復元不可）
//        { action: "dismiss", docIds } 「重複ではない」を記憶して以後候補から外す
//
// 重要な設計:
// - **承認なしの自動削除は絶対にしない**。GET は一切データを変更しない。
// - 削除は「レコード＋Storage実体」の両方（孤児ゼロ・132の原則）。既存の
//   /api/library/manage の delete は復元用に実体を残すが、お掃除は実体も消すため
//   別経路にしてある（＝お掃除での削除は復元できない）。
// - Storage の実体は「残る資料から参照されていないこと」を確認してから消す。

import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "@/lib/supabase-admin";
import { loadProfileServer, getSessionUser } from "@/lib/staff-profiles-server";
import { STAFF_PHOTOS_BUCKET } from "@/lib/staff-profiles";
import { appendLog, loadStore, saveStore } from "@/lib/library-server";
import { LIBRARY_PATH_PREFIX, type LibraryDoc } from "@/lib/library";
import {
  buildCleanupGroups,
  metaScoreOf,
  pairKey,
  type CleanupMember,
} from "@/lib/library-cleanup";
import {
  serverGetContentRow,
  serverPutContentRow,
} from "@/lib/content-store-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export const CLEANUP_DISMISSED_KEY = "library_cleanup_dismissed";
/** 実体ハッシュの算出対象にする合計バイト数の上限（タイムアウト回避） */
const HASH_BUDGET_BYTES = 80 * 1024 * 1024;

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

async function loadDismissed(): Promise<string[]> {
  const row = await serverGetContentRow(CLEANUP_DISMISSED_KEY);
  const raw = (row?.data as { pairs?: unknown } | null)?.pairs;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.includes("|"));
}

async function saveDismissed(pairs: string[]): Promise<void> {
  await serverPutContentRow(CLEANUP_DISMISSED_KEY, "portal", {
    pairs: Array.from(new Set(pairs)).slice(0, 2000),
    updatedAt: new Date().toISOString(),
  });
}

/** Storage の library/ 配下のファイルサイズ一覧（filePath → bytes） */
async function loadSizes(admin: Admin): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const { data, error } = await admin.storage
    .from(STAFF_PHOTOS_BUCKET)
    .list(LIBRARY_PATH_PREFIX, { limit: 1000 });
  if (error || !data) return out;
  for (const o of data) {
    const meta = o.metadata as { size?: unknown } | null;
    const size = typeof meta?.size === "number" ? meta.size : 0;
    out.set(`${LIBRARY_PATH_PREFIX}/${o.name}`, size);
  }
  return out;
}

async function sha256Of(admin: Admin, filePath: string): Promise<string> {
  const { data, error } = await admin.storage
    .from(STAFF_PHOTOS_BUCKET)
    .download(filePath);
  if (error || !data) return "";
  const buf = Buffer.from(await data.arrayBuffer());
  return createHash("sha256").update(buf).digest("hex");
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  try {
    const admin = createSupabaseAdminClient();
    const [store, sizes, dismissed] = await Promise.all([
      loadStore(admin),
      loadSizes(admin),
      loadDismissed(),
    ]);

    const fileDocs = store.docs.filter(
      (d) => d.kind !== "link" && d.filePath
    );

    // ① サイズが一致するものだけハッシュを取る（全件ダウンロードを避ける）
    const bySize = new Map<number, LibraryDoc[]>();
    for (const d of fileDocs) {
      const size = sizes.get(d.filePath) ?? 0;
      if (!size) continue;
      const arr = bySize.get(size) ?? [];
      arr.push(d);
      bySize.set(size, arr);
    }
    const needHash: LibraryDoc[] = [];
    let budget = HASH_BUDGET_BYTES;
    let skippedForBudget = 0;
    for (const [size, arr] of bySize.entries()) {
      if (arr.length < 2) continue;
      const cost = size * arr.length;
      if (cost > budget) {
        skippedForBudget += arr.length;
        continue;
      }
      budget -= cost;
      needHash.push(...arr);
    }
    const hashes = new Map<string, string>();
    await Promise.all(
      needHash.map(async (d) => {
        const h = await sha256Of(admin, d.filePath);
        if (h) hashes.set(d.id, h);
      })
    );

    // ② グループ化（純関数側で判定）
    const members: CleanupMember[] = store.docs.map((d) => ({
      doc: d,
      size: sizes.get(d.filePath) ?? 0,
      hash: hashes.get(d.id) ?? "",
      metaScore: metaScoreOf(d),
    }));
    const groups = buildCleanupGroups(members, dismissed);

    return NextResponse.json({
      groups,
      scanned: store.docs.length,
      hashed: hashes.size,
      // 大きすぎてハッシュを取れなかった件数（0でなければ画面に出す）
      skippedForBudget,
      dismissedCount: dismissed.length,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const user = auth.user;

  let body: { action?: unknown; docIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";
  const docIds = Array.isArray(body.docIds)
    ? body.docIds.filter((v): v is string => typeof v === "string" && !!v)
    : [];
  if (docIds.length === 0) {
    return NextResponse.json({ error: "対象がありません" }, { status: 400 });
  }

  try {
    if (action === "dismiss") {
      // グループ内の全ペアを「重複ではない」として記録（以後そのグループは出ない）
      const current = await loadDismissed();
      const add: string[] = [];
      for (let i = 0; i < docIds.length; i++) {
        for (let j = i + 1; j < docIds.length; j++) {
          add.push(pairKey(docIds[i], docIds[j]));
        }
      }
      await saveDismissed([...current, ...add]);
      return NextResponse.json({ ok: true, dismissed: add.length });
    }

    if (action !== "delete") {
      return NextResponse.json(
        { error: "action が不正です" },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();
    const store = await loadStore(admin);
    const targets = store.docs.filter((d) => docIds.includes(d.id));
    if (targets.length === 0) {
      return NextResponse.json(
        { error: "対象の資料が見つかりません" },
        { status: 404 }
      );
    }

    // レコードを外す
    const removedIds = new Set(targets.map((d) => d.id));
    store.docs = store.docs.filter((d) => !removedIds.has(d.id));
    await saveStore(admin, store);

    // 残る資料が参照しているパスを集める（共有されている実体は消さない）
    const stillReferenced = new Set<string>();
    for (const d of store.docs) {
      if (d.filePath) stillReferenced.add(d.filePath);
      for (const v of d.versions ?? []) {
        if (v.filePath) stillReferenced.add(v.filePath);
      }
      if (d.pendingUpdate?.filePath) {
        stillReferenced.add(d.pendingUpdate.filePath);
      }
    }

    // 削除対象の実体（本体＋版履歴＋承認待ち）を集めて消す
    const paths = new Set<string>();
    for (const d of targets) {
      if (d.filePath) paths.add(d.filePath);
      for (const v of d.versions ?? []) {
        if (v.filePath) paths.add(v.filePath);
      }
      if (d.pendingUpdate?.filePath) paths.add(d.pendingUpdate.filePath);
    }
    const toRemove = Array.from(paths).filter((p) => !stillReferenced.has(p));
    let storageRemoved = 0;
    if (toRemove.length > 0) {
      const { error } = await admin.storage
        .from(STAFF_PHOTOS_BUCKET)
        .remove(toRemove);
      if (!error) storageRemoved = toRemove.length;
    }

    // 共有ログに集約1エントリ（128の方式）。実体を消すので snapshot は残さない
    // （残すと復元できるように見えてしまうため）。
    const { db } = await getSessionUser();
    let userName = user.email ?? "";
    try {
      const profile = await loadProfileServer(db, user.id);
      userName = profile?.name || userName;
    } catch {
      /* 表示名が取れなくてもログは残す */
    }
    const names = targets
      .map((d) => d.fileName || d.title)
      .filter(Boolean)
      .join("、");
    await appendLog(admin, {
      userId: user.id,
      userName,
      action: "delete",
      docId: "cleanup",
      docTitle: `資料庫お掃除（${targets.length}件削除）`,
      note: `削除: ${names}／実体削除 ${storageRemoved}件（復元不可）`,
    });

    return NextResponse.json({
      ok: true,
      deleted: targets.length,
      storageRemoved,
      remaining: store.docs.length,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
