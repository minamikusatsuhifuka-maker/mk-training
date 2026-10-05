// 1on1の事前アンケートの読み書き（指示書200 → 204 §4で第1部とカルテの目標を連動）
//   GET  ?scheduleId=<id> → { karte, karteTableMissing, periods, viewers }（回答画面の初期値）
//   POST { scheduleId, answers, authorName, karteBaseline } → { record, karte, updatedLevels }
//
// - 回答は **院長・担当幹部が登録した「次回1on1の予定」（197 B-2）にだけ** ひもづける。予定の無い保存は受け付けない。
// - 1on1の日付と担当者は **予定からサーバーが決める**。本人からは受け取らない。
// - 同じ予定への回答は1件（2回目以降は上書き）。保存先は private_store（one_on_one_presurvey）。
// - 汎用の /api/private-store からは事前アンケートを保存できない（そちらは400）。
//
// 【204 §4: 第1部はカルテの目標そのもの】
//   提出すると**変わった段だけ**カルテの目標を更新する（週は触らない）。
//   開いたときの版（karteBaseline）と食い違っていたら**何も保存せず409**。
//   事前アンケートとカルテの目標は**両方そろって保存**する（片方だけ残さない）。
//   書き込むのは本人の目標の本文（title）だけ＝本人が自分の目標を直すときと同じ範囲。
//
// 【204 §5: 相手の判定は保存に使わない】
//   回答を見られるのは本人・院長・院長が指定した管理者（presurvey-access-server）。
//   participantIds は「その回の担当者」の記録として残すだけで、閲覧の判定には使わない。

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { jstTodayYmd } from "@/lib/library";
import {
  createSupabaseAdminClient,
  fetchSchedule,
  partnerCandidates,
} from "@/lib/one-on-one-schedule-server";
import { partnerLabel } from "@/lib/one-on-one-schedule";
import {
  genPresurveyKey,
  loadPresurveyQuestions,
  normalizePresurveyAnswer,
  normalizePresurveyData,
  visiblePresurveyQuestions,
  type PresurveyAnswer,
  type PresurveyData,
} from "@/lib/one-on-one-presurvey";
import { PRESURVEY_CONTENT_TYPE, PRESURVEY_VIEW_ITEM_KEY } from "@/lib/presurvey-access-server";
import { GrowthTableMissingError, fetchGoals, recordGrowthLog } from "@/lib/staff-growth-server";
import {
  KarteGoalConflictError,
  applyKarteGoalPlan,
  karteGoalLogChanges,
  loadKarteGoalSlots,
  normalizeKarteBaseline,
  planKarteGoalUpdates,
} from "@/lib/presurvey-karte-server";
import { loadDelegationSnapshot } from "@/lib/admin-delegation-server";
import { presurveyPeriods } from "@/lib/presurvey-periods";
import { loadFiscalStartMonth } from "@/lib/presurvey-periods-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not Found" }, { status: 404 });
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

type Row = {
  id: string;
  owner_id: string;
  content_type: string;
  record_key: string;
  data: unknown;
  created_at: string;
  updated_at: string;
};

/** 204 §1: この人の回答を見られる人（名前はクライアントが名簿から引く） */
async function viewersFor(userId: string): Promise<{ karteManagerIds: string[]; answerViewerIds: string[] }> {
  const snap = await loadDelegationSnapshot().catch(
    () => ({ items: {} as Record<string, string[]>, karte: {} as Record<string, string[]> })
  );
  const karteManagerIds = Object.entries(snap.karte)
    .filter(([, staff]) => (staff ?? []).includes(userId))
    .map(([manager]) => manager);
  const delegated = new Set(snap.items[PRESURVEY_VIEW_ITEM_KEY] ?? []);
  return {
    karteManagerIds,
    answerViewerIds: karteManagerIds.filter((m) => delegated.has(m)),
  };
}

