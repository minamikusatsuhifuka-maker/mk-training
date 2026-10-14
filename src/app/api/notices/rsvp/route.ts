// 📣 イベントの出欠（指示書228 §2-3）
//   PUT { noticeId, status: "yes"|"no", comment?, userId? }
//   ・本人は締切（締切日の終わり）まで送れる・変えられる
//   ・締切のあとは、つくった人・院長だけが代わりに直せる（userId を付ける）。つくった人・院長は締切前でも代わりに直せる
//   ・本人に返すのは自分の回答だけ（ほかの人の回答や人数は返さない）

import { NextRequest, NextResponse } from "next/server";
import {
  audienceOf,
  authorizeNotices,
  canProxyRsvp,
  canSeeNotice,
  fetchNotice,
  loadAccounts,
  saveRsvp,
} from "@/lib/notices-server";
import { isNoticeId, isRsvpOpen, jstToday, validateRsvpComment, type NoticeRsvp } from "@/lib/notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  try {
    const auth = await authorizeNotices();
    if (!auth.ok) {
      return NextResponse.json({ error: auth.status === 401 ? "ログインが必要です" : "Not Found" }, { status: auth.status });
    }
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const noticeId = typeof body?.noticeId === "string" ? body.noticeId : "";
    if (!isNoticeId(noticeId)) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    const status = body?.status === "yes" || body?.status === "no" ? body.status : null;
    if (!status) return NextResponse.json({ error: "「出席」か「欠席」を選んでください" }, { status: 400 });
    const comment = validateRsvpComment(body?.comment);

    const n = await fetchNotice(auth.admin, noticeId);
    if (!n || !canSeeNotice(n, auth)) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    if (n.kind !== "event") return NextResponse.json({ error: "出欠をとるイベントではありません" }, { status: 400 });

    const target = typeof body?.userId === "string" && body.userId ? body.userId : auth.user.id;
    const proxy = target !== auth.user.id;
    if (proxy) {
      if (!canProxyRsvp(n, auth)) {
        return NextResponse.json({ error: "代わりに直せるのは、つくった人と院長だけです" }, { status: 403 });
      }
      const audience = audienceOf(n.testSeed, await loadAccounts(auth.admin));
      if (!audience.some((a) => a.id === target)) {
        return NextResponse.json({ error: "このイベントの出欠の相手ではありません" }, { status: 400 });
      }
    } else {
      // 一般のイベントは検証用アカウントを除く全員／検証用のイベントは検証用アカウントだけ
      if (n.testSeed !== auth.testSeed) {
        return NextResponse.json({ error: "このイベントの出欠の相手ではありません" }, { status: 403 });
      }
      if (!isRsvpOpen(n, jstToday()) && !canProxyRsvp(n, auth)) {
        return NextResponse.json(
          { error: "出欠の締切を過ぎたので変えられません。直したいときは、つくった人か院長に伝えてください" },
          { status: 403 }
        );
      }
    }
    const rsvp: NoticeRsvp = {
      noticeId,
      userId: target,
      status,
      comment,
      answeredAt: new Date().toISOString(),
      byUserId: proxy ? auth.user.id : "",
    };
    await saveRsvp(auth.admin, rsvp);
    return NextResponse.json({ rsvp: { status: rsvp.status, comment: rsvp.comment, answeredAt: rsvp.answeredAt, byProxy: proxy } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
  }
}
