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

// ─── 期限バケット（グループ見出し・サマリー集計用） ───
// 日付（ローカル/Asia/Tokyo相当）で判定。dueColor(時刻ベース)とは別用途。
export type DueBucket =
  | "overdue"
  | "today"
  | "tomorrow"
  | "later"
  | "nodue"
  | "done";

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function bucketOf(task: StaffTask, now: Date): DueBucket {
  if (task.status === "done") return "done";
  if (!task.due) return "nodue";
  const due = new Date(task.due);
  if (isNaN(due.getTime())) return "nodue";
  const diffDays = Math.round(
    (startOfDay(due) - startOfDay(now)) / 86400000
  );
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  return "later";
}

// グループ表示順とラベル
export const DUE_BUCKET_ORDER: DueBucket[] = [
  "overdue",
  "today",
  "tomorrow",
  "later",
  "nodue",
  "done",
];

export const DUE_BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "超過",
  today: "今日",
  tomorrow: "明日",
  later: "それ以降",
  nodue: "期限なし",
  done: "完了",
};

// 見出しの文字色アクセント（赤/黄/通常/グレー）
export const DUE_BUCKET_TEXT: Record<DueBucket, string> = {
  overdue: "text-red-600",
  today: "text-yellow-700",
  tomorrow: "text-yellow-700",
  later: "text-foreground",
  nodue: "text-foreground",
  done: "text-muted-foreground",
};

// カード左端の色帯（border-left）
export const DUE_BUCKET_BORDER: Record<DueBucket, string> = {
  overdue: "border-l-red-400",
  today: "border-l-yellow-400",
  tomorrow: "border-l-yellow-400",
  later: "border-l-emerald-300",
  nodue: "border-l-slate-200",
  done: "border-l-slate-300",
};

// 件数サマリー（超過/今日/未完了/完了）。openは未完了合計
export type TaskCounts = {
  overdue: number;
  today: number;
  open: number;
  done: number;
};

export function taskCounts(tasks: StaffTask[], now: Date): TaskCounts {
  let overdue = 0;
  let today = 0;
  let open = 0;
  let done = 0;
  for (const t of tasks) {
    if (t.status === "done") {
      done++;
      continue;
    }
    open++;
    const b = bucketOf(t, now);
    if (b === "overdue") overdue++;
    else if (b === "today") today++;
  }
  return { overdue, today, open, done };
}

// ─── 確認用サンプル ───
// サンプルは "sample-" 接頭辞の固定IDで管理。実データと混ざらず、いつでも消せる。
export const SAMPLE_PREFIX = "sample-";
export const SAMPLE_MEMBERS = ["田中", "佐藤", "山本", "鈴木"];

export function isSampleTask(t: StaffTask): boolean {
  return t.id.startsWith(SAMPLE_PREFIX);
}

// now を基準に「dayOffset 日後の h:m」のISO（ローカル時刻ベース）
function atRelativeDay(
  now: Date,
  dayOffset: number,
  h: number,
  m: number
): string {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// 投入時の現在時刻を基準に相対計算したサンプル8件を生成
export function buildSampleTasks(now: Date): StaffTask[] {
  const nowIso = now.toISOString();
  const base = (
    id: string,
    title: string,
    assignee: string,
    due: string | undefined,
    status: TaskStatus,
    note?: string
  ): StaffTask => ({
    id,
    title,
    assignee,
    due,
    status,
    note,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  return [
    base("sample-1", "軟膏類の発注（在庫補充）", "山本", atRelativeDay(now, -1, 17, 0), "doing", "在庫1本のみ"),
    base("sample-2", "自費カウンセリング資料の差し替え", "佐藤", atRelativeDay(now, 0, 18, 0), "todo"),
    base("sample-3", "新人研修スケジュール作成", "田中", atRelativeDay(now, 1, 12, 0), "todo"),
    base("sample-4", "予約システムのマニュアル更新", "鈴木", atRelativeDay(now, 2, 12, 0), "doing"),
    base("sample-5", "物品棚卸し", "鈴木", atRelativeDay(now, 4, 12, 0), "todo"),
    base("sample-6", "学会の参加申込", "佐藤", atRelativeDay(now, 9, 12, 0), "doing"),
    base("sample-7", "観葉植物の水やり当番表", "田中", undefined, "todo"),
    base("sample-8", "待合のPOP張り替え", "山本", atRelativeDay(now, -3, 12, 0), "done"),
  ];
}

// 既存タスクにサンプルを id でマージ（同IDは置換）。元の並び順を保持。
export function mergeSampleTasks(
  existing: StaffTask[],
  samples: StaffTask[]
): StaffTask[] {
  const map = new Map(existing.map((t) => [t.id, t]));
  samples.forEach((s) => map.set(s.id, s));
  return Array.from(map.values());
}

// "sample-" のタスクのみ除去（実データは残す）
export function clearSampleTasks(tasks: StaffTask[]): StaffTask[] {
  return tasks.filter((t) => !isSampleTask(t));
}

export function hasSampleTasks(tasks: StaffTask[]): boolean {
  return tasks.some(isSampleTask);
}

// staff_members に名前を重複なくマージ
export function mergeMembers(existing: string[], add: string[]): string[] {
  const set = new Set(existing);
  add.forEach((m) => m && set.add(m));
  return Array.from(set);
}

// ─── AI解析（ファイル取り込み）用 ───
// AIが返すタスク候補（dueは YYYY-MM-DD または null）
export type ParsedTask = {
  title: string;
  assignee: string;
  due: string | null;
  status: TaskStatus;
  note: string;
};

// AIの生オブジェクトを ParsedTask に正規化（不正な行は null）
export function normalizeParsedTask(raw: unknown): ParsedTask | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = String(o.title ?? "").trim();
  if (!title) return null;

  const statusRaw = String(o.status ?? "").trim();
  const status: TaskStatus = (STATUS_ORDER as string[]).includes(statusRaw)
    ? (statusRaw as TaskStatus)
    : "todo";

  let due: string | null = null;
  if (typeof o.due === "string") {
    const m = o.due.match(/^\d{4}-\d{2}-\d{2}/);
    if (m) due = m[0];
  }

  return {
    title,
    assignee: String(o.assignee ?? "").trim(),
    due,
    status,
    note: String(o.note ?? "").trim(),
  };
}

// 日付のみ(YYYY-MM-DD) → ISO（ローカル0時基準）。空ならundefined
export function dateOnlyToIso(d: string | null | undefined): string | undefined {
  if (!d) return undefined;
  const dt = new Date(`${d}T00:00:00`);
  if (isNaN(dt.getTime())) return undefined;
  return dt.toISOString();
}

// ISO → date入力値(YYYY-MM-DD)
export function isoToDateInput(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
