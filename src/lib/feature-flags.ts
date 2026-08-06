// 機能フラグ基盤（指示書103）
// 新機能を「実装済みだが非表示」の状態で安全に保持するためのフラグ集。
// content_store の単一キー portal_feature_flags に { features, updatedAt } で保存。
// - キー未存在時は全機能OFF（フェイルセーフ）。
// - features 内の未知IDは無視・欠けているIDはOFF扱い（前方互換）。
// - 既存の portal_features（実装済みUIの表示スイッチ・既定ON）とは別物で併存する。
//   こちらは「未リリース機能の解禁」用で既定OFF。実装パターンは portal-features.ts を踏襲。
// 管理UIは /admin/portal「⚙ 機能」タブ下部の「機能の表示設定」セクション。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const FEATURE_FLAGS_KEY = "portal_feature_flags";

// 機能ID（指示書103で固定・以後のフェーズ（指示書104〜114想定）で変更禁止）
export const FEATURE_IDS = [
  "hiyari",
  "kizuki",
  "thanks",
  "manual_draft",
  "chorei",
  "benkyokai",
  "self_review",
  "one_on_one",
  "onboarding",
  "calendar",
  "hr_portal", // 人事制度ポータル（指示書116・Phase 5）
  "events", // イベント機能（指示書132・Phase 5）
  // ── お楽しみ演出パック（指示書146・5演出それぞれ独立フラグ・既定OFF）──
  "mascot_duty", // 146-A: 月替わりマスコット当番
  "slogan_show", // 146-B: 月初のスローガン発表演出
  "monthly_digest", // 146-C: 分かち愛マンスリーダイジェスト
  "seasonal_skin", // 146-D: 季節の装飾
  "anniversary", // 146-E: 入職記念日・誕生日のお祝い
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

// ── ページの公開スイッチ（指示書124）──
// 既存ページの「公開/非公開」制御。10機能（解禁型・既定OFF）と逆で【既定ON】。
// 保存データにIDが欠落していてもON扱い＝デプロイ直後・設定未保存でも既存ページは
// 従来どおり表示される（院長決定・最重要）。グループIDは複数ページで共有する。
export const PAGE_FLAG_IDS = [
  "page_members",
  "page_philosophy",
  "page_corporate_book", // コーポレートブック閲覧（指示書131・理念系=初日公開想定）
  "group_medical",
  "group_beauty",
  "page_tasks",
  "page_goals",
  "page_news_history",
  "page_operations",
  "page_library",
  "page_medical_fees",
  "page_expert",
  "page_growth_builder",
  "group_roles",
  "group_learning",
  "page_ai_incho",
] as const;
export type PageFlagId = (typeof PAGE_FLAG_IDS)[number];

// ナビ・ゲートが扱う全フラグID（10機能＋ページ公開スイッチ）
export type PortalFlagId = FeatureId | PageFlagId;
export const ALL_FLAG_IDS: readonly PortalFlagId[] = [
  ...FEATURE_IDS,
  ...PAGE_FLAG_IDS,
];

export type FeatureFlags = Record<PortalFlagId, boolean>;

// 既定値の正本（指示書124）: 10機能=false（解禁型）／page系=true（公開型）。
// getFeatureFlags はここから開始して保存値を上書きするため、
// 「キー未保存」「ID欠落」「取得失敗」「ロード前」のすべてがこの既定に倒れる。
export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  hiyari: false,
  kizuki: false,
  thanks: false,
  manual_draft: false,
  chorei: false,
  benkyokai: false,
  self_review: false,
  one_on_one: false,
  onboarding: false,
  calendar: false,
  hr_portal: false, // 初期OFF（院長検証→ONでスタッフ公開・指示書116）
  events: false, // 初期OFF（解禁型・指示書132）
  mascot_duty: false, // 146-A
  slogan_show: false, // 146-B
  monthly_digest: false, // 146-C
  seasonal_skin: false, // 146-D
  anniversary: false, // 146-E
  page_members: true,
  page_philosophy: true,
  page_corporate_book: true,
  group_medical: true,
  group_beauty: true,
  page_tasks: true,
  page_goals: true,
  page_news_history: true,
  page_operations: true,
  page_library: true,
  page_medical_fees: true,
  page_expert: true,
  page_growth_builder: true,
  group_roles: true,
  group_learning: true,
  page_ai_incho: true,
};

