// スタッフ個人プロフィール（指示書29）の型・定数・クライアント読み取りヘルパ
// テキストデータは content_store に保存:
//   - staff_profiles_index: { items: StaffProfileIndexEntry[] }（一覧用の軽量データ）
//   - staff_profile:<userId>: StaffProfile（単一オブジェクト直書き）
// 書き込みはサーバーAPI（/api/profile）経由のみ（本人一致をサーバーで担保）。
// 写真は Supabase Storage バケット staff-photos（public read）。

import { loadPortalObject } from "./portal-store";
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
  // 資料庫のお気に入り（指示書97）: docId配列。個人ごと・端末をまたいで引き継ぐ。
  favoriteDocIds?: string[];
  // メールアドレスの表示希望（指示書44・既定OFF）。
  // email はサーバー側でセッションから確定して保存する（クライアント値は受け取らない）。
  // 表示は「詳細ダイアログのみ・showEmail=true の人のみ」。一覧カード/indexには載せない。
  showEmail?: boolean;
  email?: string;
  // 146-E: 記念日。どちらも任意（本人が設定したときだけ本人のホームで祝う）。
  // 他者には一切出さない（/members・staff_profiles_index には載せない）。
  // joinedOn = 入職日 YYYY-MM-DD（勤続年数の算出に年が要る）
  // birthday = 誕生日 MM-DD（年齢が分かる情報は保存しない）
  joinedOn?: string;
  birthday?: string;
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
    favoriteDocIds: [],
    showEmail: false,
    email: "",
    joinedOn: "",
    birthday: "",
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

// 2026-08-07: 無効化（banned）されたアカウントを除外するため、
// content_store の直読みをやめて /api/members（サーバー側で除外）経由にした。
// これにより利用側（メンバー紹介・1on1の相手選択・ありがとう・メンバーノート等）は
// 無改修で除外が効く。取得に失敗した場合は空配列（従来と同じフォールバック）。
async function fetchMembers(withProfiles: boolean): Promise<{
  items: StaffProfileIndexEntry[];
  profiles: Record<string, StaffProfile>;
  disabledNames: string[];
}> {
  const empty = { items: [], profiles: {}, disabledNames: [] };
  try {
    const res = await fetch(
      withProfiles ? "/api/members?profiles=1" : "/api/members",
      // no-store: 無効化・有効化の反映が古いキャッシュで遅れないようにする
      { credentials: "same-origin", cache: "no-store" }
    );
    if (!res.ok) return empty;
    const json = (await res.json()) as {
      items?: StaffProfileIndexEntry[];
      profiles?: Record<string, StaffProfile>;
      disabledNames?: string[];
    };
    return {
      items: Array.isArray(json.items) ? json.items : [],
      profiles: json.profiles ?? {},
      disabledNames: Array.isArray(json.disabledNames)
        ? json.disabledNames
        : [],
    };
  } catch {
    return empty;
  }
}

export async function loadProfilesIndex(): Promise<StaffProfileIndexEntry[]> {
  const { items } = await fetchMembers(false);
  // ふりがな順（無ければ名前順）で安定表示
  return [...items].sort((a, b) =>
    (a.kana || a.name).localeCompare(b.kana || b.name, "ja")
  );
}

/** 無効化されたアカウントの名前（名前ベースの候補リストを絞るのに使う） */
export async function loadDisabledMemberNames(): Promise<string[]> {
  const { disabledNames } = await fetchMembers(false);
  return disabledNames;
}

// 全スタッフのプロフィール本体を1クエリで取得（一覧カード表示用）。
// index に項目値を同期させる方式より単純で、保存経路が増えてもズレない。
export async function loadAllStaffProfiles(): Promise<
  Record<string, StaffProfile>
> {
  try {
    // 2026-08-07: 無効アカウントの除外もサーバー側で行うため /api/members に統合
    //（145で anon 直読みは廃止済み）
    const { profiles } = await fetchMembers(true);
    return profiles;
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
