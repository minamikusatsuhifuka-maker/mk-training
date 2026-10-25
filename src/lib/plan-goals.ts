// 268: 年間計画とクリニック目標をつなげる — 純関数・定義の正本（画面とサーバーの両方から使う）
//
// 【つなぎ方】計画（院の計画・チームプロジェクト）ごとに「つながるクリニック目標」を1つ選ぶ（GanttPlan.goalId・選ばなくてもよい）。
//   中に入れた小さな計画も、それぞれで選ぶ（上の計画を選んでも、中の計画は数えない）。四象限から出した項目はつながない。
// 【進み具合】つながった計画すべてのタスクのうち、完了したタスクの割合。
//   タスクのない計画は、状態が完了なら「1/1」、それ以外は「0/1」として数える。
//   つながった計画がない目標は、今までどおり手で入れた値を出す。
//   院長（とクリニック目標を書ける人）が手で直した値（progressManual）は「手で入力」の印を出し、「自動に戻す」で自動に戻す。
// 【見せる中身】計画の一覧は、年間計画で見られる人だけ（判定はサーバー /api/gantt/goals）。進み具合の数字は、目標を見る人全員に同じ値を出す。

import type { User } from "@supabase/supabase-js";
import { isAdminUser } from "./admin-role";
import { isTestSeedUser } from "./test-seed";
import { STATUS_LABEL, type GanttPlan, type TaskStatus } from "./gantt";
import { normalizeValues } from "./gantt-rhythm";
import type { GanttTask } from "./gantt-tasks";

/**
 * 年間計画（と、クリニック目標の画面のつながった計画の一覧）を見られるか。決まりは250のまま：
 *   院長・検証用アカウントはいつも／ほかの人はスイッチ gantt がONのときだけ
 */
export function canViewGanttWith(user: Pick<User, "app_metadata">, featureOn: boolean): boolean {
  return isAdminUser(user as User) || isTestSeedUser(user) || featureOn;
}

/** クリニック目標のうち、年間計画の側で使う分（名前と目的だけ） */
export type ClinicGoalBrief = { id: string; title: string; purpose: string; /** 266: 理念とのつながり */ values: string[] };

/** portal_gantt（クリニック目標の保存値）から、id・名前・目的だけを取り出す */
export function goalBriefsOf(raw: unknown): ClinicGoalBrief[] {
  const list = (raw as { goals?: unknown } | null)?.goals;
  if (!Array.isArray(list)) return [];
  const out: ClinicGoalBrief[] = [];
  for (const g of list as Record<string, unknown>[]) {
    if (!g || typeof g !== "object") continue;
    if (typeof g.id !== "string" || typeof g.title !== "string" || !g.id || out.some((x) => x.id === g.id)) continue;
    out.push({ id: g.id, title: g.title, purpose: typeof g.purpose === "string" ? g.purpose.trim() : "", values: normalizeValues(g.values) });
  }
  return out;
}

export type TaskCount = { done: number; total: number };

/** 1つの計画のタスクの数（タスクのない計画は、完了なら 1/1・それ以外は 0/1） */
export function planTaskCount(plan: Pick<GanttPlan, "id" | "status">, tasks: Pick<GanttTask, "planId" | "status">[]): TaskCount {
  const mine = tasks.filter((t) => t.planId === plan.id);
  if (mine.length === 0) return { done: plan.status === "done" ? 1 : 0, total: 1 };
  return { done: mine.filter((t) => t.status === "done").length, total: mine.length };
}

/** 「タスク 3/5 完了」 */
export function taskCountLabel(c: TaskCount): string {
  return `タスク ${c.done}/${c.total} ${STATUS_LABEL.done}`;
}

/** その目標につながった計画（四象限の項目は除く） */
export function plansOfGoal<P extends Pick<GanttPlan, "goalId" | "source">>(plans: P[], goalId: string): P[] {
  return plans.filter((p) => p.source !== "matrix" && !!p.goalId && p.goalId === goalId);
}

export type GoalProgress = TaskCount & { planCount: number };

/** 目標ごとの自動の進み具合（つながった計画がない目標は入れない） */
export function goalProgressMap(
  plans: Pick<GanttPlan, "id" | "status" | "goalId" | "source">[],
  tasks: Pick<GanttTask, "planId" | "status">[]
): Record<string, GoalProgress> {
  const out: Record<string, GoalProgress> = {};
  for (const p of plans) {
    if (p.source === "matrix" || !p.goalId) continue;
    const c = planTaskCount(p, tasks);
    const cur = out[p.goalId] ?? { done: 0, total: 0, planCount: 0 };
    out[p.goalId] = { done: cur.done + c.done, total: cur.total + c.total, planCount: cur.planCount + 1 };
  }
  return out;
}

export function percentOf(c: TaskCount): number {
  return c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
}

export type EffectiveProgress = {
  value: number;
  /** auto＝つながった計画から自動／manual＝つながった計画があるが手で直した値／plain＝つながった計画がない（今までどおり手で入れた値） */
  mode: "auto" | "manual" | "plain";
};

/** 画面に出す進み具合 */
export function effectiveProgress(
  goal: { progress: number; progressManual?: boolean },
  auto: GoalProgress | null | undefined
): EffectiveProgress {
  if (!auto || auto.planCount === 0) return { value: goal.progress, mode: "plain" };
  if (goal.progressManual) return { value: goal.progress, mode: "manual" };
  return { value: percentOf(auto), mode: "auto" };
}

/** クリニック目標の画面に出す、つながった計画の1行分（年間計画で見られる人だけに返す） */
export type LinkedPlanRow = {
  id: string;
  name: string;
  goalId: string;
  assigneeLabel: string;
  start: string;
  end: string;
  status: TaskStatus;
  done: number;
  total: number;
};

/**
 * 年間計画の「クリニック目標」での絞り込み。
 *   その目標につながった計画と、その計画の中の小さな計画・入れた先の上の計画（並びが崩れないように）を残す。
 */
export function filterPlansByGoal<P extends Pick<GanttPlan, "id" | "parentId" | "goalId">>(plans: P[], goalId: string): P[] {
  if (!goalId) return plans;
  const hit = new Set(plans.filter((p) => p.goalId === goalId).map((p) => p.id));
  const keep = new Set(hit);
  for (const p of plans) {
    if (p.parentId && hit.has(p.parentId)) keep.add(p.id);
    if (p.parentId && hit.has(p.id)) keep.add(p.parentId);
  }
  return plans.filter((p) => keep.has(p.id));
}
