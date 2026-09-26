// 管理画面の項目一覧と委任の可否（指示書183 B）— 純関数・定義の正本
//
// 【判定の規則（183 B-2）】
//   権限・アカウント・AI／課金・機微な個人情報・監査の記録に関わるものは**院長のみ**（委任できない）。
//   それ以外（研修コンテンツ・お知らせ・画面構成などの「中身の編集」）は幹部に委任できる。
//
// 【保存形式】157の menu_access（content_store の `menu_access`・サーバー専用キー）を流用し、
//   menus["admin:<項目key>"].allowed_user_ids = 指名された幹部の userId
//   menus["karte:<幹部userId>"].allowed_user_ids = その幹部が見られる担当スタッフの userId（183 A）
// 指名の保存は院長（app_metadata.role === "admin"）だけ（/api/admin/delegation）。幹部は自分の権限を変えられない。
//
// 【判定の場所】
//   ・/admin/* と /api/admin/* は proxy.ts が項目ごとに判定し、指名の無い項目は実在しないパスと同じ応答にする（158）
//   ・/api/content-store の管理者専用キーの書き込みは、その項目に指名された幹部だけ通す（contentKeys/contentPrefixes）
//   ・/api/admin/<項目> の各ルートは requireAdminItem(項目key) でもう一度判定する（関門が外れても素通りさせない）

export type AdminItem = {
  /** 項目key（= /admin/<key> のパス。ダッシュボードは "dashboard"） */
  key: string;
  label: string;
  href: string;
  /** 幹部に委任できるか。false は院長のみ（🔒） */
  delegable: boolean;
  /** 分類の理由（報告と管理画面に出す） */
  reason: string;
  /** この項目の画面が書く content_store のキー（完全一致） */
  contentKeys?: readonly string[];
  /** この項目の画面が書く content_store のキー（前方一致） */
  contentPrefixes?: readonly string[];
  /** 管理画面のメニューには出さない（別の画面の中にある機能を分類表に載せるため） */
  hidden?: true;
};

export const ADMIN_ITEMS: readonly AdminItem[] = [
  { key: "dashboard", label: "📊 ダッシュボード", href: "/admin", delegable: true, reason: "入口。中身の編集はしない" },
  {
    key: "portal",
    label: "🏠 ポータル管理",
    href: "/admin/portal",
    delegable: true,
    reason:
      "お知らせ・投稿・レイアウトなどの中身。ただし「⚙ 機能（機能フラグ・ページ公開）」「📝 自己評価」「🤝 1on1ノート」「📊 共有ログ・貢献」は院長のみ（機能設定・個人の記録・監査）",
    contentKeys: [
      "portal_news",
      "portal_news_archive",
      "portal_hiyari",
      "portal_thankyou",
      "portal_policy",
      "portal_today_word",
      "portal_home_layout",
      "tasks_page_layout",
      "portal_quick_access",
      "portal_sidebar_mode",
      "hiyari_reports",
      "hiyari_reactions",
      "kizuki_posts",
      "kizuki_reactions",
      "manual_drafts",
      "manual_draft_reactions",
      "chorei_data",
      "chorei_reactions",
      "benkyokai_posts",
      "benkyokai_reactions",
      "portal_library",
      "portal_library_log",
      "portal_news_reactions",
      "weekly_questions",
      "portal_question_schedule",
      "onboarding_template",
      "character_settings",
      "character_order",
      "portal_mascot_duty",
    ],
  },
  { key: "nav", label: "🧭 サイドバー構成", href: "/admin/nav", delegable: true, reason: "メニューの並びと表示名", contentKeys: ["portal_nav_config"] },
  { key: "knowledge-system", label: "🏛️ 組織知識ベース管理", href: "/admin/knowledge-system", delegable: true, reason: "研修コンテンツ", contentPrefixes: ["org_"] },
  { key: "ai-background", label: "🧭 背景情報・理念管理", href: "/admin/ai-background", delegable: false, reason: "AIに注入する背景情報（AI設定）" },
  { key: "knowledge", label: "📚 知識ベース管理", href: "/admin/knowledge", delegable: true, reason: "研修コンテンツ", contentKeys: ["knowledge_docs"] },
  { key: "diseases", label: "🦠 疾患管理", href: "/admin/diseases", delegable: true, reason: "研修コンテンツ", contentKeys: ["content_diseases"] },
  { key: "drugs", label: "💊 薬剤管理", href: "/admin/drugs", delegable: true, reason: "研修コンテンツ", contentKeys: ["content_drugs"] },
  { key: "quiz", label: "❓ クイズ管理", href: "/admin/quiz", delegable: true, reason: "研修コンテンツ", contentKeys: ["content_quiz"] },
  { key: "contraindications", label: "⚠️ 禁忌管理", href: "/admin/contraindications", delegable: true, reason: "研修コンテンツ", contentKeys: ["content_contraindications"] },
  { key: "counseling", label: "💬 カウンセリング管理", href: "/admin/counseling", delegable: true, reason: "研修コンテンツ", contentKeys: ["counseling_guides"] },
  { key: "cosmetic", label: "✨ 美容施術管理", href: "/admin/cosmetic", delegable: true, reason: "研修コンテンツ", contentKeys: ["cosmetic_items"] },
  { key: "skincare", label: "🧴 スキンケア管理", href: "/admin/skincare", delegable: true, reason: "研修コンテンツ", contentKeys: ["skincare_items"] },
  { key: "pregnancy", label: "🤰 妊娠授乳管理", href: "/admin/pregnancy", delegable: true, reason: "研修コンテンツ", contentKeys: ["pregnancy_drugs"] },
  { key: "interactions", label: "⚡ 相互作用管理", href: "/admin/interactions", delegable: true, reason: "研修コンテンツ", contentKeys: ["drug_interactions"] },
  { key: "medical-fees", label: "💴 算定点数管理", href: "/admin/medical-fees", delegable: true, reason: "研修コンテンツ", contentKeys: ["medical_fees"] },
  { key: "operations", label: "📋 業務チェック管理", href: "/admin/operations", delegable: true, reason: "業務手順", contentPrefixes: ["operations_"] },
  { key: "staff-members", label: "👥 スタッフ名簿", href: "/admin/staff-members", delegable: true, reason: "タスクの担当者候補（氏名のみ・連絡先は含まない）", contentKeys: ["staff_members"] },
  { key: "task-categories", label: "🏷️ タスクカテゴリ管理", href: "/admin/task-categories", delegable: true, reason: "タスクの分類", contentKeys: ["task_category_config"] },
  { key: "staff-accounts", label: "👤 アカウント招待", href: "/admin/staff-accounts", delegable: false, reason: "アカウント・招待コード・仮パスワード（権限・アカウント）" },
  {
    key: "profile-fields",
    label: "🪪 プロフィール項目管理",
    href: "/admin/profile-fields",
    delegable: true,
    reason: "プロフィールの項目・役職・価値観の語（表示の設定）",
    contentKeys: ["profile_field_config", "profile_role_config", "members_card_config"],
  },
  { key: "biologics", label: "💉 生物学的製剤管理", href: "/admin/biologics", delegable: true, reason: "研修コンテンツ", contentPrefixes: ["biologics_"] },
  { key: "expert", label: "⭐ エキスパート要件管理", href: "/admin/expert", delegable: true, reason: "研修コンテンツ", contentKeys: ["expert_roles"] },
  { key: "deep-research", label: "🔬 ディープリサーチ", href: "/admin/deep-research", delegable: false, reason: "AIの利用（課金）" },
  { key: "changelog", label: "📝 更新履歴", href: "/admin/changelog", delegable: true, reason: "閲覧のみ" },
  { key: "settings", label: "⚙️ AI設定", href: "/admin/settings", delegable: false, reason: "AIのプロバイダ・モデル設定（AI／課金）" },
  { key: "delegation", label: "🔑 委任の設定", href: "/admin/delegation", delegable: false, reason: "権限・指名の設定そのもの" },
  // 184: 採用資料（履歴書・適性検査）は育成カルテの中の機能。院長のみ（179の決定）で委任できない
  { key: "hiring-docs", label: "📁 採用資料（履歴書・適性検査・経歴）", href: "/staff-growth", delegable: false, reason: "履歴書原本・適性検査・経歴（機微な個人情報）", hidden: true },
] as const;

