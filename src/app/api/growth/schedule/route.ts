// 次回1on1の予定（指示書197 B-2）— **院長**、またはそのスタッフの**担当幹部**（183・185）だけ。それ以外・未ログインは 404
//   GET    ?user=<id>  → { schedules（これからの予定＋回答の状態）, candidates（担当者の候補）, today, isAdmin }
//   POST   { userId, date, time, partnerId, id? } → 登録・変更
//   DELETE { id } → 削除
//
// - 担当者に選べるのは 院長 と そのスタッフの担当幹部。担当幹部が登録するときは、担当者は自分だけ。
// - 担当幹部が変更・削除できるのは、自分が担当者か、自分が登録した予定だけ。
// - 回答の状態は「答えたか」だけを返す（本文は返さない。本文は事前アンケートの既存の閲覧規則で読む）。
// - 操作ログは「誰が・いつ・誰の予定を」だけ（日時・本文は残さない）。

import { NextResponse } from "next/server";
import { authorizeGrowth, canViewStaff, recordGrowthLog } from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import { jstTodayYmd } from "@/lib/library";
import { isHm, isYmd, type OneOnOneSchedule } from "@/lib/one-on-one-schedule";
import {
  deleteSchedule,
  fetchSchedule,
  fetchSchedules,
  loadPeople,
  newScheduleId,
  partnerCandidates,
  saveSchedule,
  withAnswerState,
} from "@/lib/one-on-one-schedule-server";

export const runtime = "nodejs";
export const maxDuration = 60;

type Auth = Extract<Awaited<ReturnType<typeof authorizeGrowth>>, { ok: true }>;

/** 院長か、そのスタッフの担当幹部か（本人・担当外は不可） */
function canManage(auth: Auth, userId: string): boolean {
  return !!userId && userId !== auth.userId && canViewStaff(auth, userId);
}

/** 担当幹部が触れる予定か（院長は全部） */
function canTouch(auth: Auth, s: OneOnOneSchedule): boolean {
  if (!canManage(auth, s.userId)) return false;
  return auth.isAdmin || s.partnerId === auth.userId || s.createdById === auth.userId;
}

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const userId = new URL(req.url).searchParams.get("user") ?? "";
  if (!canManage(auth, userId)) return hidden();
  try {
    const today = jstTodayYmd();
    const people = await loadPeople(auth.admin);
    const [{ schedules, tableMissing }, candidates] = await Promise.all([
      fetchSchedules(auth.admin, { userId }),
      partnerCandidates(auth.admin, userId, people),
    ]);
    const views = await withAnswerState(auth.admin, schedules, today);
    return NextResponse.json({
      // 院長・担当者の画面には本人向けの知らせ文は要らない
      schedules: views.map((v) => ({ ...v, alert: null, editable: canTouch(auth, v) })),
      candidates: auth.isAdmin ? candidates : candidates.filter((c) => c.userId === auth.userId),
      today,
      isAdmin: auth.isAdmin,
      tableMissing,
    });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("JSONが不正です");
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!canManage(auth, userId)) return hidden();

  const date = body.date;
  const time = typeof body.time === "string" ? body.time : "";
  const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
  const today = jstTodayYmd();
  if (!isYmd(date)) return badRequest("1on1の日付を入力してください");
  if (date < today) return badRequest("過去の日付には登録できません");
  if (time && !isHm(time)) return badRequest("時刻の形式が正しくありません");

  try {
    const people = await loadPeople(auth.admin);
    const candidates = await partnerCandidates(auth.admin, userId, people);
    const partner = candidates.find((c) => c.userId === partnerId);
    if (!partner) return badRequest("担当者は院長か、このスタッフの担当幹部から選んでください");
    if (!auth.isAdmin && partner.userId !== auth.userId) return badRequest("担当幹部が登録できるのは、自分が担当する1on1だけです");

    const id = typeof body.id === "string" && body.id ? body.id : "";
    const prev = id ? await fetchSchedule(auth.admin, id) : null;
    if (id && (!prev || prev.userId !== userId || !canTouch(auth, prev))) return hidden();

    const now = new Date().toISOString();
    const s: OneOnOneSchedule = {
      id: prev?.id ?? newScheduleId(),
      userId,
      date,
      time,
      partnerId: partner.userId,
      partnerName: partner.name,
      partnerIsDirector: partner.isDirector,
      createdById: prev?.createdById ?? auth.userId,
      // 日付を変えたら、知らせの「登録より前の時点は出さない」も変更日から数え直す
      registeredOn: prev && prev.date === date ? prev.registeredOn : today,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    await saveSchedule(auth.admin, s, auth.userEmail || auth.userId);
    await recordGrowthLog(auth.admin, {
      by: auth.userEmail || auth.userId,
      action: prev ? "変更" : "登録",
      kind: "1on1の予定",
      target: people.get(userId)?.name ?? userId,
      changes: [],
    });
    const [view] = await withAnswerState(auth.admin, [s], today);
    return NextResponse.json({ schedule: view ? { ...view, alert: null, editable: true } : null });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const body = await readJson(req);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return badRequest("削除する予定を指定してください");
  try {
    const s = await fetchSchedule(auth.admin, id);
    if (!s || !canTouch(auth, s)) return hidden();
    await deleteSchedule(auth.admin, id);
    const people = await loadPeople(auth.admin);
    await recordGrowthLog(auth.admin, {
      by: auth.userEmail || auth.userId,
      action: "削除",
      kind: "1on1の予定",
      target: people.get(s.userId)?.name ?? s.userId,
      changes: [],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
