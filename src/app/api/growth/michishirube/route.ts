// 🧭 成長の道しるべ 第2部（指示書270 §3）— 可能性ノートの「🧭 道しるべ」タブ
//   GET  [?user=<userId>]            → MichiProgressView（今いる段・ステップの進み具合・技能の4段階・学びの3点セット・半期の目標）
//   PUT  { user?, op, ... }          → 1つ付ける（op: level | step | skill | learn | learnConfirm | half）
// 見られる人は可能性ノートの今の決まりのまま（本人・院長・その人の1on1を担当する幹部）。スイッチOFFの間は院長と検証用アカウントだけ。
// 誰が何を付けられるかは lib/michi-progress.ts の applyMichiOp（1か所）。付けられないときは 403、見られない人は 404。

import { NextResponse } from "next/server";
import { growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import { authorizeMichiProgress, buildMichiView, catalogOf, loadProgress, saveProgress } from "@/lib/michi-progress-server";
import { loadMichiContent } from "@/lib/michishirube-server";
import { applyMichiOp, parseMichiOp } from "@/lib/michi-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const a = await authorizeMichiProgress(new URL(req.url).searchParams.get("user") ?? "");
  if (!a) return hidden();
  try {
    return NextResponse.json(await buildMichiView(a), { headers: NO_STORE });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function PUT(req: Request) {
  const body = await readJson(req);
  const a = await authorizeMichiProgress(body && typeof body.user === "string" ? body.user : "");
  if (!a) return hidden();
  const op = parseMichiOp(body);
  if (!op) return NextResponse.json({ error: "不正なリクエストです" }, { status: 400, headers: NO_STORE });
  try {
    const [content, prev] = await Promise.all([loadMichiContent(a.auth.admin), loadProgress(a.auth.admin, a.userId)]);
    const r = applyMichiOp(prev, op, a.actor, catalogOf(content), new Date().toISOString());
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: NO_STORE });
    if (r.progress !== prev) await saveProgress(a.auth.admin, r.progress, a.auth.userEmail || a.auth.userId);
    return NextResponse.json(await buildMichiView(a, r.progress), { headers: NO_STORE });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
