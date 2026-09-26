// スタッフ育成カルテ 第1便のサーバー共通部（指示書179・サーバー専用）
//
// 保護は149（メンバーノート）/169（スタッフ連絡先）/173（振り返り記録）と同型:
//   RLS全拒否テーブル clinic_staff_growth ＋ service-role のみ。
//   非許可・未ログインには **404**（存在秘匿）。
//
// 【認可（B-4／C）】
//   本人   = 自分の記録（data.userId === 自分）の追加・編集・削除。他人の記録は読めない
//   管理者 = 全員分の閲覧・追加・編集、講座マスタの管理、カルテ（A）
//   スタッフ側は **機能フラグ growth_record（既定OFF）がONのときだけ** 通す（179 前提2:
//   記録する項目と目的を説明してから運用する）。管理者はフラグに関係なく通す
//   （説明前に院長が中身を確認・準備するため）。
//
// 【集約で権限を超えない（A-2）】
//   カルテが集める既存データは、各機能の既存の認可関数をそのまま呼んで取る
//   （staff-growth-karte-server.ts）。ここでは自分のテーブルの読み書きだけを扱う。
//
// 【証跡画像】新しい非公開バケット growth-evidence（既存の staff-photos には混ぜない・179 §2）。
//   署名URLの発行は lib/storage-signed.ts に一本化（165 §3-3）。

import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "./supabase-admin";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import { serverGetContentRow } from "./content-store-server";
import { FEATURE_FLAGS_KEY } from "./feature-flags";
import { isBucketNotFound, signBucketPaths } from "./storage-signed";
import {
  EVIDENCE_MAX_BYTES,
  GROWTH_CONFIG_ID,
  emptyGrowthConfig,
  normalizeCourse,
  normalizeGoal,
  normalizeGrowthConfig,
  normalizeGrowthLog,
  normalizeLearning,
  normalizePromiseStatus,
  type Course,
  type Goal,
  type GrowthConfig,
  type GrowthLog,
  type GrowthLogChange,
  type LearningRecord,
  type PromiseStatus,
} from "./staff-growth";

export { ServiceRoleMissingError };

export const GROWTH_TABLE = "clinic_staff_growth";
export const GROWTH_EVIDENCE_BUCKET = "growth-evidence";

const COURSE_TYPE = "course";
const LEARNING_TYPE = "learning";
const GOAL_TYPE = "goal";
const PROMISE_TYPE = "promise";
const CONFIG_TYPE = "config";
const LOG_TYPE = "log";

export type GrowthAdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** テーブル未作成（SQL未実行）を表す印。画面で案内を出すために区別する */
export class GrowthTableMissingError extends Error {
  constructor() {
    super(
      "学びの記録のテーブルがまだ作られていません。交付済みのSQL（179_スタッフ育成カルテ_テーブル作成.sql）を実行してください。"
    );
    this.name = "GrowthTableMissingError";
  }
}

/** 証跡バケット未作成（165と同じ: 何を作れば直るかを名指しする） */
export class GrowthBucketMissingError extends Error {
  constructor(detail?: string) {
    super(
      "証跡の保管庫（Storageバケット growth-evidence）がまだ作られていません。" +
        "Supabase の SQL Editor で、指示書179で交付したSQL" +
        "（179_スタッフ育成カルテ_テーブル作成.sql の②）を実行してください。" +
        (detail ? `（詳細: ${detail}）` : "")
    );
    this.name = "GrowthBucketMissingError";
  }
}

export function isMissingTable(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the table") ||
    m.includes("schema cache")
  );
}

function throwDb(message: string): never {
  if (isMissingTable(message)) throw new GrowthTableMissingError();
  throw new Error(message);
}

/** アカウントが今も有効か（169と同じ。取得できない・例外・banned_until が未来 → false） */
async function isActiveAccount(admin: GrowthAdminClient, userId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    const bannedUntil = (data.user as { banned_until?: string | null }).banned_until;
    if (!bannedUntil) return true;
    const until = new Date(bannedUntil).getTime();
    if (Number.isNaN(until)) return false;
    return until <= Date.now();
  } catch {
    return false;
  }
}

/**
 * 機能フラグをサーバー側で読む（クライアントの use-feature-flags と同じ規則:
 * 保存値が true のときだけON。未保存・失敗・壊れた値はOFF）。
 */
