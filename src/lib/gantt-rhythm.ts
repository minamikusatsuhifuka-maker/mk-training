// 266: 年間計画を進めやすくする（理念の札・期限前の知らせ・朝礼で今週の計画・週に一度のひとこと振り返り）— 純関数・定義の正本
//
// 【理念の札】「📜 当院の歩み」（253）と同じ言葉の一覧（VALUE_GROUPS）から選ぶ。目的（なぜ）はクリニック目標の側に書く。
//   クリニック目標につながった計画は目標の側の札を出す（計画の側の札は消さずに残す）。つながっていない計画・チームプロジェクトは計画の側の札。
// 【期限前の知らせ】期限のある、完了していないタスクの担当者へ、期限の3日前と当日に1回ずつ（毎朝8時の定期実行の中で）。
//   送った記録の id に期限を入れる＝期限を変えたら新しい期限で数え直す。メールは送らない。
// 【朝礼で今週の計画】今週期限・超過・先週完了・「🙋 手伝ってほしい」のタスク（見られるものだけ）。
// 【今週のひとこと】計画の担当・チームプロジェクトのメンバーが、計画ごとに週に1回（月曜〜日曜・同じ週は上書き）。
//   金曜の朝（曜日は院長があとで変えられる）、その週にまだ書いていない人へ1回知らせる。「困りごと」が書かれたら、計画の担当とタスクを書ける人へ知らせる。
// 週・日付はすべて日本時間の年月日（YYYY-MM-DD）で数える。

import { VALUE_GROUPS } from "./ayumi-intro-text";
// gantt.ts からは型だけを読む（gantt.ts がこのファイルの normalizeValues を使うので、値を読むと読み込みが循環する）
import type { GanttPlan, TeamMember } from "./gantt";
import type { GanttTask } from "./gantt-tasks";

// ─── 理念の札 ───

/** 選べる言葉（📜 当院の歩みと同じ一覧・コーポレートデザインブックの表記どおり） */
export const PLAN_VALUE_WORDS: readonly string[] = VALUE_GROUPS.flatMap((g) => g.words);
export { VALUE_GROUPS };

/** 保存値を整える（一覧にある言葉だけ・並びは一覧の順） */
export function normalizeValues(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set(raw.filter((v): v is string => typeof v === "string"));
  return PLAN_VALUE_WORDS.filter((w) => set.has(w));
}

/** 画面に出す理念の札：目標につながっていれば目標の側、なければ計画の側 */
export function effectiveValues(plan: Pick<GanttPlan, "values" | "goalId">, goal: { values?: string[] } | null | undefined): { values: string[]; from: "goal" | "plan" } {
  if (plan.goalId && goal) return { values: goal.values ?? [], from: "goal" };
  return { values: plan.values ?? [], from: "plan" };
}

/** 理念での絞り込み（目標の側の札と、計画の側の札の両方で絞れる） */
export function matchesValue(plan: Pick<GanttPlan, "values" | "goalId">, goal: { values?: string[] } | null | undefined, word: string): boolean {
  if (!word) return true;
  return (plan.values ?? []).includes(word) || (!!plan.goalId && !!goal && (goal.values ?? []).includes(word));
}

// ─── 日付と週（日本時間の年月日） ───

const dayOf = (ymd: string) => Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
const ymdOf = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

export function addDays(ymd: string, n: number): string {
  return ymdOf(dayOf(ymd) + n);
}

/** 曜日（0＝日曜 … 6＝土曜） */
export function weekdayOf(ymd: string): number {
  return new Date(dayOf(ymd) * 86_400_000).getUTCDay();
}

/** その日を含む週の月曜（1週は月曜〜日曜） */
export function weekMonday(ymd: string): string {
  return addDays(ymd, -((weekdayOf(ymd) + 6) % 7));
}

/** 「10/26」 */
function shortDate(ymd: string): string {
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
}

