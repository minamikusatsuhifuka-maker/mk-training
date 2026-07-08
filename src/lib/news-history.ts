// お知らせの「共有履歴」共通ロジック
// portal_news（現行掲載中）と portal_news_archive（期限切れ）を統合し、
// キーワード検索・グループ分け（カテゴリ／緊急度／年月）を提供する。
// データの持ち方は変えない（読み取り専用の統合ビュー）。

import { loadPortalItems } from "./portal-store";
import {
  PORTAL_KEYS,
  urgencyOf,
  type ArchivedNewsItem,
  type NewsCategory,
  type NewsItem,
  type Urgency,
} from "@/types/portal";

// ─── 統合履歴アイテム ───
export type NewsHistoryStatus = "live" | "archived";

export type NewsHistoryItem = NewsItem & {
  /** live=掲載中（portal_news）/ archived=期限切れ（portal_news_archive） */
  status: NewsHistoryStatus;
  /** archived のときのみ */
  archivedAt?: string;
};

export const HISTORY_STATUS_META: Record<
  NewsHistoryStatus,
  { label: string; badge: string }
> = {
  live: { label: "掲載中", badge: "bg-teal-100 text-teal-700" },
  archived: { label: "期限切れ", badge: "bg-gray-200 text-gray-600" },
};

// カテゴリの表示メタ（スタッフ側トップと同じ配色）
export const NEWS_CATEGORY_OPTIONS: {
  value: NewsCategory;
  label: string;
  badge: string;
  dot: string;
}[] = [
  { value: "important", label: "重要", badge: "bg-red-50 text-red-700", dot: "bg-red-500" },
  { value: "drug_info", label: "新薬情報", badge: "bg-green-50 text-green-700", dot: "bg-green-500" },
  { value: "notice", label: "お知らせ", badge: "bg-gray-100 text-gray-600", dot: "bg-gray-400" },
  { value: "event", label: "イベント", badge: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
];

export function newsCategoryMeta(c: NewsCategory) {
  return (
    NEWS_CATEGORY_OPTIONS.find((o) => o.value === c) ??
    NEWS_CATEGORY_OPTIONS.find((o) => o.value === "notice")!
  );
}

// ─── 統合ビュー ───
// 既にメモリ上にある配列から履歴を組み立てる（管理画面用）。createdAt降順。
export function buildNewsHistory(
  live: NewsItem[],
  archived: ArchivedNewsItem[]
): NewsHistoryItem[] {
  const items: NewsHistoryItem[] = [
    ...live.map((n) => ({ ...n, status: "live" as const })),
    ...archived.map((n) => ({ ...n, status: "archived" as const })),
  ];
  return items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Supabase から両テーブル分を読み込んで統合する（スタッフ側ページ用）
export async function getNewsHistory(): Promise<NewsHistoryItem[]> {
  const [live, archived] = await Promise.all([
    loadPortalItems<NewsItem>(PORTAL_KEYS.news, []),
    loadPortalItems<ArchivedNewsItem>(PORTAL_KEYS.newsArchive, []),
  ]);
  return buildNewsHistory(live, archived);
}

// ─── 検索・絞り込み ───
export type NewsHistoryFilter = {
  /** 空白区切りの複数キーワードはAND（タイトル・本文の部分一致） */
  keyword?: string;
  category?: NewsCategory | "all";
  urgency?: Urgency | "all";
  status?: NewsHistoryStatus | "all";
  /** "YYYY-MM-DD"（createdAt がこの日以降） */
  dateFrom?: string;
  /** "YYYY-MM-DD"（createdAt がこの日以前） */
  dateTo?: string;
};

export function filterNewsHistory(
  items: NewsHistoryItem[],
  f: NewsHistoryFilter
): NewsHistoryItem[] {
  // 全角スペースも区切りとして扱う
  const keywords = (f.keyword ?? "")
    .toLowerCase()
    .split(/[\s　]+/)
    .filter(Boolean);

  const fromMs = f.dateFrom ? new Date(`${f.dateFrom}T00:00:00`).getTime() : NaN;
  const toMs = f.dateTo ? new Date(`${f.dateTo}T23:59:59.999`).getTime() : NaN;

  return items.filter((n) => {
    if (f.category && f.category !== "all" && n.category !== f.category) return false;
    if (f.urgency && f.urgency !== "all" && urgencyOf(n) !== f.urgency) return false;
    if (f.status && f.status !== "all" && n.status !== f.status) return false;

    if (!Number.isNaN(fromMs) || !Number.isNaN(toMs)) {
      const created = new Date(n.createdAt).getTime();
      if (Number.isNaN(created)) return false;
      if (!Number.isNaN(fromMs) && created < fromMs) return false;
      if (!Number.isNaN(toMs) && created > toMs) return false;
    }

    if (keywords.length > 0) {
      const haystack = `${n.title}\n${n.content}`.toLowerCase();
      if (!keywords.every((k) => haystack.includes(k))) return false;
    }
    return true;
  });
}

// ─── グループ分け ───
export type NewsHistoryGroupAxis = "flat" | "category" | "urgency" | "month";

export type NewsHistoryGroup = {
  key: string;
  label: string;
  items: NewsHistoryItem[];
};

const URGENCY_ORDER: { value: Urgency; label: string }[] = [
  { value: "emergency", label: "🚨 緊急" },
  { value: "semi", label: "⚠️ 準緊急" },
  { value: "normal", label: "✅ 通常" },
];

/** createdAt から "2026年7月" 形式のラベルを返す（不正日付は "日付不明"） */
export function yearMonthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "日付不明";
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function yearMonthSortKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "0000-00"; // 不正日付は末尾へ
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// items（createdAt降順を想定）を軸ごとにグループ化。空グループは返さない。
export function groupNewsHistory(
  items: NewsHistoryItem[],
  axis: NewsHistoryGroupAxis
): NewsHistoryGroup[] {
  if (axis === "flat") {
    return items.length > 0
      ? [{ key: "all", label: "すべて（新しい順）", items }]
      : [];
  }

  if (axis === "category") {
    return NEWS_CATEGORY_OPTIONS.map((c) => ({
      key: c.value,
      label: c.label,
      items: items.filter((n) => n.category === c.value),
    })).filter((g) => g.items.length > 0);
  }

  if (axis === "urgency") {
    return URGENCY_ORDER.map((u) => ({
      key: u.value,
      label: u.label,
      items: items.filter((n) => urgencyOf(n) === u.value),
    })).filter((g) => g.items.length > 0);
  }

  // 年月（新しい月から）
  const map = new Map<string, NewsHistoryGroup>();
  for (const n of items) {
    const key = yearMonthSortKey(n.createdAt);
    if (!map.has(key)) {
      map.set(key, { key, label: yearMonthLabel(n.createdAt), items: [] });
    }
    map.get(key)!.items.push(n);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}
