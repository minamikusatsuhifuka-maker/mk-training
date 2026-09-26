// 本人が「もらった承認・フィードバック」を見た印（指示書185 B-2/C-3）— **本人のみ**
//   PUT → 自分についての記録すべての seenAt を今にする（新しい記録の印を消す）

import { NextResponse } from "next/server";
import { authorizeGrowth, fetchFeedback, saveFeedback } from "@/lib/staff-growth-server";
import { growthErrorResponse, hidden } from "@/lib/staff-growth-route";
import { isFeedbackUnseen } from "@/lib/staff-growth";

export const runtime = "nodejs";

export async function PUT() {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.selfAllowed) return hidden();
  try {
    const { feedback } = await fetchFeedback(auth.admin, { userId: auth.userId });
    const now = new Date().toISOString();
    let marked = 0;
    for (const f of feedback) {
      if (!isFeedbackUnseen(f)) continue;
      await saveFeedback(auth.admin, { ...f, seenAt: now }, auth.userEmail || auth.userId);
      marked += 1;
    }
    return NextResponse.json({ ok: true, marked });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
