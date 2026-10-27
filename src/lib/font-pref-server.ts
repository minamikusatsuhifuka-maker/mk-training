// 🔤 フォントの設定（指示書271）— サーバー専用（service-role）。クライアントから import しないこと。
//   院長の既定：content_store の FONT_DEFAULT_KEY（{ font, size, updatedAt, updatedBy, updatedByName }）
//   本人の選択：アカウントの user_metadata.app_font（{ font, size, at }）。読み書きは本人だけ（/api/font-prefs）
// proxy.ts はページを返すたびに既定を読むので、60秒だけ取り置く（院長が変えたら、この場所の取り置きは捨てる）。

import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabase-admin";
import { serverGetContentRow, serverPutContentRow } from "./content-store-server";
import {
  FONT_COOKIE,
  FONT_DEFAULT_KEY,
  FONT_META_FIELD,
  normalizeFontPref,
  type FontPref,
} from "./font-pref";

export type FontDefaultRecord = FontPref & { updatedAt?: string; updatedByName?: string };

const CACHE_MS = 60_000;
let cached: { at: number; value: FontPref | null } | null = null;

/** 院長の既定（まだ決めていない・読めないときは null） */
export async function loadFontDefaultRecord(): Promise<FontDefaultRecord | null> {
  const row = await serverGetContentRow(FONT_DEFAULT_KEY);
  const pref = normalizeFontPref(row?.data);
  if (!pref) return null;
  const d = row!.data as Record<string, unknown>;
  return {
    ...pref,
    updatedAt: typeof d.updatedAt === "string" ? d.updatedAt : undefined,
    updatedByName: typeof d.updatedByName === "string" ? d.updatedByName : undefined,
  };
}

/** proxy 用：60秒の取り置きつき */
export async function loadFontDefaultCached(): Promise<FontPref | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const rec = await loadFontDefaultRecord().catch(() => null);
  const value = rec ? { font: rec.font, size: rec.size } : null;
  cached = { at: Date.now(), value };
  return value;
}

export async function saveFontDefault(pref: FontPref, by: { id: string; name: string }): Promise<boolean> {
  const ok = await serverPutContentRow(
    FONT_DEFAULT_KEY,
    "settings",
    { ...pref, updatedAt: new Date().toISOString(), updatedBy: by.id, updatedByName: by.name },
    by.id
  );
  if (ok) cached = { at: Date.now(), value: pref };
  return ok;
}

/** 本人の選択（アカウントの user_metadata。getUser が返した最新のもの） */
export function fontPrefOfUser(user: User | null | undefined): FontPref | null {
  const meta = (user?.user_metadata ?? null) as Record<string, unknown> | null;
  return normalizeFontPref(meta?.[FONT_META_FIELD]);
}

/** 本人の選択を残す（null で消す＝院長の既定に従う）。user_metadata はほかの項目と混ぜて保存される */
export async function saveUserFontPref(userId: string, pref: FontPref | null): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  // 表示名などほかの項目を消さないよう、今の中身に重ねて送る（消すときは null＝その項目だけ消える）
  const current = await admin.auth.admin.getUserById(userId);
  if (current.error || !current.data.user) return false;
  const meta = { ...((current.data.user.user_metadata ?? {}) as Record<string, unknown>) };
  meta[FONT_META_FIELD] = pref ? { ...pref, at: new Date().toISOString() } : null;
  const { error } = await admin.auth.admin.updateUserById(userId, { user_metadata: meta });
  if (error) {
    console.error("[font-pref] 保存できませんでした:", error.message);
    return false;
  }
  return true;
}

/** Cookie の付け方（初期化スクリプトが読むので HttpOnly にしない。中身はフォントの種類と大きさだけ） */
export const FONT_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  httpOnly: false,
};

export { FONT_COOKIE };