export async function serverFeatureEnabled(id: string): Promise<boolean> {
  try {
    const row = await serverGetContentRow(FEATURE_FLAGS_KEY);
    const features = (row?.data as { features?: Record<string, unknown> } | null)?.features;
    return !!features && features[id] === true;
  } catch {
    return false;
  }
}

export type GrowthAuth =
  | { ok: false }
  | {
      ok: true;
      admin: GrowthAdminClient;
      userId: string;
      userEmail: string;
      userName: string;
      isAdmin: boolean;
    };

/**
 * 認証＋認可の共通前段。
 * - 未ログイン・無効化アカウント・service-role未設定 → ok:false（呼び出し側は404）
 * - 非管理者はフラグ growth_record がONのときだけ ok（既定OFF＝説明前は誰も入れない）
 */
export async function authorizeGrowth(): Promise<GrowthAuth> {
  const { user } = await getSessionUser();
  if (!user) return { ok: false };

  let admin: GrowthAdminClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false };
  }

  const isAdmin = isAdminUser(user);
  if (!isAdmin && !(await serverFeatureEnabled("growth_record"))) return { ok: false };

  if (!(await isActiveAccount(admin, user.id))) return { ok: false };

  const meta = user.user_metadata as Record<string, unknown> | null;
  const userName = typeof meta?.display_name === "string" ? meta.display_name.trim() : "";

  return {
    ok: true,
    admin,
    userId: user.id,
    userEmail: user.email ?? "",
    userName,
    isAdmin,
  };
}

// ─── 行の読み書き（共通）───

type Row = { id: unknown; record_type?: unknown; data: unknown; created_at?: unknown };

async function selectRows(
  admin: GrowthAdminClient,
  recordType: string,
  userId?: string
): Promise<{ rows: Row[]; tableMissing: boolean }> {
  let q = admin.from(GROWTH_TABLE).select("id, data").eq("record_type", recordType);
  if (userId) q = q.eq("data->>userId", userId);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error.message)) return { rows: [], tableMissing: true };
    throw new Error(error.message);
  }
  return { rows: (data ?? []) as Row[], tableMissing: false };
}

async function selectRow(
  admin: GrowthAdminClient,
  recordType: string,
  id: string
): Promise<Row | null> {
  const { data, error } = await admin
    .from(GROWTH_TABLE)
    .select("id, data")
    .eq("id", id)
    .eq("record_type", recordType)
    .maybeSingle();
  if (error) throwDb(error.message);
  return (data as Row | null) ?? null;
}