// 機能定義一覧（管理画面と将来のナビ登録の両方がここを参照する。二重定義禁止）
export type FeatureMeta = {
  id: FeatureId;
  label: string;
  description: string;
  phase: 1 | 2 | 3 | 4 | 5;
};

export const FEATURE_META: FeatureMeta[] = [
  { id: "hiyari", label: "ヒヤリハット報告", description: "気づいた人が組織を救う、安全の分かち合い", phase: 1 },
  { id: "kizuki", label: "日々の気づき投稿", description: "小さな「あれ?」を言葉にする場", phase: 1 },
  { id: "thanks", label: "サンクスカード", description: "感謝を見える形で贈り合う", phase: 1 },
  { id: "manual_draft", label: "マニュアル下書き", description: "未来の仲間への贈り物を書く場", phase: 2 },
  { id: "chorei", label: "朝礼サポート", description: "輪番と学び共有の記録", phase: 2 },
  { id: "benkyokai", label: "勉強会アーカイブ", description: "月1勉強会の資料と学びの蓄積", phase: 2 },
  { id: "self_review", label: "自己評価シート", description: "半期面談・年次対話の入口", phase: 3 },
  { id: "one_on_one", label: "1on1ノート", description: "伴走の対話を記録する場", phase: 3 },
  { id: "onboarding", label: "オンボーディング", description: "新しい仲間の最初の道しるべ", phase: 4 },
  { id: "calendar", label: "院内カレンダー", description: "勉強会・イベントの予定共有", phase: 4 },
  { id: "hr_portal", label: "人事制度ポータル", description: "等級・評価・給与・ステージ移行の閲覧とFAQ・検索", phase: 5 },
  { id: "events", label: "イベント", description: "行事・思い出の記録（資料と写真をクリニックの歴史として蓄積）", phase: 5 },
  { id: "mascot_duty", label: "月替わりマスコット当番", description: "毎月の当番キャラをホームに常駐表示（月初に1回お披露目）", phase: 5 },
  { id: "slogan_show", label: "月間スローガン発表演出", description: "月初の初回アクセス時にキャラが今月の意識目標を運んでくる", phase: 5 },
  { id: "monthly_digest", label: "分かち愛マンスリーダイジェスト", description: "前月のありがとう・気づき・良いこと共有を1枚に（実投稿の抜粋のみ）", phase: 5 },
  { id: "seasonal_skin", label: "季節の装飾", description: "月ごとのささやかな飾り（桜・あじさい・紅葉・雪など）", phase: 5 },
  { id: "anniversary", label: "記念日のお祝い", description: "入職記念日・誕生日に本人のホームだけでお祝い（誕生日は本人が設定した場合のみ）", phase: 5 },
];

// 実装済み機能の集合。各フェーズの実装指示書でIDを追加していく。
// ここに無いIDは管理画面に「未実装」バッジが付く（トグル自体は保存できる）。
export const IMPLEMENTED_FEATURES: ReadonlySet<FeatureId> = new Set<FeatureId>([
  "kizuki", // 指示書104: 日々の気づき投稿（/kizuki）
  "thanks", // 指示書105: サンクスカード全件一覧（/thanks・既存 portal_thankyou を核に拡張）
  "hiyari", // 指示書106: ヒヤリハット報告（/hiyari-report・既存 portal_hiyari とは別物）
  "manual_draft", // 指示書107: マニュアル下書き（/manual-drafts・資料庫昇格はステータス+リンク紐付け）
  "chorei", // 指示書108: 朝礼サポート（/chorei・投稿駆動の輪番つき）
  "benkyokai", // 指示書109: 勉強会アーカイブ（/benkyokai・資料は資料庫参照 libraryRefs）
  "self_review", // 指示書111: 自己評価シート（/self-review・private_store 基盤・提出後ロック）
  "one_on_one", // 指示書112: 1on1ノート（/one-on-one・本人＋ペア＋管理者のみ・サーバー側判定）
  "onboarding", // 指示書113: オンボーディングチェックリスト（/onboarding・テンプレ公開＋進捗private）
  "calendar", // 指示書114: 院内カレンダー（/calendar・Google Calendar REST直叩き）— これで10機能すべて実装済み
  "hr_portal", // 指示書116: 人事制度ポータル（/hr 配下6ページ・静的コンテンツ＋検索）
  "events", // 指示書132-A: イベント機能（/events・clinic_eventsテーブル・指定メンバー制）
  "mascot_duty", // 指示書146-A
  "slogan_show", // 指示書146-B
  "monthly_digest", // 指示書146-C
  "seasonal_skin", // 指示書146-D
  "anniversary", // 指示書146-E
]);

