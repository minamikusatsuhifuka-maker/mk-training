// 🧭 院長は欲求サーベイの資料とデータを見る（指示書277）— サーバー専用
// 読み書きはこのファイルだけ（content_store のサーバー専用キー・/api/content-store からは読めない）。
// スイッチと文を書けるのは院長だけ（呼び出し側の /api/admin/needs-overview が authorizeNeedsOverview で確かめる）。
// 確認の記録は本人だけが自分の分を書く（/api/needs-survey/director-view）。

import type { User } from "@supabase/supabase-js";
import { serverGetContentRow, serverGetContentRowsByPrefix, serverPutContentRow } from "./content-store-server";
import { createSupabaseAdminClient } from "./supabase-admin";
import { isTestSeedUser } from "./test-seed";
import { isDirectorUser } from "./people-training-server";
import { STAFF_PROFILES_INDEX_KEY } from "./staff-profiles";
import {
  NEEDS_DIRECTOR_ACK_PREFIX,
  NEEDS_DIRECTOR_VIEW_KEY,
  needsDirectorAckKey,
  normalizeNeedsDirectorAck,
  normalizeNeedsDirectorView,
  type NeedsDirectorAck,
  type NeedsDirectorViewState,
} from "./needs-director-view";

const CONTENT_TYPE = "needs_director_view";

/** 読めないときは OFF（fail-closed＝院長にも公開設定どおり・スタッフの文も今のまま） */
export async function loadNeedsDirectorView(): Promise<NeedsDirectorViewState> {
  try {
    const row = await serverGetContentRow(NEEDS_DIRECTOR_VIEW_KEY);
    return normalizeNeedsDirectorView(row?.data ?? null);
  } catch {
    return normalizeNeedsDirectorView(null);
  }
}

export async function saveNeedsDirectorView(s: NeedsDirectorViewState, by: string): Promise<void> {
  const ok = await serverPutContentRow(NEEDS_DIRECTOR_VIEW_KEY, CONTENT_TYPE, s, by);
  if (!ok) throw new Error("保存に失敗しました");
}

export async function loadMyAck(userId: string): Promise<NeedsDirectorAck | null> {
  try {
    const row = await serverGetContentRow(needsDirectorAckKey(userId));
    return normalizeNeedsDirectorAck(row?.data ?? null);
  } catch {
    return null;
  }
}

export async function saveMyAck(user: User, onAt: string): Promise<void> {
  const data = { at: new Date().toISOString(), onAt, ...(isTestSeedUser(user) ? { testSeed: true, seed191: true } : {}) };
  const ok = await serverPutContentRow(needsDirectorAckKey(user.id), CONTENT_TYPE, data, user.id);
  if (!ok) throw new Error("保存に失敗しました");
}

export type NeedsDirectorAckRow = { userId: string; name: string; testSeed?: true; ackAt: string };

/** 院長の画面用：今の回を確認した人・まだの人（今いる人だけ・院長自身は除く） */
export async function listNeedsDirectorAcks(s: NeedsDirectorViewState): Promise<{ acked: NeedsDirectorAckRow[]; pending: NeedsDirectorAckRow[] }> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  const names = new Map<string, string>();
  try {
    const row = await serverGetContentRow(STAFF_PROFILES_INDEX_KEY);
    const items = (row?.data as { items?: unknown } | null)?.items;
    if (Array.isArray(items)) {
      for (const it of items) {
        const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
        if (typeof o.userId === "string" && typeof o.name === "string" && o.name.trim()) names.set(o.userId, o.name.trim());
      }
    }
  } catch {
    /* Auth の名前のまま */
  }
  const acks = new Map<string, NeedsDirectorAck>();
  for (const r of await serverGetContentRowsByPrefix(NEEDS_DIRECTOR_ACK_PREFIX)) {
    const a = normalizeNeedsDirectorAck(r.data);
    if (a) acks.set(String(r.id).slice(NEEDS_DIRECTOR_ACK_PREFIX.length), a);
  }
  const acked: NeedsDirectorAckRow[] = [];
  const pending: NeedsDirectorAckRow[] = [];
  for (const u of data.users) {
    const until = (u as User & { banned_until?: string | null }).banned_until;
    if (until && new Date(until).getTime() > Date.now()) continue;
    if (isDirectorUser(u)) continue;
    const meta = u.user_metadata as Record<string, unknown> | null;
    const name = names.get(u.id) || (typeof meta?.display_name === "string" ? meta.display_name.trim() : "") || u.email || "名前未設定";
    const a = acks.get(u.id);
    const row: NeedsDirectorAckRow = { userId: u.id, name, ...(isTestSeedUser(u) ? { testSeed: true as const } : {}), ackAt: "" };
    if (s.on && a && a.onAt === s.onAt) acked.push({ ...row, ackAt: a.at });
    else pending.push(row);
  }
  acked.sort((x, y) => x.ackAt.localeCompare(y.ackAt));
  pending.sort((x, y) => x.name.localeCompare(y.name, "ja"));
  return { acked, pending };
}
