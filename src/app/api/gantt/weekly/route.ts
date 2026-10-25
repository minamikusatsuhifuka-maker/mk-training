// 266: 年間計画の「今週のひとこと」（計画ごと・人ごと・週ごとに1行）
//
//   GET  ?plan=                          → { notes: その計画のふりかえり（新しい順）, canWrite, week }
//   POST { planId, done, next, trouble } → 今週の分を書く（同じ週に書き直したら上書き）。どれか1つでもよい・それぞれ100字まで
//
// 見られる人＝年間計画を見られる人（authorizeGantt）。書ける人＝計画の担当（一覧から選んだ人）・チームプロジェクトのメンバー。
// 「困りごと」が書かれたら（新しく・または変わったら）、計画の担当とタスクを書ける人（院長・任された幹部）にアプリ内で知らせる。
// 本物のスタッフには検証用アカウントのふりかえりを出さない。検証用アカウントが書いた困りごとは、検証用アカウントにだけ知らせる。

import { NextResponse, type NextRequest } from "next/server";
import {
  authorizeGantt,
  deliverAlerts,
  ganttWriterIds,
  loadPlans,
  loadWeekly,
  myDisplayName,
  saveWeekly,
  testSeedIds,
  visiblePlans,
} from "@/lib/gantt-server";
import { hidesTestSeedFor } from "@/lib/test-seed-hide-server";
import { jstTodayYmd } from "@/lib/library";
import { alertText } from "@/lib/gantt-connect";
import { WEEKLY_TEXT_MAX, normalizeWeekly, weekMonday, weeklyId, weeklyWriters } from "@/lib/gantt-rhythm";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });
const unauth = () => NextResponse.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400, headers: NO_STORE });
const fail = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500, headers: NO_STORE });

export async function GET(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok) return auth.status === 401 ? unauth() : hidden();
  const planId = req.nextUrl.searchParams.get("plan") ?? "";
  try {
    const plan = visiblePlans(await loadPlans(auth.admin), auth.user).find((p) => p.id === planId);
    if (!plan) return hidden();
    const hide = hidesTestSeedFor(auth.user);
    const notes = (await loadWeekly(auth.admin, { planId })).filter((n) => !(hide && n.testSeed));
    return NextResponse.json(
      { notes, canWrite: weeklyWriters(plan).some((w) => w.id === auth.user.id), week: weekMonday(jstTodayYmd()) },
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
  const raw = { done: body.done, next: body.next, trouble: body.trouble };
  for (const v of Object.values(raw)) {
    if (typeof v === "string" && v.trim().length > WEEKLY_TEXT_MAX) return bad(`それぞれ${WEEKLY_TEXT_MAX}字までです`);
  }
  try {
    const plan = visiblePlans(await loadPlans(auth.admin), auth.user).find((p) => p.id === planId);
    if (!plan) return hidden();
    if (!weeklyWriters(plan).some((w) => w.id === auth.user.id)) {
      return NextResponse.json({ error: "今週のひとことを書けるのは、計画の担当とチームプロジェクトのメンバーです" }, { status: 403, headers: NO_STORE });
    }
    const week = weekMonday(jstTodayYmd());
    const id = weeklyId(plan.id, auth.user.id, week);
    const prev = (await loadWeekly(auth.admin, { planId })).find((n) => n.id === id);
    const name = await myDisplayName(auth.admin, auth.user);
    const note = normalizeWeekly(id, {
      planId: plan.id,
      userId: auth.user.id,
      name,
      week,
      ...raw,
      at: new Date().toISOString(),
      ...(auth.testSeed ? { testSeed: true } : {}),
    });
    if (!note) return bad("できたこと・次の一歩・困りごとのどれか1つを入れてください");
    const saved = await saveWeekly(auth.admin, note, auth.user.email ?? auth.user.id);
    // 困りごとが新しく書かれた・変わったときだけ知らせる
    let notified = 0;
    if (saved.trouble && saved.trouble !== (prev?.trouble ?? "")) {
      const people = [...weeklyWriters(plan).map((w) => w.id), ...(await ganttWriterIds())].filter((x) => x && x !== auth.user.id);
      const testIds = auth.testSeed ? await testSeedIds() : null;
      const ids = [...new Set(people)].filter((x) => !testIds || testIds.has(x));
      notified = await deliverAlerts(
        auth.admin,
        ids,
        { kind: "trouble", planId: plan.id, taskId: "", text: alertText("trouble", { actorName: name, taskTitle: "", planName: plan.name }), ...(auth.testSeed ? { testSeed: true } : {}) },
        auth.user.email ?? auth.user.id
      );
    }
    return NextResponse.json({ note: saved, overwritten: !!prev, notified }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}
