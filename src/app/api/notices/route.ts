// 📣 お知らせ・イベントのAPI（指示書228）
//   GET              … 一覧（新しい順・自分の未読と出欠の状態つき）
//   GET ?summary=1   … メニューの印・ホームの知らせ用の数だけ
//   GET ?id=<id>     … 1件（貼ったものの短い時間だけ有効なリンク・自分の出欠・見られる人には出欠の一覧）
//   POST             … つくる（スタッフ全員）
//   PATCH            … 直す（つくった人・院長）
//   DELETE ?id=<id>  … 消す（つくった人・院長。貼ったもの・出欠も消える。確定した参加の記録は残る）
// 見られる人の判定はすべて lib/notices-server.ts（228 §4）。スイッチOFFの間は院長と検証用アカウントだけ（他は404）。

import { NextRequest, NextResponse, after } from "next/server";
import {
  EventPhotoBucketMissingError,
  NoticesTableMissingError,
  ServiceRoleMissingError,
  audienceOf,
  authorizeNotices,
  canEditAttendance,
  canEditNotice,
  canProxyRsvp,
  canSeeNotice,
  canSeeRsvpList,
  deleteNoticeCascade,
  fetchAttendance,
  fetchMyReadIds,
  fetchMyRsvps,
  fetchNotice,
  fetchNotices,
  fetchRsvpsFor,
  loadAccounts,
  saveNotice,
  sendNewNoticeMails,
  withSignedAttachments,
  type NoticesAuth,
} from "@/lib/notices-server";
import {
  genNoticeId,
  isNoticeId,
  isRsvpOpen,
  jstToday,
  sortNotices,
  summarizeNotices,
  validateNoticeInput,
  type Notice,
  type NoticeListItem,
  type RsvpStatus,
} from "@/lib/notices";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError || e instanceof NoticesTableMissingError || e instanceof EventPhotoBucketMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  const msg = e instanceof Error ? e.message : "処理に失敗しました";
  return NextResponse.json({ error: msg }, { status: 500 });
}

function denied(status: 401 | 404): NextResponse {
  return status === 401
    ? NextResponse.json({ error: "ログインが必要です" }, { status: 401 })
    : NextResponse.json({ error: "Not Found" }, { status: 404 });
}

function listItem(n: Notice, auth: NoticesAuth, reads: Set<string>, myRsvp: RsvpStatus | null, today: string): NoticeListItem {
  const { attachments, ...rest } = n;
  return {
    ...rest,
    attachmentCount: attachments.length,
    imageCount: attachments.filter((a) => a.kind === "image").length,
    read: reads.has(n.id),
    myRsvp,
    // 一般のイベントは検証用アカウントを除く全員／検証用のイベントは検証用アカウントだけ
    inAudience: n.kind === "event" && n.testSeed === auth.testSeed,
    rsvpOpen: isRsvpOpen(n, today),
    isMine: n.authorId === auth.user.id,
    canEdit: canEditNotice(n, auth),
  };
}

