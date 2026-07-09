// プロフィール保存のサーバー専用ヘルパ（API route から使用）
// セッション検証（本人一致）を経た上で content_store を読み書きする。
// 読み書きは service-role を優先（RLS構成に依存しない）。未設定時は
// cookie付きサーバークライアントにフォールバックする。

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase-server";
import { createSupabaseAdminClient } from "./supabase-admin";
import {
  STAFF_PROFILES_INDEX_KEY,
  staffProfileKey,
  emptyProfile,
  type StaffProfile,
  type StaffProfileIndexEntry,
} from "./staff-profiles";

// cookie セッションからログインユーザーを取得（未ログインは null）
export async function getSessionUser(): Promise<{
  user: User | null;
  db: SupabaseClient;
}> {
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return { user, db };
}

export function displayNameOf(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | null;
  const name = typeof meta?.display_name === "string" ? meta.display_name : "";
  return name || user.email || "";
}

// content_store の読み書きに使うクライアント（service-role優先）
function contentDb(fallback: SupabaseClient): SupabaseClient {
  try {
    return createSupabaseAdminClient();
  } catch {
    return fallback;
  }
}

export async function loadProfileServer(
  sessionDb: SupabaseClient,
  userId: string
): Promise<StaffProfile> {
  const db = contentDb(sessionDb);
  const { data } = await db
    .from("content_store")
    .select("data")
    .eq("id", staffProfileKey(userId))
    .single();
  const payload = (data?.data ?? null) as StaffProfile | null;
  if (!payload || typeof payload.userId !== "string") {
    return emptyProfile(userId);
  }
  return { ...emptyProfile(userId), ...payload, userId };
}

// プロフィール本体を保存し、一覧用 index も同期する
export async function saveProfileServer(
  sessionDb: SupabaseClient,
  profile: StaffProfile
): Promise<void> {
  const db = contentDb(sessionDb);
  const now = new Date().toISOString();
  const body: StaffProfile = { ...profile, updatedAt: now };

  const { error } = await db.from("content_store").upsert({
    id: staffProfileKey(profile.userId),
    content_type: "staff",
    data: body as unknown as Record<string, unknown>,
    updated_at: now,
  });
  if (error) throw new Error(`プロフィールの保存に失敗しました: ${error.message}`);

  // index を読み込み → 該当エントリを差し替え
  const { data } = await db
    .from("content_store")
    .select("data")
    .eq("id", STAFF_PROFILES_INDEX_KEY)
    .single();
  const payload = (data?.data ?? null) as {
    items?: StaffProfileIndexEntry[];
  } | null;
  const items = Array.isArray(payload?.items) ? payload.items : [];

  const entry: StaffProfileIndexEntry = {
    userId: body.userId,
    name: body.name,
    kana: body.kana || undefined,
    role: body.role || undefined,
    message: body.message || undefined,
    avatarUrl: body.avatarUrl || undefined,
    updatedAt: now,
  };
  const next = [
    ...items.filter((e) => e && e.userId !== body.userId),
    entry,
  ];

  const { error: idxError } = await db.from("content_store").upsert({
    id: STAFF_PROFILES_INDEX_KEY,
    content_type: "staff",
    data: { items: next } as unknown as Record<string, unknown>,
    updated_at: now,
  });
  if (idxError)
    throw new Error(`プロフィール一覧の更新に失敗しました: ${idxError.message}`);
}
