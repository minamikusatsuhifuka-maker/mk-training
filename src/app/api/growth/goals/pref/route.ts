// 希望のペース（指示書185 A-4・CDB P.47 キャリアの選び方）— **本人のみ**
//   PUT { pace: "fast" | "deep" | "" } → 自分の希望を保存（院長・担当幹部は目標の一覧で見られる）

import { NextResponse } from "next/server";
import { authorizeGrowth, fetchGrowthPref, recordGrowthLog, saveGrowthPref } from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import { GROWTH_PACES, normalizeGrowthPref } from "@/lib/staff-growth";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.selfAllowed) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");
  const pace = body.pace === "" || GROWTH_PACES.some((p) => p.value === body.pace) ? (body.pace as string) : null;
  if (pace === null) return badRequest("希望のペースの値が不正です");
  try {
    const prev = await fetchGrowthPref(auth.admin, auth.userId);
    const next = normalizeGrowthPref(auth.userId, { pace, updatedAt: new Date().toISOString() });
    await saveGrowthPref(auth.admin, next, auth.userEmail || auth.userId);
    if (prev.pace !== next.pace) {
      const label = (v: string) => GROWTH_PACES.find((p) => p.value === v)?.label ?? "未選択";
      await recordGrowthLog(auth.admin, {
        by: auth.userEmail || auth.userId,
        action: "更新",
        kind: "希望のペース",
        target: "本人",
        changes: [{ field: "希望のペース", before: label(prev.pace), after: label(next.pace) }],
      });
    }
    return NextResponse.json({ pref: next });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
