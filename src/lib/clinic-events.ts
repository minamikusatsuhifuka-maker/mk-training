// イベント機能（指示書132-A・機能ID events）— 型・正規化・クライアントAPIヘルパ
// - データは RLS全拒否テーブル clinic_events（1行1イベント＋config行）。
//   読み書きは /api/events（Service Role・サーバー側権限強制）経由のみ。
//   content_store に置かないのは anon 直書きを防げないため（STEP0承認の設計判断）。
// - 投稿・編集は「管理者 or 指定メンバー（config行 editorUserIds）」のみ。
//   fail-close: config未設定・取得失敗時は管理者のみ（サーバー側で強制）。
// - photos は132-B（写真ギャラリー）で使用。132-A時点では常に空配列。

export const EVENT_CONFIG_ID = "__config__";

export type EventPhoto = {
  path: string; // Storage パス（非公開バケット event-photos・実体掃除にも使う）
  uploadedAt: string;
  // 期限つき署名URL（GET時にAPIが都度発行・DBには保存しない=担保案1・132-B）
  signedUrl?: string;
};

export type EventLibraryRef = { docId: string };

export type ClinicEvent = {
  id: string;
  title: string;
  heldOn: string; // "YYYY-MM-DD"
  description: string;
  libraryRefs: EventLibraryRef[]; // 資料庫docId参照（実体は資料庫の1ファイル）
  photos: EventPhoto[];
  deleted: boolean; // 論理削除（管理タブから復元可）
  createdAt: string;
  updatedAt: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function ymd(v: unknown): string {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export function normalizeEventLibraryRefs(input: unknown): EventLibraryRef[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: EventLibraryRef[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const docId = str((raw as Record<string, unknown>).docId);
    if (!docId || seen.has(docId)) continue;
    seen.add(docId);
    out.push({ docId });
  }
  return out;
}

export function normalizeEventPhotos(input: unknown): EventPhoto[] {
  if (!Array.isArray(input)) return [];
  const out: EventPhoto[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const g = raw as Record<string, unknown>;
    const path = str(g.path);
    if (!path) continue;
    // signedUrl はDBに保存しない（GET時にAPIが付与するだけ・保存経路では捨てる）
    out.push({ path, uploadedAt: str(g.uploadedAt) });
  }
  return out;
}

// 1件の正規化（id・タイトル・開催日が欠けるものは破棄）。サーバー・クライアント共用
export function normalizeClinicEvent(
  id: string,
  raw: unknown
): ClinicEvent | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const title = str(g.title).trim();
  const heldOn = ymd(g.heldOn);
  if (!title || !heldOn) return null;
  const createdAt = str(g.createdAt) || new Date(0).toISOString();
  return {
    id,
    title,
    heldOn,
    description: str(g.description),
    libraryRefs: normalizeEventLibraryRefs(g.libraryRefs),
    photos: normalizeEventPhotos(g.photos),
    deleted: g.deleted === true,
    createdAt,
    updatedAt: str(g.updatedAt) || createdAt,
  };
}

// 開催日降順（同日は作成降順）
export function sortEventsByHeldOn(events: ClinicEvent[]): ClinicEvent[] {
  return events
    .slice()
    .sort(
      (a, b) =>
        b.heldOn.localeCompare(a.heldOn) ||
        (b.createdAt || "").localeCompare(a.createdAt || "")
    );
}

// 年ごとの区切り表示用グルーピング（開催日降順のまま年見出しを挿入する用途）
export function groupEventsByYear(
  events: ClinicEvent[]
): { year: string; items: ClinicEvent[] }[] {
  const groups: { year: string; items: ClinicEvent[] }[] = [];
  for (const ev of sortEventsByHeldOn(events)) {
    const year = ev.heldOn.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.items.push(ev);
    else groups.push({ year, items: [ev] });
  }
  return groups;
}

// ─── クライアント → /api/events 呼び出しヘルパ ───

export type EventsListResponse = {
  events: ClinicEvent[];
  canEdit: boolean;
  isAdmin: boolean;
  // 写真の保管庫（バケット event-photos）が未作成か（165）。
  // 編集できる人にだけサーバーが立てる。閲覧専用の人には常に false。
  photoBucketMissing?: boolean;
};

async function callEventsApi<T>(init: RequestInit & { query?: string }): Promise<T> {
  const res = await fetch(`/api/events${init.query ?? ""}`, {
    cache: "no-store",
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(j.error || `イベントAPIでエラーが発生しました (${res.status})`);
  }
  return j;
}

// 一覧取得（all=true で削除済み含む全件＝管理タブ用。権限フラグ付き）
export async function fetchEvents(all = false): Promise<EventsListResponse> {
  return callEventsApi<EventsListResponse>({
    method: "GET",
    query: all ? "?all=1" : "",
  });
}

export async function createEvent(input: {
  title: string;
  heldOn: string;
  description: string;
  libraryRefs: EventLibraryRef[];
}): Promise<ClinicEvent> {
  const j = await callEventsApi<{ event: ClinicEvent }>({
    method: "POST",
    body: JSON.stringify(input),
  });
  return j.event;
}

export async function updateEvent(
  id: string,
  patch: Partial<
    Pick<
      ClinicEvent,
      "title" | "heldOn" | "description" | "libraryRefs" | "deleted"
    >
  >
): Promise<ClinicEvent> {
  const j = await callEventsApi<{ event: ClinicEvent }>({
    method: "PATCH",
    body: JSON.stringify({ id, ...patch }),
  });
  return j.event;
}

// 一括論理削除（指示書128の原則: 1操作=1リクエスト）
export async function bulkSetEventsDeleted(
  ids: string[],
  deleted: boolean
): Promise<void> {
  await callEventsApi({
    method: "PATCH",
    body: JSON.stringify({ ids, deleted }),
  });
}

// 完全削除（管理者のみ・写真実体もサーバー側で掃除＝孤児ゼロ原則）
export async function deleteEventForever(id: string): Promise<void> {
  await callEventsApi({
    method: "DELETE",
    query: `?id=${encodeURIComponent(id)}`,
  });
}

// 写真アップロード（132-B・multipart。圧縮済みBlobを渡す）
export async function uploadEventPhotos(
  eventId: string,
  blobs: Blob[]
): Promise<ClinicEvent> {
  const form = new FormData();
  form.append("eventId", eventId);
  blobs.forEach((b, i) => form.append("files", b, `photo-${i}.jpg`));
  const res = await fetch("/api/events/photos", { method: "POST", body: form });
  const j = (await res.json().catch(() => ({}))) as {
    event?: ClinicEvent;
    error?: string;
  };
  if (!res.ok || !j.event) {
    throw new Error(j.error || `写真のアップロードに失敗しました (${res.status})`);
  }
  return j.event;
}

// 写真の付け外し（Storage実体も即削除・元に戻せない）
export async function removeEventPhoto(
  eventId: string,
  path: string
): Promise<ClinicEvent> {
  const res = await fetch("/api/events/photos", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventId, path }),
  });
  const j = (await res.json().catch(() => ({}))) as {
    event?: ClinicEvent;
    error?: string;
  };
  if (!res.ok || !j.event) {
    throw new Error(j.error || `写真の削除に失敗しました (${res.status})`);
  }
  return j.event;
}

// 編集メンバー設定（取得は一覧APIとは別に管理タブで使用・管理者のみ）
export async function fetchEventEditors(): Promise<string[]> {
  const j = await callEventsApi<{ editorUserIds: string[] }>({
    method: "GET",
    query: "?config=1",
  });
  return j.editorUserIds;
}

export async function saveEventEditors(userIds: string[]): Promise<void> {
  await callEventsApi({
    method: "PUT",
    body: JSON.stringify({ editorUserIds: userIds }),
  });
}
