// 🏁 年間計画（指示書250・252で「📊 ガントチャート」として作り、268で「年間計画」に改めた）
//
//   GET                          → { categories, plans, editableIds, canWrite, canAddTeam, canEditCategories, fiscalStartMonth, teamCandidates, me,
//                                    tasks, taskManageIds, isDirector, canModerate, clinicGoals }（263: 計画の中のタスク。書くのは /api/gantt/tasks）
//                                  265: cheers＝{ 計画/タスクの id: 押した人[] }（本物のスタッフには検証用の応援を出さない）
//                                  268: clinicGoals＝つながるクリニック目標に選べる目標（id・名前・目的）。fiscalStartMonth はいつも11（11月始まり）
//   POST   { fields }            → 院の計画を足す（書く人）
//   POST   { kind:"team", fields } → チームプロジェクトを足す（ログインしたスタッフ全員）＋お知らせを1件出す
//   PATCH  { id, fields }        → 直す（院の計画＝書く人／チームプロジェクト＝作った人・メンバー・書く人）
//                                  265: 状態が初めて「完了」になったら、お知らせを1件出す（2回目からは出さない＝celebrated）
//   PATCH  { reorder: [{id,order}] } → 並べ替え（書く人）
//   DELETE ?id=                  → 消す（中の小さな計画も一緒に。権限は PATCH と同じ）
//   PUT    { categories }        → 分類を保存（院長だけ）。消した分類の計画は「その他」へ移す
//
// 判定はすべて authorizeGantt（lib/gantt-server.ts）と canEditTeam（lib/gantt.ts）。
// 書けない人には書く口がない（404と同じ応答）。四象限から出した項目（id が pm: で始まる）はここでは直せない。

import { after, NextResponse, type NextRequest } from "next/server";
import {
  authorizeGantt,
  deleteConnectOf,
  deletePlans,
  deleteTasksOfPlans,
  loadCheers,
  myDisplayName,
  postAchievementNotice,
  loadTasks,
  loadCategories,
  loadClinicGoalBriefs,
  loadMatrixPlans,
  loadPlans,
  moveMatrixToOther,
  movePlansToOther,
  pickMembers,
  postTeamNotice,
  saveCategories,
  savePlan,
  sendNewNoticeMails,
  teamCandidates,
  visiblePlans,
  type GanttAuth,
} from "@/lib/gantt-server";
import {
  OTHER_CATEGORY_ID,
  TEAM_CATEGORY_ID,
  canEditTeam,
  genPlanId,
  normalizeCategories,
  normalizePlan,
  PLAN_FISCAL_START_MONTH,
  type GanttPlan,
  type PlanFields,
} from "@/lib/gantt";
import { jstTodayYmd } from "@/lib/library";
import { loadEntries } from "@/lib/ayumi-server";
import { hidesTestSeedFor } from "@/lib/test-seed-hide-server";
import { canManageTasks, visibleTasksFor } from "@/lib/gantt-tasks";
import { visibleCheers } from "@/lib/gantt-connect";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });
const unauth = () => NextResponse.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400, headers: NO_STORE });
const fail = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500, headers: NO_STORE });

function readFields(body: Record<string, unknown>): PlanFields | null {
  const f = body.fields;
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  const o = f as Record<string, unknown>;
  const out: PlanFields = {};
  for (const k of ["name", "categoryId", "start", "end", "assignee", "assignees", "status", "memo", "parentId", "members", "goalId"] as const) {
    if (k in o) (out as Record<string, unknown>)[k] = o[k];
  }
  return out;
}

/** 小さな計画は1段だけ。上の計画は、いちばん上の院の計画（四象限・チームプロジェクトは不可）。分類は上の計画と同じにそろえる */
function checkParent(next: GanttPlan, plans: GanttPlan[]): string | null {
  if (!next.parentId) return null;
  if (next.parentId === next.id) return "自分の中には入れられません";
  const parent = plans.find((p) => p.id === next.parentId);
  if (!parent || parent.parentId || parent.kind === "team") return "入れる先の計画が見つかりません（中に入れられるのは1段だけです）";
  if (plans.some((p) => p.parentId === next.id)) return "中に小さな計画がある計画は、ほかの計画の中に入れられません";
  next.categoryId = parent.categoryId;
  return null;
}

