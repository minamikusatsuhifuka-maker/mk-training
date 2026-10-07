// 1人のスタッフの事前アンケートの回答を、時期ごとにまとめて返す（指示書214 §2・§3）
//   GET ?userId=<スタッフ>  → { staffName, entries, currentQuestionIds, isAdmin }
//
// 【なぜ1回でまとめて返すか】
//   横並びの比較は、画面で選び直すたびに組み替える（214 §2の「最大3つ」「最初は最新とその前」）。
//   選び直しのたびにAPIを呼ぶと、院長以外の**閲覧の記録が選び直しの回数だけ増えてしまう**ので、
//   見られる回答を1回で渡し、表の組み立ては画面側の純関数（lib/presurvey-compare.ts）で行う。
//
// 【見られる人（214 §3＝204 §5-1と同じ）】
//   院長、または「📝 1on1の事前アンケートの回答」を委任されていて、
//   かつそのスタッフを担当に指定されている人だけ。判定は presurvey-access-server（サーバー側）。
//   見られないスタッフを指定したら、**存在しないのと同じ404**（回答の有無も件数も分からない）。
//
// 【閲覧の記録（214 §3＝204 §5-3）】院長以外が開いたら、誰が・誰の・いつを残す（本文は残さない）。
//
// 【出さないもの】ほかのスタッフとの比較・並べ替え・集計（214 §0-4）。1-2の選択も集計に使わない。

import { NextResponse } from "next/server";
import { requireAdminItem } from "@/lib/admin-delegation-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { GrowthTableMissingError, recordGrowthLog } from "@/lib/staff-growth-server";
import { presurveyDeadline } from "@/lib/one-on-one-schedule";
import {
  loadPresurveyQuestions,
  normalizePresurveyData,
  visiblePresurveyQuestions,
} from "@/lib/one-on-one-presurvey";
import {
  PRESURVEY_CONTENT_TYPE,
  PRESURVEY_VIEW_ITEM_KEY,
  canViewPresurveyOf,
  presurveyViewerScope,
} from "@/lib/presurvey-access-server";
import { sortCompareEntriesDesc } from "@/lib/presurvey-compare";
import { resolveDisplayNames } from "@/lib/display-names-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 1人ぶんで返す回答の上限（古いものは切る。比べられるのは最大3件なので十分） */
const ENTRY_LIMIT = 24;

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

type Row = { owner_id: string; record_key: string; data: unknown };

export async function GET(req: Request) {
  const auth = await requireAdminItem(PRESURVEY_VIEW_ITEM_KEY);
  if (auth.response) return auth.response;

  const userId = (new URL(req.url).searchParams.get("userId") ?? "").trim();
  if (!userId) return hidden();

  try {
    const db = createSupabaseAdminClient();
    const scope = await presurveyViewerScope(auth.user);
    // 担当に指定されていないスタッフは「存在しない」と同じ応答（214 §5-5）
    if (!canViewPresurveyOf(userId, scope)) return hidden();

    const { data, error } = await db
      .from("private_store")
      .select("owner_id, record_key, data")
      .eq("content_type", PRESURVEY_CONTENT_TYPE)
      .eq("owner_id", userId);
    if (error) throw new Error(error.message);

    const all = ((data ?? []) as Row[]).map((r) => {
      const d = normalizePresurveyData(r.data);
      return {
        recordKey: r.record_key,
        heldOn: d.heldOn,
        deadline: d.heldOn ? presurveyDeadline({ date: d.heldOn }) : "",
        submittedAt: d.submittedAt,
        updatedAt: d.updatedAt,
        twoParts: d.twoParts,
        answers: d.answers,
      };
    });
    // 新しい回答から（画面の一覧の並び）。古いぶんは切る
    const entries = sortCompareEntriesDesc(all).slice(0, ENTRY_LIMIT);

    const names = await resolveDisplayNames([userId]).catch(() => new Map<string, string>());
    const staffName = names.get(userId) || "名前未設定";

    // いまの質問の並び（行の順番の基準。ここに無い問いは「旧形式の問い」になる）
    const currentQuestionIds = await loadPresurveyQuestions()
      .then((qs) => visiblePresurveyQuestions(qs).map((q) => q.id))
      .catch(() => [] as string[]);

    if (!scope.isAdmin) {
      // 204 §5-3と同じ記録（本文は残さない）
      await recordGrowthLog(db, {
        by: auth.user.email ?? auth.user.id,
        action: "閲覧",
        kind: "1on1の事前アンケートの回答",
        target: staffName,
        changes: [],
      }).catch(() => {
        /* 記録に失敗しても閲覧は返す（204と同じ扱い） */
      });
    }

    return NextResponse.json({
      isAdmin: scope.isAdmin,
      staffName,
      entries,
      currentQuestionIds,
    });
  } catch (e) {
    if (e instanceof GrowthTableMissingError) return hidden();
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "読み込みに失敗しました" },
      { status: 500 }
    );
  }
}