async function upsertRow(
  admin: GrowthAdminClient,
  recordType: string,
  id: string,
  data: Record<string, unknown>,
  updatedBy: string
): Promise<void> {
  const { error } = await admin.from(GROWTH_TABLE).upsert({
    id,
    record_type: recordType,
    data,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throwDb(error.message);
}

async function deleteRow(admin: GrowthAdminClient, recordType: string, id: string): Promise<void> {
  const { error } = await admin
    .from(GROWTH_TABLE)
    .delete()
    .eq("id", id)
    .eq("record_type", recordType);
  if (error) throwDb(error.message);
}

export function newGrowthId(kind: string): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 講座マスタ ───

export async function fetchCourses(
  admin: GrowthAdminClient
): Promise<{ courses: Course[]; tableMissing: boolean }> {
  const { rows, tableMissing } = await selectRows(admin, COURSE_TYPE);
  const courses = rows
    .map((r) => normalizeCourse(String(r.id), r.data))
    .filter((c): c is Course => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
  return { courses, tableMissing };
}

export async function fetchCourse(admin: GrowthAdminClient, id: string): Promise<Course | null> {
  const row = await selectRow(admin, COURSE_TYPE, id);
  return row ? normalizeCourse(String(row.id), row.data) : null;
}

export async function saveCourse(
  admin: GrowthAdminClient,
  course: Course,
  updatedBy: string
): Promise<void> {
  const { id, ...data } = course;
  await upsertRow(admin, COURSE_TYPE, id, data, updatedBy);
}

export async function deleteCourse(admin: GrowthAdminClient, id: string): Promise<void> {
  await deleteRow(admin, COURSE_TYPE, id);
}

/**
 * 講座の統合（B-2）: from の学びの記録をすべて into に付け替え、from を消す。
 * 再受講回数は保存していないので、次に数えたときに自動で正しくなる。
 * 戻り値は付け替えた記録の件数。
 */
export async function mergeCourse(
  admin: GrowthAdminClient,
  fromId: string,
  intoId: string,
  updatedBy: string
): Promise<number> {
  const { rows } = await selectRows(admin, LEARNING_TYPE);
  const targets = rows.filter(
    (r) => (r.data as { courseId?: unknown } | null)?.courseId === fromId
  );
  for (const r of targets) {
    const data = { ...(r.data as Record<string, unknown>), courseId: intoId };
    await upsertRow(admin, LEARNING_TYPE, String(r.id), data, updatedBy);
  }
  await deleteRow(admin, COURSE_TYPE, fromId);
  return targets.length;
}

// ─── 学びの記録 ───

export async function fetchLearning(
  admin: GrowthAdminClient,
  userId?: string
): Promise<{ records: LearningRecord[]; tableMissing: boolean }> {
  const { rows, tableMissing } = await selectRows(admin, LEARNING_TYPE, userId);
  const records = rows
    .map((r) => normalizeLearning(String(r.id), r.data))
    .filter((c): c is LearningRecord => c !== null);
  return { records, tableMissing };
}

export async function fetchLearningRow(
  admin: GrowthAdminClient,
  id: string
): Promise<LearningRecord | null> {
  const row = await selectRow(admin, LEARNING_TYPE, id);
  return row ? normalizeLearning(String(row.id), row.data) : null;
}

export async function saveLearning(
  admin: GrowthAdminClient,
  rec: LearningRecord,
  updatedBy: string
): Promise<void> {
  const { id, ...data } = rec;
  // signedUrl は保存しない（署名は返すときに毎回発行する）
  const evidence = data.evidence.map(({ path, name, uploadedAt }) => ({ path, name, uploadedAt }));
  await upsertRow(admin, LEARNING_TYPE, id, { ...data, evidence }, updatedBy);
}

/** 記録の削除。証跡の実体も一緒に消す（孤児を残さない。実体削除の失敗は記録の削除を止めない） */
export async function deleteLearning(
  admin: GrowthAdminClient,
  rec: LearningRecord
): Promise<void> {
  if (rec.evidence.length > 0) {
    const { error } = await admin.storage
      .from(GROWTH_EVIDENCE_BUCKET)
      .remove(rec.evidence.map((e) => e.path));
    if (error && !isBucketNotFound(error.message)) {
      console.error("[staff-growth] 証跡の実体を削除できませんでした:", error.message);
    }
  }
  await deleteRow(admin, LEARNING_TYPE, rec.id);
}

// ─── 自分の目標 ───

export async function fetchGoals(
  admin: GrowthAdminClient,
  userId?: string
): Promise<{ goals: Goal[]; tableMissing: boolean }> {
  const { rows, tableMissing } = await selectRows(admin, GOAL_TYPE, userId);
  const goals = rows
    .map((r) => normalizeGoal(String(r.id), r.data))
    .filter((c): c is Goal => c !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { goals, tableMissing };
}

export async function fetchGoal(admin: GrowthAdminClient, id: string): Promise<Goal | null> {
  const row = await selectRow(admin, GOAL_TYPE, id);
  return row ? normalizeGoal(String(row.id), row.data) : null;
}

export async function saveGoal(admin: GrowthAdminClient, goal: Goal, updatedBy: string): Promise<void> {
  const { id, ...data } = goal;
  await upsertRow(admin, GOAL_TYPE, id, data, updatedBy);
}

export async function deleteGoal(admin: GrowthAdminClient, id: string): Promise<void> {
  await deleteRow(admin, GOAL_TYPE, id);
}

// ─── 1on1の約束の取り組み状況 ───

export async function fetchPromiseStatuses(
  admin: GrowthAdminClient,
  userId?: string
): Promise<{ statuses: PromiseStatus[]; tableMissing: boolean }> {
  const { rows, tableMissing } = await selectRows(admin, PROMISE_TYPE, userId);
  const statuses = rows
    .map((r) => normalizePromiseStatus(String(r.id), r.data))
    .filter((c): c is PromiseStatus => c !== null);
  return { statuses, tableMissing };
}

export async function savePromiseStatus(
  admin: GrowthAdminClient,
  st: PromiseStatus,
  updatedBy: string
): Promise<void> {
  const { id, ...data } = st;
  await upsertRow(admin, PROMISE_TYPE, id, data, updatedBy);
}

// ─── 設定（AI下書きの有効化）───

export async function fetchGrowthConfig(admin: GrowthAdminClient): Promise<GrowthConfig> {
  try {
    const row = await selectRow(admin, CONFIG_TYPE, GROWTH_CONFIG_ID);
    return row ? normalizeGrowthConfig(row.data) : emptyGrowthConfig();
  } catch {
    return emptyGrowthConfig(); // 読めないときはOFF（fail-close）
  }
}

export async function saveGrowthConfig(
  admin: GrowthAdminClient,
  cfg: GrowthConfig,
  updatedBy: string
): Promise<void> {
  await upsertRow(admin, CONFIG_TYPE, GROWTH_CONFIG_ID, { ...cfg }, updatedBy);
}

// ─── 証跡バケット（165と同じ作法）───

export async function growthBucketExists(admin: GrowthAdminClient): Promise<boolean> {
  try {
    const { data } = await admin.storage.getBucket(GROWTH_EVIDENCE_BUCKET);
    return Boolean(data);
  } catch {
    return false;
  }
}

/** 非公開バケットの用意（保険。正規は交付SQLでの事前作成） */
export async function ensureGrowthBucket(admin: GrowthAdminClient): Promise<void> {
  if (await growthBucketExists(admin)) return;
  const { error } = await admin.storage.createBucket(GROWTH_EVIDENCE_BUCKET, {
    public: false, // 歯止め: 新規バケットは必ず非公開
    fileSizeLimit: EVIDENCE_MAX_BYTES,
  });
  if (!error) return;
  if (/already exists/i.test(error.message)) return;
  throw new GrowthBucketMissingError(error.message);
}

export function translateGrowthStorageError(message: string): Error {
  return isBucketNotFound(message) ? new GrowthBucketMissingError(message) : new Error(message);
}

/** 証跡に署名URL（期限つき）を付けて返す。恒久URLはDBに保存しない */
export async function attachEvidenceUrls(
  admin: GrowthAdminClient,
  records: LearningRecord[]
): Promise<{ records: LearningRecord[]; bucketMissing: boolean }> {
  const paths = records.flatMap((r) => r.evidence.map((e) => e.path));
  if (paths.length === 0) return { records, bucketMissing: false };
  const { urls, bucketMissing } = await signBucketPaths(admin, GROWTH_EVIDENCE_BUCKET, paths);
  return {
    records: records.map((r) => ({
      ...r,
      evidence: r.evidence.map((e) => ({ ...e, signedUrl: urls.get(e.path) ?? "" })),
    })),
    bucketMissing,
  };
}

// ─── 操作ログ（本文を残さない）───

function newLogId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 操作ログを1件残す。記録に失敗しても業務は止めない（サーバーログには残す） */
export async function recordGrowthLog(
  admin: GrowthAdminClient,
  entry: { by: string; action: string; kind: string; target: string; changes: GrowthLogChange[] }
): Promise<void> {
  try {
    const at = new Date().toISOString();
    await admin.from(GROWTH_TABLE).insert({
      id: newLogId(),
      record_type: LOG_TYPE,
      data: { at, ...entry },
      updated_by: entry.by,
      updated_at: at,
    });
  } catch (e) {
    console.error(
      "[staff-growth] 操作ログを記録できませんでした:",
      e instanceof Error ? e.message : e
    );
  }
}

/** 操作ログの取得（時系列のみ・新しい順）。管理者のみ＝呼び出し側で保証する */
export async function fetchGrowthLogs(
  admin: GrowthAdminClient,
  options: { limit: number; before?: string }
): Promise<{ logs: GrowthLog[]; tableMissing: boolean }> {
  let query = admin
    .from(GROWTH_TABLE)
    .select("id, data, created_at")
    .eq("record_type", LOG_TYPE)
    .order("created_at", { ascending: false })
    .limit(options.limit);
  if (options.before) query = query.lt("created_at", options.before);
  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error.message)) return { logs: [], tableMissing: true };
    throw new Error(error.message);
  }
  const logs = (data ?? [])
    .map((r) => normalizeGrowthLog(String(r.id), r.data))
    .filter((l): l is GrowthLog => l !== null);
  return { logs, tableMissing: false };
}