/** 「10/20〜10/26の週」 */
export function weekLabel(monday: string): string {
  return `${shortDate(monday)}〜${shortDate(addDays(monday, 6))}の週`;
}

export const WEEKDAY_LABELS = ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"] as const;
/** 今週のひとことの知らせを出す曜日の既定（金曜） */
export const DEFAULT_REFLECTION_WEEKDAY = 5;

export function normalizeWeekday(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 6 ? v : DEFAULT_REFLECTION_WEEKDAY;
}

// ─── 完了した日時（朝礼の「先週完了」に使う） ───

/** 完了した日（日本時間の年月日）。古いデータで記録が無いものは、最後に直した日 */
export function doneDay(x: { status: string; doneAt?: string; updatedAt: string }): string {
  if (x.status !== "done") return "";
  const iso = x.doneAt || x.updatedAt;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? "" : new Date(t + 9 * 3600_000).toISOString().slice(0, 10);
}

/** 状態を変えたときの doneAt（完了になったら今・完了から戻したら消す・そのままなら前のまま） */
export function nextDoneAt(prevStatus: string, nextStatus: string, prevDoneAt: string | undefined, now: string): string | undefined {
  if (nextStatus !== "done") return undefined;
  if (prevStatus === "done") return prevDoneAt ?? now;
  return now;
}

// ─── 期限前の知らせ ───

export type DueStage = "due_d3" | "due_d0";

/** 今日送る段（期限の3日前・当日。完了・期限なしは送らない） */
export function dueStageFor(task: Pick<GanttTask, "due" | "status">, today: string): DueStage | null {
  if (!task.due || task.status === "done") return null;
  if (task.due === today) return "due_d0";
  if (task.due === addDays(today, 3)) return "due_d3";
  return null;
}

/** 送った記録の id（期限を入れる＝期限を変えたら数え直す） */
export const dueSentId = (taskId: string, stage: DueStage, due: string) => `gas-${taskId}-${stage}-${due.replaceAll("-", "")}`;
/** 今週のひとことの知らせを送った記録の id */
export const weeklySentId = (planId: string, userId: string, monday: string) => `gas-weekly-${planId}-${userId}-${monday.replaceAll("-", "")}`;
export const SENT_TYPE = "gantt_alert_sent";

// ─── 今週のひとこと ───

export const WEEKLY_TYPE = "gantt_weekly";
export const WEEKLY_TEXT_MAX = 100;

export type WeeklyNote = {
  id: string;
  planId: string;
  userId: string;
  name: string;
  /** その週の月曜 */
  week: string;
  /** できたこと */
  done: string;
  /** 次の一歩 */
  next: string;
  /** 困りごと */
  trouble: string;
  at: string;
  testSeed?: boolean;
};

export const weeklyId = (planId: string, userId: string, monday: string) => `gw-${planId}-${userId}-${monday.replaceAll("-", "")}`;

export function normalizeWeekly(id: string, raw: unknown): WeeklyNote | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, WEEKLY_TEXT_MAX) : "");
  const planId = typeof o.planId === "string" ? o.planId : "";
  const userId = typeof o.userId === "string" ? o.userId : "";
  const week = typeof o.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.week) ? o.week : "";
  const note = { done: s(o.done), next: s(o.next), trouble: s(o.trouble) };
  if (!id || !planId || !userId || !week || (!note.done && !note.next && !note.trouble)) return null;
  return {
    id,
    planId,
    userId,
    name: typeof o.name === "string" ? o.name.slice(0, 60) : "",
    week,
    ...note,
    at: typeof o.at === "string" ? o.at : "",
    ...(o.testSeed === true ? { testSeed: true } : {}),
  };
}

