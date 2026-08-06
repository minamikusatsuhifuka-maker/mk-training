import { resolveSectionLayout, visibleSectionKeys } from "@/lib/section-layout";

export type NewsCategory = "important" | "drug_info" | "notice" | "event";

/** 緊急度（カテゴリとは別軸）。emergency=赤 / semi=黄 / normal=緑 */
export type Urgency = "emergency" | "semi" | "normal";

export type NewsItem = {
  id: string;
  title: string;
  category: NewsCategory;
  author: string;
  content: string;
  createdAt: string;
  isActive: boolean;
  /** 通知アニメをこの日時まで毎回表示する期限（ISO日時）。未設定の旧データは newsNoticeDays でフォールバック */
  noticeUntil?: string;
  /** 通知アニメで表示するイラスト（CharacterSvgType の id）。未設定=おまかせ（自動割当） */
  character?: CharacterSvgType;
  /** 緊急度。未設定の旧データは "normal"（緑）として扱う */
  urgency?: Urgency;
};

// ─── 緊急度の表示メタ（色・ラベル・アイコン） ───
// border/bg はカード枠の色付け用（normalは空文字＝既存の枠を変更しない）。
// bubble/bubbleTail/bubbleIcon/bubblePulse はキャラクター通知の吹き出し用（指示書48）。
// Tailwind purge回避のためリテラルクラスで定義。
export const URGENCY_META: Record<
  Urgency,
  {
    label: string;
    emoji: string;
    badge: string;
    dot: string;
    border: string;
    bg: string;
    /** 吹き出し本体の背景・文字色 */
    bubble: string;
    /** 吹き出しの三角（しっぽ）の背景色。bubble と同色 */
    bubbleTail: string;
    /** 吹き出し先頭のアイコン */
    bubbleIcon: string;
    /** 緊急のみ控えめな点滅（他は空文字＝アニメなし） */
    bubblePulse: string;
  }
> = {
  emergency: {
    label: "緊急",
    emoji: "🚨",
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500",
    border: "border-2 border-red-300",
    bg: "bg-red-50",
    bubble: "bg-red-600 text-white",
    bubbleTail: "bg-red-600",
    bubbleIcon: "🚨",
    bubblePulse: "animate-pulse",
  },
  semi: {
    label: "準緊急",
    emoji: "⚠️",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    border: "border-2 border-amber-300",
    bg: "bg-amber-50",
    bubble: "bg-amber-500 text-white",
    bubbleTail: "bg-amber-500",
    bubbleIcon: "⚠️",
    bubblePulse: "",
  },
  normal: {
    label: "通常",
    emoji: "✅",
    badge: "bg-green-100 text-green-700",
    dot: "bg-green-500",
    border: "",
    bg: "",
    bubble: "bg-teal-600 text-white",
    bubbleTail: "bg-teal-600",
    bubbleIcon: "📢",
    bubblePulse: "",
  },
};

// 選択UI用（追加フォーム・一覧の <select>）
export const URGENCY_OPTIONS: { value: Urgency; label: string }[] = [
  { value: "emergency", label: "緊急" },
  { value: "semi", label: "準緊急" },
  { value: "normal", label: "通常（特に急ぎでない）" },
];

/** 旧データ（未設定）は "normal" として扱う */
export function urgencyOf(n: { urgency?: Urgency }): Urgency {
  return n.urgency ?? "normal";
}

/** 緊急度に応じたカード枠クラス（normalは既存の枠のまま変更しない＝空文字） */
export function urgencyCardClass(n: { urgency?: Urgency }): string {
  const u = urgencyOf(n);
  if (u === "normal") return "";
  return `${URGENCY_META[u].border} ${URGENCY_META[u].bg}`;
}

// お知らせ毎の noticeUntil（日時）を優先。無ければ createdAt + newsNoticeDays日。
// CharacterNotification の通知アニメ表示期限と同じロジック（期限切れ判定）。
export function isNewsExpired(
  n: Pick<NewsItem, "createdAt" | "noticeUntil">,
  newsNoticeDays: number,
  now: number = Date.now()
): boolean {
  const created = new Date(n.createdAt).getTime();
  if (Number.isNaN(created)) return false;
  if (n.noticeUntil) {
    const until = new Date(n.noticeUntil).getTime();
    return Number.isNaN(until) || now > until;
  }
  return now > created + newsNoticeDays * 24 * 60 * 60 * 1000;
}

