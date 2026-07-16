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

// ─── 正規化（1人1お知らせにつき1リアクション） ───

// 保存形状にはタイムスタンプが無いため「最新」は保存順で判定する。
// 採用ルール: 1人が同じお知らせに複数付けている場合、
//   保存されたキー順（JSONの挿入順）で最後に現れたものを残す。
//   setReaction は付け直すたびにそのキーを末尾へ移すため、末尾＝最後の操作になる。
// 同一キー内の同一IDの重複も1件に畳む。
export function normalizeNewsReactions(map: NewsReactionsMap): NewsReactionsMap {
  const next: NewsReactionsMap = {};
  for (const [newsId, entry] of Object.entries(map ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    // 各IDについて「最後に現れたキー」を決める
    const lastKeyOf = new Map<string, string>();
    for (const [key, list] of Object.entries(entry)) {
      for (const r of list ?? []) {
        if (r && typeof r.id === "string") lastKeyOf.set(r.id, key);
      }
    }
    const nextEntry: Partial<Record<ReactionKey, Reactor[]>> = {};
    for (const [key, list] of Object.entries(entry)) {
      const seen = new Set<string>();
      const kept = (list ?? []).filter((r) => {
        if (!r || typeof r.id !== "string") return false;
        if (lastKeyOf.get(r.id) !== key) return false;
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      if (kept.length > 0) nextEntry[key as ReactionKey] = kept;
    }
    if (Object.keys(nextEntry).length > 0) next[newsId] = nextEntry;
  }
  return next;
}

// 正規化が必要だった「ユーザー×お知らせ」の件数（正規化スクリプト・調査用）
export function countMultiReactionPairs(map: NewsReactionsMap): number {
  let count = 0;
  for (const entry of Object.values(map ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    const keysOf = new Map<string, Set<string>>();
    for (const [key, list] of Object.entries(entry)) {
      for (const r of list ?? []) {
        if (!r || typeof r.id !== "string") continue;
        const set = keysOf.get(r.id) ?? new Set<string>();
        set.add(key);
        keysOf.set(r.id, set);
      }
    }
    for (const set of keysOf.values()) if (set.size > 1) count++;
  }
  return count;
}

// ─── 保存・読込 ───

// 読込・保存の両方で正規化する（表示時点で必ず1つに見え、どの書き込み経路でも複数付かない）
export async function loadNewsReactions(): Promise<NewsReactionsMap> {
  const obj = await loadPortalObject<NewsReactionsMap | null>(
    NEWS_REACTIONS_KEY,
    null
  );
  return obj && typeof obj === "object" ? normalizeNewsReactions(obj) : {};
}

export async function saveNewsReactions(
  map: NewsReactionsMap
): Promise<boolean> {
  return savePortalObject(NEWS_REACTIONS_KEY, normalizeNewsReactions(map));
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

// 指定リアクションを「押した/取り消した」状態に強制設定する（指示書70: 1人1つの排他選択）。
// active=true のとき、同じお知らせ内のそのユーザーの他リアクションをすべて外してから付ける
// （別のを押すと1操作で乗り換わる）。active=false は取り消し。
// トグルの最終状態を楽観更新側で決め、保存時は最新データに同じ状態を適用する
// （再トグルだと並行更新で反転しうるため）。
export function setReaction(
  map: NewsReactionsMap,
  newsId: string,
  key: ReactionKey,
  reactor: Reactor,
  active: boolean
): NewsReactionsMap {
  const entry: Partial<Record<ReactionKey, Reactor[]>> = {};
  // このユーザーの既存リアクションを全種類から外す
  for (const [k, list] of Object.entries(map[newsId] ?? {})) {
    const kept = (list ?? []).filter((r) => r.id !== reactor.id);
    if (kept.length > 0) entry[k as ReactionKey] = kept;
  }
  // 付け直しでキーが末尾に移る＝正規化ルールの「保存順で最後＝最新」と一致する
  if (active) {
    entry[key] = [...(entry[key] ?? []), { id: reactor.id, name: reactor.name }];
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

// ─── 表示名の解決（指示書71） ───
// 保存されている name は「押した瞬間のスナップショット」なので、表示時に最新の
// プロフィール登録名で解決する（保存データは書き換えない・移行不要）。
// userId → プロフィール登録名。staff_profiles_index（loadProfilesIndex）から作る。
export type ReactorNameMap = Record<string, string>;

export const UNNAMED_REACTOR_LABEL = "名前未設定";

// 未ログインの匿名リアクションか（getAnonymousReactorId が付ける接頭辞で判定）
export function isAnonymousReactorId(id: string): boolean {
  return id.startsWith("anon_");
}

// メールアドレスは画面に出さない（指示書72）。
// getReactorIdentity はアカウント表示名が無いとき user.email を name に入れるため、
// スナップショットにメールが混ざる。その場合は名前なし扱いにする
// （＝指示書71の「アカウント表示名なしの人は名前未設定」を正しく満たす）。
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// 表示名を解決する。null = 「匿名」として集計する未ログインの人。
// 優先順位: プロフィール登録名 → 保存された name → 「名前未設定」
export function resolveReactorName(
  reactor: Reactor,
  profileNames: ReactorNameMap = {}
): string | null {
  const fromProfile = profileNames[reactor.id]?.trim();
  if (fromProfile) return fromProfile;
  const snapshot = reactor.name?.trim();
  if (snapshot && !looksLikeEmail(snapshot)) return snapshot;
  // 未ログインの匿名は従来どおり「匿名 ×N」にまとめる（指示書37Rの仕様を維持）
  return isAnonymousReactorId(reactor.id) ? null : UNNAMED_REACTOR_LABEL;
}

// 押した人の表示名リスト（名前あり→名前、匿名は「匿名 ×N」にまとめる）
export function reactorNamesLabel(
  list: Reactor[],
  profileNames: ReactorNameMap = {}
): string {
  const named: string[] = [];
  let anonCount = 0;
  for (const r of list) {
    const name = resolveReactorName(r, profileNames);
    if (name === null) anonCount++;
    else named.push(name);
  }
  const parts = [...named];
  if (anonCount > 0) {
    parts.push(anonCount === 1 ? "匿名" : `匿名 ×${anonCount}`);
  }
  return parts.join("、");
}
