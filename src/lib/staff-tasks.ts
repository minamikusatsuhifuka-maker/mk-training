// 南草津皮フ科 「みんなのタスク」用のデータ層
// content_store キー staff_tasks にタスク配列（jsonb）を保存。
// 既存の content-store 導線（getContent / saveContent）を流用する。

import { getContent, saveContent } from "./content-store";

// ─── キー ───
export const STAFF_TASKS_KEY = "staff_tasks";
export const STAFF_MEMBERS_KEY = "staff_members";
export const STAFF_TASKS_ARCHIVE_KEY = "staff_tasks_archive";
export const TASK_CATEGORY_CONFIG_KEY = "task_category_config";

// ─── 型 ───
export type TaskStatus = "todo" | "doing" | "done";

export type StaffTask = {
  id: string;
  title: string;
  /** 旧・単一担当（互換維持のため残置。読み取りは assigneesOf() を使う） */
  assignee: string;
  /** 複数担当（指示書53）。新規保存はこちらの配列で行う */
  assignees?: string[];
  /** チームタスクの役割（指示書57）。担当名→リーダー/サブ。未設定=全員メンバー扱い。
   *  チーム（2名以上）でのみ有効。担当から外れた名前は保存時にクリーンアップする */
  taskRoles?: Record<string, "leader" | "sub">;
  /** カテゴリid（task_category_config の id。未分類は undefined） */
  category?: string;
  due?: string; // ISO文字列（任意）
  status: TaskStatus;
  note?: string;
  /** 登録した人（指示書56。identity由来・匿名なら"匿名"。既存タスクは未設定=「—」表示） */
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

// 担当者を常に配列で取り出す（旧データの単一 assignee と新データの assignees の両対応）
export function assigneesOf(t: Pick<StaffTask, "assignee" | "assignees">): string[] {
  if (Array.isArray(t.assignees)) {
    const list = t.assignees.filter(
      (s) => typeof s === "string" && s.trim() !== ""
    );
    if (list.length > 0) return list;
  }
  return t.assignee?.trim() ? [t.assignee.trim()] : [];
}

// チームタスク（担当2名以上）か
export function isTeamTask(t: Pick<StaffTask, "assignee" | "assignees">): boolean {
  return assigneesOf(t).length >= 2;
}

// 担当者の表示用連結。常に全員を「・」でつなぐ（指示書54で「+N」省略を撤廃。
// 長い場合の折り返しは表示側の flex-wrap / break-words で対応する）。
// チーム（2名以上）で役割があれば 👑/⭐ を名前の前に付ける（指示書57）。
// 色付き表示は components/tasks/AssigneeNames.tsx（JSX版）を使う。
export function formatAssignees(
  t: Pick<StaffTask, "assignee" | "assignees" | "taskRoles">
): string {
  const names = assigneesOf(t);
  if (names.length === 0) return "—";
  const team = names.length >= 2;
  return names
    .map((n) => {
      if (!team) return n;
      const r = t.taskRoles?.[n];
      return r === "leader" ? `👑${n}` : r === "sub" ? `⭐${n}` : n;
    })
    .join("・");
}

// ─── チームタスクの役割（指示書57） ───
export type TaskMemberRole = "leader" | "sub" | "member";

// 役割の色・アイコンの一元管理（リテラルクラス・動的組み立て禁止）。
// chip=選択済みチップ（memberは従来の緑系）、text=名前表示の文字色。
export const TASK_ROLE_STYLE: Record<
  TaskMemberRole,
  { icon: string; label: string; chip: string; text: string }
> = {
  leader: {
    icon: "👑",
    label: "リーダー",
    chip: "bg-amber-100 text-amber-800 border-amber-300",
    text: "text-amber-700 font-semibold",
  },
  sub: {
    icon: "⭐",
    label: "サブ",
    chip: "bg-blue-100 text-blue-800 border-blue-300",
    text: "text-blue-700",
  },
  member: {
    icon: "",
    label: "",
    chip: "bg-teal-light text-teal border-transparent",
    text: "",
  },
};

// その人の役割（チームでないタスクは常に member）
export function roleOf(
  t: Pick<StaffTask, "assignee" | "assignees" | "taskRoles">,
  name: string
): TaskMemberRole {
  if (!isTeamTask(t)) return "member";
  return t.taskRoles?.[name] ?? "member";
}

export function leaderName(
  t: Pick<StaffTask, "assignee" | "assignees" | "taskRoles">
): string | null {
  if (!isTeamTask(t)) return null;
  const names = assigneesOf(t);
  return names.find((n) => t.taskRoles?.[n] === "leader") ?? null;
}

export function subNames(
  t: Pick<StaffTask, "assignee" | "assignees" | "taskRoles">
): string[] {
  if (!isTeamTask(t)) return [];
  return assigneesOf(t).filter((n) => t.taskRoles?.[n] === "sub");
}

// 保存用クリーンアップ: 担当に残っている名前の役割のみ保持。
// チームでない（担当2名未満）場合や空になった場合は undefined（役割なし）。
export function cleanTaskRoles(
  assignees: string[],
  roles: Record<string, "leader" | "sub"> | undefined
): Record<string, "leader" | "sub"> | undefined {
  if (!roles || assignees.length < 2) return undefined;
  const out: Record<string, "leader" | "sub"> = {};
  for (const n of assignees) {
    const r = roles[n];
    if (r === "leader" || r === "sub") out[n] = r;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

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

// ─── タスクカテゴリ（指示書53。content_store `task_category_config` 配列保存） ───
export type TaskCategoryDef = {
  id: string;
  label: string;
  order: number;
  hidden?: boolean;
};

// 既定セット（idは既定ラベルのまま＝表示解決が素直。新規追加は tc_xxx 自動生成）
export const DEFAULT_TASK_CATEGORIES: TaskCategoryDef[] = [
  { id: "接遇", label: "接遇", order: 1 },
  { id: "在庫・発注", label: "在庫・発注", order: 2 },
  { id: "事務", label: "事務", order: 3 },
  { id: "研修", label: "研修", order: 4 },
  { id: "院内整備", label: "院内整備", order: 5 },
  { id: "その他", label: "その他", order: 6 },
];

// 保存データを検証（不正・空なら既定セットにフォールバック）
export function normalizeTaskCategories(raw: unknown): TaskCategoryDef[] {
  const cats: TaskCategoryDef[] = [];
  if (Array.isArray(raw)) {
    for (const c of raw) {
      if (!c || typeof c !== "object") continue;
      const o = c as Record<string, unknown>;
      if (typeof o.id !== "string" || !o.id.trim()) continue;
      if (typeof o.label !== "string" || !o.label.trim()) continue;
      cats.push({
        id: o.id.trim(),
        label: o.label.trim(),
        order: typeof o.order === "number" ? o.order : cats.length + 1,
        hidden: o.hidden === true ? true : undefined,
      });
    }
  }
  return cats.length > 0
    ? cats
    : DEFAULT_TASK_CATEGORIES.map((c) => ({ ...c }));
}

export async function loadTaskCategories(): Promise<TaskCategoryDef[]> {
  const rows = await getContent<unknown>(TASK_CATEGORY_CONFIG_KEY, []);
  const cats = normalizeTaskCategories(rows);
  return [...cats].sort((a, b) => a.order - b.order);
}

export async function saveTaskCategories(
  cats: TaskCategoryDef[]
): Promise<boolean> {
  const body = cats.map((c, i) => ({ ...c, order: i + 1 }));
  return saveContent<TaskCategoryDef>(TASK_CATEGORY_CONFIG_KEY, body);
}

// 選択肢に出すカテゴリ（hidden除外・order昇順）
export function visibleTaskCategories(
  cats: TaskCategoryDef[]
): TaskCategoryDef[] {
  return cats.filter((c) => !c.hidden).sort((a, b) => a.order - b.order);
}

// カテゴリid→表示ラベル（hidden・未知でも壊れない: 定義が無ければ値そのまま）
export function taskCategoryLabel(
  cats: TaskCategoryDef[],
  categoryId: string | undefined
): string {
  const v = (categoryId ?? "").trim();
  if (!v) return "";
  return cats.find((c) => c.id === v)?.label ?? v;
}

// ─── タスク操作ログ（指示書56。portal_news_log と同じパターン） ───
// 作成/変更/完了/削除/アーカイブ/復元を記録し、管理画面で閲覧する。
// 権限制限はしない＝「誰が何をしたか」の可視化による統制。
export const STAFF_TASKS_LOG_KEY = "staff_tasks_log";

/** ログの保持上限（超過分は古いものから削除） */
export const TASK_LOG_MAX = 1000;

export type TaskLogAction =
  | "create"
  | "update"
  | "status"
  | "delete"
  | "archive"
  | "restore";

export type TaskLogEntry = {
  id: string;
  /** 操作日時（ISO） */
  at: string;
  action: TaskLogAction;
  taskId: string;
  taskTitle: string;
  /** 操作者（ログイン中=プロフィール名／未ログイン=保存済みの名前／未設定=「匿名」） */
  actor: string;
  /** 変更点の要約など */
  detail?: string;
};

/** appendTaskLog に渡す形（id/at は採番） */
export type TaskLogInput = Omit<TaskLogEntry, "id" | "at">;

// 管理画面のバッジ表示用（リテラルクラス）
export const TASK_LOG_ACTION_META: Record<
  TaskLogAction,
  { label: string; badge: string }
> = {
  create: { label: "作成", badge: "bg-emerald-100 text-emerald-700" },
  update: { label: "変更", badge: "bg-blue-100 text-blue-700" },
  status: { label: "状態変更", badge: "bg-violet-100 text-violet-700" },
  delete: { label: "削除", badge: "bg-red-100 text-red-700" },
  archive: { label: "アーカイブ", badge: "bg-slate-200 text-slate-600" },
  restore: { label: "復元", badge: "bg-teal-100 text-teal-700" },
};

// ログ追記（最新が先頭・TASK_LOG_MAX件で切り詰め）。
// 失敗してもタスク本体の保存を妨げない（false を返すだけ。呼び出し側も catch する）。
export async function appendTaskLog(
  input: TaskLogInput | TaskLogInput[]
): Promise<boolean> {
  try {
    const inputs = Array.isArray(input) ? input : [input];
    if (inputs.length === 0) return true;
    const now = Date.now();
    const entries: TaskLogEntry[] = inputs.map((e, i) => ({
      ...e,
      id: `tlog_${now}_${i}`,
      at: new Date().toISOString(),
    }));
    const current = await getContent<TaskLogEntry>(STAFF_TASKS_LOG_KEY, []);
    return saveContent<TaskLogEntry>(
      STAFF_TASKS_LOG_KEY,
      [...entries, ...current].slice(0, TASK_LOG_MAX)
    );
  } catch {
    return false;
  }
}

export async function loadTaskLog(): Promise<TaskLogEntry[]> {
  return getContent<TaskLogEntry>(STAFF_TASKS_LOG_KEY, []);
}

// update ログ用の主要変更の要約（厳密diffは不要。変更なしなら空文字）
export function buildTaskUpdateDetail(
  before: StaffTask,
  after: StaffTask,
  cats: TaskCategoryDef[]
): string {
  const parts: string[] = [];
  if (before.title !== after.title) {
    parts.push(`内容: ${before.title}→${after.title}`);
  }
  const beforeAssignees = assigneesOf(before).join("・") || "未割当";
  const afterAssignees = assigneesOf(after).join("・") || "未割当";
  if (beforeAssignees !== afterAssignees) {
    parts.push(`担当: ${beforeAssignees}→${afterAssignees}`);
  }
  // 役割変更（指示書57。厳密diffは不要）
  const bLeader = leaderName(before) ?? "なし";
  const aLeader = leaderName(after) ?? "なし";
  if (bLeader !== aLeader) {
    parts.push(`リーダー: ${bLeader}→${aLeader}`);
  }
  const bSubs = subNames(before).join("・") || "なし";
  const aSubs = subNames(after).join("・") || "なし";
  if (bSubs !== aSubs) {
    parts.push(`サブ: ${bSubs}→${aSubs}`);
  }
  if ((before.category ?? "") !== (after.category ?? "")) {
    const b = taskCategoryLabel(cats, before.category) || "未分類";
    const a = taskCategoryLabel(cats, after.category) || "未分類";
    parts.push(`カテゴリ: ${b}→${a}`);
  }
  if ((before.due ?? "") !== (after.due ?? "")) {
    parts.push(`期限: ${formatDue(before.due)}→${formatDue(after.due)}`);
  }
  if (before.status !== after.status) {
    parts.push(
      `状態: ${STATUS_LABELS[before.status]}→${STATUS_LABELS[after.status]}`
    );
  }
  if ((before.note ?? "") !== (after.note ?? "")) {
    parts.push("メモ変更");
  }
  return parts.join(" / ");
}

// ─── 完了タスクのアーカイブ（指示書53） ───
export type ArchivedTask = StaffTask & { archivedAt: string };

// done になってからこの日数（updatedAt基準）を過ぎたらアーカイブへ移動
export const ARCHIVE_AFTER_DAYS = 7;

export async function loadTaskArchive(): Promise<ArchivedTask[]> {
  return getContent<ArchivedTask>(STAFF_TASKS_ARCHIVE_KEY, []);
}

export async function saveTaskArchive(items: ArchivedTask[]): Promise<boolean> {
  return saveContent<ArchivedTask>(STAFF_TASKS_ARCHIVE_KEY, items);
}

// アーカイブ対象を分離する（冪等: /tasks 読み込み時に呼ぶ）。
// done かつ updatedAt が7日以上前。サンプル（sample-）は移動せず「サンプルを消す」の削除対象のまま。
export function splitArchivableTasks(
  tasks: StaffTask[],
  now: Date
): { keep: StaffTask[]; toArchive: StaffTask[] } {
  const threshold = now.getTime() - ARCHIVE_AFTER_DAYS * 86400000;
  const keep: StaffTask[] = [];
  const toArchive: StaffTask[] = [];
  for (const t of tasks) {
    const updated = new Date(t.updatedAt).getTime();
    if (
      t.status === "done" &&
      !isSampleTask(t) &&
      !isNaN(updated) &&
      updated < threshold
    ) {
      toArchive.push(t);
    } else {
      keep.push(t);
    }
  }
  return { keep, toArchive };
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
// AIが返すタスク候補（dueは YYYY-MM-DD または null。担当は複数可・指示書53）
export type ParsedTask = {
  title: string;
  assignees: string[];
  category: string;
  due: string | null;
  status: TaskStatus;
  note: string;
};

// AIの生オブジェクトを ParsedTask に正規化（不正な行は null）。
// 担当は assignees(配列) 優先、無ければ assignee(文字列・カンマ/読点区切り可) を分割。
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

  let assignees: string[] = [];
  if (Array.isArray(o.assignees)) {
    assignees = o.assignees
      .map((a) => String(a ?? "").trim())
      .filter(Boolean);
  } else if (typeof o.assignee === "string") {
    assignees = o.assignee
      .split(/[、,，・\/]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  // 重複除去（表記そのまま）
  assignees = Array.from(new Set(assignees));

  return {
    title,
    assignees,
    category: String(o.category ?? "").trim(),
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
