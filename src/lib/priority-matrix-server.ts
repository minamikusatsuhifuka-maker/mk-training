// 院長の四象限マトリクスのサーバー共通部（指示書201・サーバー専用）
//
// 【保護】
//   実体は既存の private_store（RLS有効＋ポリシー無し＝anon/authenticated とも全拒否）。
//   読み書きは service-role を持つこのファイル経由だけ。
//   入口は /api/admin/priority-matrix のみで、requireAdmin（app_metadata.role === "admin"）を通す。
//   非管理者には proxy.ts が /api/admin 配下を「実在しないAPIと同じ応答」に rewrite する（159-D）。
//   画面 /admin/priority-matrix も admin/layout.tsx と proxy が管理者以外を404にする（158）。
//   183の委任対象外（🔒）＝ admin-items.ts で delegable: false にしてあるので幹部にも開かない。
//
// 【汎用の /api/private-store には content_type を足さない】
//   足すと「ログイン済みなら誰でも自分名義のレコードを作れる口」ができる。
//   201 A の「院長のみ・スタッフの画面には一切出さない」を守るため、ここだけから触る。
//
// 【owner_id で院長本人に閉じる】
//   タスクは院長の持ち物。owner_id＝セッションの userId で必ず絞る。
//   リクエストから owner を受け取る口は作らない（他人のマトリクスを覗く経路を作らない）。
//
// 【操作ログは本文を残さない（201 F）】
//   action・タスクid・象限だけ。タイトル・メモ・9マスの本文は書かない。

import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "./supabase-admin";
import {
  FOCUS_MAX,
  normalizeLog,
  normalizeTask,
  type MatrixLog,
  type PriorityTask,
  type Quadrant,
} from "./priority-matrix";

export { ServiceRoleMissingError };

export const PM_TABLE = "private_store";
/** タスク1件＝1レコード（record_key＝タスクid） */
export const PM_CONTENT_TYPE = "priority_matrix";
/** 操作ログ1件＝1レコード（本文は入れない） */
export const PM_LOG_CONTENT_TYPE = "priority_matrix_log";

export type MatrixAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export function priorityMatrixAdmin(): MatrixAdminClient {
  return createSupabaseAdminClient();
}

type StoreRow = {
  record_key: string;
  data: unknown;
  updated_at?: string;
  created_at?: string;
};

export function newTaskId(): string {
  return `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newLogId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── タスクの読み書き ───

export async function fetchTasks(
  admin: MatrixAdminClient,
  ownerId: string
): Promise<PriorityTask[]> {
  const { data, error } = await admin
    .from(PM_TABLE)
    .select("record_key, data")
    .eq("owner_id", ownerId)
    .eq("content_type", PM_CONTENT_TYPE);
  if (error) throw new Error(error.message);
  return ((data ?? []) as StoreRow[])
    .map((r) => normalizeTask(r.record_key, r.data))
    .filter((t): t is PriorityTask => t !== null);
}

export async function fetchTask(
  admin: MatrixAdminClient,
  ownerId: string,
  id: string
): Promise<PriorityTask | null> {
  const { data, error } = await admin
    .from(PM_TABLE)
    .select("record_key, data")
    .eq("owner_id", ownerId)
    .eq("content_type", PM_CONTENT_TYPE)
    .eq("record_key", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as StoreRow;
  return normalizeTask(row.record_key, row.data);
}

/** 1件を保存（upsert）。id は record_key に入れるので data からは外す */
export async function saveTask(
  admin: MatrixAdminClient,
  ownerId: string,
  task: PriorityTask
): Promise<void> {
  const { id, ...data } = task;
  const { error } = await admin.from(PM_TABLE).upsert(
    {
      owner_id: ownerId,
      content_type: PM_CONTENT_TYPE,
      record_key: id,
      data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id,content_type,record_key" }
  );
  if (error) throw new Error(error.message);
}

/**
 * 1件を物理削除。
 * 9マスから作ったタスク（リンク先）は消さない。代わりに、元のマスに残っているリンクを外す
 * （消えたタスクへのリンクが画面に残らないように）。
 */
export async function deleteTaskRow(
  admin: MatrixAdminClient,
  ownerId: string,
  id: string
): Promise<void> {
  const { error } = await admin
    .from(PM_TABLE)
    .delete()
    .eq("owner_id", ownerId)
    .eq("content_type", PM_CONTENT_TYPE)
    .eq("record_key", id);
  if (error) throw new Error(error.message);
}

/** 消したタスクへのリンクを、他のタスクの9マスから外す */
export async function clearLinksTo(
  admin: MatrixAdminClient,
  ownerId: string,
  deletedId: string
): Promise<void> {
  const tasks = await fetchTasks(admin, ownerId);
  for (const t of tasks) {
    if (!t.cells.some((c) => c.linkedTaskId === deletedId)) continue;
    const next: PriorityTask = {
      ...t,
      cells: t.cells.map((c) =>
        c.linkedTaskId === deletedId ? { ...c, linkedTaskId: "" } : c
      ),
      updatedAt: new Date().toISOString(),
    };
    await saveTask(admin, ownerId, next);
  }
}

/**
 * ★（注力）を付けられるか（201 C-3: 同時に3件まで）。
 * 自分自身は数に入れない（すでに★のタスクを編集しても引っかからないように）。
 */
export async function canAddFocus(
  admin: MatrixAdminClient,
  ownerId: string,
  selfId: string
): Promise<boolean> {
  const tasks = await fetchTasks(admin, ownerId);
  const others = tasks.filter((t) => t.focus && t.id !== selfId).length;
  return others < FOCUS_MAX;
}

// ─── 操作ログ（本文は残さない） ───

/** 1件記録する。記録に失敗しても業務は止めない（サーバーログには残す） */
export async function recordMatrixLog(
  admin: MatrixAdminClient,
  ownerId: string,
  entry: { by: string; action: string; taskId: string; quadrant: Quadrant | 0 }
): Promise<void> {
  try {
    const at = new Date().toISOString();
    const { error } = await admin.from(PM_TABLE).upsert(
      {
        owner_id: ownerId,
        content_type: PM_LOG_CONTENT_TYPE,
        record_key: newLogId(),
        data: { at, ...entry },
        updated_at: at,
      },
      { onConflict: "owner_id,content_type,record_key" }
    );
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error(
      "[priority-matrix] 操作ログを記録できませんでした:",
      e instanceof Error ? e.message : e
    );
  }
}

export async function fetchMatrixLogs(
  admin: MatrixAdminClient,
  ownerId: string,
  limit: number
): Promise<MatrixLog[]> {
  const { data, error } = await admin
    .from(PM_TABLE)
    .select("record_key, data")
    .eq("owner_id", ownerId)
    .eq("content_type", PM_LOG_CONTENT_TYPE)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as StoreRow[])
    .map((r) => normalizeLog(r.record_key, r.data))
    .filter((l): l is MatrixLog => l !== null);
}
