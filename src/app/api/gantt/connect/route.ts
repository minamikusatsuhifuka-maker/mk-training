// 265: 年間計画で人と人をつなぐ（応援・手伝ってほしい・手伝います・院長の判断）
//
//   POST { action:"cheer", kind:"plan"|"task", targetId }  → 👏 応援（押す・取り消す。ログインしたスタッフ全員・知らせは出さない）
//   POST { action:"help", taskId, text }                   → 🙋 手伝ってほしい を出す（タスクの担当者・タスクを書ける人。100字まで）
//   POST { action:"help", taskId, open:false }             → 下ろす（同上。名乗り出た人の記録は残す）
//   POST { action:"offer", taskId }                        → 手伝います（押す・取り消す。出ている間だけ・担当者ではない人）。押したら担当者と計画の担当に知らせる
//   POST { action:"addHelper", taskId, userId }            → 名乗り出た人を担当者に加える（タスクを書ける人）
//   POST { action:"judgment", taskId, text }               → 院長の判断を書く・直す（院長だけ・「院長が判断」のタスクだけ・500字まで）。担当者と計画の担当に知らせる
//
// 判定はすべてサーバー（authorizeGantt ＋ lib/gantt-tasks.ts の式）。見えない計画・タスクは404、書けない人には書く口がない（404）、
// 見えるが条件に合わない操作は403。検証用アカウントがしたことは、本物のスタッフに知らせない（alertRecipients）。

import { NextResponse, type NextRequest } from "next/server";
import {
  authorizeGantt,
  deliverAlerts,
  loadCategories,
  loadCheers,
  loadMatrixPlans,
  loadPlans,
  loadTasks,
  myDisplayName,
  saveCheers,
  saveTask,
  teamCandidates,
  testSeedIds,
  visiblePlans,
} from "@/lib/gantt-server";
import { hidesTestSeedFor } from "@/lib/test-seed-hide-server";
import { canManageTasks, canTouchTask, visibleTasksFor, type GanttTask } from "@/lib/gantt-tasks";
import {
  HELP_TEXT_MAX,
  JUDGMENT_MAX,
  alertRecipients,
  alertText,
  toggleCheer,
  visibleCheers,
  type CheerKind,
} from "@/lib/gantt-connect";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });
const unauth = () => NextResponse.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400, headers: NO_STORE });
const forbid = (msg: string) => NextResponse.json({ error: msg }, { status: 403, headers: NO_STORE });
const fail = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500, headers: NO_STORE });