// ページの公開設定の管理UI用メタ（指示書124・「📄 ページの公開設定」セクション）
export type PageFlagMeta = {
  id: PageFlagId;
  label: string;
  description: string;
};

export const PAGE_FLAG_META: PageFlagMeta[] = [
  { id: "page_members", label: "👥 メンバー紹介", description: "/members を公開します。" },
  { id: "page_philosophy", label: "🏛️ 理念・院長の想い", description: "/philosophy を公開します。" },
  { id: "page_corporate_book", label: "📕 コーポレートブック", description: "/corporate-book（Corporate Design Book の閲覧）を公開します。" },
  { id: "group_medical", label: "📚 医療知識（グループ）", description: "組織知識ベース・疾患・薬剤・禁忌・妊娠授乳・相互作用・生物学的製剤・年齢注意の8ページをまとめて公開します。" },
  { id: "group_beauty", label: "💄 美容知識（グループ）", description: "美容メニュー・スキンケア・カウンセリングガイドの3ページをまとめて公開します。" },
  { id: "page_tasks", label: "📋 みんなのタスク", description: "/tasks（タスク履歴含む）を公開します。" },
  { id: "page_goals", label: "🎯 クリニック目標", description: "/goals を公開します。" },
  { id: "page_news_history", label: "📜 お知らせ履歴", description: "/news-history を公開します。" },
  { id: "page_operations", label: "📋 業務チェックリスト", description: "/operations を公開します。" },
  { id: "page_library", label: "🗂️ 資料庫", description: "/library を公開します（ナビの「📖 マニュアル」ビューも連動します）。" },
  { id: "page_medical_fees", label: "💴 算定・点数表", description: "/medical-fees を公開します。" },
  { id: "page_expert", label: "⭐ エキスパートの働き方", description: "/expert を公開します。" },
  { id: "page_growth_builder", label: "🚀 成長ロードマップ", description: "/growth-builder を公開します。" },
  { id: "group_roles", label: "👥 役割別ガイド（グループ）", description: "受付・事務・カウンセラーの3ページをまとめて公開します。" },
  { id: "group_learning", label: "📝 学習・テスト（グループ）", description: "クイズ・学習進捗・AIアシスタント・症例学習・ロールプレイの5ページをまとめて公開します。" },
  { id: "page_ai_incho", label: "🤖 AI院長（外部リンク）", description: "メニューの「AI院長」リンクを表示します（外部サイトのため直URLは制御できません）。" },
];

type StoredFeatureFlags = {
  features?: Record<string, unknown>;
  updatedAt?: string;
};

// content_store から取得してデフォルト規則を適用（未知ID無視・boolean以外は既定値）。
// 欠落IDの倒れる向きは DEFAULT_FEATURE_FLAGS が正本: 10機能=OFF／page系=ON（指示書124）
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const obj = await loadPortalObject<StoredFeatureFlags | null>(
    FEATURE_FLAGS_KEY,
    null
  );
  const next = { ...DEFAULT_FEATURE_FLAGS };
  const src =
    obj && typeof obj === "object" && obj.features && typeof obj.features === "object"
      ? obj.features
      : null;
  if (src) {
    for (const id of ALL_FLAG_IDS) {
      const v = src[id];
      if (typeof v === "boolean") next[id] = v;
    }
  }
  return next;
}

// 単一機能の有効判定
export async function isFeatureEnabled(id: FeatureId): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[id];
}

// キーを丸ごと更新（updatedAt は現在時刻）。初回保存でキーが自動作成される（SQL投入不要）。
export async function saveFeatureFlags(flags: FeatureFlags): Promise<boolean> {
  return savePortalObject(FEATURE_FLAGS_KEY, {
    features: flags,
    updatedAt: new Date().toISOString(),
  });
}
