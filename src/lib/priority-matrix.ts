// 院長の四象限マトリクス（指示書201 → 202で改修）— 型・正規化・集計（純関数）とクライアント呼び出し
//
// 【この機能が扱うもの】
// 院長が「常に何に注力すべきか」を見失わないよう、やることを四象限（緊急度×重要度）で管理する。
//   ・四象限の図とリストで全体を見る（第一・第二を大きく）
//   ・1項目＝1行。**その場で書けて、行をクリックすると下に小さく開いて直せる**（202 §1・§2）
//   ・1項目を9マスで深掘りする（**3段まで**・202 §3）
//   ・四象限とは別に「9マス帳」を持つ（202 §4）
//
// **院長のみ**（201 A）。183の委任対象外（🔒）。スタッフの画面には一切出さない。
//
// 【保存先（201 F・202 §5）】
// 既存の private_store（RLS全拒否・service-role のみ・(owner_id, content_type, record_key) で一意）。
// **1レコード＝「四象限の項目」1件、または「9マス帳」1冊**。その下の9マス（3段まで）は
// 同じレコードの中に入れ子で持つ（別レコードに散らさない＝1回の保存で段ごとずれない）。
// content_type は 201 と同じ `priority_matrix` **1種類のまま**にし、
// 四象限の項目と9マス帳は data の `kind`（"task" / "book"）で分ける。
//   → 新しい content_type を足さない＝**DB側に手を入れずに済む**（202 §0 の疑いを増やさない）。
// 汎用の /api/private-store には content_type を**足さない**（ログイン済みスタッフが
// 自分名義のレコードを作れる口を作らないため）。読み書きは /api/admin/priority-matrix だけ。
//
// 【201のデータの扱い（202 §5）】
// 201の9マスは `cells: {text,done,linkedTaskId}[8]` だった。202では各マスに `children`（下の段の8マス）が
// 増える。**読み取り時に children: [] を足すだけ**で新しい形になるので、元のデータは何も失わない。
//
// 【173（院長の振り返り記録）との関係（201 E・202 §6）】
// 「今月完了した件数」はこの機能の中だけの参考表示。173の四象限の配分には**自動で書き込まない**。
// 9マス帳も同じ（配分にも★にも今月の完了数にも入れない）。
//
// このファイルは純関数とクライアント呼び出しだけ。サーバー専用の処理は priority-matrix-server.ts。

// ─── 象限 ───

/** 四象限（1〜4）。201 B の「第一〜第四」 */
export type Quadrant = 1 | 2 | 3 | 4;

export const QUADRANTS: Quadrant[] = [1, 2, 3, 4];