export async function POST(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  try {
    const categories = await loadCategories(auth.admin);
    const [allPlans, matrix, allTasks, myName] = await Promise.all([
      loadPlans(auth.admin),
      loadMatrixPlans(auth.admin, categories),
      loadTasks(auth.admin),
      myDisplayName(auth.admin, auth.user),
    ]);
    const hide = hidesTestSeedFor(auth.user);
    const plans = [...visiblePlans(allPlans, auth.user), ...matrix];
    const tasks = visibleTasksFor(allTasks, hide, new Set(plans.map((p) => p.id)));
    const by = auth.user.email ?? auth.user.id;
    const me = { id: auth.user.id, name: myName, testSeed: auth.testSeed };
    const now = new Date().toISOString();

    // 👏 応援
    if (action === "cheer") {
      const kind: CheerKind = body.kind === "task" ? "task" : "plan";
      const targetId = typeof body.targetId === "string" ? body.targetId : "";
      const exists = kind === "task" ? tasks.some((t) => t.id === targetId) : plans.some((p) => p.id === targetId);
      if (!targetId || !exists) return hidden();
      const cheers = await loadCheers(auth.admin);
      const next = toggleCheer(cheers.get(targetId) ?? [], me, now);
      await saveCheers(auth.admin, targetId, kind, next.list, by);
      return NextResponse.json({ on: next.on, cheers: visibleCheers(next.list, hide) }, { headers: NO_STORE });
    }

    const taskId = typeof body.taskId === "string" ? body.taskId : "";
    const task = tasks.find((t) => t.id === taskId);
    const plan = task ? plans.find((p) => p.id === task.planId) : undefined;
    if (!task || !plan) return hidden();
    // 保存は元の行（見る人向けに外したもの＝検証用のひとこと等を消さないように）
    const raw = allTasks.find((t) => t.id === taskId)!;
    const manage = canManageTasks(plan, auth.user.id, auth.canWrite);
    const touch = canTouchTask(task, auth.user.id, manage);
    const out = (t: GanttTask) => visibleTasksFor([t], hide, new Set([t.planId]))[0] ?? t;
    const notify = async (kind: Parameters<typeof alertText>[0]) => {
      const ids = alertRecipients(raw, plan, auth.user.id, auth.testSeed, auth.testSeed ? await testSeedIds() : new Set());
      return deliverAlerts(
        auth.admin,
        ids,
        { kind, planId: plan.id, taskId: task.id, text: alertText(kind, { actorName: myName, taskTitle: task.title, planName: plan.name }), ...(auth.testSeed ? { testSeed: true } : {}) },
        by
      );
    };

    // 🙋 手伝ってほしい（出す・下ろす）
    if (action === "help") {
      if (!touch) return forbid("「🙋 手伝ってほしい」を出せるのは、タスクの担当者とタスクを書ける人です");
      if (body.open === false) {
        if (!raw.help) return NextResponse.json({ task: out(raw) }, { headers: NO_STORE });
        const saved = await saveTask(auth.admin, { ...raw, help: { ...raw.help, open: false } }, by);
        return NextResponse.json({ task: out(saved) }, { headers: NO_STORE });
      }
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) return bad("何を手伝ってほしいかを入れてください");
      if (text.length > HELP_TEXT_MAX) return bad(`${HELP_TEXT_MAX}字までです`);
      const saved = await saveTask(
        auth.admin,
        { ...raw, help: { text, byId: auth.user.id, byName: myName, at: now, open: true, ...(auth.testSeed ? { testSeed: true } : {}) } },
        by
      );
      return NextResponse.json({ task: out(saved) }, { headers: NO_STORE });
    }

    // 手伝います（押す・取り消す）
    if (action === "offer") {
      if (!task.help?.open) return forbid("「🙋 手伝ってほしい」が出ていないタスクです");
      if (task.assignees.some((a) => a.id === auth.user.id)) return forbid("担当者は「手伝います」を押せません");
      const helpers = raw.helpers ?? [];
      const on = !helpers.some((h) => h.id === auth.user.id);
      const next = on
        ? [...helpers, { id: auth.user.id, name: myName, at: now, ...(auth.testSeed ? { testSeed: true } : {}) }]
        : helpers.filter((h) => h.id !== auth.user.id);
      const saved = await saveTask(auth.admin, { ...raw, helpers: next }, by);
      const notified = on ? await notify("help_offer") : 0;
      return NextResponse.json({ task: out(saved), on, notified }, { headers: NO_STORE });
    }

    // 名乗り出た人を担当者に加える
    if (action === "addHelper") {
      if (!manage) return forbid("担当者に加えられるのは、タスクを書ける人です");
      const userId = typeof body.userId === "string" ? body.userId : "";
      const helper = (task.helpers ?? []).find((h) => h.id === userId);
      if (!helper) return bad("名乗り出た人の中にいません");
      // 担当者に選べる人（本物の計画には本物のスタッフ・検証用には検証用アカウント）の中だけ
      const candidates = await teamCandidates(auth.admin, raw.testSeed === true);
      const c = candidates.find((x) => x.id === userId);
      if (!c) return bad("この人は担当者に選べません（アカウントが止まっているなど）");
      if (raw.assignees.some((a) => a.id === userId)) return NextResponse.json({ task: out(raw) }, { headers: NO_STORE });
      const saved = await saveTask(auth.admin, { ...raw, assignees: [...raw.assignees, { id: c.id, name: c.name }] }, by);
      return NextResponse.json({ task: out(saved) }, { headers: NO_STORE });
    }

    // 院長の判断（院長だけ。ほかの人には書く口がない）
    if (action === "judgment") {
      if (!auth.isAdmin) return hidden();
      if (!raw.directorJudge) return forbid("「院長が判断」の印のあるタスクだけに書けます");
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) return bad("院長の判断を入れてください");
      if (text.length > JUDGMENT_MAX) return bad(`${JUDGMENT_MAX}字までです`);
      const edit = !!raw.judgment;
      if (edit && raw.judgment!.text === text) return NextResponse.json({ task: out(raw), notified: 0 }, { headers: NO_STORE });
      const saved = await saveTask(
        auth.admin,
        { ...raw, judgment: edit ? { text, at: raw.judgment!.at, editedAt: now } : { text, at: now } },
        by
      );
      const notified = await notify(edit ? "judgment_edit" : "judgment");
      return NextResponse.json({ task: out(saved), notified }, { headers: NO_STORE });
    }

    return bad("不正なリクエストです");
  } catch (e) {
    return fail(e);
  }
}
