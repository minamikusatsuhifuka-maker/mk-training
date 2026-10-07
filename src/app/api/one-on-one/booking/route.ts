// 1on1の予約（指示書205 §2）— ログイン必須・**自分の分だけ**
//
//   GET    → { enabled, today, periods: [{ …, openSlots, myBooking, canChange }] }
//   POST   → 枠を予約する／別の枠に移る body: { slotId }
//   DELETE → 予約を取り消す body: { periodId }
//
// 【他の人の予約は返さない（205 §5）】
//   返すのは**空き枠**と**自分の予約**だけ。予約済みの枠は一覧から外して返すので、
//   誰がいつ予約しているかは画面にもAPIにも出ない。判定はこのサーバー側で行う。
//
// 【4日前の決まり（205 §0-5）】
//   スタッフが自分で予約・変更・取り消しできるのは実施日の4日前まで。
//   それより近い枠は一覧に出さず、保存も断る。院長は管理画面から代わりにできる。
//
// 【同じ枠の同時予約（205 §7-9）】
//   予約の行idが枠ごとに決まっているので、2件目の insert は一意制約で失敗する。
//   そのときは409で「この枠は先に予約されました。別の枠を選んでください」を返す。

import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { GrowthTableMissingError, serverFeatureEnabled } from "@/lib/staff-growth-server";
import { fetchSchedules, loadPeople } from "@/lib/one-on-one-schedule-server";
import { isAdminUser } from "@/lib/admin-role";
import { isTestSeedUser } from "@/lib/test-seed";
import { jstTodayYmd } from "@/lib/library";
import { PRESURVEY_CONTENT_TYPE } from "@/lib/presurvey-access-server";
import { normalizePresurveyData } from "@/lib/one-on-one-presurvey";
import {
  AlreadyBookedError,
  DirectorBusyError,
  SlotTakenError,
  bookSlot,
  cancelBooking,
  fetchBookings,
  fetchPeriods,
  fetchRebookRequests,
  fetchSlots,
} from "@/lib/one-on-one-slots-server";
import {
  BOOKING_LOCKED_MESSAGE,
  bookingChangeDeadline,
  canStaffChange,
  openSlotsForStaff,
  type Slot,
} from "@/lib/one-on-one-slots";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof GrowthTableMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  if (e instanceof SlotTakenError || e instanceof DirectorBusyError) {
    return NextResponse.json({ error: e.message, code: "taken" }, { status: 409 });
  }
  // 205-補: 同じ人が2台の端末から同時に別の枠を押した。1件目は成立しているので画面を読み込み直す
  if (e instanceof AlreadyBookedError) {
    return NextResponse.json({ error: e.message, code: "already" }, { status: 409 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

/** 機能が使える人か（203のプレビューと同じ扱い＝院長・検証用アカウントはフラグOFFでも使える） */
async function bookingEnabled(user: Parameters<typeof isAdminUser>[0]): Promise<boolean> {
  if (isAdminUser(user) || isTestSeedUser(user)) return true;
  return serverFeatureEnabled("one_on_one_booking");
}

export async function GET() {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;
  const today = jstTodayYmd();

  try {
    const enabled = await bookingEnabled(user);
    if (!enabled) return NextResponse.json({ enabled: false, today, periods: [] });

    const admin = createSupabaseAdminClient();
    const [periods, allSlots, allBookings, scheduleRes, rebooks] = await Promise.all([
      fetchPeriods(admin),
      fetchSlots(admin),
      fetchBookings(admin),
      fetchSchedules(admin),
      fetchRebookRequests(admin, user.id),
    ]);

    // 同じ時刻に院長の予定がある枠は出さない（205 §3）。自分の予約ぶんの予定は除く
    const myScheduleIds = new Set(
      allBookings.filter((b) => b.userId === user.id).map((b) => b.scheduleId)
    );
    const directorBusy = new Set(
      scheduleRes.schedules
        .filter((s) => s.partnerIsDirector && s.time && !myScheduleIds.has(s.id))
        .map((s) => `${s.date} ${s.time}`)
    );

    // 212 A: 事前アンケートに答えたかを、予約ごとに返す
    //   （予約の画面に「📝 事前アンケートに答える」を出すか「回答済み ✓」を出すかの判定）
    const answeredScheduleIds = new Set<string>();
    try {
      const { data: rows } = await admin
        .from("private_store")
        .select("data")
        .eq("owner_id", user.id)
        .eq("content_type", PRESURVEY_CONTENT_TYPE);
      for (const r of (rows ?? []) as { data: unknown }[]) {
        const d = normalizePresurveyData(r.data);
        if (d.scheduleId && d.submittedAt) answeredScheduleIds.add(d.scheduleId);
      }
    } catch {
      /* 読めないときは「未回答」として扱う（答える導線は出したままにする） */
    }

    const mine = periods.filter((p) => p.staffIds.includes(user.id));
    const out = mine.map((p) => {
      const slots = allSlots.filter((s) => s.periodId === p.id);
      const bookings = allBookings.filter((b) => b.periodId === p.id);
      const myBooking = bookings.find((b) => b.userId === user.id) ?? null;
      const open: Slot[] = openSlotsForStaff(slots, bookings, today).filter(
        (s) => !directorBusy.has(`${s.date} ${s.startTime}`)
      );
      const rebook = rebooks.find((r) => r.periodId === p.id) ?? null;
      return {
        id: p.id,
        label: p.label,
        // 205 §1-2: 院長が枠を消した・ブロックしたことで予約が外れた
        rebook: rebook ? { date: rebook.date, startTime: rebook.startTime } : null,
        startDate: p.startDate,
        endDate: p.endDate,
        // 自分の予約（他の人の予約は入れない）
        myBooking,
        // 自分で動かせるか（4日前まで）
        canChange: myBooking ? canStaffChange(myBooking.date, today) : true,
        // 212 A: その予約に対する事前アンケートが提出済みか
        presurveyAnswered: myBooking ? answeredScheduleIds.has(myBooking.scheduleId) : false,
        changeDeadline: myBooking ? bookingChangeDeadline(myBooking.date) : "",
        openSlots: open.map((s) => ({
          id: s.id,
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
      };
    });
    return NextResponse.json({ enabled: true, today, periods: out });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;
  const today = jstTodayYmd();

  let slotIdIn = "";
  try {
    const b = (await req.json()) as { slotId?: unknown };
    slotIdIn = typeof b.slotId === "string" ? b.slotId : "";
  } catch {
    return bad("不正なリクエストです");
  }
  if (!slotIdIn) return bad("枠を選んでください");

  try {
    if (!(await bookingEnabled(user))) return hidden();
    const admin = createSupabaseAdminClient();
    const [periods, slots, people] = await Promise.all([
      fetchPeriods(admin),
      fetchSlots(admin),
      loadPeople(admin),
    ]);
    const slot = slots.find((s) => s.id === slotIdIn) ?? null;
    if (!slot) return hidden();
    const period = periods.find((p) => p.id === slot.periodId) ?? null;
    // 自分が対象の期間でなければ「無い」と同じ応答（他の期間の存在を知らせない）
    if (!period || !period.staffIds.includes(user.id)) return hidden();
    if (slot.blocked) return NextResponse.json({ error: "この枠は選べません", code: "taken" }, { status: 409 });
    if (slot.date < today) return bad("過ぎた枠は選べません");
    if (!canStaffChange(slot.date, today)) return bad(BOOKING_LOCKED_MESSAGE);

    const r = await bookSlot(admin, {
      slot,
      userId: user.id,
      staffName: people.get(user.id)?.name ?? "名前未設定",
      by: user.email ?? user.id,
      today,
      seedMark: isTestSeedUser(user),
    });
    return NextResponse.json({ ok: true, booking: r.booking, moved: r.moved });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;
  const today = jstTodayYmd();

  let periodId = "";
  try {
    const b = (await req.json()) as { periodId?: unknown };
    periodId = typeof b.periodId === "string" ? b.periodId : "";
  } catch {
    periodId = new URL(req.url).searchParams.get("periodId") ?? "";
  }
  if (!periodId) return bad("対象の期間がわかりません");

  try {
    if (!(await bookingEnabled(user))) return hidden();
    const admin = createSupabaseAdminClient();
    const [bookings, people] = await Promise.all([fetchBookings(admin, periodId), loadPeople(admin)]);
    const mine = bookings.find((b) => b.userId === user.id) ?? null;
    if (!mine) return hidden();
    if (!canStaffChange(mine.date, today)) return bad(BOOKING_LOCKED_MESSAGE);
    await cancelBooking(admin, {
      booking: mine,
      staffName: people.get(user.id)?.name ?? "名前未設定",
      by: user.email ?? user.id,
      seedMark: isTestSeedUser(user),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
