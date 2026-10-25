// 265: 年間計画のアプリ内の知らせ（自分あてだけ）
//
//   GET                 → { alerts: まだ読んでいない自分あての知らせ（新しい順） }
//   POST { ids? }       → 読んだ印を付ける（ids を省くと全部）
//
// 年間計画を見られない人（スイッチOFFの間の一般のスタッフ）には404（authorizeGantt）。ほかの人あての知らせは返さない。

import { NextResponse, type NextRequest } from "next/server";
import { authorizeGantt, loadAlerts, markAlertsRead } from "@/lib/gantt-server";
import { hidesTestSeedFor } from "@/lib/test-seed-hide-server";

export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const auth = await authorizeGantt();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "ログインが必要です" : "Not Found" }, { status: auth.status, headers: NO_STORE });
  try {
    const hide = hidesTestSeedFor(auth.user);
    const alerts = (await loadAlerts(auth.admin, auth.user.id)).filter((a) => !a.readAt && !(hide && a.testSeed));
    return NextResponse.json({ alerts }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込めませんでした" }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeGantt();
  if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "ログインが必要です" : "Not Found" }, { status: auth.status, headers: NO_STORE });
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 100) : undefined;
  try {
    const n = await markAlertsRead(auth.admin, auth.user.id, ids);
    return NextResponse.json({ read: n }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存できませんでした" }, { status: 500, headers: NO_STORE });
  }
}
