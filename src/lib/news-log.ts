// お知らせ操作ログ・貢献集計のクライアント用ヘルパ（指示書36）
// 追記・読込の実体は portal-store の appendNewsLog / loadNewsLog。
// ここには actor 名の解決・update差分の要約・発信者別の集計を置く。

import { getSupabaseBrowserClient } from "./supabase-browser";
import { newsCategoryMeta } from "./news-history";
import {
  URGENCY_META,
  urgencyOf,
  type NewsItem,
  type NewsLogAction,
} from "@/types/portal";

// ログ一覧の操作種別メタ（表示用）
export const NEWS_LOG_ACTION_META: Record<
  NewsLogAction,
  { label: string; badge: string }
> = {
  create: { label: "🆕 作成", badge: "bg-teal-100 text-teal-700" },
  update: { label: "✏️ 更新", badge: "bg-blue-100 text-blue-700" },
  delete: { label: "🗑️ 削除", badge: "bg-red-100 text-red-700" },
  archive: { label: "🗄️ アーカイブ", badge: "bg-gray-200 text-gray-600" },
  restore: { label: "↩️ 復元", badge: "bg-amber-100 text-amber-700" },
};

// ログイン中ならプロフィール名（display_name→email の順）を返す。未ログインは null。
// ログインは必須にしない（段階導入②）ため、失敗はすべて null に落とす。
export async function getCurrentActorName(): Promise<string | null> {
  try {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const meta = user.user_metadata as Record<string, unknown> | null;
    const name =
      typeof meta?.display_name === "string" ? meta.display_name.trim() : "";
    return name || user.email || null;
  } catch {
    return null;
  }
}

// update の変更点要約（厳密diffではなく主要フィールドの変化のみ）
export function buildNewsUpdateDetail(
  before: NewsItem | undefined,
  patch: Partial<NewsItem>
): string {
  if (!before) return "更新";
  const parts: string[] = [];
  if (patch.title !== undefined && patch.title !== before.title) {
    parts.push("title変更");
  }
  if (patch.content !== undefined && patch.content !== before.content) {
    parts.push("本文変更");
  }
  if (patch.category !== undefined && patch.category !== before.category) {
    parts.push(
      `カテゴリ: ${newsCategoryMeta(before.category).label}→${newsCategoryMeta(patch.category).label}`
    );
  }
  if (patch.urgency !== undefined && patch.urgency !== before.urgency) {
    parts.push(
      `urgency: ${URGENCY_META[urgencyOf(before)].label}→${URGENCY_META[patch.urgency ?? "normal"].label}`
    );
  }
  if (patch.isActive !== undefined && patch.isActive !== before.isActive) {
    parts.push(patch.isActive ? "掲載ON" : "掲載OFF");
  }
  if (
    patch.noticeUntil !== undefined &&
    patch.noticeUntil !== before.noticeUntil
  ) {
    parts.push("通知期限変更");
  }
  if (patch.character !== undefined && patch.character !== before.character) {
    parts.push("キャラクター変更");
  }
  return parts.length > 0 ? parts.join(" / ") : "更新";
}

// ─── 貢献の集計（portal_news + archive の author 集計。ログ導入前の投稿も拾える） ───

export type ContributionRow = {
  author: string;
  thisMonth: number;
  lastMonth: number;
  total: number;
};

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

export function aggregateNewsContributions(
  items: Pick<NewsItem, "author" | "createdAt">[],
  now: Date = new Date()
): ContributionRow[] {
  const thisKey = monthKey(now);
  const lastKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const map = new Map<string, ContributionRow>();
  for (const item of items) {
    const author = (item.author ?? "").trim() || "（無記名）";
    const row =
      map.get(author) ?? { author, thisMonth: 0, lastMonth: 0, total: 0 };
    row.total += 1;
    const created = new Date(item.createdAt);
    if (!Number.isNaN(created.getTime())) {
      const key = monthKey(created);
      if (key === thisKey) row.thisMonth += 1;
      else if (key === lastKey) row.lastMonth += 1;
    }
    map.set(author, row);
  }
  return [...map.values()].sort(
    (a, b) => b.thisMonth - a.thisMonth || b.total - a.total
  );
}

// トップの「🙌 今月の共有」用: 今月の投稿者を件数順に最大 limit 名
export function monthlyTopContributors(
  items: Pick<NewsItem, "author" | "createdAt">[],
  limit = 3,
  now: Date = new Date()
): { author: string; count: number }[] {
  return aggregateNewsContributions(items, now)
    .filter((r) => r.thisMonth > 0)
    .sort((a, b) => b.thisMonth - a.thisMonth)
    .slice(0, limit)
    .map((r) => ({ author: r.author, count: r.thisMonth }));
}
