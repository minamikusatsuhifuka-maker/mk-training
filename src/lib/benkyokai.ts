// 勉強会アーカイブ（指示書109・機能ID benkyokai）— 型・定数・正規化・読み書き
// - content_store 単一キー benkyokai_posts（{ posts, updatedAt }）。
// - 開催回ごとの記録: テーマ（必須）・開催日 heldOn YYYY-MM-DD（必須）・学びメモ（自由記述）。
// - 資料は資料庫（リンク型含む）に登録し、ここからは libraryRefs: {docId}[] の参照のみ
//   （直接URLを持たせない・院長決定）。0件も可（記録だけ先に残し後から紐付ける運用を許す）。
// - 記名のみ・論理削除。リアクションは既存排他モデルを benkyokai_reactions キーで流用。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const BENKYOKAI_KEY = "benkyokai_posts";
// 排他リアクションの保存先（useNewsReactions(BENKYOKAI_REACTIONS_KEY) で渡す）
export const BENKYOKAI_REACTIONS_KEY = "benkyokai_reactions";

export type BenkyokaiPost = {
  id: string;
  authorId: string; // 記名のみ
  authorName: string;
  title: string; // テーマ（必須）
  heldOn: string; // 開催日 "YYYY-MM-DD"（必須）
  body: string; // 学びメモ（自由記述・空も可）
  libraryRefs: { docId: string }[]; // 資料庫への参照（0件可・重複は正規化で1つに）
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
};

export type BenkyokaiStore = { posts: BenkyokaiPost[]; updatedAt: string };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// 開催日の正規化（"YYYY-MM-DD" のみ許可・不正は ""）
export function normalizeHeldOn(v: unknown): string {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// libraryRefs の正規化（docId の型チェック・同一 docId の重複は1つに）
export function normalizeLibraryRefs(input: unknown): { docId: string }[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: { docId: string }[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const docId = str((raw as Record<string, unknown>).docId);
    if (!docId || seen.has(docId)) continue;
    seen.add(docId);
    out.push({ docId });
  }
  return out;
}

// 1件の正規化（id・authorId・テーマ・開催日が欠けるものは破棄。学びメモは空も可）
export function normalizeBenkyokaiPost(raw: unknown): BenkyokaiPost | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const id = str(g.id);
  const authorId = str(g.authorId);
  const title = str(g.title).trim();
  const heldOn = normalizeHeldOn(g.heldOn);
  if (!id || !authorId || !title || !heldOn) return null;
  const createdAt = str(g.createdAt) || new Date(0).toISOString();
  return {
    id,
    authorId,
    authorName: str(g.authorName),
    title,
    heldOn,
    body: str(g.body),
    libraryRefs: normalizeLibraryRefs(g.libraryRefs),
    createdAt,
    updatedAt: str(g.updatedAt) || createdAt,
    deleted: g.deleted === true,
  };
}

export function normalizeBenkyokaiStore(raw: unknown): BenkyokaiStore {
  const data = raw as { posts?: unknown; updatedAt?: unknown } | null;
  const list = Array.isArray(data?.posts) ? data!.posts : [];
  const posts = list
    .map(normalizeBenkyokaiPost)
    .filter((p): p is BenkyokaiPost => p !== null);
  return { posts, updatedAt: str(data?.updatedAt) };
}

export async function loadBenkyokaiStore(): Promise<BenkyokaiStore> {
  const obj = await loadPortalObject<unknown>(BENKYOKAI_KEY, null);
  return normalizeBenkyokaiStore(obj);
}

export async function saveBenkyokaiStore(
  posts: BenkyokaiPost[]
): Promise<boolean> {
  return savePortalObject(BENKYOKAI_KEY, {
    posts,
    updatedAt: new Date().toISOString(),
  });
}

export function genBenkyokaiId(): string {
  return `bnk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 表示用: 削除済みを除き開催日降順（同日は作成日時降順のセカンダリキーで安定）
export function visibleBenkyokaiPosts(posts: BenkyokaiPost[]): BenkyokaiPost[] {
  return posts
    .filter((p) => !p.deleted)
    .slice()
    .sort(
      (a, b) =>
        (b.heldOn || "").localeCompare(a.heldOn || "") ||
        (b.createdAt || "").localeCompare(a.createdAt || "")
    );
}

// 開催日の表示（YYYY-MM-DD → YYYY/MM/DD）
export function formatHeldOn(heldOn: string): string {
  return heldOn.replaceAll("-", "/");
}
