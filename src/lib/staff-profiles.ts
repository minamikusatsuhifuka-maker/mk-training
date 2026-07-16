// スタッフ個人プロフィール（指示書29）の型・定数・クライアント読み取りヘルパ
// テキストデータは content_store に保存:
//   - staff_profiles_index: { items: StaffProfileIndexEntry[] }（一覧用の軽量データ）
//   - staff_profile:<userId>: StaffProfile（単一オブジェクト直書き）
// 書き込みはサーバーAPI（/api/profile）経由のみ（本人一致をサーバーで担保）。
// 写真は Supabase Storage バケット staff-photos（public read）。

import { loadPortalItems, loadPortalObject } from "./portal-store";
import { supabase } from "./supabase";
import type { NeedsSurvey } from "./needs-survey";

export const STAFF_PROFILES_INDEX_KEY = "staff_profiles_index";

export function staffProfileKey(userId: string): string {
  return `staff_profile:${userId}`;
}

// 写真バケット名（未作成の場合はダッシュボードで手動作成が必要）
export const STAFF_PHOTOS_BUCKET = "staff-photos";

// 1人あたりの共有写真の上限
export const MAX_SHARED_PHOTOS = 20;

export type ProfilePhoto = {
  url: string;
  caption?: string;
  uploadedAt: string;
};

export type StaffProfile = {
  userId: string;
  name: string;
  kana: string;
  role: string; // profile_role_config（lib/profile-roles.ts）の役職id（自由入力は許可しない）
  bio: string; // 自己紹介
  hobbies: string; // 趣味・特技
  message: string; // ひとこと
  avatarUrl: string;
  photos: ProfilePhoto[];
  // カスタム項目の回答（キー = profile_field_config の fieldId）。
  // 設定から消えた fieldId の値も保持する（非表示になるだけで消さない）。
  customFields: Record<string, string>;
  // カスタム項目の開示設定（指示書52）。未設定のキーは 'public'（従来どおり公開）。
  // 'private' の項目は /members のカード・詳細で非表示（本人の /profile では見える）。
  customFieldsPrivacy?: Record<string, "public" | "private">;
  // 5つの基本的欲求サーベイ（指示書58）。既定 private（自分のみ）。
  // imageUrl はアップロードAPIでのみ変更（PUT のクライアント値は使わない）。
  needsSurvey?: NeedsSurvey;
  // 大切にしている価値観（指示書68）: lib/value-keywords.ts の52語から最大5個。
  // 常に公開（customFieldsPrivacy 対象外）。未設定は undefined / 空配列。
  valueKeywords?: string[];
  // メールアドレスの表示希望（指示書44・既定OFF）。
  // email はサーバー側でセッションから確定して保存する（クライアント値は受け取らない）。
  // 表示は「詳細ダイアログのみ・showEmail=true の人のみ」。一覧カード/indexには載せない。
  showEmail?: boolean;
  email?: string;
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
    customFieldsPrivacy: {},
    showEmail: false,
    email: "",
    updatedAt: "",
  };
}

// カスタム項目が「🔒 自分のみ」か（指示書52。未設定は公開）
export function isFieldPrivate(
  p: Pick<StaffProfile, "customFieldsPrivacy">,
  fieldId: string
): boolean {
  return p.customFieldsPrivacy?.[fieldId] === "private";
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

// 全スタッフのプロフィール本体を1クエリで取得（一覧カード表示用）。
// index に項目値を同期させる方式より単純で、保存経路が増えてもズレない。
export async function loadAllStaffProfiles(): Promise<
  Record<string, StaffProfile>
> {
  try {
    const { data, error } = await supabase
      .from("content_store")
      .select("id, data")
      .like("id", "staff_profile:%");
    if (error || !data) return {};
    const map: Record<string, StaffProfile> = {};
    for (const row of data) {
      const p = row.data as StaffProfile | null;
      if (!p || typeof p.userId !== "string") continue;
      map[p.userId] = { ...emptyProfile(p.userId), ...p };
    }
    return map;
  } catch {
    return {};
  }
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
