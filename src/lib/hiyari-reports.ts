// ヒヤリハット報告（指示書106・機能ID hiyari）— 型・定数・正規化・読み書き
// - content_store 単一キー hiyari_reports（{ posts, updatedAt }）。
//   既存「気づきシェア」の portal_hiyari とは完全に別キー・既存は無改変。
// - 記名基本＋匿名選択可（院長決定）。真の匿名を厳守: 匿名時は authorId を
//   フィールドごと保存しない（管理者にも特定できない。裏で特定できる実装は禁止）。
// - 論理削除（deleted: true・管理画面から復元）。
// - リアクションは既存排他モデルを hiyari_reactions キーで流用。
// - 雛形は lib/kizuki.ts。authorId が optional な点だけが本質的な違い
//   （kizuki の normalize は authorId 必須のため流用不可＝専用型 HiyariReport を持つ）。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const HIYARI_REPORTS_KEY = "hiyari_reports";
// 排他リアクションの保存先（useNewsReactions(HIYARI_REACTIONS_KEY) で渡す）
export const HIYARI_REACTIONS_KEY = "hiyari_reactions";

export type HiyariReport = {
  id: string;
  authorId?: string; // 記名時のみ。匿名時はフィールド自体を保存しない（真の匿名）
  authorName: string; // 記名時はプロフィール名／匿名時は「匿名」
  body: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean; // 論理削除（管理画面から復元できる）
};

export type HiyariReportStore = { posts: HiyariReport[]; updatedAt: string };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// 1件の正規化（id・本文が欠けるものは破棄。authorId は無くてよい＝匿名）
export function normalizeHiyariReport(raw: unknown): HiyariReport | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const id = str(g.id);
  const body = str(g.body);
  if (!id || !body.trim()) return null;
  const createdAt = str(g.createdAt) || new Date(0).toISOString();
  const authorId = str(g.authorId);
  return {
    id,
    // 匿名投稿の authorId を後から生やさない（空文字も含めない）
    ...(authorId ? { authorId } : {}),
    authorName: str(g.authorName) || "匿名",
    body,
    createdAt,
    updatedAt: str(g.updatedAt) || createdAt,
    deleted: g.deleted === true,
  };
}

export function normalizeHiyariStore(raw: unknown): HiyariReportStore {
  const data = raw as { posts?: unknown; updatedAt?: unknown } | null;
  const list = Array.isArray(data?.posts) ? data!.posts : [];
  const posts = list
    .map(normalizeHiyariReport)
    .filter((p): p is HiyariReport => p !== null);
  return { posts, updatedAt: str(data?.updatedAt) };
}

export async function loadHiyariStore(): Promise<HiyariReportStore> {
  const obj = await loadPortalObject<unknown>(HIYARI_REPORTS_KEY, null);
  return normalizeHiyariStore(obj);
}

export async function saveHiyariStore(
  posts: HiyariReport[]
): Promise<boolean> {
  return savePortalObject(HIYARI_REPORTS_KEY, {
    posts,
    updatedAt: new Date().toISOString(),
  });
}

export function genHiyariReportId(): string {
  return `hyr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 表示用: 削除済みを除き新着順
export function visibleHiyariReports(posts: HiyariReport[]): HiyariReport[] {
  return posts
    .filter((p) => !p.deleted)
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
