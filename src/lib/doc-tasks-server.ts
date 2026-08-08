// 書類進捗ボードのサーバー共通部（指示書154 / 154-2・サーバー専用）
//
// 保護は149（メンバーノート）/132（イベント）と同型:
//   RLS全拒否テーブル clinic_doc_tasks ＋ service-role API のみ ＋ 指定アカウント制。
//   認可 = 管理者 or config行の viewerUserIds に含まれる。
//   fail-close: 設定が無い・壊れている・取得に失敗したときは **管理者のみ**。
//   非許可・未ログインには **404**（403だと機能の存在が分かるため）。
//
// カルテ番号は院内では個人を特定しうる情報なので、この404秘匿は体裁ではなく要件（154）。

import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "./supabase-admin";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import {
  DOC_TASKS_CONFIG_ID,
  defaultDocTasksConfig,
  normalizeDocTask,
  normalizeDocTasksConfig,
  docTypeDef,
  isStepDone,
  ymd,
  HISTORY_MAX,
  type DocTask,
  type DocTasksConfig,
} from "./doc-tasks";

export { ServiceRoleMissingError };

export const DOC_TASKS_TABLE = "clinic_doc_tasks";

export type DocTasksAdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** テーブル未作成（SQL未実行）を表す印。画面で案内を出すために区別する */
export class DocTasksTableMissingError extends Error {
  constructor() {
    super(
      "書類進捗ボードのテーブルがまだ作られていません。交付済みのSQLを実行してください。"
    );
    this.name = "DocTasksTableMissingError";
  }
}

function isMissingTable(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the table") ||
    m.includes("schema cache")
  );
}

/** 設定行。無い・壊れている・失敗は既定値＝fail-close（viewerUserIds 空＝管理者のみ） */
export async function loadDocTasksConfig(
  admin: DocTasksAdminClient
): Promise<{ config: DocTasksConfig; tableMissing: boolean }> {
  try {
    const { data, error } = await admin
      .from(DOC_TASKS_TABLE)
      .select("data")
      .eq("id", DOC_TASKS_CONFIG_ID)
      .maybeSingle();
    if (error) {
      return {
        config: defaultDocTasksConfig(),
        tableMissing: isMissingTable(error.message),
      };
    }
    return {
      config: normalizeDocTasksConfig(data?.data ?? null),
      tableMissing: false,
    };
  } catch {
    return { config: defaultDocTasksConfig(), tableMissing: false };
  }
}

export async function saveDocTasksConfig(
  admin: DocTasksAdminClient,
  config: DocTasksConfig,
  updatedBy: string
): Promise<void> {
  const { error } = await admin.from(DOC_TASKS_TABLE).upsert({
    id: DOC_TASKS_CONFIG_ID,
    record_type: "config",
    data: config,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (isMissingTable(error.message)) throw new DocTasksTableMissingError();
    throw new Error(error.message);
  }
}

export type DocTasksAuth =
  | { ok: false }
  | {
      ok: true;
      admin: DocTasksAdminClient;
      userId: string;
      userEmail: string;
      isAdmin: boolean;
      config: DocTasksConfig;
      /** アプリ内アラート（バッジ）の対象者か。未指名なら閲覧できる人ぜんいん */
      canNotify: boolean;
      tableMissing: boolean;
    };

export async function authorizeDocTasks(): Promise<DocTasksAuth> {
  const { user } = await getSessionUser();
  if (!user) return { ok: false };

  let admin: DocTasksAdminClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false }; // service-role未設定＝誰も入れない
  }

  const isAdmin = isAdminUser(user);
  const { config, tableMissing } = await loadDocTasksConfig(admin);
  const allowed = isAdmin || config.viewerUserIds.includes(user.id);
  if (!allowed) return { ok: false };

  return {
    ok: true,
    admin,
    userId: user.id,
    userEmail: user.email ?? "",
    isAdmin,
    config,
    canNotify:
      config.notifyUserIds.length === 0 ||
      config.notifyUserIds.includes(user.id),
    tableMissing,
  };
}

