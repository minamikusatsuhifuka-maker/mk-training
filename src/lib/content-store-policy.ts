// content_store の書き込み権限ポリシー（指示書145）
// サーバー側（/api/content-store）で強制する唯一の正本。クライアントの判定には依存しない。
//
// 方針:
// - 読み取り: ログイン必須（未ログインで表示が必要な画面は存在しないため全キー一律）
// - 書き込み: 既定はログイン済みなら可（文化系の投稿・タスク・プロフィール等）。
//   下記の「管理者専用キー」だけは管理者のみ。既存UIで管理画面からしか書けないもの、
//   および lib 境界で isAdminUser を見ていたもの（clinic-metrics / gantt-goals / monthly-slogan 流儀）を
//   サーバー側の強制に格上げしたもの。
//
// 追加時の注意: スタッフが書くキーをここに入れると当該機能が壊れる。
// 管理画面からしか save 関数を呼んでいないことを確認してから追加すること。

// 完全一致で管理者のみ書き込み可
const ADMIN_ONLY_KEYS = new Set<string>([
  // 招待・アカウント系（露出すると誰でも入室できる）
  "join_config",
  // 公開範囲・導線
  "portal_feature_flags",
  "portal_nav_config",
  "portal_home_layout",
  // 166: クイックアクセスの表示項目・並び順／サイドメニューの既定開閉
  "portal_quick_access",
  "portal_sidebar_mode",
  // AI 設定
  "gemini_model_setting",
  "ai_background_context",
  // 画面・項目の設定
  "character_settings",
  "character_order",
  "members_card_config",
  "profile_field_config",
  "profile_role_config",
  "self_review_config",
  "onboarding_template",
  "portal_question_schedule",
  // 146: 月替わりマスコット当番の手動上書き
  "portal_mascot_duty",
  // 147: 資料庫お掃除の「重複ではない」記録
  "library_cleanup_dismissed",
  // 経営情報（lib 境界で管理者チェック済みだったもの）
  "portal_monthly_slogan",
  "portal_metrics",
  "portal_gantt",
]);

// 前方一致で管理者のみ書き込み可（研修コンテンツ・院内資料の原本）
const ADMIN_ONLY_PREFIXES = [
  "content_", // content_diseases / content_drugs / content_quiz / content_contraindications
  "operations_", // operations_reception / operations_clerk / operations_counselor
  "biologics_",
  "deep_research", // deep_research_index / deep_research:<id>
  "derived_material", // derived_materials_index / derived_material:<id>
  "org_", // org_manuals / org_skillmaps / org_knowledges
];

// 前方一致以外の単発コンテンツキー（管理画面のマスタ編集のみ）
const ADMIN_ONLY_CONTENT_KEYS = new Set<string>([
  "skincare_items",
  "cosmetic_items",
  "pregnancy_drugs",
  "drug_interactions",
  "counseling_guides",
  "medical_fees",
  "expert_roles",
  "knowledge_docs",
  "staff_members",
]);

// サーバー専用キー（指示書157）。/api/content-store 経由では**読むことも書くこともできない**。
// menu_access は「誰がどのメニューを開けるか」＝機能の存在に直結する情報で、
// ログイン済みなら誰でも読める既定の扱い（読み取りは全キー一律）に置くと秘匿が崩れるため。
// 読み書きは lib/menu-access-server.ts（service-role）と、それを使う管理者専用APIだけ。
const SERVER_ONLY_KEYS = new Set<string>(["menu_access"]);

export function isServerOnlyContentKey(key: string): boolean {
  return SERVER_ONLY_KEYS.has(key);
}

/** 書き込みに管理者権限が必要なキーか */
export function isAdminOnlyContentKey(key: string): boolean {
  if (ADMIN_ONLY_KEYS.has(key)) return true;
  if (ADMIN_ONLY_CONTENT_KEYS.has(key)) return true;
  return ADMIN_ONLY_PREFIXES.some((p) => key.startsWith(p));
}

// キーの形式チェック（想定外の値でテーブル全体を触られないため）
const KEY_RE = /^[\w.:-]{1,128}$/;

export function isValidContentKey(key: unknown): key is string {
  return typeof key === "string" && KEY_RE.test(key);
}

// 前方一致取得を許可するプレフィックス（現状はスタッフプロフィール一覧のみ）
const ALLOWED_PREFIXES = ["staff_profile:"];

export function isAllowedContentPrefix(prefix: unknown): prefix is string {
  return typeof prefix === "string" && ALLOWED_PREFIXES.includes(prefix);
}
