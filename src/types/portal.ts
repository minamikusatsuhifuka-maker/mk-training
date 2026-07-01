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
// Tailwind purge回避のためリテラルクラスで定義。
export const URGENCY_META: Record<
  Urgency,
  { label: string; emoji: string; badge: string; dot: string; border: string; bg: string }
> = {
  emergency: {
    label: "緊急",
    emoji: "🚨",
    badge: "bg-red-100 text-red-700",
    dot: "bg-red-500",
    border: "border-2 border-red-300",
    bg: "bg-red-50",
  },
  semi: {
    label: "準緊急",
    emoji: "⚠️",
    badge: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
    border: "border-2 border-amber-300",
    bg: "bg-amber-50",
  },
  normal: {
    label: "通常",
    emoji: "✅",
    badge: "bg-green-100 text-green-700",
    dot: "bg-green-500",
    border: "",
    bg: "",
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
  toName: string;
  message: string;
  createdAt: string;
};

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
  | "moon";

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
} as const;

export type PortalKey = (typeof PORTAL_KEYS)[keyof typeof PORTAL_KEYS];
