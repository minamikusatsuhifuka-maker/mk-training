// 266: 「🌅 朝礼サポート」に出す「今週の計画」
//
//   GET → { 今週期限・超過・先週完了（👏の数付き）・「🙋 手伝ってほしい」のタスクと計画 }
//
// 見せる中身は年間計画で見られるものだけ（authorizeGantt・本物のスタッフには検証用のものを出さない）。
// 朝礼サポートのスイッチにも従う（OFFの間は院長と検証用アカウントだけ）。中身の計算は lib/gantt-rhythm.ts の morningSummary。

import { NextResponse } from "next/server";
import { authorizeGantt, loadCategories, loadCheers, loadMatrixPlans, loadPlans, loadTasks, visiblePlans } from "@/lib/gantt-server";
import { serverFeatureEnabled } from "@/lib/staff-growth-server";
import { hidesTestSeedFor } from "@/lib/test-seed-hide-server";
import { visibleTasksFor } from "@/lib/gantt-tasks";
import { visibleCheers } from "@/lib/gantt-connect";
import { morningSummary } from "@/lib/gantt-rhythm";
import { jstTodayYmd } from "@/lib/library";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const auth = await authorizeGantt();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "ログインが必要です" : "Not Found" }, { status: auth.status, headers: NO_STORE });
  if (!auth.isAdmin && !auth.testSeed && !(await serverFeatureEnabled("chorei"))) {
    return NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });
  }
  try {
    const categories = await loadCategories(auth.admin);
    const [plans, matrix, tasksAll, cheers] = await Promise.all([
      loadPlans(auth.admin),
      loadMatrixPlans(auth.admin, categories),
      loadTasks(auth.admin),
      loadCheers(auth.admin),
    ]);
    const hide = hidesTestSeedFor(auth.user);
    const shown = [...visiblePlans(plans, auth.user), ...matrix];
    const tasks = visibleTasksFor(tasksAll, hide, new Set(shown.map((p) => p.id)));
    const count = (id: string) => visibleCheers(cheers.get(id) ?? [], hide).length;
    return NextResponse.json(morningSummary(shown, tasks, count, jstTodayYmd()), { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込めませんでした" }, { status: 500, headers: NO_STORE });
  }
}
