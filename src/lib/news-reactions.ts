// お知らせリアクション（指示書37R・匿名OK）
// データは content_store `portal_news_reactions` に単一オブジェクトで保存:
//   { [newsId]: { [reactionKey]: { id, name|null }[] } }
// identity:
//   - ログイン中 = userId + プロフィール名
//   - 未ログイン = localStorage の匿名ID(uuid)。名前は任意（null=「匿名」表示）。
//     名前の localStorage キーは指示書36の投稿フォームと共用。

import { loadPortalObject, savePortalObject } from "./portal-store";
import { getSupabaseBrowserClient } from "./supabase-browser";

export const NEWS_REACTIONS_KEY = "portal_news_reactions";

// 発信者名/リアクション名の記憶キー（指示書36の投稿フォームと共用）
export const NEWS_AUTHOR_LS_KEY = "portal_news_author";

// 匿名リアクションの内部識別ID（画面には表示しない）
const REACTOR_ID_LS_KEY = "portal_reactor_id";

export type ReactionKey = "like" | "ok" | "heart" | "thanks" | "cheer";

export const REACTION_META: { key: ReactionKey; emoji: string; label: string }[] =
  [
    { key: "like", emoji: "👍", label: "いいね" },
    { key: "ok", emoji: "✅", label: "了解です" },
    { key: "heart", emoji: "❤️", label: "ハート" },
    { key: "thanks", emoji: "🙏", label: "ありがとう" },
    { key: "cheer", emoji: "🎉", label: "おめでとう" },
  ];

export type Reactor = { id: string; name: string | null };

export type NewsReactionsMap = Record<
  string,
  Partial<Record<ReactionKey, Reactor[]>>
>;

// ─── 保存・読込 ───

export async function loadNewsReactions(): Promise<NewsReactionsMap> {
  const obj = await loadPortalObject<NewsReactionsMap | null>(
    NEWS_REACTIONS_KEY,
    null
  );
  return obj && typeof obj === "object" ? obj : {};
}

export async function saveNewsReactions(
  map: NewsReactionsMap
): Promise<boolean> {
  return savePortalObject(NEWS_REACTIONS_KEY, map);
}

// ─── identity ───

// 匿名ID: 初回に uuid を生成して localStorage に保存（端末単位）。
// これによりトグル（取り消し）が同一端末で正しく効き、別端末の匿名は別カウントになる。
export function getAnonymousReactorId(): string {
  try {
    let id = localStorage.getItem(REACTOR_ID_LS_KEY);
    if (!id) {
      id = `anon_${crypto.randomUUID()}`;
      localStorage.setItem(REACTOR_ID_LS_KEY, id);
    }
    return id;
  } catch {
    // localStorage不可の環境: セッション内だけ有効なIDで動かす（表示は匿名のまま）
    return "anon_volatile";
  }
}

export async function getReactorIdentity(): Promise<{
  reactor: Reactor;
  loggedIn: boolean;
}> {
  try {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const meta = user.user_metadata as Record<string, unknown> | null;
      const name =
        typeof meta?.display_name === "string" ? meta.display_name.trim() : "";
      return {
        reactor: { id: user.id, name: name || user.email || null },
        loggedIn: true,
      };
    }
  } catch {
    // 未ログイン扱いにフォールバック
  }
  let storedName: string | null = null;
  try {
    storedName = localStorage.getItem(NEWS_AUTHOR_LS_KEY)?.trim() || null;
  } catch {
    storedName = null;
  }
  return {
    reactor: { id: getAnonymousReactorId(), name: storedName },
    loggedIn: false,
  };
}

// ─── 純関数（トグル・名前反映・集計） ───

// 指定リアクションを「押した/取り消した」状態に強制設定する。
// トグルの最終状態を楽観更新側で決め、保存時は最新データに同じ状態を適用する
// （再トグルだと並行更新で反転しうるため）。
export function setReaction(
  map: NewsReactionsMap,
  newsId: string,
  key: ReactionKey,
  reactor: Reactor,
  active: boolean
): NewsReactionsMap {
  const entry = { ...(map[newsId] ?? {}) };
  const list = (entry[key] ?? []).filter((r) => r.id !== reactor.id);
  const nextList = active ? [...list, { id: reactor.id, name: reactor.name }] : list;
  if (nextList.length > 0) {
    entry[key] = nextList;
  } else {
    delete entry[key];
  }
  const next = { ...map, [newsId]: entry };
  if (Object.keys(entry).length === 0) delete next[newsId];
  return next;
}

export function hasReacted(
  map: NewsReactionsMap,
  newsId: string,
  key: ReactionKey,
  reactorId: string
): boolean {
  return (map[newsId]?.[key] ?? []).some((r) => r.id === reactorId);
}

// 同一IDの全リアクションの表示名を更新する（名前設定/変更/匿名に戻す）。
// 過去に匿名で押した分も同じIDなので、設定後は遡って名前表示になる。
export function applyReactorName(
  map: NewsReactionsMap,
  reactorId: string,
  name: string | null
): NewsReactionsMap {
  const next: NewsReactionsMap = {};
  for (const [newsId, entry] of Object.entries(map)) {
    const nextEntry: Partial<Record<ReactionKey, Reactor[]>> = {};
    for (const [key, list] of Object.entries(entry)) {
      nextEntry[key as ReactionKey] = (list ?? []).map((r) =>
        r.id === reactorId ? { ...r, name } : r
      );
    }
    next[newsId] = nextEntry;
  }
  return next;
}

// お知らせ1件の種類別件数（サマリー表示用）
export function reactionCounts(
  map: NewsReactionsMap,
  newsId: string
): Partial<Record<ReactionKey, number>> {
  const entry = map[newsId];
  if (!entry) return {};
  const counts: Partial<Record<ReactionKey, number>> = {};
  for (const m of REACTION_META) {
    const n = entry[m.key]?.length ?? 0;
    if (n > 0) counts[m.key] = n;
  }
  return counts;
}

// お知らせ1件の合計リアクション数（管理の貢献集計用）
export function totalReactionsOf(
  map: NewsReactionsMap,
  newsId: string
): number {
  const entry = map[newsId];
  if (!entry) return 0;
  return Object.values(entry).reduce((sum, list) => sum + (list?.length ?? 0), 0);
}

// 押した人の表示名リスト（名前あり→名前、匿名は「匿名 ×N」にまとめる）
export function reactorNamesLabel(list: Reactor[]): string {
  const named = list.filter((r) => r.name).map((r) => r.name as string);
  const anonCount = list.length - named.length;
  const parts = [...named];
  if (anonCount > 0) {
    parts.push(anonCount === 1 ? "匿名" : `匿名 ×${anonCount}`);
  }
  return parts.join("、");
}
