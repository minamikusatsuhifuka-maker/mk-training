// イベント機能のサーバー共通部（132-A/132-B・/api/events と /api/events/photos で共用）
// - 認可: 管理者 or config行 editorUserIds（fail-close: 未設定・取得失敗=管理者のみ）。
// - 写真バケット: event-photos（**非公開**・閲覧は署名URLのみ=指示書132-B担保案1）。
//   staff-photos（公開バケット）には置かない（未ログイン到達を防ぐ）。

import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "./supabase-admin";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import {
  EVENT_CONFIG_ID,
  normalizeClinicEvent,
  type ClinicEvent,
} from "./clinic-events";

export { ServiceRoleMissingError };

export const EVENTS_TABLE = "clinic_events";
export const EVENT_PHOTOS_BUCKET = "event-photos";
export const EVENT_PHOTO_MAX_BYTES = 8 * 1024 * 1024; // 8MB/枚（サーバー側強制）
export const EVENT_PHOTO_MAX_COUNT = 20; // 1回のアップロード上限
export const EVENT_PHOTO_SIGN_TTL = 3600; // 署名URL有効期間（秒）

export type EventsAdminClient = ReturnType<typeof createSupabaseAdminClient>;

// 編集メンバー設定の取得（無い・壊れている場合は空＝fail-close）
export async function loadEditorUserIds(
  admin: EventsAdminClient
): Promise<string[]> {
  try {
    const { data } = await admin
      .from(EVENTS_TABLE)
      .select("data")
      .eq("id", EVENT_CONFIG_ID)
      .maybeSingle();
    const ids = (data?.data as { editorUserIds?: unknown } | null)
      ?.editorUserIds;
    return Array.isArray(ids)
      ? ids.filter((v): v is string => typeof v === "string" && v !== "")
      : [];
  } catch {
    return []; // fail-close（管理者のみ書き込み可になる）
  }
}

// 認証＋権限の共通前段
export async function authorizeEvents() {
  const { user } = await getSessionUser();
  if (!user) {
    return { user: null, admin: null, isAdmin: false, canEdit: false } as const;
  }
  const admin = createSupabaseAdminClient();
  const isAdmin = isAdminUser(user);
  const editors = await loadEditorUserIds(admin);
  const canEdit = isAdmin || editors.includes(user.id);
  return { user, admin, isAdmin, canEdit } as const;
}

export async function fetchEventRow(
  admin: EventsAdminClient,
  id: string
): Promise<ClinicEvent | null> {
  const { data } = await admin
    .from(EVENTS_TABLE)
    .select("id, data")
    .eq("id", id)
    .eq("record_type", "event")
    .maybeSingle();
  if (!data) return null;
  return normalizeClinicEvent(data.id, data.data);
}

export async function saveEventRow(
  admin: EventsAdminClient,
  ev: ClinicEvent,
  isNew: boolean
): Promise<void> {
  const { id, ...data } = ev;
  if (isNew) {
    const { error } = await admin
      .from(EVENTS_TABLE)
      .insert({ id, record_type: "event", data });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .from(EVENTS_TABLE)
      .update({ data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("record_type", "event");
    if (error) throw new Error(error.message);
  }
}

// 非公開バケットの用意（初回のみ作成・冪等。院長のダッシュボード操作・SQL不要）
export async function ensureEventPhotosBucket(
  admin: EventsAdminClient
): Promise<void> {
  const { data } = await admin.storage.getBucket(EVENT_PHOTOS_BUCKET);
  if (data) return;
  const { error } = await admin.storage.createBucket(EVENT_PHOTOS_BUCKET, {
    public: false,
    fileSizeLimit: EVENT_PHOTO_MAX_BYTES,
  });
  // 並行作成の競合（既に存在）は成功扱い
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(error.message);
  }
}

// 一覧の photos に署名URL（期限つき）を付与して返す（担保案1・恒久URLはDBに保存しない）
export async function attachSignedUrls(
  admin: EventsAdminClient,
  events: ClinicEvent[]
): Promise<ClinicEvent[]> {
  const paths = events.flatMap((e) => e.photos.map((p) => p.path));
  if (paths.length === 0) return events;
  const { data } = await admin.storage
    .from(EVENT_PHOTOS_BUCKET)
    .createSignedUrls(paths, EVENT_PHOTO_SIGN_TTL);
  const urlMap = new Map(
    (data ?? [])
      .filter((d) => d.signedUrl)
      .map((d) => [d.path, d.signedUrl as string])
  );
  return events.map((e) => ({
    ...e,
    photos: e.photos.map((p) => ({
      ...p,
      signedUrl: urlMap.get(p.path) ?? "",
    })),
  }));
}
