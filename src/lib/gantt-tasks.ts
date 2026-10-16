// 📊 ガントチャートの計画の中のタスク（指示書263）— 純関数・定義の正本（画面とサーバーの両方から使う）
//
// 【ねらい】スタッフができることはスタッフに任せる。院長にしかできない判断は院長が行う（「院長が判断」の印）。
// 【保存先】clinic_staff_growth（record_type = gantt_task・1件1行・id = gt-…）。新しい表は作らない。
//   ひとことはタスクの行の中（comments）に入れる。
// 【権限（判定はサーバー。ここは判定の式だけ）】
//   足す・直す・消す・並べ替え … 院長・「📊 ガントチャート」を任された幹部・その計画の担当（264: 一覧から選んだ人）
//                                （チームプロジェクトは作った人とメンバー）＝ canManageTasks
//   状態を変える・ひとことを書く … 上の人と、そのタスクの担当者 ＝ canTouchTask
//   自分のひとこと                … 書いた人が直せる・消せる。どのひとことでも消せるのは院長と任された幹部
//   「院長が判断」の印            … 付けるのは書ける人。外すのは院長だけ
//   「院長が判断」のタスクの完了  … 院長だけ（完了から戻すのも院長だけ）
// 【検証用（237）】検証用アカウントが書いたタスク・ひとことは testSeed の印を付け、本物のスタッフには出さない。

import { STATUS_LABEL, TASK_STATUSES, type TaskStatus } from "./priority-matrix";
import type { GanttPlan, TeamMember } from "./gantt";

export const TASK_TITLE_MAX = 100;
export const TASK_MEMO_MAX = 500;
export const TASK_COMMENT_MAX = 200;
/** 1つの計画に入れられるタスクの数 */
export const TASKS_PER_PLAN_MAX = 50;
/** 1つのタスクのひとことの数（古いものから落とさず、これ以上は書けない） */
export const COMMENTS_PER_TASK_MAX = 200;
export const TASK_ASSIGNEES_MAX = 50;

export type TaskComment = {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
  /** 直した日時（直していなければ空） */
  editedAt?: string;
  testSeed?: boolean;
};

export type GanttTask = {
  id: string;
  /** 入れた計画（gp-… または四象限の pm:…） */
  planId: string;
  title: string;
  status: TaskStatus;
  /** 担当者（スタッフの一覧から選ぶ。名前は保存したときの表示名） */
  assignees: TeamMember[];
  /** 期限 YYYY-MM-DD（空＝なし） */
  due: string;
  /** 「院長が判断」の印 */
  directorJudge: boolean;
  memo: string;
  comments: TaskComment[];
  /** 計画の中の並び（小さいほど上） */
  order: number;
  createdBy: string;
  testSeed?: boolean;
  updatedAt: string;
};

/** 書ける人が送ってよい項目 */
export type TaskFields = Partial<Pick<GanttTask, "title" | "status" | "due" | "directorJudge" | "memo">> & { assignees?: unknown };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function isYmd(v: unknown): v is string {
  if (typeof v !== "string" || !YMD.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function isTaskStatus(v: unknown): v is TaskStatus {
  return TASK_STATUSES.some((s) => s.value === v);
}

function normalizeAssignees(raw: unknown): TeamMember[] {
  if (!Array.isArray(raw)) return [];
  const out: TeamMember[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.slice(0, 64) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: typeof o.name === "string" ? o.name.slice(0, 60) : "" });
    if (out.length >= TASK_ASSIGNEES_MAX) break;
  }
  return out;
}

function normalizeComments(raw: unknown): TaskComment[] {
  if (!Array.isArray(raw)) return [];
  const out: TaskComment[] = [];
  for (const v of raw) {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.slice(0, 64) : "";
    const text = typeof o.text === "string" ? o.text.slice(0, TASK_COMMENT_MAX) : "";
    if (!id || !text.trim()) continue;
    out.push({
      id,
      authorId: typeof o.authorId === "string" ? o.authorId.slice(0, 64) : "",
      authorName: typeof o.authorName === "string" ? o.authorName.slice(0, 60) : "",
      text,
      createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
      ...(typeof o.editedAt === "string" && o.editedAt ? { editedAt: o.editedAt } : {}),
      ...(o.testSeed === true ? { testSeed: true } : {}),
    });
    if (out.length >= COMMENTS_PER_TASK_MAX) break;
  }
  return out;
}