export async function GET(req: Request) {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;

  const url = new URL(req.url);
  const scheduleId = url.searchParams.get("scheduleId") ?? "";

  try {
    const db = createSupabaseAdminClient();
    if (scheduleId) {
      const s = await fetchSchedule(db, scheduleId);
      if (!s || s.userId !== user.id) return notFound();
    }
    const [{ slots, tableMissing }, viewers, startMonth] = await Promise.all([
      loadKarteGoalSlots(db, user.id).catch(() => ({ slots: {}, tableMissing: true })),
      viewersFor(user.id),
      loadFiscalStartMonth(),
    ]);
    return NextResponse.json({
      karte: slots,
      karteTableMissing: tableMissing,
      periods: presurveyPeriods(jstTodayYmd(), startMonth),
      viewers,
    });
  } catch (e) {
    if (e instanceof GrowthTableMissingError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "読み込みに失敗しました" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("不正なリクエストです");
  }
  const scheduleId = typeof body.scheduleId === "string" ? body.scheduleId : "";
  if (!scheduleId) return bad("次回1on1が登録されてから回答してください");
  if (!Array.isArray(body.answers) || body.answers.length > 50) return bad("回答が不正です");
  const answers = body.answers
    .map(normalizePresurveyAnswer)
    .filter((a): a is PresurveyAnswer => a !== null);
  if (!answers.some((a) => a.text.trim() || a.choice || a.unchanged)) return bad("まだ何も書かれていません");
  const authorName = typeof body.authorName === "string" ? body.authorName.trim().slice(0, 100) : "";
  const karteBaseline = normalizeKarteBaseline(body.karteBaseline);

  try {
    const db = createSupabaseAdminClient();
    const s = await fetchSchedule(db, scheduleId);
    // 自分の予定でなければ「無い」と同じ応答
    if (!s || s.userId !== user.id) return notFound();
    if (s.date < jstTodayYmd()) return bad("この1on1の日は過ぎています");
    // 担当者が今も院長か担当幹部か（担当を外された人を相手にしない）
    const candidates = await partnerCandidates(db, user.id);
    if (!candidates.some((c) => c.userId === s.partnerId)) {
      return bad("この1on1の担当者の指定が無効になっています。院長にお知らせください");
    }

    // ── 204 §4: カルテの目標の更新を先に組み立てる（版が食い違えば何も保存しない） ──
    const questions = visiblePresurveyQuestions(await loadPresurveyQuestions());
    const now = new Date().toISOString();
    let plan: Awaited<ReturnType<typeof planKarteGoalUpdates>> | null = null;
    let karteMissing = false;
    try {
      const [{ slots, tableMissing }, { goals }] = await Promise.all([
        loadKarteGoalSlots(db, user.id),
        fetchGoals(db, user.id),
      ]);
      karteMissing = tableMissing;
      if (!tableMissing) {
        plan = planKarteGoalUpdates({
          userId: user.id,
          questions,
          answers,
          slots,
          baseline: karteBaseline,
          goals,
          now,
        });
      }
    } catch (e) {
      if (e instanceof KarteGoalConflictError) {
        return NextResponse.json({ error: e.message, code: "karte_conflict" }, { status: 409 });
      }
      if (e instanceof GrowthTableMissingError) karteMissing = true;
      else throw e;
    }

    // 同じ予定への回答があれば上書き
    const { data: mine, error: listErr } = await db
      .from("private_store")
      .select("*")
      .eq("owner_id", user.id)
      .eq("content_type", PRESURVEY_CONTENT_TYPE);
    if (listErr) throw new Error(listErr.message);
    const existing = ((mine ?? []) as Row[]).find(
      (r) => normalizePresurveyData(r.data).scheduleId === s.id
    );
    const prev = existing ? normalizePresurveyData(existing.data) : null;

    const data: PresurveyData = {
      heldOn: s.date,
      scheduleId: s.id,
      participantIds: [s.partnerId],
      partnerName: partnerLabel(s).replace(/さん$/, ""),
      authorName: authorName || prev?.authorName || "",
      answers,
      twoParts: answers.some((a) => a.part !== 0),
      submittedAt: prev?.submittedAt || now,
      createdAt: prev?.createdAt || now,
      updatedAt: now,
    };

    // ── 両方そろって保存する（片方だけ残さない・204 §4） ──
    const by = user.email ?? user.id;
    let rollback: (() => Promise<void>) | null = null;
    if (plan && plan.items.length > 0) {
      const applied = await applyKarteGoalPlan(db, plan, by);
      rollback = applied.rollback;
    }

    try {
      const { data: saved, error } = await db
        .from("private_store")
        .upsert(
          {
            owner_id: user.id,
            content_type: PRESURVEY_CONTENT_TYPE,
            record_key: existing?.record_key ?? genPresurveyKey(s.date),
            data,
            updated_at: now,
          },
          { onConflict: "owner_id,content_type,record_key" }
        )
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      if (plan && plan.items.length > 0) {
        await recordGrowthLog(db, {
          by,
          action: "更新",
          kind: "目標（事前アンケート）",
          target: "本人",
          changes: karteGoalLogChanges(plan),
        });
      }
      const r = saved as Row;
      const after = await loadKarteGoalSlots(db, user.id).catch(() => ({ slots: {}, tableMissing: true }));
      return NextResponse.json({
        record: {
          id: r.id,
          ownerId: r.owner_id,
          contentType: r.content_type,
          recordKey: r.record_key,
          data: r.data,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        },
        karte: after.slots,
        karteTableMissing: karteMissing,
        updatedLevels: plan?.items.map((i) => i.level) ?? [],
      });
    } catch (e) {
      // 事前アンケートが保存できなかったら、先に書いた目標を元に戻す
      if (rollback) await rollback();
      throw e;
    }
  } catch (e) {
    if (e instanceof KarteGoalConflictError) {
      return NextResponse.json({ error: e.message, code: "karte_conflict" }, { status: 409 });
    }
    if (e instanceof GrowthTableMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗しました" }, { status: 500 });
  }
}