/** portal_news_archive に保存する形（元の全フィールド＋archivedAt） */
export type ArchivedNewsItem = NewsItem & { archivedAt: string };

// ─── お知らせ操作ログ（content_store `portal_news_log`・配列保存） ───
export type NewsLogAction = "create" | "update" | "delete" | "archive" | "restore";

export type NewsLogEntry = {
  id: string;
  /** 操作日時（ISO） */
  at: string;
  action: NewsLogAction;
  newsId: string;
  newsTitle: string;
  /** トップ投稿=発信者名／管理画面=ログイン中ならプロフィール名・未ログインなら「管理者」 */
  actor: string;
  source: "top" | "admin";
  /** update時の変更点要約など */
  detail?: string;
};

/** appendNewsLog に渡す形（id/at はストア側で採番） */
export type NewsLogInput = Omit<NewsLogEntry, "id" | "at">;

export const NEWS_LOG_KEY = "portal_news_log";

/** ログの保持上限（超過分は古いものから削除） */
export const NEWS_LOG_MAX = 1000;

export type HiyariType = "hiyari" | "good";

export type HiyariItem = {
  id: string;
  type: HiyariType;
  text: string;
  role: string;
  isAnonymous: boolean;
  createdAt: string;
};

export type ThankyouItem = {
  id: string;
  fromName: string;
  /** 宛先。旧データ=単一文字列 / 新データ=複数名の配列（指示書49）。読み取りは thankyouToNames() を使う */
  toName: string | string[];
  message: string;
  createdAt: string;
  /** 論理削除（指示書105。未定義=表示。管理画面から復元できる。既存データは無改変） */
  deleted?: boolean;
};

/** 宛先を常に配列で取り出す（旧データの単一文字列と新データの配列の両対応） */
export function thankyouToNames(t: Pick<ThankyouItem, "toName">): string[] {
  if (Array.isArray(t.toName)) {
    return t.toName.filter((s) => typeof s === "string" && s.trim() !== "");
  }
  return typeof t.toName === "string" && t.toName.trim() !== ""
    ? [t.toName]
    : [];
}

/** 宛先の表示用文字列（複数名は「Aさん・Bさん」のように「・」で連結） */
export function formatThankyouTo(t: Pick<ThankyouItem, "toName">): string {
  return thankyouToNames(t).join("・");
}

/** 宛先名の同一判定用の正規化（空白除去・末尾「さん」除去・メールは@前）。
 *  /profile の「今月あなたに届いたありがとう」の紐付けと候補の重複除去で共用。 */
export function normalizeThankyouName(s: string): string {
  const base = s.includes("@") ? s.split("@")[0] : s;
  return base.replace(/[\s　]+/g, "").replace(/さん$/u, "");
}

export type PolicyItem = {
  id: string;
  year: number;
  purpose: string;
  mission: string;
  vision: string;
  value: string;
  fullText: string;
  isActive: boolean;
};

export type TodayWord = {
  text: string;
  author: string;
  updatedAt: string;
};

// ─── キャラクター通知設定 ───
export type CharacterSvgType =
  | "cat"
  | "dog"
  | "rabbit"
  | "bird"
  | "chihuahua"
  | "sakura"
  | "sprout"
  | "star"
  | "moon"
  | "shiba"
  | "panda"
  | "penguin"
  | "hedgehog"
  | "rainbow"
  | "note"
  | "clover"
  | "butterfly"
  // 133-B: オリジナル6体（院長採用・既存IDは不変で追加のみ）
  | "mochi"
  | "happa"
  | "kumopi"
  | "piyomaru"
  | "kogumaro"
  | "azaran"
  // 135: SVG版ラッコ（波乗りモーション用・全体像が見えるデザイン）
  | "rakkon";

export type CharacterSettings = {
  enabled: boolean;
  characterStyle: "emoji" | "svg";
  size: number; // px (30-120)
  speed: number; // 横切る秒数 (5-30)
  emoji: string; // 絵文字スタイルの場合
  svgType: CharacterSvgType; // イラストスタイルの場合
  newsNoticeDays: number; // 新着通知アニメの表示期間（日数）。投稿からこの日数以内は毎回再生
};

