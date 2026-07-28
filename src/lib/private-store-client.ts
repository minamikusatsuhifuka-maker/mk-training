// private_store のクライアント fetch ラッパー（指示書110・Phase 3 基盤）
// - 自己評価（111）・1on1ノート（112）はこのラッパーを呼ぶだけにする（重複実装禁止）。
// - データは認証付き /api/private-store 経由でのみ読み書きできる（anon 直読み不可）。
// - エラーの扱いをここに集約:
//   401 → kind "unauthenticated"（呼び出し側はログイン誘導を表示する）
//   403 → kind "forbidden"（権限なし表示）
//   その他 → kind "error"（メッセージ表示・再試行導線）

export type PrivateContentType = "self_review" | "one_on_one";

export type PrivateRecord<T = unknown> = {
  id: string;
  ownerId: string;
  contentType: string;
  recordKey: string;
  data: T;
  createdAt: string;
  updatedAt: string;
};

export type PrivateStoreErrorKind = "unauthenticated" | "forbidden" | "error";

export class PrivateStoreError extends Error {
  kind: PrivateStoreErrorKind;
  status: number;
  constructor(kind: PrivateStoreErrorKind, status: number, message: string) {
    super(message);
    this.name = "PrivateStoreError";
    this.kind = kind;
    this.status = status;
  }
}

const API = "/api/private-store";

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    const message = j.error || `処理に失敗しました (${res.status})`;
    const kind: PrivateStoreErrorKind =
      res.status === 401
        ? "unauthenticated"
        : res.status === 403
          ? "forbidden"
          : "error";
    throw new PrivateStoreError(kind, res.status, message);
  }
  return (await res.json()) as T;
}

// 自分のレコード一覧（updated_at 降順）
export async function listMine<T = unknown>(
  contentType: PrivateContentType
): Promise<PrivateRecord<T>[]> {
  const j = await call<{ records: PrivateRecord<T>[] }>(
    `${API}?contentType=${encodeURIComponent(contentType)}`
  );
  return j.records;
}

// 単一取得（無ければ null）。owner は管理者が他者のレコードを読むときのみ指定
export async function getRecord<T = unknown>(
  contentType: PrivateContentType,
  recordKey: string,
  owner?: string
): Promise<PrivateRecord<T> | null> {
  const params = new URLSearchParams({ contentType, recordKey });
  if (owner) params.set("owner", owner);
  const j = await call<{ record: PrivateRecord<T> | null }>(
    `${API}?${params.toString()}`
  );
  return j.record;
}

// upsert（(owner, contentType, recordKey) 単位）。owner は管理者のみ有効（非管理者はサーバー側で無視される）
export async function upsertRecord<T = unknown>(
  contentType: PrivateContentType,
  recordKey: string,
  data: T,
  owner?: string
): Promise<PrivateRecord<T>> {
  const j = await call<{ record: PrivateRecord<T> }>(API, {
    method: "PUT",
    body: JSON.stringify({ contentType, recordKey, data, ...(owner ? { owner } : {}) }),
  });
  return j.record;
}

// 物理削除（冪等）。owner は管理者のみ有効
export async function deleteRecord(
  contentType: PrivateContentType,
  recordKey: string,
  owner?: string
): Promise<void> {
  await call<{ ok: boolean }>(API, {
    method: "DELETE",
    body: JSON.stringify({ contentType, recordKey, ...(owner ? { owner } : {}) }),
  });
}

// 管理者用: 全員分の一覧（非管理者は 403 = PrivateStoreError("forbidden")）
export async function listAll<T = unknown>(
  contentType: PrivateContentType
): Promise<PrivateRecord<T>[]> {
  const j = await call<{ records: PrivateRecord<T>[] }>(
    `${API}?contentType=${encodeURIComponent(contentType)}&all=1`
  );
  return j.records;
}

// 管理者用: 特定スタッフの一覧
export async function listOwner<T = unknown>(
  contentType: PrivateContentType,
  owner: string
): Promise<PrivateRecord<T>[]> {
  const params = new URLSearchParams({ contentType, owner });
  const j = await call<{ records: PrivateRecord<T>[] }>(
    `${API}?${params.toString()}`
  );
  return j.records;
}
