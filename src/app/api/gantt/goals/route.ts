// 268: クリニック目標の画面に出す「つながった計画」と、目標ごとの自動の進み具合
//
//   GET → { progress: { [goalId]: { done, total, planCount } }, canSeePlans, plans: LinkedPlanRow[] }
//
// ・ログインしたスタッフ全員が呼べる（クリニック目標の画面は全員が見る）。進み具合の数字は、目標を見る人全員に同じ決まりで出す
//   （本物のスタッフには検証用の計画・タスクを数えない＝年間計画で見えるものと同じ）。
// ・計画の一覧（名前・担当・期間・状態・タスクの数）は、年間計画を見られる人だけ（canViewGantt。スイッチOFFの間は院長と検証用アカウントだけ）。
// ・中身は lib/plan-goals.ts（純関数）。保存はしない（読むだけ）。

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { canViewGantt, loadPlans, loadTasks, visiblePlans } from "@/lib/gantt-server";
import { hidesTestSeedFor } from "@/lib/test-seed-hide-server";
import { planAssigneeLabel } from "@/lib/gantt";
import { visibleTasksFor } from "@/lib/gantt-tasks";
import { goalProgressMap, planTaskCount, type LinkedPlanRow } from "@/lib/plan-goals";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const { user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
  try {
    const admin = createSupabaseAdminClient();
    const [plans, allTasks, canSeePlans] = await Promise.all([loadPlans(admin), loadTasks(admin), canViewGantt(user)]);
    const mine = visiblePlans(plans, user).filter((p) => !!p.goalId);
    const tasks = visibleTasksFor(allTasks, hidesTestSeedFor(user), new Set(mine.map((p) => p.id)));
    const rows: LinkedPlanRow[] = canSeePlans
      ? mine
          .map((p) => {
            const c = planTaskCount(p, tasks);
            return {
              id: p.id,
              name: p.name,
              goalId: p.goalId ?? "",
              assigneeLabel: p.kind === "team" ? (p.members ?? []).map((m) => m.name || "名前未設定").join("、") : planAssigneeLabel(p),
              start: p.start,
              end: p.end,
              status: p.status,
              done: c.done,
              total: c.total,
            };
          })
          .sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, "ja"))
      : [];
    return NextResponse.json({ progress: goalProgressMap(mine, tasks), canSeePlans, plans: rows }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込めませんでした" }, { status: 500, headers: NO_STORE });
  }
}
