// 🧭 成長の道しるべ（指示書270）— サーバー専用
//
// 【判定】
//   見る   … ログインしたスタッフ全員。スイッチ michishirube がOFFの間は院長と検証用アカウントだけ（ほかは無いのと同じ404）
//   中身を直す … 院長と、委任の設定で「🧭 成長の道しるべ（中身）」（admin item "michishirube"）を任された人（/api/admin/michishirube）
// 【保存先】clinic_staff_growth の record_type "michi_content"（1行・新しい表もSQLも足さない）。
//   保存が無い間は、はじめの中身（michishirube-seed.ts＝別紙A〜Gから作ったもの）を使う。

import type { User } from "@supabase/supabase-js";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import { isTestSeedUser } from "./test-seed";
import { createSupabaseAdminClient } from "./supabase-admin";
import { GROWTH_TABLE, isMissingTable, serverFeatureEnabled } from "./staff-growth-server";
import { MICHI_SEED } from "./michishirube-seed";
import {
  MICHI_HISTORY_MAX,
  describeChanges,
  normalizeEditable,
  normalizeStored,
  type MichiContent,
} from "./michishirube";

export const MICHI_ITEM_KEY = "michishirube";
export const MICHI_FEATURE = "michishirube";
export const MICHI_CONTENT_TYPE = "michi_content";
export const MICHI_CONTENT_ID = "michi-content";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** 見られる人か（未ログイン=401、見られない人=404） */
export async function authorizeMichiView(): Promise<
  { ok: true; user: User; admin: Admin; isAdmin: boolean; testSeed: boolean } | { ok: false; status: 401 | 404 }
> {
  const { user } = await getSessionUser();
  if (!user) return { ok: false, status: 401 };
  const isAdmin = isAdminUser(user);
  const testSeed = isTestSeedUser(user);
  if (!isAdmin && !testSeed && !(await serverFeatureEnabled(MICHI_FEATURE))) return { ok: false, status: 404 };
  return { ok: true, user, admin: createSupabaseAdminClient(), isAdmin, testSeed };
}

export async function loadMichiContent(admin: Admin): Promise<MichiContent> {
  const { data, error } = await admin
    .from(GROWTH_TABLE)
    .select("data")
    .eq("id", MICHI_CONTENT_ID)
    .eq("record_type", MICHI_CONTENT_TYPE)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) return MICHI_SEED;
    throw new Error(error.message);
  }
  const stored = (data as { data?: unknown } | null)?.data;
  return stored ? normalizeStored(stored, MICHI_SEED) : MICHI_SEED;
}

export class MichiConflictError extends Error {
  constructor() {
    super("ほかの人が先に直しました。読み込み直してから、もう一度直してください。");
  }
}

/**
 * 直した中身を保存する（直した日時と人を残す）。
 * baseUpdatedAt が今の保存と違えば、ほかの人が先に直した＝上書きしない。
 */
export async function saveMichiContent(
  admin: Admin,
  input: unknown,
  baseUpdatedAt: string,
  by: { id: string; name: string }
): Promise<MichiContent> {
  const before = await loadMichiContent(admin);
  if ((before.updatedAt || "") !== (baseUpdatedAt || "")) throw new MichiConflictError();
  const edited = normalizeEditable(input, before);
  const what = describeChanges(before, edited);
  const now = new Date().toISOString();
  const next: MichiContent = {
    ...edited,
    updatedAt: now,
    updatedBy: by.id,
    updatedByName: by.name,
    history: [...before.history, { at: now, by: by.id, byName: by.name, what: what || "変更なし" }].slice(-MICHI_HISTORY_MAX),
  };
  const { error } = await admin
    .from(GROWTH_TABLE)
    .upsert({ id: MICHI_CONTENT_ID, record_type: MICHI_CONTENT_TYPE, data: next, updated_by: by.id, updated_at: now });
  if (error) throw new Error(error.message);
  return next;
}

/** はじめの中身（別紙のまま）に戻す。直した記録は残す */
export async function resetMichiContent(admin: Admin, baseUpdatedAt: string, by: { id: string; name: string }): Promise<MichiContent> {
  return saveMichiContent(admin, MICHI_SEED, baseUpdatedAt, by);
}

/** 表示名（user_metadata.display_name・無ければメール） */
export function displayNameOf(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | null;
  const n = typeof meta?.display_name === "string" ? meta.display_name.trim() : "";
  return n || user.email || user.id;
}
