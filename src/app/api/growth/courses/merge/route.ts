// 講座の統合API（指示書179 B-2）— **管理者のみ**
//   POST { fromId, intoId } → from に紐づく学びの記録を into へ付け替え、from を消す
// 再受講回数は保存していないので、統合後に数え直すと自動で正しくなる（B-2「統合しても回数は正しく数え直される」）。

import { NextResponse } from "next/server";
import {
  authorizeGrowth,
  fetchCourse,
  mergeCourse,
  recordGrowthLog,
} from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  if (!auth.isAdmin) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");
  const fromId = typeof body.fromId === "string" ? body.fromId : "";
  const intoId = typeof body.intoId === "string" ? body.intoId : "";
  if (!fromId || !intoId) return badRequest("統合元と統合先は必須です");
  if (fromId === intoId) return badRequest("同じ講座には統合できません");

  try {
    const [from, into] = await Promise.all([
      fetchCourse(auth.admin, fromId),
      fetchCourse(auth.admin, intoId),
    ]);
    if (!from || !into) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });

    const by = auth.userEmail || auth.userId;
    const moved = await mergeCourse(auth.admin, fromId, intoId, by);
    await recordGrowthLog(auth.admin, {
      by,
      action: "統合",
      kind: "講座",
      target: `${from.name} → ${into.name}`,
      changes: [{ field: "付け替えた学びの記録", before: "", after: `${moved}件` }],
    });
    return NextResponse.json({ ok: true, moved, into });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
