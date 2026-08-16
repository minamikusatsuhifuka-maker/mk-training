// イベント機能のサーバー共通部（132-A/132-B・/api/events と /api/events/photos で共用）
// - 認可: 管理者 or config行 editorUserIds（fail-close: 未設定・取得失敗=管理者のみ）。
// - 写真バケット: event-photos（**非公開**・閲覧は署名URLのみ=指示書132-B担保案1）。
//   staff-photos（公開バケット）には置かない（未ログイン到達を防ぐ）。
// - 指示書165: バケットの実体は**交付SQLでの事前作成が正**。コード側の自動作成は保険。
//   未作成のまま使われたときは握りつぶさず、何を作れば直るかを日本語で画面まで届ける。
//   署名URLの発行とTTLは lib/storage-signed.ts に一本化（作法を2つに分けない）。

import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "./supabase-admin";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import {
  SIGNED_URL_TTL,
  isBucketNotFound,
  signBucketPaths,
} from "./storage-signed";
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
// 署名URL有効期間（秒）。165 §3-3「作法を2つに分けない」により
// lib/storage-signed.ts の SIGNED_URL_TTL を唯一の値として再輸出するだけにする。
export const EVENT_PHOTO_SIGN_TTL = SIGNED_URL_TTL;

/**
 * 写真の保管庫（Storageバケット event-photos）が未作成であることを表すエラー。
 *
 * 【165でこれを足した理由】
 * 132-Bはコードとしては完成していたが、バケットという**前提のリソースが無かった**。
 * それでも画面には「アップロードに失敗しました」としか出ず、
 * 何を作れば直るのかが誰にも分からない状態だった。
 * 「実装済み」と「動く」は別である以上、足りていないものは名指しで言う。
 */
export class EventPhotoBucketMissingError extends Error {
  constructor(detail?: string) {
    super(
      "写真の保管庫（Storageバケット event-photos）がまだ作られていません。" +
        "Supabase の SQL Editor で、指示書165で交付したSQL" +
        "（165_event-photos_バケット作成.sql）を実行してください。" +
        (detail ? `（詳細: ${detail}）` : "")
    );
    this.name = "EventPhotoBucketMissingError";
  }
}

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

/** バケットが今あるかどうかだけを見る（作らない・編集者向けの事前警告用） */
export async function eventPhotosBucketExists(
  admin: EventsAdminClient
): Promise<boolean> {
  try {
    const { data } = await admin.storage.getBucket(EVENT_PHOTOS_BUCKET);
    return Boolean(data);
  } catch {
    return false;
  }
}

/**
 * 非公開バケットの用意（初回のみ作成・冪等）。
 *
 * 165の位置づけ: **保険**。正規の作成手段は交付SQL（事前作成）。
 * ここで作れなかった場合は、握りつぶさず EventPhotoBucketMissingError にして
 * 「何を作れば直るのか」を画面まで届ける。
 */
export async function ensureEventPhotosBucket(
  admin: EventsAdminClient
): Promise<void> {
  if (await eventPhotosBucketExists(admin)) return;
  const { error } = await admin.storage.createBucket(EVENT_PHOTOS_BUCKET, {
    public: false, // 歯止め3: 新規バケットは必ず非公開
    fileSizeLimit: EVENT_PHOTO_MAX_BYTES,
  });
  if (!error) return;
  // 並行作成の競合（既に存在）は成功扱い
  if (/already exists/i.test(error.message)) return;
  throw new EventPhotoBucketMissingError(error.message);
}

/**
 * 一覧の photos に署名URL（期限つき）を付与して返す（担保案1・恒久URLはDBに保存しない）。
 * 署名の実処理は lib/storage-signed.ts に一本化（165 §3-3）。
 *
 * bucketMissing: バケット未作成が原因で署名できなかったか。
 * 165以前はここが静かに空文字になり、写真が黙って消えて見えていた。
 */
export async function attachSignedUrls(
  admin: EventsAdminClient,
  events: ClinicEvent[]
): Promise<{ events: ClinicEvent[]; bucketMissing: boolean }> {
  const paths = events.flatMap((e) => e.photos.map((p) => p.path));
  if (paths.length === 0) return { events, bucketMissing: false };
  const { urls, bucketMissing } = await signBucketPaths(
    admin,
    EVENT_PHOTOS_BUCKET,
    paths
  );
  return {
    events: events.map((e) => ({
      ...e,
      photos: e.photos.map((p) => ({
        ...p,
        signedUrl: urls.get(p.path) ?? "",
      })),
    })),
    bucketMissing,
  };
}

/** Storage の生エラーを、原因の分かるエラーに変える（未作成なら名指しする） */
export function translateStorageError(message: string): Error {
  return isBucketNotFound(message)
    ? new EventPhotoBucketMissingError(message)
    : new Error(message);
}
