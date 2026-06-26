// 南草津皮フ科 「みんなのタスク」用のデータ層
// content_store キー staff_tasks にタスク配列（jsonb）を保存。
// 既存の content-store 導線（getContent / saveContent）を流用する。

import { getContent, saveContent } from "./content-store";

// ─── キー ───
export const STAFF_TASKS_KEY = "staff_tasks";
export const STAFF_MEMBERS_KEY = "staff_members";

// ─── 型 ───
export type TaskStatus = "todo" | "doing" | "done";

export type StaffTask = {
  id: string;
  title: string;
  assignee: string;
  due?: string; // ISO文字列（任意）
  status: TaskStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

// 状態ラベル
export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "未着手",
  doing: "進行中",
  done: "完了",
};

export const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done"];

// ─── 読み書き ───
export async function loadTasks(): Promise<StaffTask[]> {
  return getContent<StaffTask>(STAFF_TASKS_KEY, []);
}

export async function saveTasks(tasks: StaffTask[]): Promise<boolean> {
  return saveContent<StaffTask>(STAFF_TASKS_KEY, tasks);
}

export async function loadStaffMembers(): Promise<string[]> {
  return getContent<string>(STAFF_MEMBERS_KEY, []);
}

export async function saveStaffMembers(members: string[]): Promise<boolean> {
  return saveContent<string>(STAFF_MEMBERS_KEY, members);
}

// ─── ID生成（SSR非依存・クライアントで利用） ───
export function newTaskId(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `task_${rnd}`;
}

// ─── 期限の色分け ───
// status=done → done(グレー) / due未設定 → neutral / 現在>due → overdue(赤)
// 本日または明日(翌日終わりまで) → soon(黄) / それ以降 → neutral
export type DueKind = "done" | "overdue" | "soon" | "neutral";

export function dueColor(
  due: string | undefined,
  status: TaskStatus,
  now: Date
): DueKind {
  if (status === "done") return "done";
  if (!due) return "neutral";

  const dueDate = new Date(due);
  if (isNaN(dueDate.getTime())) return "neutral";

  if (now.getTime() > dueDate.getTime()) return "overdue";

  // 明日の終わり（23:59:59.999）
  const endOfTomorrow = new Date(now);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 1);
  endOfTomorrow.setHours(23, 59, 59, 999);

  if (dueDate.getTime() <= endOfTomorrow.getTime()) return "soon";
  return "neutral";
}

// 期限バッジの Tailwind クラス（緊急度バッジと同系統：赤/黄/緑〜グレー）
export const DUE_BADGE_CLASS: Record<DueKind, string> = {
  overdue: "bg-red-100 text-red-700 border border-red-200",
  soon: "bg-yellow-100 text-yellow-800 border border-yellow-200",
  neutral: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  done: "bg-slate-100 text-slate-500 border border-slate-200",
};

// ─── 期限の表示・変換ユーティリティ（クライアント側のみで使用） ───
// ISO → datetime-local の入力値（YYYY-MM-DDTHH:mm、ローカル時刻）
export function isoToLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// datetime-local の入力値 → ISO（空ならundefined）
export function localInputToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

// 期限の人間向け表示（例: 6/28(土) 17:00）
export function formatDue(iso: string | undefined): string {
  if (!iso) return "期限なし";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "期限なし";
  const week = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  const pad = (n: number) => String(n).padStart(2, "0");
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  const date = `${d.getMonth() + 1}/${d.getDate()}(${week})`;
  return hasTime ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
}

// due 昇順の比較関数（未設定は末尾）
export function compareByDue(a: StaffTask, b: StaffTask): number {
  if (!a.due && !b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  return new Date(a.due).getTime() - new Date(b.due).getTime();
}
