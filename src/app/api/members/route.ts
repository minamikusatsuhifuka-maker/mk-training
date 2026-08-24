// メンバー一覧の供給API（2026-08-07の指示）
//
// 無効化（banned）されたアカウントを**サーバー側で一括除外**する唯一の入口。
// クライアント側で個別にフィルタすると必ず漏れるため、ここに集約している。
//
// 【方針】
// - 除外は表示レベルのみ。プロフィールも投稿も1on1記録も消さない
//   （過去記録に出る名前はそのまま残る）。
// - **fail-open**: 無効判定に失敗したときは除外せず全員返す。
//   誤って実在メンバーが消える方が業務影響が大きいため（指示の明示）。
// - 管理画面のアカウント一覧（/api/admin/staff-accounts）はこのAPIを通さない。
//   無効化した人を有効に戻す操作が必要なので、あちらは従来どおり全件出す。

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  getSessionUser,
  withSignedIndexEntries,
  withSignedProfiles,
} from "@/lib/staff-profiles-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  STAFF_PROFILES_INDEX_KEY,
  emptyProfile,
  type StaffProfile,
  type StaffProfileIndexEntry,
} from "@/lib/staff-profiles";
import { redactProfilesForViewer } from "@/lib/survey-visibility";
import {
  serverGetContentRow,
  serverGetContentRowsByPrefix,
} from "@/lib/content-store-server";

export const runtime = "nodejs";
// 無効化・有効化の切替が即反映されるよう、常に都度実行する
export const dynamic = "force-dynamic";

function isBanned(u: User): boolean {
  const until = (u as User & { banned_until?: string | null }).banned_until;
  return !!until && new Date(until).getTime() > Date.now();
}

/** 無効アカウントの userId と表示名。判定不能なら null（＝除外しない） */
async function loadDisabled(): Promise<{
  ids: Set<string>;
  names: Set<string>;
} | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error || !data) return null;
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const u of data.users) {
      if (!isBanned(u)) continue;
      ids.add(u.id);
      const meta = u.user_metadata as Record<string, unknown> | null;
      if (typeof meta?.display_name === "string" && meta.display_name.trim()) {
        names.add(meta.display_name.trim());
      }
    }
    return { ids, names };
  } catch {
    return null; // fail-open
  }
}

function normalizeIndex(raw: unknown): StaffProfileIndexEntry[] {
  const items = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.filter(
    (e): e is StaffProfileIndexEntry =>
      !!e && typeof e === "object" && typeof (e as { userId?: unknown }).userId === "string"
  );
}

export async function GET(req: Request) {
  const { user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  try {
    const wantProfiles =
      new URL(req.url).searchParams.get("profiles") === "1";

    const [indexRow, disabled, profileRows] = await Promise.all([
      serverGetContentRow(STAFF_PROFILES_INDEX_KEY),
      loadDisabled(),
      wantProfiles
        ? serverGetContentRowsByPrefix("staff_profile:")
        : Promise.resolve([]),
    ]);

    const all = normalizeIndex(indexRow?.data);
    // 判定できなかった場合（disabled === null）は除外しない＝現状どおり表示
    const items = disabled
      ? all.filter((e) => !disabled.ids.has(e.userId))
      : all;

    // 名前ベースの一覧（タスクの担当者候補など）が除外に使えるよう、
    // 無効アカウントの名前も返す（プロフィール名＋アカウント表示名の両方）
    const disabledNames = disabled
      ? Array.from(
          new Set([
            ...Array.from(disabled.names),
            ...all
              .filter((e) => disabled.ids.has(e.userId))
              .map((e) => (e.name ?? "").trim())
              .filter(Boolean),
          ])
        )
      : [];

    // 163/170: 一覧カードのアバターは **index の avatarUrl** を見ている。
    // ここを署名URLに差し替えないと、バケット非公開化により全員のアバターが消える
    //（170の真因。関数はあったが呼ばれていなかった）。
    const signedItems = await withSignedIndexEntries(items);

    const body: {
      items: StaffProfileIndexEntry[];
      disabledNames: string[];
      filtered: boolean;
      profiles?: Record<string, StaffProfile>;
    } = {
      items: signedItems,
      disabledNames,
      // false = 無効判定に失敗して除外していない（画面側が知りたい場合のため）
      filtered: disabled !== null,
    };

    if (wantProfiles) {
      const profiles: Record<string, StaffProfile> = {};
      for (const row of profileRows) {
        const p = row.data as StaffProfile | null;
        if (!p || typeof p.userId !== "string") continue;
        if (disabled?.ids.has(p.userId)) continue;
        profiles[p.userId] = { ...emptyProfile(p.userId), ...p };
      }
      // 164: **署名URLを発行する前に**、本人以外に見せない情報を削ぐ。
      // 非公開のサーベイは needsSurvey ごと落とすので、
      // その画像の署名URLもここから先で発行されない（164-3-4）。
      const visible = redactProfilesForViewer(Object.values(profiles), user.id);
      // 163: 写真URLを署名付きにして返す（人数分まとめて1回で発行）
      const signedList = await withSignedProfiles(visible);
      body.profiles = Object.fromEntries(signedList.map((p) => [p.userId, p]));
    }

    return NextResponse.json(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗しました" },
      { status: 500 }
    );
  }
}
