// 📣 イベントの参加の確定（指示書228 §3）
//   GET ?noticeId=  … 確定の画面に出す一覧（出欠をとる相手全員と、それぞれの出欠・今の確定）
//   PUT { noticeId, userIds } … 参加した人を確定する／直す
//
// 【できる人】確定の前＝開催日時を過ぎたら、つくった人・院長・任された幹部。確定の後＝院長・任された幹部だけ。
//   それ以外の人には「無い」と同じ 404 を返す（確定した一覧をスタッフの画面に出さない・228 §3）。
// 【記録】clinic_events の notice_attendance（1イベント1行）。題名・日時・氏名は確定したときに写しておく
//   ＝お知らせが消されても、管理画面の「参加の記録」は読める。

import { NextRequest, NextResponse } from "next/server";
import {
  audienceOf,
  authorizeNotices,
  canEditAttendance,
  canSeeNotice,
  fetchAttendance,
  fetchNotice,
  fetchRsvpsFor,
  loadAccounts,
  saveAttendance,
  type NoticesAuth,
} from "@/lib/notices-server";
import { isNoticeId, type Notice, type NoticeAttendance, type RsvpStatus } from "@/lib/notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

async function load(auth: NoticesAuth, noticeId: string) {
  const n = await fetchNotice(auth.admin, noticeId);
  if (n && !canSeeNotice(n, auth)) return null;
  const att = await fetchAttendance(auth.admin, noticeId);
  if (!n && !att) return null;
  // お知らせが消されていて記録だけ残っている場合、検証用の記録は院長と検証用アカウントだけ
  if (!n && att && att.testSeed && !auth.isAdmin && !auth.testSeed) return null;
  if (!canEditAttendance(n, att, auth)) return null;
  return { n, att };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeNotices();
    if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "ログインが必要です" : "Not Found" }, { status: auth.status });
    const noticeId = new URL(req.url).searchParams.get("noticeId") ?? "";
    if (!isNoticeId(noticeId)) return NOT_FOUND();
    const r = await load(auth, noticeId);
    if (!r) return NOT_FOUND();
    const testSeed = r.n ? r.n.testSeed : !!r.att?.testSeed;
    const [accounts, rsvps] = await Promise.all([loadAccounts(auth.admin), fetchRsvpsFor(auth.admin, noticeId)]);
    const audience = audienceOf(testSeed, accounts);
    const rsvpBy = new Map(rsvps.map((x) => [x.userId, x.status]));
    const candidates: { userId: string; name: string; rsvp: RsvpStatus | "none" }[] = audience.map((a) => ({
      userId: a.id,
      name: a.name,
      rsvp: rsvpBy.get(a.id) ?? "none",
    }));
    // 確定済みで、いまは相手にいない人（アカウントを止めた等）も一覧に残す
    for (const id of r.att?.userIds ?? []) {
      if (!candidates.some((c) => c.userId === id)) {
        candidates.push({ userId: id, name: accounts.find((a) => a.id === id)?.name ?? r.att?.names[id] ?? "（アカウントなし）", rsvp: rsvpBy.get(id) ?? "none" });
      }
    }
    // 確定の前は「出席」と答えた人を最初から選んでおく（228 §3）
    const selected = r.att ? r.att.userIds : candidates.filter((c) => c.rsvp === "yes").map((c) => c.userId);
    return NextResponse.json({
      title: r.n?.title ?? r.att?.title ?? "",
      heldOn: r.n?.heldOn ?? r.att?.heldOn ?? "",
      heldTime: r.n?.heldTime ?? r.att?.heldTime ?? "",
      confirmed: !!r.att,
      confirmedAt: r.att?.confirmedAt ?? "",
      candidates,
      selected,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await authorizeNotices();
    if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "ログインが必要です" : "Not Found" }, { status: auth.status });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const noticeId = typeof body?.noticeId === "string" ? body.noticeId : "";
    if (!isNoticeId(noticeId)) return NOT_FOUND();
    const r = await load(auth, noticeId);
    if (!r) return NOT_FOUND();
    const raw = Array.isArray(body?.userIds) ? body!.userIds : null;
    if (!raw) return NextResponse.json({ error: "参加した人を選んでください" }, { status: 400 });
    const testSeed = r.n ? r.n.testSeed : !!r.att?.testSeed;
    const accounts = await loadAccounts(auth.admin);
    const allowed = new Set([...audienceOf(testSeed, accounts).map((a) => a.id), ...(r.att?.userIds ?? [])]);
    const userIds = Array.from(new Set(raw.filter((x): x is string => typeof x === "string")));
    const stray = userIds.filter((id) => !allowed.has(id));
    if (stray.length > 0) return NextResponse.json({ error: "このイベントの相手ではない人が含まれています" }, { status: 400 });

    const names: Record<string, string> = {};
    for (const id of userIds) names[id] = accounts.find((a) => a.id === id)?.name ?? r.att?.names[id] ?? "";
    const now = new Date().toISOString();
    const base: Pick<Notice, "title" | "heldOn" | "heldTime"> = r.n
      ? { title: r.n.title, heldOn: r.n.heldOn, heldTime: r.n.heldTime }
      : { title: r.att!.title, heldOn: r.att!.heldOn, heldTime: r.att!.heldTime };
    const att: NoticeAttendance = {
      noticeId,
      ...base,
      userIds,
      names,
      testSeed,
      confirmedAt: r.att?.confirmedAt || now,
      confirmedBy: r.att?.confirmedBy || auth.user.id,
      updatedAt: now,
      updatedBy: auth.user.id,
    };
    await saveAttendance(auth.admin, att);
    return NextResponse.json({ ok: true, confirmedAt: att.confirmedAt, count: userIds.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
  }
}
