// 朝礼サポート（指示書108・機能ID chorei）— 型・定数・正規化・輪番の純関数・読み書き
// - content_store 単一キー chorei_data に輪番（rotation）と投稿（posts）を同居。
//   投稿追加＋ポインタ前進を1回の書き込みで行うため（原子的更新）。
// - 輪番は投稿駆動＋手動調整（院長決定）。時間駆動の自動送りはしない（シフト制のためズレるだけ）。
// - 投稿の論理削除でポインタは巻き戻さない（朝礼が行われた事実は変わらない。ズレは管理画面で手動調整）。
// - order の要素は { staffId, name }。プロフィール登録者は staffId=userId、名簿のみの人は ""（承認済み）。
//   輪番の機能は name ベースで完結する（代理投稿でも進められる仕様のため本人照合は不要）。
// - リアクションは既存排他モデルを chorei_reactions キーで流用。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const CHOREI_KEY = "chorei_data";
// 排他リアクションの保存先（useNewsReactions(CHOREI_REACTIONS_KEY) で渡す）
export const CHOREI_REACTIONS_KEY = "chorei_reactions";

export type ChoreiMember = {
  staffId: string; // プロフィール登録者は userId・名簿のみの人は ""
  name: string;
};

export type ChoreiRotation = {
  order: ChoreiMember[];
  pointer: number; // order のインデックス。order が空のときは 0（当番表示なし）
  updatedAt: string;
};

export type ChoreiPost = {
  id: string;
  authorId: string; // 記名のみ
  authorName: string;
  body: string;
  onDutyName: string; // 投稿時点の当番名（記録として保存・当番未設定時は ""）
  advanced: boolean; // この投稿で当番を進めたかの記録
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
};

export type ChoreiData = {
  rotation: ChoreiRotation;
  posts: ChoreiPost[];
  updatedAt: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export const EMPTY_ROTATION: ChoreiRotation = {
  order: [],
  pointer: 0,
  updatedAt: "",
};

function normalizeMember(raw: unknown): ChoreiMember | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const name = str(g.name).trim();
  if (!name) return null;
  return { staffId: str(g.staffId), name };
}

export function normalizeRotation(raw: unknown): ChoreiRotation {
  if (!raw || typeof raw !== "object") return { ...EMPTY_ROTATION };
  const g = raw as Record<string, unknown>;
  const order = (Array.isArray(g.order) ? g.order : [])
    .map(normalizeMember)
    .filter((m): m is ChoreiMember => m !== null);
  const p = typeof g.pointer === "number" && Number.isFinite(g.pointer) ? g.pointer : 0;
  // 末尾超過・負値は 0 に丸める
  const pointer = order.length > 0 && p >= 0 && p < order.length ? Math.floor(p) : 0;
  return { order, pointer, updatedAt: str(g.updatedAt) };
}

function normalizePost(raw: unknown): ChoreiPost | null {
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
    onDutyName: str(g.onDutyName),
    advanced: g.advanced === true,
    createdAt,
    updatedAt: str(g.updatedAt) || createdAt,
    deleted: g.deleted === true,
  };
}

export function normalizeChoreiData(raw: unknown): ChoreiData {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const posts = (Array.isArray(g.posts) ? g.posts : [])
    .map(normalizePost)
    .filter((p): p is ChoreiPost => p !== null);
  return {
    rotation: normalizeRotation(g.rotation),
    posts,
    updatedAt: str(g.updatedAt),
  };
}

export async function loadChoreiData(): Promise<ChoreiData> {
  const obj = await loadPortalObject<unknown>(CHOREI_KEY, null);
  return normalizeChoreiData(obj);
}

export async function saveChoreiData(
  data: Pick<ChoreiData, "rotation" | "posts">
): Promise<boolean> {
  return savePortalObject(CHOREI_KEY, {
    rotation: data.rotation,
    posts: data.posts,
    updatedAt: new Date().toISOString(),
  });
}

export function genChoreiId(): string {
  return `chr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 表示用: 削除済みを除き新着順
export function visibleChoreiPosts(posts: ChoreiPost[]): ChoreiPost[] {
  return posts
    .filter((p) => !p.deleted)
    .slice()
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

// ─── 輪番の純関数 ───

// メンバーの同定キー（staffId が空の名簿メンバーは名前で同定）
function memberKey(m: ChoreiMember): string {
  return m.staffId || `name:${m.name}`;
}

export function currentDuty(rot: ChoreiRotation): ChoreiMember | null {
  return rot.order.length > 0 ? (rot.order[rot.pointer] ?? null) : null;
}

export function nextDuty(rot: ChoreiRotation): ChoreiMember | null {
  if (rot.order.length === 0) return null;
  return rot.order[(rot.pointer + 1) % rot.order.length] ?? null;
}

// ポインタを次へ進める（order が空なら何もしない）
export function advancePointer(rot: ChoreiRotation): ChoreiRotation {
  if (rot.order.length === 0) return rot;
  return {
    ...rot,
    pointer: (rot.pointer + 1) % rot.order.length,
    updatedAt: new Date().toISOString(),
  };
}

// order の編集を適用する（指示書108の追随ルール）:
// - 現在の当番（pointer 位置の人）が新 order に残っていればその人を指し続ける
// - 削除されていた場合は同位置（末尾超過なら 0）に丸める
export function applyOrderEdit(
  rot: ChoreiRotation,
  newOrder: ChoreiMember[]
): ChoreiRotation {
  let pointer = 0;
  if (newOrder.length > 0) {
    const cur = currentDuty(rot);
    if (cur) {
      const idx = newOrder.findIndex((m) => memberKey(m) === memberKey(cur));
      if (idx >= 0) {
        pointer = idx;
      } else {
        pointer = rot.pointer < newOrder.length ? rot.pointer : 0;
      }
    }
  }
  return { order: newOrder, pointer, updatedAt: new Date().toISOString() };
}

// 任意位置へジャンプ（「この人を当番にする」）
export function setPointer(rot: ChoreiRotation, index: number): ChoreiRotation {
  if (rot.order.length === 0) return rot;
  const pointer = index >= 0 && index < rot.order.length ? index : rot.pointer;
  return { ...rot, pointer, updatedAt: new Date().toISOString() };
}
