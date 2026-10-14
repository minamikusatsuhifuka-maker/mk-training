// 📣 お知らせ・イベント：開いた印（指示書228 §2-1「まだ開いていないものに印」）
//   POST { id } … 自分が開いたことを残す（本人の分だけ・他の人の既読は誰にも出さない）

import { NextRequest, NextResponse } from "next/server";
import { authorizeNotices, canSeeNotice, fetchNotice, markRead } from "@/lib/notices-server";
import { isNoticeId } from "@/lib/notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeNotices();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.status === 401 ? "ログインが必要です" : "Not Found" }, { status: auth.status });
    }
    const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
    const id = typeof body?.id === "string" ? body.id : "";
    if (!isNoticeId(id)) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    const n = await fetchNotice(auth.admin, id);
    if (!n || !canSeeNotice(n, auth)) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    await markRead(auth.admin, id, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
  }
}
