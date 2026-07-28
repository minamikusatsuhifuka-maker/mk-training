// マニュアル下書き（指示書107・機能ID manual_draft）— 型・定数・正規化・読み書き
// - content_store 単一キー manual_drafts（{ posts, updatedAt }）。
// - 記名のみ（マニュアルは書き手が分かることに価値がある。匿名オプションなし）。
// - status: "draft"（✏️ 執筆中）/ "registered"（📗 資料庫に登録済み）の2値のみ。
// - libraryRef: { docId } は登録済み時のみ（資料ID参照方式・院長承認済み）。
//   URL文字列は版差し替えで変わるため保存しない。リンクは /library?doc=<docId>。
// - 論理削除。リアクションは既存排他モデルを manual_draft_reactions キーで流用。
// - 運用フロー想定: スタッフが下書き → 院長が内容確認 → 正式マニュアルを作成し
//   資料庫に登録（従来の資料庫の登録手順） → 管理タブで下書きに紐付け。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const MANUAL_DRAFTS_KEY = "manual_drafts";
// 排他リアクションの保存先（useNewsReactions(MANUAL_DRAFT_REACTIONS_KEY) で渡す）
export const MANUAL_DRAFT_REACTIONS_KEY = "manual_draft_reactions";

export type ManualDraftStatus = "draft" | "registered";

export type ManualDraft = {
  id: string;
  authorId: string; // 記名のみ（必須）
  authorName: string; // 投稿時点の表示名スナップショット
  title: string; // 必須
  body: string;
  status: ManualDraftStatus;
  libraryRef?: { docId: string }; // 資料庫登録済み時のみ（未登録時はフィールド自体なし）
  createdAt: string;
  updatedAt: string;
  deleted: boolean; // 論理削除（管理画面から復元できる）
};

export type ManualDraftStore = { posts: ManualDraft[]; updatedAt: string };

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// 1件の正規化（id・authorId・タイトル・本文が欠けるものは破棄）。
// status と libraryRef は整合を強制: registered かつ docId ありのときだけ両方保持、
// どちらか欠けたら draft＋libraryRef なしに倒す。
export function normalizeManualDraft(raw: unknown): ManualDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const id = str(g.id);
  const authorId = str(g.authorId);
  const title = str(g.title).trim();
  const body = str(g.body);
  if (!id || !authorId || !title || !body.trim()) return null;
  const createdAt = str(g.createdAt) || new Date(0).toISOString();
  const ref = g.libraryRef as { docId?: unknown } | null | undefined;
  const docId = ref && typeof ref === "object" ? str(ref.docId) : "";
  const registered = g.status === "registered" && !!docId;
  return {
    id,
    authorId,
    authorName: str(g.authorName),
    title,
    body,
    status: registered ? "registered" : "draft",
    ...(registered ? { libraryRef: { docId } } : {}),
    createdAt,
    updatedAt: str(g.updatedAt) || createdAt,
    deleted: g.deleted === true,
  };
}

export function normalizeManualDraftStore(raw: unknown): ManualDraftStore {
  const data = raw as { posts?: unknown; updatedAt?: unknown } | null;
  const list = Array.isArray(data?.posts) ? data!.posts : [];
  const posts = list
    .map(normalizeManualDraft)
    .filter((p): p is ManualDraft => p !== null);
  return { posts, updatedAt: str(data?.updatedAt) };
}

export async function loadManualDraftStore(): Promise<ManualDraftStore> {
  const obj = await loadPortalObject<unknown>(MANUAL_DRAFTS_KEY, null);
  return normalizeManualDraftStore(obj);
}

export async function saveManualDraftStore(
  posts: ManualDraft[]
): Promise<boolean> {
  return savePortalObject(MANUAL_DRAFTS_KEY, {
    posts,
    updatedAt: new Date().toISOString(),
  });
}

export function genManualDraftId(): string {
  return `mnd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 表示用: 削除済みを除き新着順
export function visibleManualDrafts(posts: ManualDraft[]): ManualDraft[] {
  return posts
    .filter((p) => !p.deleted)
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

// ステータスバッジの表示メタ（スタッフ側・管理側で共用）
export const MANUAL_DRAFT_STATUS_META: Record<
  ManualDraftStatus,
  { label: string; className: string }
> = {
  draft: { label: "✏️ 執筆中", className: "bg-amber-100 text-amber-800" },
  registered: {
    label: "📗 資料庫に登録済み",
    className: "bg-emerald-100 text-emerald-700",
  },
};