/** 書ける人：計画の担当（一覧から選んだ人）・チームプロジェクトのメンバー（と作った人） */
export function weeklyWriters(plan: Pick<GanttPlan, "kind" | "members" | "assignees" | "createdBy" | "createdByName" | "source">): TeamMember[] {
  if (plan.source === "matrix") return [];
  if (plan.kind === "team") {
    const list = [...(plan.members ?? [])];
    if (plan.createdBy && !list.some((m) => m.id === plan.createdBy)) list.push({ id: plan.createdBy, name: plan.createdByName ?? "" });
    return list;
  }
  return plan.assignees ?? [];
}

/** 新しい順 */
export function sortWeekly(notes: WeeklyNote[]): WeeklyNote[] {
  return [...notes].sort((a, b) => b.week.localeCompare(a.week) || b.at.localeCompare(a.at));
}

/**
 * 今週のひとことの知らせを出す計画：完了していない・今週にかかっている（始まっていて、終わりが今週の月曜より前でない）
 */
export function planNeedsWeekly(plan: Pick<GanttPlan, "status" | "start" | "end" | "source">, today: string): boolean {
  if (plan.source === "matrix" || plan.status === "done") return false;
  return plan.start <= today && plan.end >= weekMonday(today);
}

// ─── 朝礼で「今週の計画」 ───

export type MorningTask = {
  id: string;
  planId: string;
  planName: string;
  title: string;
  due: string;
  assignees: string;
  status: GanttTask["status"];
  directorJudge: boolean;
  help: string;
  cheers: number;
};
export type MorningPlan = { id: string; name: string; cheers: number };

export type MorningSummary = {
  /** 今週期限の、完了していないタスク（期限の早い順） */
  weekDue: MorningTask[];
  /** 超過しているタスク */
  overdue: MorningTask[];
  /** 先週完了したタスクと計画（👏の数付き） */
  lastWeekTasks: MorningTask[];
  lastWeekPlans: MorningPlan[];
  /** 「🙋 手伝ってほしい」が出ているタスク */
  help: MorningTask[];
  /** 今週・先週（月曜） */
  week: string;
  lastWeek: string;
};

export function morningSummary(
  plans: Pick<GanttPlan, "id" | "name" | "status" | "doneAt" | "updatedAt" | "source">[],
  tasks: GanttTask[],
  cheerCount: (id: string) => number,
  today: string
): MorningSummary {
  const week = weekMonday(today);
  const weekEnd = addDays(week, 6);
  const lastWeek = addDays(week, -7);
  const lastWeekEnd = addDays(week, -1);
  const planName = new Map(plans.map((p) => [p.id, p.name]));
  const row = (t: GanttTask): MorningTask => ({
    id: t.id,
    planId: t.planId,
    planName: planName.get(t.planId) ?? "",
    title: t.title,
    due: t.due,
    assignees: t.assignees.map((a) => a.name || "名前未設定").join("、"),
    status: t.status,
    directorJudge: t.directorJudge,
    help: t.help?.open ? t.help.text : "",
    cheers: cheerCount(t.id),
  });
  const mine = tasks.filter((t) => planName.has(t.planId));
  const byDue = (a: MorningTask, b: MorningTask) => a.due.localeCompare(b.due) || a.title.localeCompare(b.title, "ja");
  const inLastWeek = (d: string) => !!d && d >= lastWeek && d <= lastWeekEnd;
  return {
    weekDue: mine.filter((t) => t.status !== "done" && t.due && t.due >= today && t.due <= weekEnd).map(row).sort(byDue),
    overdue: mine.filter((t) => t.status !== "done" && t.due && t.due < today).map(row).sort(byDue),
    lastWeekTasks: mine.filter((t) => inLastWeek(doneDay(t))).map(row).sort(byDue),
    lastWeekPlans: plans
      .filter((p) => p.source !== "matrix" && inLastWeek(doneDay(p)))
      .map((p) => ({ id: p.id, name: p.name, cheers: cheerCount(p.id) })),
    help: mine.filter((t) => t.status !== "done" && t.help?.open).map(row).sort(byDue),
    week,
    lastWeek,
  };
}