export type QuadrantMeta = {
  /** 図とリストの見出し */
  label: string;
  /** 短い名前（移す先の選択など） */
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

/** 1行に出す小さな印（202 §2）。未着手は印を出さない（行をうるさくしない） */
export const STATUS_MARK: Record<TaskStatus, string> = {
  todo: "",
  doing: "進行中",
  done: "完了",
  hold: "保留",
};

export function isTaskStatus(v: unknown): v is TaskStatus {
  return v === "todo" || v === "doing" || v === "done" || v === "hold";
}

// ─── 9マス（201 D → 202 §3） ───

/** 周りのマスの数。中央は「いま開いている題」なので入力は8マス */
export const CELL_COUNT = 8;

/** 深さの上限（202 §3）。最初の9マスを1段として**3段まで**。4段目は「▦」を出さない */
export const MAX_DEPTH = 3;

/**
 * マスの並び（201から変えない）。中央（4番目）は題で、残りが入力マス0〜7。
 * ここを変えると201に書いてあるマスの位置が入れ替わってしまう。
 */
export const GRID_SLOTS: (number | "center")[] = [0, 1, 2, 3, "center", 4, 5, 6, 7];

/**
 * 「Enterで時計回りに次の空きマスへ」の順番（202 §3）。
 * 上の並びでは左上→上→右上→右→右下→下→左下→左 が 0,1,2,4,7,6,5,3 になる。
 */
export const CLOCKWISE: number[] = [0, 1, 2, 4, 7, 6, 5, 3];

export type NineCell = {
  text: string;
  /** 各マスの完了のチェック */
  done: boolean;
  /** 「四象限に行として追加」した先の項目id（元のマスは残す・202 §3） */
  linkedTaskId: string;
  /** 下の段の8マス。**空配列＝下の段なし**（レコードを無駄に太らせない） */
  children: NineCell[];
};

/** 9マスの中のどのマスを中央にしているか。[]＝最初の9マス・[2]＝3番目のマスを中央にした2段目 */
export type CellPath = number[];

export function emptyCell(): NineCell {
  return { text: "", done: false, linkedTaskId: "", children: [] };
}

export function emptyCells(): NineCell[] {
  return Array.from({ length: CELL_COUNT }, emptyCell);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function bool(v: unknown): boolean {
  return v === true;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * マス1つを整える。depth はそのマスが何段目か（1〜MAX_DEPTH）。
 * MAX_DEPTH の段のマスは children を持たない（4段目を作れないようにする）。
 */
function normalizeCell(raw: unknown, depth: number): NineCell {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    text: str(o.text),
    done: bool(o.done),
    linkedTaskId: str(o.linkedTaskId),
    children: depth >= MAX_DEPTH ? [] : normalizeChildren(o.children, depth + 1),
  };
}

/** 下の段。何も無ければ**空配列**のまま返す（201のデータはここが無いので空になる） */
function normalizeChildren(raw: unknown, depth: number): NineCell[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const cells = normalizeCells(raw, depth);
  return cells.some((c) => c.text.trim() || c.done || c.children.length > 0) ? cells : [];
}

/** 必ず8マスに揃える（足りなければ空マスで埋め、多ければ切る） */
export function normalizeCells(raw: unknown, depth = 1): NineCell[] {
  const arr = Array.isArray(raw) ? raw : [];
  const out: NineCell[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    out.push(i < arr.length ? normalizeCell(arr[i], depth) : emptyCell());
  }
  return out;
}

// ─── 9マスの道（入れ子をたどる） ───

export function isValidPath(path: CellPath): boolean {
  if (path.length > MAX_DEPTH - 1) return false;
  return path.every((i) => Number.isInteger(i) && i >= 0 && i < CELL_COUNT);
}

/** 画面のURLに入れる形（"2.5"）。最初の9マスは空文字 */
export function pathToParam(path: CellPath): string {
  return path.join(".");
}

/** URLの値を道に戻す。おかしければ最初の9マス（[]）に倒す */
export function parsePathParam(v: string | null | undefined): CellPath {
  if (!v) return [];
  const path = v
    .split(".")
    .filter((s) => s !== "")
    .map((s) => Number(s));
  return isValidPath(path) ? path : [];
}

/** 道の指すマス（無ければ null） */
export function cellAt(root: NineCell[], path: CellPath): NineCell | null {
  let cells = root;
  let cell: NineCell | null = null;
  for (const i of path) {
    cell = cells[i] ?? null;
    if (!cell) return null;
    cells = cell.children;
  }
  return cell;
}

/** その道で表示する8マス（下の段がまだ無ければ空マス8つ） */
export function gridCells(root: NineCell[], path: CellPath): NineCell[] {
  if (path.length === 0) return root;
  const cell = cellAt(root, path);
  if (!cell) return emptyCells();
  return cell.children.length === CELL_COUNT ? cell.children : emptyCells();
}

/** その道の9マスが何段目か（1〜MAX_DEPTH） */
export function depthOf(path: CellPath): number {
  return path.length + 1;
}

/** そのマスから下の段へ行けるか（4段目は作らない・202 §3） */
export function canDigInto(path: CellPath): boolean {
  return depthOf(path) < MAX_DEPTH;
}

/** そのマス自身または下の段に中身があるか（印に使う・202 §3） */
export function hasContentDeep(cell: NineCell): boolean {
  if (cell.text.trim() || cell.done) return true;
  return cell.children.some(hasContentDeep);
}

/** 下の段に中身があるか（右下の点・消すときの確認に使う） */
export function hasChildContent(cell: NineCell): boolean {
  return cell.children.some(hasContentDeep);
}

/** 道の指す8マスの index 番目を直す。下の段がまだ無ければその場で8マス作る */
export function setGridCell(
  root: NineCell[],
  path: CellPath,
  index: number,
  patch: Partial<NineCell>
): NineCell[] {
  if (index < 0 || index >= CELL_COUNT) return root;
  if (path.length === 0) {
    return root.map((c, i) => (i === index ? { ...c, ...patch } : c));
  }
  const [head, ...rest] = path;
  return root.map((c, i) => {
    if (i !== head) return c;
    const children = c.children.length === CELL_COUNT ? c.children : emptyCells();
    return { ...c, children: setGridCell(children, rest, index, patch) };
  });
}

/** 道の指すマス（＝いま中央にしている題）の文章を書き換える */
export function setCellText(root: NineCell[], path: CellPath, text: string): NineCell[] {
  if (path.length === 0) return root;
  const index = path[path.length - 1];
  return setGridCell(root, path.slice(0, -1), index, { text });
}

/** マスを空にする（下の段も一緒に消える・202 §3） */
export function clearGridCell(root: NineCell[], path: CellPath, index: number): NineCell[] {
  return setGridCell(root, path, index, {
    text: "",
    done: false,
    linkedTaskId: "",
    children: [],
  });
}

// ─── レコード（四象限の項目／9マス帳） ───

export type RecordKind = "task" | "book";

export type PriorityTask = {
  kind: "task";
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
  /** 9マス（周り8マス。各マスが下の段を持てる） */
  cells: NineCell[];
  /** 9マスのマスから作られた項目のとき、その元（たどれるようにしておく） */
  sourceTaskId: string;
  sourceCellIndex: number;
  createdAt: string;
  updatedAt: string;
};

/** 9マス帳（202 §4）。四象限・★・今月の完了数には**入れない** */
export type GridBook = {
  kind: "book";
  id: string;
  title: string;
  cells: NineCell[];
  order: number;
  createdAt: string;
  updatedAt: string;
};

export type MatrixRecord = PriorityTask | GridBook;

export function isBook(r: MatrixRecord): r is GridBook {
  return r.kind === "book";
}

/** YYYY-MM-DD だけ通す（それ以外は期限なし扱い） */
export function normalizeDue(v: unknown): string {
  const s = str(v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

/**
 * 保存された値・送られてきた値を四象限の項目に整える。
 * タイトルが空のものは**項目として成り立たない**ので null（201 B: タイトルは必須）。
 */
export function normalizeTask(id: string, raw: unknown): PriorityTask | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = str(o.title).trim();
  if (!title) return null;
  const status = isTaskStatus(o.status) ? o.status : "todo";
  const now = new Date().toISOString();
  return {
    kind: "task",
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

export function normalizeBook(id: string, raw: unknown): GridBook | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = str(o.title).trim();
  if (!title) return null;
  const now = new Date().toISOString();
  return {
    kind: "book",
    id,
    title,
    cells: normalizeCells(o.cells),
    order: num(o.order, 0),
    createdAt: str(o.createdAt) || now,
    updatedAt: str(o.updatedAt) || now,
  };
}

/** 保存されている1レコードを、kind を見て項目／9マス帳のどちらかに整える */
export function normalizeRecord(id: string, raw: unknown): MatrixRecord | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // 201のデータには kind が無い。その場合は四象限の項目（当時は項目しか無かった）
  return o.kind === "book" ? normalizeBook(id, o) : normalizeTask(id, o);
}

/** 保存前の検証。問題があればその文言、無ければ null */
export function validateRecord(r: MatrixRecord): string | null {
  if (!r.title.trim()) return "タイトルは必須です";
  if (r.title.length > 200) return "タイトルが長すぎます（200文字まで）";
  if (r.kind === "task") {
    if (r.memo.length > 4000) return "メモが長すぎます（4000文字まで）";
    if (r.assignee.length > 100) return "任せる相手が長すぎます（100文字まで）";
  }
  const tooLong = (cells: NineCell[]): boolean =>
    cells.some((c) => c.text.length > 1000 || tooLong(c.children));
  if (tooLong(r.cells)) return "9マスの内容が長すぎます（1マス1000文字まで）";
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
 * 一覧に出す項目を絞る。
 * 完了したものは既定では隠す（201 B「完了も表示」で見られる）。
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

// ─── 9マスの進み具合（201 C-2・202 §3） ───

export type CellProgress = { written: number; done: number; total: number };

/**
 * 「8マス中3つ完了」の元になる数。**その段の8マスだけ**を数える（下の段は数えない）。
 * written＝何か書いてあるマスの数、done＝完了チェックが付いたマスの数、total＝8。
 */
export function levelProgress(cells: NineCell[]): CellProgress {
  let written = 0;
  let done = 0;
  for (const c of cells) {
    if (c.text.trim()) written += 1;
    if (c.done) done += 1;
  }
  return { written, done, total: CELL_COUNT };
}

export function cellProgress(r: MatrixRecord): CellProgress {
  return levelProgress(r.cells);
}

export function progressLabel(p: CellProgress): string {
  return `${p.total}マス中${p.done}つ完了`;
}

export function cellProgressLabel(r: MatrixRecord): string {
  return progressLabel(cellProgress(r));
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

export const FOCUS_LIMIT_MESSAGE = `★（いま注力すること）は${FOCUS_MAX}件までです`;

// ─── 今月完了した件数（201 E・参考表示。9マス帳は入れない） ───

export function monthKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export type DoneCounts = Record<Quadrant, number>;

export function emptyDoneCounts(): DoneCounts {
  return { 1: 0, 2: 0, 3: 0, 4: 0 };
}

/**
 * 指定した月（YYYY-MM）に完了した項目の件数を象限ごとに数える。
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
  /** 対象のid。**タイトル・メモ・9マスの本文は残さない** */
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

// ─── 版の照合（202 §5・複数タブの同時編集） ───

export const VERSION_CONFLICT_MESSAGE =
  "別の画面で更新されました。再読み込みしてください";

/** 版が食い違ったとき（HTTP 409）だと分かる印 */
export const CONFLICT_CODE = "conflict";

export class MatrixError extends Error {
  code: string;
  status: number;
  constructor(message: string, status: number, code = "") {
    super(message);
    this.name = "MatrixError";
    this.status = status;
    this.code = code;
  }
}

export function isConflict(e: unknown): boolean {
  return e instanceof MatrixError && e.code === CONFLICT_CODE;
}

// ─── クライアント呼び出し ───

export type MatrixPayload = {
  tasks: PriorityTask[];
  books: GridBook[];
  logs: MatrixLog[];
};

/** 編集で送れる項目（id・createdAt などサーバーが決めるものは含めない） */
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

export type BookFields = Partial<Pick<GridBook, "title" | "order" | "cells">>;

export type RecordFields = TaskFields | BookFields;

const API = "/api/admin/priority-matrix";

async function call<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    // 回線が切れた・端末がスリープしたなど。**黙って終わらせない**（202 §0-3）
    throw new MatrixError("通信できませんでした。電波・接続を確かめてもう一度お試しください", 0);
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new MatrixError(
      j.error || `処理に失敗しました (${res.status})`,
      res.status,
      j.code || (res.status === 409 ? CONFLICT_CODE : "")
    );
  }
  return (await res.json()) as T;
}

function obj(v: unknown): Record<string, unknown> {
  return (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
}

function toTask(v: unknown): PriorityTask {
  const o = obj(v);
  const t = normalizeTask(str(o.id), o);
  if (!t) throw new MatrixError("保存した内容を読み取れませんでした", 500);
  return t;
}

function toBook(v: unknown): GridBook {
  const o = obj(v);
  const b = normalizeBook(str(o.id), o);
  if (!b) throw new MatrixError("保存した内容を読み取れませんでした", 500);
  return b;
}

export async function fetchMatrix(): Promise<MatrixPayload> {
  const j = await call<{ tasks: unknown[]; books: unknown[]; logs: unknown[] }>(API);
  return {
    tasks: (j.tasks ?? [])
      .map((t) => normalizeTask(str(obj(t).id), t))
      .filter((t): t is PriorityTask => t !== null),
    books: (j.books ?? [])
      .map((b) => normalizeBook(str(obj(b).id), b))
      .filter((b): b is GridBook => b !== null),
    logs: (j.logs ?? [])
      .map((l) => normalizeLog(str(obj(l).id), l))
      .filter((l): l is MatrixLog => l !== null),
  };
}

/** ★の3件だけを取る（管理画面のトップ用・201 C-3） */
export async function fetchFocusTasks(): Promise<PriorityTask[]> {
  const j = await call<{ tasks: unknown[] }>(`${API}?focus=1`);
  return (j.tasks ?? [])
    .map((t) => normalizeTask(str(obj(t).id), t))
    .filter((t): t is PriorityTask => t !== null);
}

/** 9マス画面のための単体取得（項目でも9マス帳でも同じ口） */
export async function fetchRecord(id: string): Promise<MatrixRecord> {
  const j = await call<{ record: unknown }>(`${API}?id=${encodeURIComponent(id)}`);
  const o = obj(j.record);
  const r = normalizeRecord(str(o.id), o);
  if (!r) throw new MatrixError("読み取れませんでした", 500);
  return r;
}

export async function createTask(fields: TaskFields): Promise<PriorityTask> {
  const j = await call<{ record: unknown }>(API, {
    method: "POST",
    body: JSON.stringify({ kind: "task", fields }),
  });
  return toTask(j.record);
}

export async function createBook(title: string): Promise<GridBook> {
  const j = await call<{ record: unknown }>(API, {
    method: "POST",
    body: JSON.stringify({ kind: "book", fields: { title } }),
  });
  return toBook(j.record);
}

/**
 * 1件を更新する。baseUpdatedAt には**いま画面が持っている版**（updatedAt）を渡す。
 * サーバーの版と違えば保存せず 409（202 §5）。
 */
export async function updateTask(
  id: string,
  fields: TaskFields,
  baseUpdatedAt?: string
): Promise<PriorityTask> {
  const j = await call<{ record: unknown }>(API, {
    method: "PATCH",
    body: JSON.stringify({ id, fields, baseUpdatedAt }),
  });
  return toTask(j.record);
}

export async function updateBook(
  id: string,
  fields: BookFields,
  baseUpdatedAt?: string
): Promise<GridBook> {
  const j = await call<{ record: unknown }>(API, {
    method: "PATCH",
    body: JSON.stringify({ id, fields, baseUpdatedAt }),
  });
  return toBook(j.record);
}

/** 項目でも9マス帳でも同じ口で消す */
export async function deleteRecord(id: string): Promise<void> {
  await call<{ ok: boolean }>(`${API}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ─── 保存の点検（202 §0）───

export type SelfTestStep = { name: string; ok: boolean; detail: string };
export type SelfTestResult = { ok: boolean; steps: SelfTestStep[] };

/**
 * 「書ける／読み戻せる／消せる」を本番でその場で確かめる（院長だけが押せる）。
 * 201で保存が効かなかったとき、**画面の文言だけで原因が分かる**ようにするための道具。
 * 使い捨てのレコードを1件作って読み戻し、必ず消す。
 */
export async function runSelfTest(): Promise<SelfTestResult> {
  return await call<SelfTestResult>(`${API}?selftest=1`);
}
