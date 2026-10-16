// 📊 ガントチャートの計画の中のタスク（指示書263）
//
//   GET    ?mine=1                         → 自分が担当者のタスク（「📋 みんなのタスク」に出す）{ tasks:[…, planName, canTouch], me }
//   POST   { planId, fields }              → タスクを足す（院長・任された幹部・その計画の担当）
//   PATCH  { id, fields }                  → 直す（同上）
//   PATCH  { id, status }                  → 状態を変える（同上＋そのタスクの担当者）
//   PATCH  { id, comment }                 → ひとことを書く（同上）
//   PATCH  { id, commentId, text }         → 自分のひとことを直す（書いた人だけ）
//   PATCH  { planId, reorder:[{id,order}] }→ 並べ替え（タスクを書ける人）
//   DELETE ?id=                            → タスクを消す（タスクを書ける人）
//   DELETE ?id=&commentId=                 → ひとことを消す（書いた人・院長・任された幹部）
//
// 「院長が判断」のタスク：印を外す・完了にする（完了から戻す）は院長だけ。
// 判定はすべてサーバー（authorizeGantt ＋ lib/gantt-tasks.ts の式）。見えないタスク・計画は404、見えるが権限が無い操作は403。
// 一覧（ガントチャートの画面の分）は GET /api/gantt が tasks として一緒に返す。

import { NextResponse, type NextRequest } from "next/server";
import {
  authorizeGantt,
  deleteTasks,
  loadCategories,
  loadMatrixPlans,
  loadPlans,
  loadTasks,
  myDisplayName,
  pickMembers,
  saveTask,
  teamCandidates,
  visiblePlans,
  type GanttAuth,
} from "@/lib/gantt-server";
import { hidesTestSeedFor } from "@/lib/test-seed-hide-server";
import type { GanttPlan } from "@/lib/gantt";
import {
  COMMENTS_PER_TASK_MAX,
  TASKS_PER_PLAN_MAX,
  TASK_COMMENT_MAX,
  canManageTasks,
  canTouchTask,
  genCommentId,
  genTaskId,
  isTaskStatus,
  normalizeTask,
  statusChangeProblem,
  visibleTasksFor,
  type GanttTask,
  type TaskFields,
} from "@/lib/gantt-tasks";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });
const unauth = () => NextResponse.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400, headers: NO_STORE });
const forbid = (msg: string) => NextResponse.json({ error: msg }, { status: 403, headers: NO_STORE });
const fail = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500, headers: NO_STORE });

type Ctx = {
  auth: GanttAuth;
  plans: GanttPlan[];
  tasks: GanttTask[];
  myName: string;
  hide: boolean;
  by: string;
};

async function context(auth: GanttAuth): Promise<Ctx> {
  const categories = await loadCategories(auth.admin);
  const [plans, matrix, tasks, myName] = await Promise.all([
    loadPlans(auth.admin),
    loadMatrixPlans(auth.admin, categories),
    loadTasks(auth.admin),
    myDisplayName(auth.admin, auth.user),
  ]);
  return {
    auth,
    plans: [...visiblePlans(plans, auth.user), ...matrix],
    tasks,
    myName,
    hide: hidesTestSeedFor(auth.user),
    by: auth.user.email ?? auth.user.id,
  };
}

const manages = (c: Ctx, plan: GanttPlan) => canManageTasks(plan, c.auth.user.id, c.myName, c.auth.canWrite);

/** 見えるタスクと、その計画（見えなければ null） */
function findTask(c: Ctx, id: string): { task: GanttTask; plan: GanttPlan } | null {
  const task = c.tasks.find((t) => t.id === id);
  if (!task || (c.hide && task.testSeed)) return null;
  const plan = c.plans.find((p) => p.id === task.planId);
  return plan ? { task, plan } : null;
}

/** 返すタスク（本物のスタッフには検証用のひとことを出さない） */
function out(c: Ctx, task: GanttTask): GanttTask {
  return visibleTasksFor([task], c.hide, new Set([task.planId]))[0] ?? task;
}

function readFields(body: Record<string, unknown>): TaskFields | null {
  const f = body.fields;
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  const o = f as Record<string, unknown>;
  const r: TaskFields = {};
  if (typeof o.title === "string") r.title = o.title;
  if (isTaskStatus(o.status)) r.status = o.status;
  if (typeof o.due === "string") r.due = o.due;
  if (typeof o.directorJudge === "boolean") r.directorJudge = o.directorJudge;
  if (typeof o.memo === "string") r.memo = o.memo;
  if ("assignees" in o) r.assignees = o.assignees;
  return r;
}