// ─── GET ───

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeNotices();
    if (!auth.ok) return denied(auth.status);
    const sp = new URL(req.url).searchParams;
    const today = jstToday();

    const id = sp.get("id");
    if (id) return await getOne(auth, id, today);

    const [notices, reads, rsvps] = await Promise.all([
      fetchNotices(auth.admin),
      fetchMyReadIds(auth.admin, auth.user.id),
      fetchMyRsvps(auth.admin, auth.user.id),
    ]);
    const items = sortNotices(notices.filter((n) => canSeeNotice(n, auth))).map((n) =>
      listItem(n, auth, reads, rsvps.get(n.id)?.status ?? null, today)
    );
    const summary = summarizeNotices(items, today);
    if (sp.get("summary") === "1") return NextResponse.json({ summary, today });
    return NextResponse.json({
      notices: items,
      summary,
      today,
      isAdmin: auth.isAdmin,
      testSeed: auth.testSeed,
      delegated: auth.delegated,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

async function getOne(auth: NoticesAuth, id: string, today: string): Promise<NextResponse> {
  if (!isNoticeId(id)) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  const n = await fetchNotice(auth.admin, id);
  // 見られないものは「無い」と同じ応答にする（検証用のものが一般スタッフに見えない）
  if (!n || !canSeeNotice(n, auth)) return NextResponse.json({ error: "見つかりません" }, { status: 404 });

  const { notice, bucketMissing } = await withSignedAttachments(auth.admin, n);
  const myRsvps = await fetchMyRsvps(auth.admin, auth.user.id);
  const mine = myRsvps.get(n.id) ?? null;
  const canEdit = canEditNotice(n, auth);

  let rsvpList: { userId: string; name: string; status: RsvpStatus | "none"; comment: string; answeredAt: string; byProxy: boolean }[] | null = null;
  let attendance: { confirmed: boolean; canEdit: boolean; confirmedAt: string } | null = null;
  if (n.kind === "event") {
    if (canSeeRsvpList(n, auth)) {
      const [rsvps, accounts] = await Promise.all([fetchRsvpsFor(auth.admin, n.id), loadAccounts(auth.admin)]);
      const byUser = new Map(rsvps.map((r) => [r.userId, r]));
      const audience = audienceOf(n.testSeed, accounts);
      const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
      const ids = [...audience.map((a) => a.id), ...rsvps.map((r) => r.userId).filter((u) => !audience.some((a) => a.id === u))];
      rsvpList = ids.map((userId) => {
        const r = byUser.get(userId);
        return {
          userId,
          name: nameOf.get(userId) ?? "（アカウントなし）",
          status: r?.status ?? "none",
          comment: r?.comment ?? "",
          answeredAt: r?.answeredAt ?? "",
          byProxy: !!r?.byUserId && r.byUserId !== userId,
        };
      });
    }
    const att = await fetchAttendance(auth.admin, n.id);
    attendance = {
      confirmed: !!att,
      canEdit: canEditAttendance(n, att, auth),
      confirmedAt: att?.confirmedAt ?? "",
    };
  }

  return NextResponse.json({
    notice,
    today,
    isMine: n.authorId === auth.user.id,
    canEdit,
    inAudience: n.kind === "event" && n.testSeed === auth.testSeed,
    rsvpOpen: isRsvpOpen(n, today),
    canProxy: canProxyRsvp(n, auth),
    myRsvp: mine ? { status: mine.status, comment: mine.comment, answeredAt: mine.answeredAt, byProxy: !!mine.byUserId && mine.byUserId !== auth.user.id } : null,
    rsvpList,
    attendance,
    // 置き場が無いことは、直せる人（つくった人・院長）にだけ知らせる
    fileBucketMissing: canEdit ? bucketMissing : false,
  });
}

// ─── POST（つくる・スタッフ全員）───

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeNotices();
    if (!auth.ok) return denied(auth.status);
    const body = (await req.json().catch(() => null)) as unknown;
    const v = validateNoticeInput(body);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const now = new Date().toISOString();
    const notice: Notice = {
      id: genNoticeId(),
      ...v.value,
      attachments: [],
      authorId: auth.user.id,
      authorName: auth.name,
      testSeed: auth.testSeed,
      createdAt: now,
      updatedAt: now,
    };
    await saveNotice(auth.admin, notice, true);
    // 228 §5: 新しいお知らせ・イベントのメール（スイッチOFF・検証用は送らない）。応答を待たせない
    const admin = auth.admin;
    after(async () => {
      try {
        await sendNewNoticeMails(admin, notice);
      } catch (e) {
        console.error(`[notices] 新しいお知らせのメールに失敗: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    return NextResponse.json({ notice });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── PATCH（直す・つくった人と院長）───

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authorizeNotices();
    if (!auth.ok) return denied(auth.status);
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const id = typeof body?.id === "string" ? body.id : "";
    if (!isNoticeId(id)) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    const cur = await fetchNotice(auth.admin, id);
    if (!cur || !canSeeNotice(cur, auth)) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    if (!canEditNotice(cur, auth)) {
      return NextResponse.json({ error: "直せるのは、つくった人と院長だけです" }, { status: 403 });
    }
    // 種類（お知らせ／イベント）はつくったあとは変えない（出欠の扱いが変わるため）
    const v = validateNoticeInput({ ...body, kind: cur.kind });
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    const next: Notice = { ...cur, ...v.value, kind: cur.kind, updatedAt: new Date().toISOString() };
    await saveNotice(auth.admin, next, false);
    return NextResponse.json({ notice: next });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── DELETE（消す・つくった人と院長）───

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authorizeNotices();
    if (!auth.ok) return denied(auth.status);
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!isNoticeId(id)) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    const cur = await fetchNotice(auth.admin, id);
    if (!cur || !canSeeNotice(cur, auth)) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
    if (!canEditNotice(cur, auth)) {
      return NextResponse.json({ error: "消せるのは、つくった人と院長だけです" }, { status: 403 });
    }
    await deleteNoticeCascade(auth.admin, cur);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
