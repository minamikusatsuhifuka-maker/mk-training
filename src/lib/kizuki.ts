// 日々の気づき投稿（指示書104・機能ID kizuki）— 型・定数・正規化・読み書き
// - content_store 単一キー kizuki_posts（{ posts, updatedAt }）。新テーブルは作らない。
// - 記名式（匿名なし）・論理削除（deleted: true で非表示化・物理削除しない）。
// - リアクションは既存の排他モデル（lib/news-reactions.ts）を別キー kizuki_reactions で流用。
// - 既存「気づきシェア」（portal_hiyari・ホームの複合機能）とは完全に別物・無干渉（B案）。
//   その整理は指示書106（ヒヤリハット）の STEP0 で判断する。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const KIZUKI_KEY = "kizuki_posts";
// 排他リアクションの保存先（useNewsReactions(KIZUKI_REACTIONS_KEY) で渡す）
export const KIZUKI_REACTIONS_KEY = "kizuki_reactions";

export type KizukiPost = {
  id: string;
  authorId: string; // Supabase Auth の userId（リアクションの identity と同じ体系）
  authorName: string; // 投稿時点の表示名スナップショット
  body: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean; // 論理削除（管理画面から復元できる）
};

export type KizukiStore = { posts: KizukiPost[]; updatedAt: string };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// 1件の正規化（id・authorId・本文が欠けるものは破棄）
export function normalizeKizukiPost(raw: unknown): KizukiPost | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const id = str(g.id);
  const authorId = str(g.authorId);
  const body = str(g.body);
  if (!id || !authorId || !body.trim()) return null;
  const createdAt = str(g.createdAt) || new Date(0).toISOString();
  return {
    id,
    authorId,
    authorName: str(g.authorName),
    body,
    createdAt,
    updatedAt: str(g.updatedAt) || createdAt,
    deleted: g.deleted === true,
  };
}

export function normalizeKizukiStore(raw: unknown): KizukiStore {
  const data = raw as { posts?: unknown; updatedAt?: unknown } | null;
  const list = Array.isArray(data?.posts) ? data!.posts : [];
  const posts = list
    .map(normalizeKizukiPost)
    .filter((p): p is KizukiPost => p !== null);
  return { posts, updatedAt: str(data?.updatedAt) };
}

export async function loadKizukiStore(): Promise<KizukiStore> {
  const obj = await loadPortalObject<unknown>(KIZUKI_KEY, null);
  return normalizeKizukiStore(obj);
}

export async function saveKizukiStore(posts: KizukiPost[]): Promise<boolean> {
  return savePortalObject(KIZUKI_KEY, {
    posts,
    updatedAt: new Date().toISOString(),
  });
}

export function genKizukiId(): string {
  return `kzk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 表示用: 削除済みを除き新着順
export function visibleKizukiPosts(posts: KizukiPost[]): KizukiPost[] {
  return posts
    .filter((p) => !p.deleted)
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