export async function GET(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  if (req.nextUrl.searchParams.get("mine") !== "1") return bad("不正なリクエストです");
  try {
    const c = await context(auth);
    const planIds = new Set(c.plans.map((p) => p.id));
    const mine = visibleTasksFor(c.tasks, c.hide, planIds).filter((t) => t.assignees.some((a) => a.id === auth.user.id));
    return NextResponse.json(
      {
        tasks: mine
          .map((t) => {
            const plan = c.plans.find((p) => p.id === t.planId)!;
            return { ...t, planName: plan.name, canTouch: true, canManage: manages(c, plan) };
          })
          .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999") || a.planName.localeCompare(b.planName, "ja")),
        me: auth.user.id,
        isDirector: auth.isAdmin,
        canModerate: auth.canWrite,
      },
      { headers: NO_STORE }
    );
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const planId = typeof body.planId === "string" ? body.planId : "";
  const fields = readFields(body);
  if (!planId || !fields) return bad("不正なリクエストです");
  try {
    const c = await context(auth);
    const plan = c.plans.find((p) => p.id === planId);
    if (!plan) return hidden();
    if (!manages(c, plan)) return hidden();
    if (c.tasks.filter((t) => t.planId === planId).length >= TASKS_PER_PLAN_MAX) {
      return bad(`1つの計画に入れられるタスクは${TASKS_PER_PLAN_MAX}件までです`);
    }
    const testSeed = auth.testSeed || plan.testSeed === true;
    const candidates = await teamCandidates(auth.admin, testSeed);
    const status = fields.status ?? "todo";
    const judge = fields.directorJudge === true;
    const problem = statusChangeProblem({ directorJudge: judge, status: "todo" }, status, auth.isAdmin);
    if (problem) return forbid(problem);
    const siblings = c.tasks.filter((t) => t.planId === planId);
    const next = normalizeTask(genTaskId(), {
      planId,
      title: fields.title,
      status,
      assignees: pickMembers(fields.assignees, candidates),
      due: fields.due ?? "",
      directorJudge: judge,
      memo: fields.memo ?? "",
      comments: [],
      order: siblings.length ? Math.max(...siblings.map((t) => t.order)) + 1 : 0,
      createdBy: auth.user.id,
      ...(testSeed ? { testSeed: true } : {}),
    });
    if (!next) return bad("題名を入れてください");
    const saved = await saveTask(auth.admin, next, c.by);
    return NextResponse.json({ task: out(c, saved) }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const c = await context(auth);

    // 並べ替え（その計画のタスクを書ける人）
    if (Array.isArray(body.reorder)) {
      const planId = typeof body.planId === "string" ? body.planId : "";
      const plan = c.plans.find((p) => p.id === planId);
      if (!plan || !manages(c, plan)) return hidden();
      const items = (body.reorder as unknown[])
        .map((v) => (v && typeof v === "object" ? (v as { id?: unknown; order?: unknown }) : {}))
        .filter((v): v is { id: string; order: number } => typeof v.id === "string" && typeof v.order === "number");
      for (const it of items.slice(0, TASKS_PER_PLAN_MAX)) {
        const t = c.tasks.find((x) => x.id === it.id && x.planId === planId);
        if (t && t.order !== it.order) await saveTask(auth.admin, { ...t, order: it.order }, c.by);
      }
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }

    const id = typeof body.id === "string" ? body.id : "";
    const found = id ? findTask(c, id) : null;
    if (!found) return hidden();
    const { task, plan } = found;
    const manage = manages(c, plan);
    const touch = canTouchTask(task, auth.user.id, manage);
    if (!touch) return hidden();

    // 自分のひとことを直す（書いた人だけ）
    if (typeof body.commentId === "string") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (!text) return bad("ひとことを入れてください");
      if (text.length > TASK_COMMENT_MAX) return bad(`ひとことは${TASK_COMMENT_MAX}字までです`);
      const cm = task.comments.find((x) => x.id === body.commentId);
      if (!cm || (c.hide && cm.testSeed)) return hidden();
      if (cm.authorId !== auth.user.id) return forbid("ひとことを直せるのは、書いた人だけです");
      const now = new Date().toISOString();
      const saved = await saveTask(
        auth.admin,
        { ...task, comments: task.comments.map((x) => (x.id === cm.id ? { ...x, text, editedAt: now } : x)) },
        c.by
      );
      return NextResponse.json({ task: out(c, saved) }, { headers: NO_STORE });
    }

    // ひとことを書く
    if (body.comment !== undefined) {
      const text = typeof body.comment === "string" ? body.comment.trim() : "";
      if (!text) return bad("ひとことを入れてください");
      if (text.length > TASK_COMMENT_MAX) return bad(`ひとことは${TASK_COMMENT_MAX}字までです`);
      if (task.comments.length >= COMMENTS_PER_TASK_MAX) return bad(`ひとことは1つのタスクに${COMMENTS_PER_TASK_MAX}件までです`);
      const saved = await saveTask(
        auth.admin,
        {
          ...task,
          comments: [
            ...task.comments,
            {
              id: genCommentId(),
              authorId: auth.user.id,
              authorName: c.myName,
              text,
              createdAt: new Date().toISOString(),
              ...(auth.testSeed ? { testSeed: true } : {}),
            },
          ],
        },
        c.by
      );
      return NextResponse.json({ task: out(c, saved) }, { headers: NO_STORE });
    }

    // 状態だけを変える（タスクの担当者も）
    if (body.status !== undefined) {
      if (!isTaskStatus(body.status)) return bad("不正なリクエストです");
      const problem = statusChangeProblem(task, body.status, auth.isAdmin);
      if (problem) return forbid(problem);
      const saved = await saveTask(auth.admin, { ...task, status: body.status }, c.by);
      return NextResponse.json({ task: out(c, saved) }, { headers: NO_STORE });
    }

    // 中身を直す（タスクを書ける人だけ）
    const fields = readFields(body);
    if (!fields) return bad("不正なリクエストです");
    if (!manage) return forbid("このタスクを直せるのは、院長・任された幹部・計画の担当です");
    const judge = fields.directorJudge ?? task.directorJudge;
    if (task.directorJudge && !judge && !auth.isAdmin) return forbid("「院長が判断」の印を外せるのは院長だけです");
    const status = fields.status ?? task.status;
    const problem = statusChangeProblem({ directorJudge: judge, status: task.status }, status, auth.isAdmin);
    if (problem) return forbid(problem);
    let assignees = task.assignees;
    if ("assignees" in fields) {
      const candidates = await teamCandidates(auth.admin, task.testSeed === true);
      // 今の担当者で一覧に無い人（アカウントが止まった等）は、外さないかぎり残す
      const keep = task.assignees.filter((a) => !candidates.some((x) => x.id === a.id));
      assignees = pickMembers(fields.assignees, [...candidates, ...keep]);
    }
    const next = normalizeTask(task.id, {
      ...task,
      title: fields.title ?? task.title,
      memo: fields.memo ?? task.memo,
      due: fields.due ?? task.due,
      status,
      directorJudge: judge,
      assignees,
    });
    if (!next) return bad("題名を入れてください");
    const saved = await saveTask(auth.admin, next, c.by);
    return NextResponse.json({ task: out(c, saved) }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  const commentId = req.nextUrl.searchParams.get("commentId") ?? "";
  try {
    const c = await context(auth);
    const found = id ? findTask(c, id) : null;
    if (!found) return hidden();
    const { task, plan } = found;
    const manage = manages(c, plan);
    if (commentId) {
      if (!canTouchTask(task, auth.user.id, manage) && !auth.canWrite) return hidden();
      const cm = task.comments.find((x) => x.id === commentId);
      if (!cm || (c.hide && cm.testSeed)) return hidden();
      // 自分のひとこと＝書いた人。どのひとことでも＝院長と任された幹部
      if (cm.authorId !== auth.user.id && !auth.canWrite) return forbid("このひとことを消せるのは、書いた人・院長・任された幹部です");
      const saved = await saveTask(auth.admin, { ...task, comments: task.comments.filter((x) => x.id !== commentId) }, c.by);
      return NextResponse.json({ task: out(c, saved) }, { headers: NO_STORE });
    }
    if (!manage) return canTouchTask(task, auth.user.id, false) ? forbid("このタスクを消せるのは、院長・任された幹部・計画の担当です") : hidden();
    await deleteTasks(auth.admin, [task.id]);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}