/** 268: つながるクリニック目標は、今ある目標の中から（空＝つながない）。無い目標ならエラーの文を返す */
async function checkGoal(next: GanttPlan): Promise<string | null> {
  if (!next.goalId) return null;
  const goals = await loadClinicGoalBriefs();
  return goals.some((g) => g.id === next.goalId) ? null : "そのクリニック目標は見つかりません（消された可能性があります）";
}

/**
 * 265 §2: 状態が「完了」になったとき、お知らせを1件（初めての完了のときだけ・失敗しても計画の保存は止めない）。
 *   タスクの数は、その計画のタスク（本物の計画には検証用のタスクを数えない）。
 */
async function celebrateIfDone(auth: GanttAuth, prev: GanttPlan, saved: GanttPlan): Promise<GanttPlan> {
  if (prev.status === "done" || saved.status !== "done" || saved.celebrated) return saved;
  try {
    const tasks = (await loadTasks(auth.admin)).filter((t) => t.planId === saved.id && (saved.testSeed || !t.testSeed));
    const name = await myDisplayName(auth.admin, auth.user);
    const notice = await postAchievementNotice(auth.admin, saved, tasks, { id: auth.user.id, name, testSeed: auth.testSeed }, jstTodayYmd());
    const admin = auth.admin;
    after(async () => {
      try {
        await sendNewNoticeMails(admin, notice);
      } catch (e) {
        console.error(`[gantt] 完了のお知らせのメールに失敗: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    return await savePlan(auth.admin, { ...saved, celebrated: { at: new Date().toISOString(), noticeId: notice.id } }, auth.user.email ?? auth.user.id);
  } catch (e) {
    console.error(`[gantt] 完了のお知らせに失敗: ${e instanceof Error ? e.message : String(e)}`);
    return saved;
  }
}

/** 見ている人には見えない計画（本物のスタッフから見た検証用の計画）は、無いものとして扱う */
function findVisible(plans: GanttPlan[], id: string, auth: GanttAuth): GanttPlan | null {
  return visiblePlans(plans, auth.user).find((p) => p.id === id) ?? null;
}

export async function GET() {
  const auth = await authorizeGantt();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  try {
    const categories = await loadCategories(auth.admin);
    const [plans, matrix, clinicGoals, candidates, allTasks, cheerMap] = await Promise.all([
      loadPlans(auth.admin),
      loadMatrixPlans(auth.admin, categories),
      loadClinicGoalBriefs().catch(() => []),
      teamCandidates(auth.admin, auth.testSeed).catch(() => []),
      loadTasks(auth.admin),
      loadCheers(auth.admin),
    ]);
    const mine = visiblePlans(plans, auth.user);
    const shown = [...mine, ...matrix];
    const shownTasks = visibleTasksFor(allTasks, hidesTestSeedFor(auth.user), new Set(shown.map((p) => p.id)));
    const targetIds = new Set([...shown.map((p) => p.id), ...shownTasks.map((t) => t.id)]);
    const cheers: Record<string, { id: string; name: string }[]> = {};
    for (const [id, list] of cheerMap) {
      if (!targetIds.has(id)) continue;
      const v = visibleCheers(list, hidesTestSeedFor(auth.user));
      if (v.length) cheers[id] = v;
    }
    return NextResponse.json(
      {
        categories,
        plans: shown,
        // 直す・消すが出せる計画（判定はサーバー。画面はこれに従うだけ）
        editableIds: mine.filter((p) => canEditTeam(p, auth.user.id, auth.canWrite)).map((p) => p.id),
        canWrite: auth.canWrite,
        canAddTeam: true,
        canEditCategories: auth.canEditCategories,
        fiscalStartMonth: PLAN_FISCAL_START_MONTH,
        clinicGoals,
        teamCandidates: candidates,
        me: auth.user.id,
        // 263: 計画の中のタスク（本物のスタッフには検証用のタスク・ひとことを出さない）と、タスクを書ける計画
        tasks: shownTasks,
        cheers,
        taskManageIds: shown.filter((p) => canManageTasks(p, auth.user.id, auth.canWrite)).map((p) => p.id),
        isDirector: auth.isAdmin,
        canModerate: auth.canWrite,
        // 253: 「📜 当院の歩みに残す」を出すか・もう残した計画
        canAyumi: auth.canAyumi,
        keptPlanIds: auth.canAyumi ? (await loadEntries(auth.admin)).map((e) => e.source?.planId).filter((x): x is string => !!x) : [],
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
  const team = body.kind === "team";
  // 院の計画は、院長と任された幹部だけ。チームプロジェクトはログインしたスタッフ全員
  if (!team && !auth.canWrite) return hidden();
  const fields = readFields(body);
  if (!fields) return bad("不正なリクエストです");
  try {
    const plans = await loadPlans(auth.admin);
    const by = auth.user.email ?? auth.user.id;
    const id = genPlanId();
    if (team) {
      const candidates = await teamCandidates(auth.admin, auth.testSeed);
      const me = candidates.find((c) => c.id === auth.user.id);
      const myName = me?.name || auth.user.email || "";
      const members = pickMembers(fields.members, candidates);
      // 作った人は最初から入っている
      if (!members.some((m) => m.id === auth.user.id)) members.unshift({ id: auth.user.id, name: myName });
      const next = normalizePlan(id, {
        ...fields,
        kind: "team",
        members,
        createdBy: auth.user.id,
        createdByName: myName,
        order: 0,
      });
      if (!next) return bad("チーム名と目標の達成期間を入れてください");
      if (!next.memo.trim()) return bad("プロジェクト概要を入れてください");
      const goalProblem = await checkGoal(next);
      if (goalProblem) return bad(goalProblem);
      const siblings = plans.filter((p) => p.categoryId === TEAM_CATEGORY_ID && !p.parentId);
      next.order = siblings.length ? Math.max(...siblings.map((p) => p.order)) + 1 : 0;
      if (auth.testSeed) next.testSeed = true;
      let saved = await savePlan(auth.admin, next, by);
      // 252 §5: お知らせを1件（失敗してもチームプロジェクトは残す）
      let noticeError = "";
      try {
        const notice = await postTeamNotice(auth.admin, saved, { id: auth.user.id, name: myName, testSeed: auth.testSeed }, jstTodayYmd());
        saved = await savePlan(auth.admin, { ...saved, noticeId: notice.id }, by);
        const admin = auth.admin;
        after(async () => {
          try {
            await sendNewNoticeMails(admin, notice);
          } catch (e) {
            console.error(`[gantt] チームプロジェクトのお知らせのメールに失敗: ${e instanceof Error ? e.message : String(e)}`);
          }
        });
      } catch (e) {
        noticeError = e instanceof Error ? e.message : "お知らせを出せませんでした";
        console.error(`[gantt] チームプロジェクトのお知らせに失敗: ${noticeError}`);
      }
      return NextResponse.json({ plan: saved, noticeError }, { headers: NO_STORE });
    }
    const categories = await loadCategories(auth.admin);
    // 264: 担当は一覧から選んだ人（選べるのは、見ている人と同じ側の一覧＝本物には本物・検証用には検証用）
    const next = normalizePlan(id, { ...fields, assignees: pickMembers(fields.assignees, await teamCandidates(auth.admin, auth.testSeed)), order: 0 });
    if (!next) return bad("名前と開始日を入れてください");
    if (!categories.some((c) => c.id === next.categoryId) || next.categoryId === TEAM_CATEGORY_ID) next.categoryId = OTHER_CATEGORY_ID;
    const problem = checkParent(next, plans) ?? (await checkGoal(next));
    if (problem) return bad(problem);
    // 同じ並びのいちばん下へ
    const siblings = plans.filter((p) => (next.parentId ? p.parentId === next.parentId : !p.parentId && p.categoryId === next.categoryId));
    next.order = siblings.length ? Math.max(...siblings.map((p) => p.order)) + 1 : 0;
    if (auth.testSeed) next.testSeed = true;
    const saved = await savePlan(auth.admin, next, by);
    return NextResponse.json({ plan: saved }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const by = auth.user.email ?? auth.user.id;
  try {
    // 並べ替え（書く人だけ）
    if (Array.isArray(body.reorder)) {
      if (!auth.canWrite) return hidden();
      const plans = await loadPlans(auth.admin);
      const items = (body.reorder as unknown[])
        .map((v) => (v && typeof v === "object" ? (v as { id?: unknown; order?: unknown }) : {}))
        .filter((v): v is { id: string; order: number } => typeof v.id === "string" && typeof v.order === "number");
      for (const it of items.slice(0, 200)) {
        const p = plans.find((x) => x.id === it.id);
        if (p && p.order !== it.order) await savePlan(auth.admin, { ...p, order: it.order }, by);
      }
      return NextResponse.json({ ok: true }, { headers: NO_STORE });
    }
    const id = typeof body.id === "string" ? body.id : "";
    if (!id || id.startsWith("pm:")) return auth.canWrite ? bad("この計画はここでは直せません（四象限マトリクスで直してください）") : hidden();
    const fields = readFields(body);
    if (!fields) return bad("不正なリクエストです");
    const plans = await loadPlans(auth.admin);
    const prev = findVisible(plans, id, auth);
    if (!prev || !canEditTeam(prev, auth.user.id, auth.canWrite)) return hidden();
    if (prev.kind === "team") {
      const candidates = await teamCandidates(auth.admin, prev.testSeed === true);
      const members = "members" in fields ? pickMembers(fields.members, candidates) : prev.members;
      const next = normalizePlan(id, {
        ...prev,
        name: fields.name ?? prev.name,
        memo: fields.memo ?? prev.memo,
        start: fields.start ?? prev.start,
        end: fields.end ?? prev.end,
        status: fields.status ?? prev.status,
        members,
        goalId: "goalId" in fields ? fields.goalId : prev.goalId,
      });
      if (!next) return bad("チーム名と目標の達成期間を入れてください");
      if (!next.memo.trim()) return bad("プロジェクト概要を入れてください");
      if (next.goalId !== prev.goalId) {
        const goalProblem = await checkGoal(next);
        if (goalProblem) return bad(goalProblem);
      }
      // 252 §5: 直したときは知らせない
      const saved = await celebrateIfDone(auth, prev, await savePlan(auth.admin, next, by));
      return NextResponse.json({ plan: saved }, { headers: NO_STORE });
    }
    let assignees = prev.assignees ?? [];
    if ("assignees" in fields) {
      const candidates = await teamCandidates(auth.admin, prev.testSeed === true);
      // 264: 今の担当で一覧に無い人（退職など）は、外さないかぎり名前ごと残す
      const keep = assignees.filter((a) => !candidates.some((c) => c.id === a.id));
      assignees = pickMembers(fields.assignees, [...candidates, ...keep]);
    }
    const next = normalizePlan(id, { ...prev, ...fields, members: undefined, assignees });
    if (!next) return bad("名前と開始日を入れてください");
    const categories = await loadCategories(auth.admin);
    if (!categories.some((c) => c.id === next.categoryId) || next.categoryId === TEAM_CATEGORY_ID) next.categoryId = OTHER_CATEGORY_ID;
    const problem = checkParent(next, plans) ?? (next.goalId !== prev.goalId ? await checkGoal(next) : null);
    if (problem) return bad(problem);
    const saved = await celebrateIfDone(auth, prev, await savePlan(auth.admin, next, by));
    // 上の計画の分類を変えたら、中の小さな計画もそろえる
    if (!next.parentId && next.categoryId !== prev.categoryId) {
      for (const c of plans.filter((p) => p.parentId === id)) await savePlan(auth.admin, { ...c, categoryId: next.categoryId }, by);
    }
    return NextResponse.json({ plan: saved }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id || id.startsWith("pm:")) return auth.canWrite ? bad("この計画はここでは消せません（四象限マトリクスで「年間計画に出す」を外してください）") : hidden();
  try {
    const plans = await loadPlans(auth.admin);
    const prev = findVisible(plans, id, auth);
    if (!prev || !canEditTeam(prev, auth.user.id, auth.canWrite)) return hidden();
    const ids = [id, ...plans.filter((p) => p.parentId === id).map((p) => p.id)];
    const taskIds = (await loadTasks(auth.admin)).filter((t) => ids.includes(t.planId)).map((t) => t.id);
    await deletePlans(auth.admin, ids);
    // 263: 中のタスクも一緒に消す
    await deleteTasksOfPlans(auth.admin, ids);
    // 265: 応援と知らせも消す
    await deleteConnectOf(auth.admin, ids, taskIds);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  if (!auth.canEditCategories) return hidden();
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!Array.isArray(body.categories)) return bad("不正なリクエストです");
  try {
    const prev = await loadCategories(auth.admin);
    const by = auth.user.email ?? auth.user.id;
    const next = await saveCategories(auth.admin, normalizeCategories(body.categories), by);
    const removed = prev.map((c) => c.id).filter((cid) => !next.some((c) => c.id === cid));
    const moved = (await movePlansToOther(auth.admin, removed, by)) + (await moveMatrixToOther(auth.admin, removed));
    return NextResponse.json({ categories: next, moved }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}
