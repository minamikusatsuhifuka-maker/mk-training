export type NewsCategory = "important" | "drug_info" | "notice" | "event";

export type NewsItem = {
  id: string;
  title: string;
  category: NewsCategory;
  author: string;
  content: string;
  createdAt: string;
  isActive: boolean;
};

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
export type CharacterSvgType = "cat" | "dog" | "rabbit" | "bird";

export type CharacterSettings = {
  enabled: boolean;
  characterStyle: "emoji" | "svg";
  size: number; // px (30-120)
  speed: number; // 横切る秒数 (5-30)
  emoji: string; // 絵文字スタイルの場合
  svgType: CharacterSvgType; // イラストスタイルの場合
};

export const DEFAULT_CHARACTER_SETTINGS: CharacterSettings = {
  enabled: true,
  characterStyle: "emoji",
  size: 60,
  speed: 12,
  emoji: "🐈",
  svgType: "cat",
};

// content_store の id（単一オブジェクトとして保存）
export const CHARACTER_SETTINGS_KEY = "character_settings";

export const PORTAL_KEYS = {
  news: "portal_news",
  hiyari: "portal_hiyari",
  thankyou: "portal_thankyou",
  policy: "portal_policy",
  todayWord: "portal_today_word",
} as const;

export type PortalKey = (typeof PORTAL_KEYS)[keyof typeof PORTAL_KEYS];
