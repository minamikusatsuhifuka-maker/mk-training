// 266 §4: 1on1とのつながり — 可能性ノートに出す、その人の最近4週間の「今週のひとこと」（年間計画のふりかえり）
//
//   GET ?user=  → { notes: [...（計画の名前付き・新しい順）] }
//
// 見られる人は可能性ノートの今の決まりどおり（authorizeGrowth）：
//   院長＝全員／その人の1on1を担当する幹部＝担当のスタッフ（canViewStaff）／本人＝自分の分（わたしの可能性ノート・selfAllowed）
//   それ以外は403、未ログイン・可能性ノートを使えない人は404（存在を知らせない）。

import { NextResponse, type NextRequest } from "next/server";
import { authorizeGrowth, canViewStaff } from "@/lib/staff-growth-server";
import { loadPlans, loadWeekly } from "@/lib/gantt-server";
import { addDays, weekMonday } from "@/lib/gantt-rhythm";
import { jstTodayYmd } from "@/lib/library";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });
  const user = req.nextUrl.searchParams.get("user") || auth.userId;
  const self = user === auth.userId;
  if (self ? !auth.selfAllowed : !canViewStaff(auth, user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }
  try {
    const since = addDays(weekMonday(jstTodayYmd()), -21);
    const [notes, plans] = await Promise.all([loadWeekly(auth.admin, { userId: user }), loadPlans(auth.admin)]);
    const names = new Map(plans.map((p) => [p.id, p.name]));
    return NextResponse.json(
      {
        notes: notes
          .filter((n) => n.week >= since && names.has(n.planId))
          .map((n) => ({ ...n, planName: names.get(n.planId) ?? "" })),
      },
      { headers: NO_STORE }
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込めませんでした" }, { status: 500, headers: NO_STORE });
  }
}