/** 保存値・送られてきた値をタスクに整える。題名・計画が無いものは成り立たないので null */
export function normalizeTask(id: string, raw: unknown): GanttTask | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = typeof o.title === "string" ? o.title.trim().slice(0, TASK_TITLE_MAX) : "";
  const planId = typeof o.planId === "string" ? o.planId.slice(0, 80) : "";
  if (!id || !title || !planId) return null;
  return {
    id,
    planId,
    title,
    status: isTaskStatus(o.status) ? o.status : "todo",
    assignees: normalizeAssignees(o.assignees),
    due: isYmd(o.due) ? o.due : "",
    directorJudge: o.directorJudge === true,
    memo: typeof o.memo === "string" ? o.memo.slice(0, TASK_MEMO_MAX) : "",
    comments: normalizeComments(o.comments),
    order: typeof o.order === "number" && Number.isFinite(o.order) ? o.order : 0,
    createdBy: typeof o.createdBy === "string" ? o.createdBy.slice(0, 64) : "",
    ...(o.testSeed === true ? { testSeed: true } : {}),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

export function genTaskId(now = Date.now(), rand = Math.random()): string {
  return `gt-${now.toString(36)}${Math.floor(rand * 1e8).toString(36)}`;
}

export function genCommentId(now = Date.now(), rand = Math.random()): string {
  return `gc-${now.toString(36)}${Math.floor(rand * 1e8).toString(36)}`;
}

// ─── 権限の式 ───

/**
 * この計画のタスクを足す・直す・消す・並べ替えができるか（writer＝院長・任された幹部）。
 * 264: 院の計画の「担当の人」は、スタッフの一覧から選ばれた人だけ（文字で入れた担当は判定に使わない）
 */
export function canManageTasks(
  plan: Pick<GanttPlan, "kind" | "createdBy" | "members" | "assignees" | "source">,
  userId: string,
  writer: boolean
): boolean {
  if (writer) return true;
  if (plan.source === "matrix") return false;
  if (plan.kind === "team") return plan.createdBy === userId || (plan.members ?? []).some((m) => m.id === userId);
  return (plan.assignees ?? []).some((a) => a.id === userId);
}

/** 状態を変える・ひとことを書くができるか */
export function canTouchTask(task: Pick<GanttTask, "assignees">, userId: string, manage: boolean): boolean {
  return manage || task.assignees.some((a) => a.id === userId);
}

/**
 * 状態を変えてよいか（「院長が判断」のタスクは、完了にする・完了から戻すのが院長だけ）。
 * よければ空、だめなら理由の文。
 */
export function statusChangeProblem(task: Pick<GanttTask, "directorJudge" | "status">, next: TaskStatus, isDirector: boolean): string {
  if (isDirector || !task.directorJudge || task.status === next) return "";
  if (next === "done") return "「院長が判断」のタスクを「完了」にできるのは院長だけです";
  if (task.status === "done") return "「院長が判断」のタスクを「完了」から戻せるのは院長だけです";
  return "";
}

// ─── 出し方 ───

/** 計画の中の並び */
export function tasksOfPlan(tasks: GanttTask[], planId: string): GanttTask[] {
  return tasks
    .filter((t) => t.planId === planId)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** 「3/8 完了」 */
export function progressLabel(tasks: Pick<GanttTask, "status">[]): string {
  return `${tasks.filter((t) => t.status === "done").length}/${tasks.length} ${STATUS_LABEL.done}`;
}

/** 期限を過ぎて完了していないか */
export function isOverdue(task: Pick<GanttTask, "due" | "status">, today: string): boolean {
  return !!task.due && task.status !== "done" && task.due < today;
}

/** 264: 今の「📋 みんなのタスク」と同じ言葉にそろえる */
export const OVERDUE_LABEL = "超過";

/** ひとことは新しい順 */
export function commentsNewestFirst(comments: TaskComment[]): TaskComment[] {
  return [...comments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** ↑↓：計画の中で入れ替えた並びを返す */
export function swapTaskOrder(tasks: GanttTask[], id: string, dir: -1 | 1): { id: string; order: number }[] | null {
  const me = tasks.find((t) => t.id === id);
  if (!me) return null;
  const list = tasksOfPlan(tasks, me.planId);
  const i = list.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return null;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next.map((t, k) => ({ id: t.id, order: k }));
}

/** 見る人に返すタスク（本物のスタッフには検証用のタスク・ひとことを出さない） */
export function visibleTasksFor(tasks: GanttTask[], hideTestSeed: boolean, visiblePlanIds: Set<string>): GanttTask[] {
  return tasks
    .filter((t) => visiblePlanIds.has(t.planId) && !(hideTestSeed && t.testSeed))
    .map((t) => (hideTestSeed ? { ...t, comments: t.comments.filter((c) => !c.testSeed) } : t));
}

/** 「10/26 14:05」（ひとことの日時・日本時間） */
export function commentTimeLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 9 * 3600_000);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hh}:${mm}`;
}