export async function fetchAllDocTasks(
  admin: DocTasksAdminClient
): Promise<{ tasks: DocTask[]; tableMissing: boolean }> {
  const { data, error } = await admin
    .from(DOC_TASKS_TABLE)
    .select("id, data")
    .eq("record_type", "task");
  if (error) {
    if (isMissingTable(error.message)) return { tasks: [], tableMissing: true };
    throw new Error(error.message);
  }
  const tasks = (data ?? [])
    .map((r) => normalizeDocTask(r.id as string, r.data))
    .filter((t): t is DocTask => t !== null);
  return { tasks, tableMissing: false };
}

export async function fetchDocTaskRow(
  admin: DocTasksAdminClient,
  id: string
): Promise<DocTask | null> {
  const { data, error } = await admin
    .from(DOC_TASKS_TABLE)
    .select("id, data")
    .eq("id", id)
    .eq("record_type", "task")
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) throw new DocTasksTableMissingError();
    throw new Error(error.message);
  }
  if (!data) return null;
  return normalizeDocTask(data.id as string, data.data);
}

export async function saveDocTaskRow(
  admin: DocTasksAdminClient,
  task: DocTask,
  updatedBy: string,
  isNew: boolean
): Promise<void> {
  const { id, ...data } = task;
  const row = {
    id,
    record_type: "task",
    data,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };
  const { error } = isNew
    ? await admin.from(DOC_TASKS_TABLE).insert(row)
    : await admin
        .from(DOC_TASKS_TABLE)
        .update(row)
        .eq("id", id)
        .eq("record_type", "task");
  if (error) {
    if (isMissingTable(error.message)) throw new DocTasksTableMissingError();
    throw new Error(error.message);
  }
}

export async function deleteDocTaskRow(
  admin: DocTasksAdminClient,
  id: string
): Promise<void> {
  const { error } = await admin
    .from(DOC_TASKS_TABLE)
    .delete()
    .eq("id", id)
    .eq("record_type", "task");
  if (error) {
    if (isMissingTable(error.message)) throw new DocTasksTableMissingError();
    throw new Error(error.message);
  }
}

/**
 * 変更点から履歴を作る（誰がいつ何を変えたか・154の要件4）。
 * 記録はサーバー側でのみ生成する＝クライアントから任意の履歴を差し込めない。
 */
export function buildHistoryActions(prev: DocTask, next: DocTask): string[] {
  const actions: string[] = [];
  for (const step of docTypeDef(next.docType).steps) {
    const before = isStepDone(prev, step);
    const after = isStepDone(next, step);
    if (before === after) {
      // 日付工程は「日付そのものの変更」も記録する
      if (
        step.kind === "date" &&
        after &&
        prev.steps[step.id] !== next.steps[step.id]
      ) {
        actions.push(`「${step.label}」を ${next.steps[step.id]} に変更`);
      }
      continue;
    }
    if (step.kind === "check") {
      actions.push(after ? `「${step.label}」を ✓` : `「${step.label}」の ✓ を解除`);
    } else {
      actions.push(
        after
          ? `「${step.label}」に ${next.steps[step.id]} を入力`
          : `「${step.label}」を空に`
      );
    }
  }
  if (prev.chartNo !== next.chartNo) actions.push("カルテ番号を変更");
  if (prev.doctor !== next.doctor) actions.push(`主治医を「${next.doctor}」に変更`);
  if (prev.enteredOn !== next.enteredOn)
    actions.push(`記入日を ${next.enteredOn} に変更`);
  if (prev.assigneeUserId !== next.assigneeUserId) actions.push("担当を変更");
  if (prev.memo !== next.memo) actions.push("メモを更新");
  return actions;
}

export function appendHistory(
  task: DocTask,
  actions: string[],
  by: string
): DocTaskHistoryList {
  if (actions.length === 0) return task.history;
  const at = new Date().toISOString();
  const added = actions.map((action) => ({ at, by, action }));
  return [...added, ...task.history].slice(0, HISTORY_MAX);
}

type DocTaskHistoryList = DocTask["history"];

/** 完了時刻の付け外し（全工程が満たされた瞬間に記録・外れたら消す） */
export function withCompletedAt(task: DocTask): DocTask {
  const completed = docTypeDef(task.docType).steps.every((s) =>
    isStepDone(task, s)
  );
  if (completed) {
    return { ...task, completedAt: task.completedAt || new Date().toISOString() };
  }
  return { ...task, completedAt: "" };
}

/** 記入日の既定（未指定なら今日・Asia/Tokyo） */
export function enteredOnOrToday(v: unknown): string {
  return ymd(v) || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}
