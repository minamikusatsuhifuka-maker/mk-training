// 可能性ノート「欲求の視点（関わる側のヒント）」のAPI — 院長、またはそのスタッフの担当に指定された幹部だけ
//   GET ?user=<スタッフのuserId> → { available, perspective, focusCurrentShared }
//
// 【見られる人】authorizeGrowth＋canViewStaff（179/183 と同じ判定）。本人・担当でない幹部・一般スタッフ・未ログインは
//   **何も返さない**（404＝カルテと同じ「存在しない」応答）。自分自身のページも 404（本人の画面には出さない）。
// 【使う診断結果】本人の公開設定どおりに削いだあと（redactSurveyForViewer＝182の唯一の判定）だけ。
//   ・「詳細（詳細15項目の欲求値）も公開」の人だけ、15項目の「欲求」の値がある → 高い欲求（上位3）・低い欲求（下位3）が出る
//   ・「注力」「現況」はどの設定でも本人以外に渡さない決まり（182）なので、φ と 気になるパターンは今は出ない
//   ・非公開・レーダーのみの人・未回答の人は、すべて同じ応答（available:false）＝非公開の結果が有るか無いかも分からない
// 【保存しない】判定は表示のたびに計算するだけ。応答に数値は入れない（項目キーだけ）。
// 【AIに渡さない】このルートはどのAI処理も呼ばない。

import { NextResponse } from "next/server";
import { authorizeGrowth, canViewStaff } from "@/lib/staff-growth-server";
import { hidden } from "@/lib/staff-growth-route";
import { staffProfileKey, type StaffProfile } from "@/lib/staff-profiles";
import { redactSurveyForViewer } from "@/lib/survey-visibility";
import { computeNeedsPerspective } from "@/lib/needs-guide";
import { NEEDS_GUIDE_ITEMS } from "@/lib/needs-guide-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const userId = new URL(req.url).searchParams.get("user") ?? "";
  // 本人の画面には出さない／院長か担当の幹部だけ
  if (!userId || userId === auth.userId || !canViewStaff(auth, userId)) return hidden();

  try {
    const { data } = await auth.admin.from("content_store").select("data").eq("id", staffProfileKey(userId)).maybeSingle();
    const profile = (data?.data ?? null) as StaffProfile | null;
    // 本人の公開設定どおりに削ぐ（院長も例外にしない・164/182）
    const shared = redactSurveyForViewer(profile?.needsSurvey);
    const details = shared?.visibility === "public_details" ? shared.details ?? {} : {};
    const perspective = computeNeedsPerspective(details, NEEDS_GUIDE_ITEMS);
    const available = perspective.strong.length > 0;
    return NextResponse.json(
      {
        available,
        perspective: available ? perspective : null,
        // 注力・現況が渡っているか（今の決まりでは常に false）。φ・パターンを出せるかを画面が知るため
        focusCurrentShared: false,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return hidden();
  }
}