export const DEFAULT_CHARACTER_SETTINGS: CharacterSettings = {
  enabled: true,
  characterStyle: "emoji",
  size: 60,
  speed: 12,
  emoji: "🐈",
  svgType: "cat",
  newsNoticeDays: 3,
};

// content_store の id（単一オブジェクトとして保存）
export const CHARACTER_SETTINGS_KEY = "character_settings";

export const PORTAL_KEYS = {
  news: "portal_news",
  newsArchive: "portal_news_archive",
  hiyari: "portal_hiyari",
  thankyou: "portal_thankyou",
  policy: "portal_policy",
  todayWord: "portal_today_word",
  homeLayout: "portal_home_layout",
  // 141: 今月の意識目標・月間スローガン（月=YYYY-MMごとに履歴保存）
  monthlySlogan: "portal_monthly_slogan",
} as const;

export type PortalKey = (typeof PORTAL_KEYS)[keyof typeof PORTAL_KEYS];

// ─── ホーム画面のセクション並び順設定（管理画面「ポータル管理→レイアウト」で編集） ───
export type HomeSectionKey =
  | "today_word"
  | "monthly_slogan"
  | "news"
  | "quick_access"
  | "gantt_summary"
  | "clinic_metrics"
  | "weekly_question"
  | "kizuki"
  | "thanks"
  | "policy"
  | "library_news";

export type HomeSectionConfig = {
  key: HomeSectionKey;
  order: number;
  hidden?: boolean;
};

export const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  today_word: "💬 今日の一言",
  monthly_slogan: "🎯 今月の意識目標",
  news: "📢 新着情報",
  quick_access: "⚡ クイックアクセス",
  gantt_summary: "🎯 クリニック目標（進行中）",
  clinic_metrics: "📈 クリニックの歩み",
  weekly_question: "❓ みんなへの質問",
  // ⚠ この "kizuki" はホームの既存「気づきシェア」（portal_hiyari）セクションのレイアウトキー。
  //   指示書104の機能ID kizuki（日々の気づき /kizuki）とは同名の別物（歴史的経緯）。
  //   portal_home_layout の保存データ互換のため改名しない（指示書106で確認済み）。
  kizuki: "💛 気づきシェア",
  thanks: "♥ ありがとうカード",
  policy: "🎯 経営方針",
  library_news: "📚 資料庫の新着・更新",
};

// 現状のハードコード順（未設定/不正時のフォールバック用の既定値）
export const DEFAULT_HOME_LAYOUT: HomeSectionConfig[] = [
  { key: "today_word", order: 0 },
  // 141: 月間スローガン（ページ上部寄り＝今日の一言の直後を既定に。
  //   保存済みレイアウトがある環境では resolveSectionLayout により末尾へ自動追加
  //   → 管理画面「レイアウト」タブで並び替え可能）
  { key: "monthly_slogan", order: 1 },
  { key: "news", order: 2 },
  { key: "quick_access", order: 3 },
  { key: "gantt_summary", order: 4 },
  { key: "clinic_metrics", order: 5 },
  { key: "weekly_question", order: 6 },
  { key: "kizuki", order: 7 },
  { key: "thanks", order: 8 },
  { key: "policy", order: 9 },
  { key: "library_news", order: 10 },
];

// 保存済み設定を検証・補完する。空/不正なら既定順に丸ごとフォールバック（ホームが壊れない）。
// 保存済み設定に無いキー（将来追加されたセクション）は末尾に自動追加する。
// 実装は汎用ヘルパ（/tasks と共通）に委譲。
export function resolveHomeLayout(
  saved: HomeSectionConfig[] | null | undefined
): HomeSectionConfig[] {
  return resolveSectionLayout(saved, DEFAULT_HOME_LAYOUT);
}

// スタッフ側ホーム表示用：非表示を除いたキーの描画順配列
export function visibleHomeSectionKeys(
  saved: HomeSectionConfig[] | null | undefined
): HomeSectionKey[] {
  return visibleSectionKeys(saved, DEFAULT_HOME_LAYOUT);
}
