// 院長の四象限マトリクス（指示書201）— 型・正規化・集計（純関数）とクライアント呼び出し
//
// 【この機能が扱うもの】
// 院長が「常に何に注力すべきか」を見失わないよう、タスクを四象限（緊急度×重要度）で管理する。
// とくに第一象限（緊急・重要）と第二象限（緊急でない・重要）を管理するための道具。
//   ・四象限の図で全体を見る（第一・第二を大きく）
//   ・象限ごとのリストで一覧する
//   ・一つ一つのタスクを9マス（中央＝タスク／周り8マス＝分解）で整理する
//
// **院長のみ**（201 A）。183の委任対象外（🔒）。スタッフの画面には一切出さない。
//
// 【保存先に専用テーブルを作らなかった理由（201 F）】
// 既に private_store（RLS全拒否・service-role のみ・(owner_id, content_type, record_key) で一意）がある。
// 1タスク＝1レコードなので件数の上限が無く、content_store の1キーに溜める方式の
// 「上限で古い記録から失う」問題も起きない。**新規テーブルは不要＝交付するSQLも無い**。
// ただし汎用の /api/private-store には content_type を**足さない**。足すとログイン済みの
// スタッフが自分名義の priority_matrix レコードを作れる口ができてしまう。
// 読み書きは /api/admin/priority-matrix（requireAdmin）だけを通す。
//
// 【173（院長の振り返り記録）との関係（201 E）】
// 「今月完了したタスクの象限ごとの件数」は**この機能の中だけの参考表示**。
// 173の四象限の配分（時間管理スナップショット）には**自動で書き込まない**。
// 配分は院長が自分で決めるものなので、177の決定（AIは提案だけ・保存は人が決める）と同じ扱いにする。
//
// このファイルは純関数とクライアント呼び出しだけ。サーバー専用の処理は priority-matrix-server.ts。

// ─── 象限 ───

/** 四象限（1〜4）。201 B の「第一〜第四」 */
export type Quadrant = 1 | 2 | 3 | 4;

export const QUADRANTS: Quadrant[] = [1, 2, 3, 4];

export type QuadrantMeta = {
  /** 図とリストの見出し */
  label: string;
  /** 短い名前（カードの移動先選択など） */
  short: string;
  /** その象限での向き合い方（201 C-1・1行） */
  advice: string;
  /** 図で大きく見せるか（第一・第二＝注力すべき場所） */
  large: boolean;
};

export const QUADRANT_META: Record<Quadrant, QuadrantMeta> = {
  1: {
    label: "第一象限（緊急・重要）",
    short: "第一象限",
    advice: "すぐに対処する",
    large: true,
  },
  2: {
    label: "第二象限（緊急でない・重要）",
    short: "第二象限",
    advice: "時間を確保して計画的に進める（最も大切）",
    large: true,
  },
  3: {
    label: "第三象限（緊急・重要でない）",
    short: "第三象限",
    advice: "任せる・減らす",
    large: false,
  },
  4: {
    label: "第四象限（緊急でない・重要でない）",
    short: "第四象限",
    advice: "やめる",
    large: false,
  },
};

export function isQuadrant(v: unknown): v is Quadrant {
  return v === 1 || v === 2 || v === 3 || v === 4;
}

/**
 * ★を付けようとしたときの一言（201 C-3）。
 * 第三・第四象限は「任せる・減らす」側なので声をかけるが、**付けることは止めない**。
 */
export const FOCUS_HINT_LOW_QUADRANT = "任せる・減らすことを検討しましょう";

/** ★（いま注力すること）は同時に3件まで（201 C-3） */
export const FOCUS_MAX = 3;

// ─── 状態 ───

export type TaskStatus = "todo" | "doing" | "done" | "hold";

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "未着手" },
  { value: "doing", label: "進行中" },
  { value: "done", label: "完了" },
  { value: "hold", label: "保留" },
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "未着手",
  doing: "進行中",
  done: "完了",
  hold: "保留",
};

