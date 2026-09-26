// 採用資料のサーバー共通部（指示書184・サーバー専用）— **院長（管理者）のみ**
//
// 保護は149/169/173/179と同型: RLS全拒否テーブル clinic_hiring_docs ＋ service-role のみ。
// 実体は**専用の非公開バケット hiring-docs**（staff-photos・growth-evidence と混ぜない）。
// 閲覧はその都度10分の署名URL。削除は院長の操作のみ（退職しても自動削除しない）。
// 非許可・未ログインには 404（存在秘匿）。183の委任対象外（lib/admin-items.ts で🔒）。

import { createSupabaseAdminClient, ServiceRoleMissingError } from "./supabase-admin";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import { isActiveAccountId } from "./admin-delegation-server";
import { isBucketNotFound, signBucketPaths } from "./storage-signed";
import {
  HIRING_DOC_MAX_BYTES,
  HIRING_SIGNED_URL_TTL,
  hiringProfileId,
  normalizeHiringDoc,
  normalizeHiringLog,
  normalizeHiringProfile,
  type HiringDoc,
  type HiringLog,
  type HiringProfile,
} from "./hiring-docs";

export { ServiceRoleMissingError };

export const HIRING_TABLE = "clinic_hiring_docs";
export const HIRING_BUCKET = "hiring-docs";

const DOC_TYPE = "doc";
const PROFILE_TYPE = "profile";
const LOG_TYPE = "log";

export type HiringAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export class HiringTableMissingError extends Error {
  constructor() {
    super("採用資料のテーブルがまだ作られていません。交付済みのSQL（184_採用資料_テーブル作成.sql）を実行してください。");
    this.name = "HiringTableMissingError";
  }
}

export class HiringBucketMissingError extends Error {
  constructor(detail?: string) {
    super(
      "採用資料の保管庫（Storageバケット hiring-docs）がまだ作られていません。" +
        "Supabase の SQL Editor で 184_採用資料_テーブル作成.sql の②を実行してください。" +
        (detail ? `（詳細: ${detail}）` : "")
    );
    this.name = "HiringBucketMissingError";
  }
}

function isMissingTable(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("could not find the table") || m.includes("schema cache");
}
function throwDb(message: string): never {
  if (isMissingTable(message)) throw new HiringTableMissingError();
  throw new Error(message);
}

export type HiringAuth =
  | { ok: false }
  | { ok: true; admin: HiringAdminClient; userId: string; userEmail: string };

/** 院長（app_metadata.role === "admin"）で有効なアカウントだけ。委任は一切見ない */
export async function authorizeHiring(): Promise<HiringAuth> {
  const { user } = await getSessionUser();
  if (!user || !isAdminUser(user)) return { ok: false };
  let admin: HiringAdminClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false };
  }
  if (!(await isActiveAccountId(user.id))) return { ok: false };
  return { ok: true, admin, userId: user.id, userEmail: user.email ?? "" };
}

// ─── 資料 ───

export async function fetchHiringDocs(
  admin: HiringAdminClient,
  userId?: string
): Promise<{ docs: HiringDoc[]; tableMissing: boolean }> {
  let q = admin.from(HIRING_TABLE).select("id, data").eq("record_type", DOC_TYPE);
  if (userId) q = q.eq("data->>userId", userId);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error.message)) return { docs: [], tableMissing: true };
    throw new Error(error.message);
  }
  const docs = (data ?? [])
    .map((r) => normalizeHiringDoc(String(r.id), r.data))
    .filter((d): d is HiringDoc => d !== null)
    .sort((a, b) => (b.docDate || b.createdAt).localeCompare(a.docDate || a.createdAt));
  return { docs, tableMissing: false };
}

export async function fetchHiringDoc(admin: HiringAdminClient, id: string): Promise<HiringDoc | null> {
  const { data, error } = await admin.from(HIRING_TABLE).select("id, data").eq("id", id).eq("record_type", DOC_TYPE).maybeSingle();
  if (error) throwDb(error.message);
  return data ? normalizeHiringDoc(String(data.id), data.data) : null;
}

