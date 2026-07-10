// スタッフ個人プロフィール（指示書29）の型・定数・クライアント読み取りヘルパ
// テキストデータは content_store に保存:
//   - staff_profiles_index: { items: StaffProfileIndexEntry[] }（一覧用の軽量データ）
//   - staff_profile:<userId>: StaffProfile（単一オブジェクト直書き）
// 書き込みはサーバーAPI（/api/profile）経由のみ（本人一致をサーバーで担保）。
// 写真は Supabase Storage バケット staff-photos（public read）。

import { loadPortalItems, loadPortalObject } from "./portal-store";

export const STAFF_PROFILES_INDEX_KEY = "staff_profiles_index";

export function staffProfileKey(userId: string): string {
  return `staff_profile:${userId}`;
}

// 写真バケット名（未作成の場合はダッシュボードで手動作成が必要）
export const STAFF_PHOTOS_BUCKET = "staff-photos";

// 1人あたりの共有写真の上限
export const MAX_SHARED_PHOTOS = 20;

export const PROFILE_ROLES = [
  "受付",
  "クラーク",
  "医療クラーク",
  "看護師",
  "カウンセラー",
  "その他",
] as const;

export type ProfileRole = (typeof PROFILE_ROLES)[number];

export type ProfilePhoto = {
  url: string;
  caption?: string;
  uploadedAt: string;
};

export type StaffProfile = {
  userId: string;
  name: string;
  kana: string;
  role: string; // PROFILE_ROLES のいずれか（自由入力は許可しない）
  bio: string; // 自己紹介
  hobbies: string; // 趣味・特技
  message: string; // ひとこと
  avatarUrl: string;
  photos: ProfilePhoto[];
  // カスタム項目の回答（キー = profile_field_config の fieldId）。
  // 設定から消えた fieldId の値も保持する（非表示になるだけで消さない）。
  customFields: Record<string, string>;
  updatedAt: string;
};

export type StaffProfileIndexEntry = {
  userId: string;
  name: string;
  kana?: string;
  role?: string;
  message?: string;
  avatarUrl?: string;
  updatedAt: string;
};

export function emptyProfile(userId: string, name = ""): StaffProfile {
  return {
    userId,
    name,
    kana: "",
    role: "",
    bio: "",
    hobbies: "",
    message: "",
    avatarUrl: "",
    photos: [],
    customFields: {},
    updatedAt: "",
  };
}

// ─── クライアント読み取り（閲覧は誰でも可） ───

export async function loadProfilesIndex(): Promise<StaffProfileIndexEntry[]> {
  const items = await loadPortalItems<StaffProfileIndexEntry>(
    STAFF_PROFILES_INDEX_KEY,
    []
  );
  // ふりがな順（無ければ名前順）で安定表示
  return [...items].sort((a, b) =>
    (a.kana || a.name).localeCompare(b.kana || b.name, "ja")
  );
}

export async function loadStaffProfile(
  userId: string
): Promise<StaffProfile | null> {
  const p = await loadPortalObject<StaffProfile | null>(
    staffProfileKey(userId),
    null
  );
  if (!p || typeof p.userId !== "string") return null;
  return { ...emptyProfile(userId), ...p };
}