export function isTaskStatus(v: unknown): v is TaskStatus {
  return v === "todo" || v === "doing" || v === "done" || v === "hold";
}

// ─── 9マス（201 D） ───

/** 周りのマスの数。中央はタスクのタイトル（固定）なので入力は8マス */
export const CELL_COUNT = 8;

export type NineCell = {
  text: string;
  /** 各マスの完了のチェック */
  done: boolean;
  /** このマスから作った新しいタスクのid（元のマスにリンクが残る・201 D） */
  linkedTaskId: string;
};

export function emptyCell(): NineCell {
  return { text: "", done: false, linkedTaskId: "" };
}

export function emptyCells(): NineCell[] {
  return Array.from({ length: CELL_COUNT }, emptyCell);
}

// ─── タスク ───

export type PriorityTask = {
  id: string;
  /** 必須 */
  title: string;
  quadrant: Quadrant;
  /** 期限 YYYY-MM-DD（空＝期限なし） */
  due: string;
  status: TaskStatus;
  memo: string;
  /** 任せる相手（第三象限で使う想定。氏名または役割） */
  assignee: string;
  /** ★ 注力の印 */
  focus: boolean;
  /** 完了日（ISO。status === "done" のときだけ入る） */
  completedAt: string;
  /** 手動の並べ替え用（小さいほど上） */
  order: number;
  /** 9マスの周り8マス */
  cells: NineCell[];
  /** 9マスのマスから作られたタスクのとき、その元（たどれるようにしておく） */
  sourceTaskId: string;
  sourceCellIndex: number;
  createdAt: string;
  updatedAt: string;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function bool(v: unknown): boolean {
  return v === true;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** YYYY-MM-DD だけ通す（それ以外は期限なし扱い） */
export function normalizeDue(v: unknown): string {
  const s = str(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function normalizeCell(raw: unknown): NineCell {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    text: str(o.text),
    done: bool(o.done),
    linkedTaskId: str(o.linkedTaskId),
  };
}

/** 必ず8マスに揃える（足りなければ空マスで埋め、多ければ切る） */
export function normalizeCells(raw: unknown): NineCell[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out = emptyCells();
  for (let i = 0; i < CELL_COUNT; i++) {
    if (i < arr.length) out[i] = normalizeCell(arr[i]);
  }
  return out;
}

/**
 * 保存された値・送られてきた値をタスクに整える。
 * タイトルが空のものは**タスクとして成り立たない**ので null（201 B: タイトルは必須）。
 */
export function normalizeTask(id: string, raw: unknown): PriorityTask | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = str(o.title).trim();
  if (!title) return null;
  const status = isTaskStatus(o.status) ? o.status : "todo";
  const now = new Date().toISOString();
  return {
    id,
    title,
    quadrant: isQuadrant(o.quadrant) ? o.quadrant : 2,
    due: normalizeDue(o.due),
    status,
    memo: str(o.memo),
    assignee: str(o.assignee).trim(),
    focus: bool(o.focus),
    // 完了以外に戻したら完了日は残さない（一覧の「完了も表示」の判定とずれないように）
    completedAt: status === "done" ? str(o.completedAt) || now : "",
    order: num(o.order, 0),
    cells: normalizeCells(o.cells),
    sourceTaskId: str(o.sourceTaskId),
    sourceCellIndex: num(o.sourceCellIndex, -1),
    createdAt: str(o.createdAt) || now,
    updatedAt: str(o.updatedAt) || now,
  };
}

/** 保存前の検証。問題があればその文言、無ければ null */
export function validateTask(t: PriorityTask): string | null {
  if (!t.title.trim()) return "タイトルは必須です";
  if (t.title.length > 200) return "タイトルが長すぎます（200文字まで）";
  if (t.memo.length > 4000) return "メモが長すぎます（4000文字まで）";
  if (t.assignee.length > 100) return "任せる相手が長すぎます（100文字まで）";
  for (const c of t.cells) {
    if (c.text.length > 1000) return "9マスの内容が長すぎます（1マス1000文字まで）";
  }
  return null;
}

// ─── 並び・絞り込み（201 C-2） ───

export type SortMode = "due" | "manual";

/** 期限が近い順（期限なしは最後）。同じなら手動の並び→作成順 */
export function compareByDue(a: PriorityTask, b: PriorityTask): number {
  if (a.due && b.due) {
    if (a.due !== b.due) return a.due < b.due ? -1 : 1;
  } else if (a.due !== b.due) {
    return a.due ? -1 : 1; // 期限なしは最後
  }
  if (a.order !== b.order) return a.order - b.order;
  return a.createdAt.localeCompare(b.createdAt);
}

export function compareByManual(a: PriorityTask, b: PriorityTask): number {
  if (a.order !== b.order) return a.order - b.order;
  return a.createdAt.localeCompare(b.createdAt);
}

export function sortTasks(tasks: PriorityTask[], mode: SortMode): PriorityTask[] {
  return [...tasks].sort(mode === "due" ? compareByDue : compareByManual);
}

export function tasksOfQuadrant(tasks: PriorityTask[], q: Quadrant): PriorityTask[] {
  return tasks.filter((t) => t.quadrant === q);
}

/**
 * 一覧に出すタスクを絞る。
 * 完了したタスクは既定では隠す（201 B「完了も表示」で見られる）。
 * statuses が空なら状態での絞り込みはしない。
 */
export function filterTasks(
  tasks: PriorityTask[],
  options: { statuses?: TaskStatus[]; showDone?: boolean }
): PriorityTask[] {
  const statuses = options.statuses ?? [];
  return tasks.filter((t) => {
    if (!options.showDone && t.status === "done") return false;
    if (statuses.length > 0 && !statuses.includes(t.status)) return false;
    return true;
  });
}

// ─── 期限切れ（201 C-1 の赤い印） ───

/** 今日（端末の日付）を YYYY-MM-DD で */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 期限切れか（期限なし・完了済みは期限切れにしない） */
export function isOverdue(t: PriorityTask, today: string = todayKey()): boolean {
  if (!t.due || t.status === "done") return false;
  return t.due < today;
}

// ─── 9マスの進み具合（201 C-2） ───

export type CellProgress = { written: number; done: number; total: number };

/**
 * 「8マス中3つ完了」の元になる数。
 * written＝何か書いてあるマスの数、done＝完了チェックが付いたマスの数、total＝8。
 */
export function cellProgress(t: PriorityTask): CellProgress {
  let written = 0;
  let done = 0;
  for (const c of t.cells) {
    if (c.text.trim()) written += 1;
    if (c.done) done += 1;
  }
  return { written, done, total: CELL_COUNT };
}

export function cellProgressLabel(t: PriorityTask): string {
  const p = cellProgress(t);
  return `${p.total}マス中${p.done}つ完了`;
}

// ─── ★ いま注力すること（201 C-3） ───

export function focusTasks(tasks: PriorityTask[]): PriorityTask[] {
  return tasks
    .filter((t) => t.focus)
    .sort((a, b) => {
      // 第一・第二象限を先に、そのあと期限が近い順
      if (a.quadrant !== b.quadrant) return a.quadrant - b.quadrant;
      return compareByDue(a, b);
    })
    .slice(0, FOCUS_MAX);
}

/** いま★が何件か（上限の判定に使う） */
export function focusCount(tasks: PriorityTask[]): number {
  return tasks.filter((t) => t.focus).length;
}

// ─── 今月完了したタスクの象限ごとの件数（201 E・参考表示） ───

export function monthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export type DoneCounts = Record<Quadrant, number>;

export function emptyDoneCounts(): DoneCounts {
  return { 1: 0, 2: 0, 3: 0, 4: 0 };
}

/**
 * 指定した月（YYYY-MM）に完了したタスクの件数を象限ごとに数える。
 * **173の配分には書き込まない**（201 E）。ここで数えた値は画面の参考表示だけに使う。
 */
export function doneCountsOfMonth(tasks: PriorityTask[], month: string = monthKey()): DoneCounts {
  const out = emptyDoneCounts();
  for (const t of tasks) {
    if (t.status !== "done" || !t.completedAt) continue;
    if (!t.completedAt.startsWith(month)) continue;
    out[t.quadrant] += 1;
  }
  return out;
}

// ─── 操作ログ（201 F・本文は残さない） ───

export type MatrixLog = {
  id: string;
  at: string;
  by: string;
  action: string;
  /** 対象のタスクid。**タイトル・メモ・9マスの本文は残さない** */
  taskId: string;
  quadrant: Quadrant | 0;
};

export function normalizeLog(id: string, raw: unknown): MatrixLog | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const at = str(o.at);
  const action = str(o.action);
  if (!at || !action) return null;
  return {
    id,
    at,
    by: str(o.by),
    action,
    taskId: str(o.taskId),
    quadrant: isQuadrant(o.quadrant) ? o.quadrant : 0,
  };
}

// ─── クライアント呼び出し ───

export type MatrixPayload = {
  tasks: PriorityTask[];
  logs: MatrixLog[];
};

/** タスクの編集で送れる項目（id・createdAt などサーバーが決めるものは含めない） */
export type TaskFields = Partial<
  Pick<
    PriorityTask,
    | "title"
    | "quadrant"
    | "due"
    | "status"
    | "memo"
    | "assignee"
    | "focus"
    | "order"
    | "cells"
    | "sourceTaskId"
    | "sourceCellIndex"
  >
>;

const API = "/api/admin/priority-matrix";

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `処理に失敗しました (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchMatrix(): Promise<MatrixPayload> {
  const j = await call<{ tasks: unknown[]; logs: unknown[] }>(API);
  return {
    tasks: (j.tasks ?? [])
      .map((t) => {
        const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
        return normalizeTask(str(o.id), o);
      })
      .filter((t): t is PriorityTask => t !== null),
    logs: (j.logs ?? [])
      .map((l) => {
        const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
        return normalizeLog(str(o.id), o);
      })
      .filter((l): l is MatrixLog => l !== null),
  };
}

/** ★の3件だけを取る（管理画面のトップ用・201 C-3）。中身は必要な分だけ返る */
export async function fetchFocusTasks(): Promise<PriorityTask[]> {
  const j = await call<{ tasks: unknown[] }>(`${API}?focus=1`);
  return (j.tasks ?? [])
    .map((t) => {
      const o = (t && typeof t === "object" ? t : {}) as Record<string, unknown>;
      return normalizeTask(str(o.id), o);
    })
    .filter((t): t is PriorityTask => t !== null);
}

export async function createTask(fields: TaskFields): Promise<PriorityTask> {
  const j = await call<{ task: unknown }>(API, {
    method: "POST",
    body: JSON.stringify({ fields }),
  });
  const o = (j.task && typeof j.task === "object" ? j.task : {}) as Record<string, unknown>;
  const t = normalizeTask(str(o.id), o);
  if (!t) throw new Error("保存した内容を読み取れませんでした");
  return t;
}

export async function updateTask(id: string, fields: TaskFields): Promise<PriorityTask> {
  const j = await call<{ task: unknown }>(API, {
    method: "PATCH",
    body: JSON.stringify({ id, fields }),
  });
  const o = (j.task && typeof j.task === "object" ? j.task : {}) as Record<string, unknown>;
  const t = normalizeTask(str(o.id), o);
  if (!t) throw new Error("保存した内容を読み取れませんでした");
  return t;
}

export async function deleteTask(id: string): Promise<void> {
  await call<{ ok: boolean }>(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}