export async function saveHiringDoc(admin: HiringAdminClient, doc: HiringDoc, updatedBy: string): Promise<void> {
  const { id, signedUrl: _s, ...data } = doc;
  void _s;
  const { error } = await admin.from(HIRING_TABLE).upsert({
    id,
    record_type: DOC_TYPE,
    data,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throwDb(error.message);
}

/** 実体を先に削除（失敗したら参照を残す＝再試行できる）→ 行を削除 */
export async function deleteHiringDoc(admin: HiringAdminClient, doc: HiringDoc): Promise<void> {
  const { error: rmError } = await admin.storage.from(HIRING_BUCKET).remove([doc.path]);
  if (rmError && !isBucketNotFound(rmError.message)) {
    throw new Error(`資料の実体を削除できませんでした（再試行してください）: ${rmError.message}`);
  }
  const { error } = await admin.from(HIRING_TABLE).delete().eq("id", doc.id).eq("record_type", DOC_TYPE);
  if (error) throwDb(error.message);
}

export function newHiringId(kind: string): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── バケット（165と同じ作法）───

export async function ensureHiringBucket(admin: HiringAdminClient): Promise<void> {
  try {
    const { data } = await admin.storage.getBucket(HIRING_BUCKET);
    if (data) return;
  } catch {
    /* 続けて作成を試みる */
  }
  const { error } = await admin.storage.createBucket(HIRING_BUCKET, {
    public: false,
    fileSizeLimit: HIRING_DOC_MAX_BYTES,
  });
  if (!error || /already exists/i.test(error.message)) return;
  throw new HiringBucketMissingError(error.message);
}

export function translateHiringStorageError(message: string): Error {
  return isBucketNotFound(message) ? new HiringBucketMissingError(message) : new Error(message);
}

/** 署名URL（10分）。発行できなければ空 */
export async function signHiringDocs(
  admin: HiringAdminClient,
  docs: HiringDoc[]
): Promise<{ docs: HiringDoc[]; bucketMissing: boolean }> {
  if (docs.length === 0) return { docs, bucketMissing: false };
  const { urls, bucketMissing } = await signBucketPaths(
    admin,
    HIRING_BUCKET,
    docs.map((d) => d.path),
    HIRING_SIGNED_URL_TTL
  );
  return { docs: docs.map((d) => ({ ...d, signedUrl: urls.get(d.path) ?? "" })), bucketMissing };
}

/** AI整理のためにメモリへ読む（保存しない・呼び出し側で破棄する） */
export async function downloadHiringDoc(admin: HiringAdminClient, doc: HiringDoc): Promise<Buffer> {
  const { data, error } = await admin.storage.from(HIRING_BUCKET).download(doc.path);
  if (error || !data) throw translateHiringStorageError(error?.message ?? "資料を読み込めませんでした");
  return Buffer.from(await data.arrayBuffer());
}

// ─── 経歴・入職時の想い ───

export async function fetchHiringProfile(admin: HiringAdminClient, userId: string): Promise<HiringProfile> {
  const { data, error } = await admin
    .from(HIRING_TABLE)
    .select("id, data")
    .eq("id", hiringProfileId(userId))
    .eq("record_type", PROFILE_TYPE)
    .maybeSingle();
  if (error) throwDb(error.message);
  return normalizeHiringProfile(userId, data?.data ?? null);
}

export async function saveHiringProfile(admin: HiringAdminClient, p: HiringProfile, updatedBy: string): Promise<void> {
  const { userId, ...rest } = p;
  const { error } = await admin.from(HIRING_TABLE).upsert({
    id: hiringProfileId(userId),
    record_type: PROFILE_TYPE,
    data: { ...rest, userId, updatedBy, updatedAt: new Date().toISOString() },
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throwDb(error.message);
}

// ─── 操作ログ（本文・抽出内容は残さない）───

export async function recordHiringLog(
  admin: HiringAdminClient,
  entry: { by: string; action: string; target: string; changes: { field: string; before: string; after: string }[] }
): Promise<void> {
  try {
    const at = new Date().toISOString();
    await admin.from(HIRING_TABLE).insert({
      id: newHiringId("log"),
      record_type: LOG_TYPE,
      data: { at, ...entry },
      updated_by: entry.by,
      updated_at: at,
    });
  } catch (e) {
    console.error("[hiring-docs] 操作ログを記録できませんでした:", e instanceof Error ? e.message : e);
  }
}

export async function fetchHiringLogs(
  admin: HiringAdminClient,
  limit = 100
): Promise<{ logs: HiringLog[]; tableMissing: boolean }> {
  const { data, error } = await admin
    .from(HIRING_TABLE)
    .select("id, data")
    .eq("record_type", LOG_TYPE)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error.message)) return { logs: [], tableMissing: true };
    throw new Error(error.message);
  }
  return {
    logs: (data ?? []).map((r) => normalizeHiringLog(String(r.id), r.data)).filter((l): l is HiringLog => l !== null),
    tableMissing: false,
  };
}
