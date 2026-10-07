// 1on1の事前アンケートの回答を見る（指示書204 §5-2・§5-3）
//   GET                              → { rows, isAdmin }（1on1の予定ごとの一覧）
//   GET ?userId=&recordKey=          → { answer, previous }（回答の本文。開いた記録を残す）
//
// 【見られる人（204 §5-1）】院長、または「📝 1on1の事前アンケートの回答」を委任されていて、
//   かつそのスタッフを担当に指定されている人だけ。判定は presurvey-access-server。
//   見られないスタッフの分は**一覧にも出さない**（有無も件数も分からない）。
//
// 【閲覧の記録（204 §5-3）】院長以外が回答を開いたら、誰が・誰の・いつを残す（**本文は残さない**）。
//   置き場所は183の閲覧の記録と同じ clinic_staff_growth の操作ログ（院長だけが見られる）。
//
// 【出さないもの】合計・件数・順位・比較（204 §5-2）。1-2の選択を集計に使わない（§5-4）。

import { NextResponse } from "next/server";
import { requireAdminItem } from "@/lib/admin-delegation-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  GrowthTableMissingError,
  recordGrowthLog,
} from "@/lib/staff-growth-server";
import { fetchSchedules } from "@/lib/one-on-one-schedule-server";
import {
  isScheduleAnswered,
  presurveyDeadline,
  scheduleAnswerState,
} from "@/lib/one-on-one-schedule";
import {
  changedPart1QuestionIds,
  normalizePresurveyData,
  type PresurveyData,
} from "@/lib/one-on-one-presurvey";
import {
  PRESURVEY_CONTENT_TYPE,
  PRESURVEY_VIEW_ITEM_KEY,
  canViewPresurvey,
  presurveyViewerScope,
  viewableStaffIds,
} from "@/lib/presurvey-access-server";
import { resolveDisplayNames } from "@/lib/display-names-server";
import { jstTodayYmd } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

type Row = { owner_id: string; record_key: string; data: unknown; updated_at?: string };

// 211 A: 名前の解決は lib/display-names-server.ts（正本）に寄せた。
//   ここには独自の名簿読みがあったが、名簿の行は `{ items: [...] }` の形なのに
//   `Array.isArray(row.data)` で配列として読もうとしており **常に空** ＝
//   回答一覧の名前が全員「名前未設定」になっていた。
async function nameMap(ids: readonly string[]): Promise<Map<string, string>> {
  try {
    return await resolveDisplayNames(ids);
  } catch {
    return new Map();
  }
}

export async function GET(req: Request) {
  const auth = await requireAdminItem(PRESURVEY_VIEW_ITEM_KEY);
  if (auth.response) return auth.response;

  try {
    const db = createSupabaseAdminClient();
    const scope = await presurveyViewerScope(auth.user);
    const allowed = viewableStaffIds(scope);

    const { data, error } = await db
      .from("private_store")
      .select("owner_id, record_key, data, updated_at")
      .eq("content_type", PRESURVEY_CONTENT_TYPE);
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as Row[]).filter((r) => canViewPresurvey(r, scope));

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId") ?? "";
    const recordKey = url.searchParams.get("recordKey") ?? "";

    // ── 本文を1件返す（開いた記録を残す） ──
    if (userId && recordKey) {
      const hit = rows.find((r) => r.owner_id === userId && r.record_key === recordKey);
      if (!hit) return hidden();
      const d = normalizePresurveyData(hit.data);
      // 前回（同じ人の、この回より前の回答）— 第1部の「変わった項目」の印に使う
      const previous = rows
        .filter((r) => r.owner_id === userId && r.record_key !== recordKey)
        .map((r) => normalizePresurveyData(r.data))
        .filter((x) => x.heldOn && (!d.heldOn || x.heldOn < d.heldOn))
        .sort((a, b) => b.heldOn.localeCompare(a.heldOn))[0] as PresurveyData | undefined;
      const names = await nameMap([userId]);
      if (!scope.isAdmin) {
        await recordGrowthLog(db, {
          by: auth.user.email ?? auth.user.id,
          action: "閲覧",
          kind: "1on1の事前アンケートの回答",
          target: names.get(userId) || userId,
          changes: [],
        });
      }
      return NextResponse.json({
        isAdmin: scope.isAdmin,
        answer: {
          userId,
          recordKey,
          staffName: names.get(userId) || "名前未設定",
          heldOn: d.heldOn,
          deadline: d.heldOn ? presurveyDeadline({ date: d.heldOn }) : "",
          submittedAt: d.submittedAt,
          updatedAt: d.updatedAt,
          twoParts: d.twoParts,
          answers: d.answers,
        },
        changedQuestionIds: Array.from(changedPart1QuestionIds(d, previous ?? null)),
        previousHeldOn: previous?.heldOn ?? "",
      });
    }

    // ── 一覧（1on1の予定ごと） ──
    const { schedules, tableMissing } = await fetchSchedules(db);
    // 一覧に出る全員ぶん（名簿に無い人はアカウントの表示名で埋まる）
    const names = await nameMap([...new Set([...rows.map((r) => r.owner_id), ...schedules.map((s) => s.userId)])]);
    const today = jstTodayYmd();
    const byUser = new Map<string, { data: PresurveyData; recordKey: string }[]>();
    for (const r of rows) {
      const list = byUser.get(r.owner_id) ?? [];
      list.push({ data: normalizePresurveyData(r.data), recordKey: r.record_key });
      byUser.set(r.owner_id, list);
    }

    const visibleSchedules = schedules.filter(
      (s) => allowed === "all" || allowed.has(s.userId)
    );
    const list = visibleSchedules
      .map((s) => {
        const mine = byUser.get(s.userId) ?? [];
        const answered = isScheduleAnswered(
          s,
          mine.map((m) => m.data)
        );
        const hit = mine.find(
          (m) => m.data.scheduleId === s.id || (m.data.heldOn === s.date && !!m.data.submittedAt)
        );
        return {
          scheduleId: s.id,
          userId: s.userId,
          staffName: names.get(s.userId) || "名前未設定",
          date: s.date,
          time: s.time,
          deadline: presurveyDeadline(s),
          partnerName: s.partnerIsDirector ? "院長" : s.partnerName,
          submitted: answered,
          state: scheduleAnswerState(s, today, answered),
          recordKey: hit?.recordKey ?? "",
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.staffName.localeCompare(b.staffName));

    return NextResponse.json({ rows: list, isAdmin: scope.isAdmin, tableMissing });
  } catch (e) {
    if (e instanceof GrowthTableMissingError) {
      return NextResponse.json({ rows: [], isAdmin: false, tableMissing: true });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "読み込みに失敗しました" },
      { status: 500 }
    );
  }
}
