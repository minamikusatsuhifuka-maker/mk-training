// 266: 年間計画の設定（院長だけ）
//
//   GET                          → { reflectionWeekday }（今週のひとことの知らせを出す曜日。0＝日曜 … 6＝土曜・既定は5＝金曜）
//   PUT { reflectionWeekday }    → 保存
//
// 院長以外には口がない（404）。

import { NextResponse, type NextRequest } from "next/server";
import { authorizeGantt, loadGanttSettings, saveGanttSettings } from "@/lib/gantt-server";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });

export async function GET() {
  const auth = await authorizeGantt();
  if (!auth.ok || !auth.isAdmin) return hidden();
  try {
    return NextResponse.json(await loadGanttSettings(auth.admin), { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込めませんでした" }, { status: 500, headers: NO_STORE });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok || !auth.isAdmin) return hidden();
  const body = (await req.json().catch(() => ({}))) as { reflectionWeekday?: unknown };
  if (typeof body.reflectionWeekday !== "number" || !Number.isInteger(body.reflectionWeekday) || body.reflectionWeekday < 0 || body.reflectionWeekday > 6) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400, headers: NO_STORE });
  }
  try {
    const saved = await saveGanttSettings(auth.admin, { reflectionWeekday: body.reflectionWeekday }, auth.user.email ?? auth.user.id);
    return NextResponse.json(saved, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500, headers: NO_STORE });
  }
}