/** 管理画面のメニューには出ないが /admin 配下に存在するものは無い（存在すればここに足して分類する） */

export const ADMIN_MENU_PREFIX = "admin:";
export const KARTE_MENU_PREFIX = "karte:";

export function adminMenuKey(itemKey: string): string {
  return `${ADMIN_MENU_PREFIX}${itemKey}`;
}

export function karteMenuKey(managerUserId: string): string {
  return `${KARTE_MENU_PREFIX}${managerUserId}`;
}

export function findAdminItem(key: string): AdminItem | undefined {
  return ADMIN_ITEMS.find((i) => i.key === key);
}

/** /admin/<seg>/... → 項目key（/admin は dashboard）。/admin 配下でなければ null */
export function adminItemKeyForPath(pathname: string): string | null {
  if (pathname === "/admin" || pathname === "/admin/") return "dashboard";
  if (!pathname.startsWith("/admin/")) return null;
  const seg = pathname.slice("/admin/".length).split("/")[0];
  return seg || "dashboard";
}

/**
 * /api/admin/<seg>/... → その API を使える項目key。
 * ここに無い /api/admin ルートは院長のみ（アカウント・AI・監査ログなど）。
 * "my-items" はログイン済みなら誰でも（自分の指名内容だけを返す）。
 */
const API_ITEM_MAP: Record<string, string> = {
  "value-keywords": "profile-fields",
};

export function adminItemKeyForApiPath(pathname: string): string | null {
  if (!pathname.startsWith("/api/admin/")) return null;
  const seg = pathname.slice("/api/admin/".length).split("/")[0];
  return API_ITEM_MAP[seg] ?? null;
}

/** ログイン済みなら誰でも呼べる /api/admin 配下のルート（自分の情報だけを返す） */
export const ADMIN_API_SELF_PATHS = ["/api/admin/my-items"];

/** 指名された項目の集合で、そのキーを書いてよいか */
export function canDelegatedItemsWriteKey(itemKeys: readonly string[], contentKey: string): boolean {
  for (const k of itemKeys) {
    const item = findAdminItem(k);
    if (!item || !item.delegable) continue;
    if (item.contentKeys?.includes(contentKey)) return true;
    if (item.contentPrefixes?.some((p) => contentKey.startsWith(p))) return true;
  }
  return false;
}

/** 委任できる項目keyだけに絞る（保存前の検証） */
export function delegableItemKeys(): string[] {
  return ADMIN_ITEMS.filter((i) => i.delegable).map((i) => i.key);
}

/**
 * ポータル管理（/admin/portal）の中で院長だけが開けるタブ（183 B-2）。
 * ⚙機能＝機能フラグ・ページ公開設定／自己評価・1on1＝個人の記録／共有ログ・貢献＝人ごとの集計。
 */
export const PORTAL_TABS_ADMIN_ONLY: readonly string[] = ["features", "selfReview", "oneOnOne", "contrib"];
