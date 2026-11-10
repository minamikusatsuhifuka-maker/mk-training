// 277: 欲求サーベイの見え方（院長は資料とデータを見る）— ログイン済みのスタッフ全員
//   GET  → { on, texts | null, showNotice }  ON の間だけ新しい文を返す（OFF は今の文のまま＝texts:null）
//   POST { action: "ack" } → 今の回のお知らせを「確認しました」（本人の分だけ）
// 院長自身にはお知らせを出さない。スイッチと文を変えるのは /api/admin/needs-overview（院長だけ）。

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { isDirectorUser } from "@/lib/people-training-server";
import { loadMyAck, loadNeedsDirectorView, saveMyAck } from "@/lib/needs-director-view-server";
import { hasAckedCurrent } from "@/lib/needs-director-view";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const { user, response } = await requireLogin();
  if (!user) return response;
  const s = await loadNeedsDirectorView();
  if (!s.on) return NextResponse.json({ on: false, texts: null, showNotice: false }, { headers: NO_STORE });
  const showNotice = !isDirectorUser(user) && !hasAckedCurrent(s, await loadMyAck(user.id));
  return NextResponse.json({ on: true, texts: s.texts, showNotice }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const { user, response } = await requireLogin();
  if (!user) return response;
  let body: { action?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "形式が不正です" }, { status: 400, headers: NO_STORE });
  }
  if (body.action !== "ack") return NextResponse.json({ error: "action が不正です" }, { status: 400, headers: NO_STORE });
  const s = await loadNeedsDirectorView();
  if (!s.on) return NextResponse.json({ ok: true, showNotice: false }, { headers: NO_STORE });
  try {
    await saveMyAck(user, s.onAt);
    return NextResponse.json({ ok: true, showNotice: false }, { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗しました" }, { status: 500, headers: NO_STORE });
  }
}
