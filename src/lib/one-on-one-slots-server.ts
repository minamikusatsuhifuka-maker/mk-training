// 1on1の日程調整のサーバー処理（指示書205）— サーバー専用
//
// 【置き場所】既存の `clinic_staff_growth`（RLS有効・ポリシー0＝全拒否・service-role のみ）。
//   **新しい表は作らない＝交付するSQLも無い**（205 §3の「新しい表に置く場合は…」に当たらない）。
//
// 【同じ枠の二重予約（205 §7-9）】
//   予約の行idを `booking-<枠id>` に固定し、**insert で入れる**。
//   同じ枠への2件目は主キーの一意制約で必ず失敗する（Postgres 23505）→ 2人目には
//   「この枠は先に予約されました。別の枠を選んでください」を返す。
//   **upsert を使わないこと**（上書きになって一意制約の意味が無くなる）。
//
// 【197の予定との関係】
//   予約1件＝予定1件。予定の行idは `sch-<期間id>-<userId>` で固定するので、
//   枠を変えても予定の行は同じ＝204の事前アンケート（scheduleId でひもづく）が引き継がれる。
//   枠を変えたときは予定と事前アンケートの**日付だけ**直し、**回答は消さない**（205 §3）。
//
// 【見る人（205 §5）】
//   枠と予約の一覧（氏名つき）は院長のみ。スタッフには自分の予約と空き枠だけを返す。
//   他の人の予約の有無・氏名・時刻は返さない。判定はこの層と各APIで行う。
//
// クライアントから import しないこと。

import {
  GROWTH_TABLE,
  GrowthTableMissingError,
  isMissingTable,
  type GrowthAdminClient,
} from "./staff-growth-server";
import { fetchSchedules, saveSchedule } from "./one-on-one-schedule-server";
import { normalizeSchedule, type OneOnOneSchedule } from "./one-on-one-schedule";
import { normalizePresurveyData } from "./one-on-one-presurvey";
import { PRESURVEY_CONTENT_TYPE } from "./presurvey-access-server";
import { SEED_MARK } from "./test-seed";
import {
  BOOKING_HOLD_TYPE,
  BOOKING_NOTICE_TYPE,
  BOOKING_REBOOK_TYPE,
  BOOKING_TYPE,
  SLOT_PERIOD_TYPE,
  SLOT_TYPE,
  bookingId,
  holdId,
  newNoticeId,
  normalizeBooking,
  normalizeBookingNotice,
  normalizeRebookRequest,
  normalizeSlot,
  normalizeSlotPeriod,
  planSlots,
  rebookId,
  scheduleIdFor,
  slotId,
  type Booking,
  type BookingNotice,
  type BookingNoticeKind,
  type PeriodInput,
  type RebookRequest,
  type Slot,
  type SlotPeriod,
} from "./one-on-one-slots";

/** 院長への知らせは古いものから捨てる（記録として積み上げない・205 §5） */
const NOTICE_MAX = 50;

type Row = { id: unknown; data: unknown };

/** 枠が先に取られていた（主キーの一意制約で弾かれた） */
export class SlotTakenError extends Error {
  constructor() {
    super("この枠は先に予約されました。別の枠を選んでください");
    this.name = "SlotTakenError";
  }
}

/**
 * 205-補: 同じ人が2台の端末から同時に別の枠を予約した（2件目を止めた）。
 * 1件目は成立しているので、画面を読み込み直せば自分の予約が見える。
 */
export class AlreadyBookedError extends Error {
  constructor() {
    super("すでに予約があります。画面を読み込み直してください");
    this.name = "AlreadyBookedError";
  }
}

/** 同じ時刻に院長の予定が入っている（205 §3） */
export class DirectorBusyError extends Error {
  constructor() {
    super("その時刻には院長の予定が入っています。別の枠を選んでください");
    this.name = "DirectorBusyError";
  }
}

function wrap(error: { message?: string } | null): void {
  if (!error) return;
  if (isMissingTable(error.message)) throw new GrowthTableMissingError();
  throw new Error(error.message ?? "処理に失敗しました");
}

async function selectType(admin: GrowthAdminClient, recordType: string): Promise<Row[]> {
  const { data, error } = await admin.from(GROWTH_TABLE).select("id, data").eq("record_type", recordType);
  wrap(error);
  return (data ?? []) as Row[];
}

async function upsert(
  admin: GrowthAdminClient,
  recordType: string,
  id: string,
  data: Record<string, unknown>,
  by: string
): Promise<void> {
  const { error } = await admin.from(GROWTH_TABLE).upsert({
    id,
    record_type: recordType,
    data,
    updated_by: by,
    updated_at: new Date().toISOString(),
  });
  wrap(error);
}

async function remove(admin: GrowthAdminClient, recordType: string, id: string): Promise<void> {
  const { error } = await admin.from(GROWTH_TABLE).delete().eq("id", id).eq("record_type", recordType);
  wrap(error);
}

/** 主キーの重複（Postgres 23505）か。PostgRESTはcodeを返すが、文言でも拾えるようにしておく */
function isDuplicateKey(error: { code?: string; message: string }): boolean {
  return (error.code ?? "") === "23505" || /duplicate key|already exists/i.test(error.message);
}

// ─── 205-補: 「1人がその期間に持てる枠は1つ」の1行（hold） ───
//
// `booking-<枠id>` は**同じ枠**の二重予約を防ぐが、**同じ人が2台の端末から別の枠**を
// 同時に押した場合は行idが別なので両方通ってしまう（どちらも「自分の前の予約を外す」ので
// 消し合って0枠になることもある）。そこで期間とユーザーで1行の hold を置き、
// **最初の予約だけ insert が通る**ようにして2件目をDBの一意制約で止める。**新しい表は作らない**。

/** hold の中身。検証用の分は一括削除で拾えるように印を付ける（205 §6と同じ作法） */
function holdData(
  periodId: string,
  userId: string,
  slotIdValue: string,
  now: string,
  seedMark: boolean
): Record<string, unknown> {
  const data: Record<string, unknown> = { periodId, userId, slotId: slotIdValue, updatedAt: now };
  if (seedMark) data[SEED_MARK] = true;
  return data;
}

/** hold を insert する。既にあれば false（＝先に誰か／別の端末が取った） */
async function insertHold(
  admin: GrowthAdminClient,
  periodId: string,
  userId: string,
  slotIdValue: string,
  by: string,
  seedMark = false
): Promise<boolean> {
  const now = new Date().toISOString();
  const { error } = await admin.from(GROWTH_TABLE).insert({
    id: holdId(periodId, userId),
    record_type: BOOKING_HOLD_TYPE,
    data: holdData(periodId, userId, slotIdValue, now, seedMark),
    updated_by: by,
    updated_at: now,
  });
  if (!error) return true;
  if (isMissingTable(error.message)) throw new GrowthTableMissingError();
  if (isDuplicateKey(error as { code?: string; message: string })) return false;
  throw new Error(error.message);
}

/** hold の指す枠を書き換える（付け替え・取り直し） */
async function writeHold(
  admin: GrowthAdminClient,
  periodId: string,
  userId: string,
  slotIdValue: string,
  by: string,
  seedMark = false
): Promise<void> {
  await upsert(
    admin,
    BOOKING_HOLD_TYPE,
    holdId(periodId, userId),
    holdData(periodId, userId, slotIdValue, new Date().toISOString(), seedMark),
    by
  );
}

/** hold を消す（取り消し・枠の削除やブロックで外れたとき） */
async function clearHold(admin: GrowthAdminClient, periodId: string, userId: string): Promise<void> {
  await remove(admin, BOOKING_HOLD_TYPE, holdId(periodId, userId));
}

// ─── 期間 ───

export async function fetchPeriods(admin: GrowthAdminClient): Promise<SlotPeriod[]> {
  return (await selectType(admin, SLOT_PERIOD_TYPE))
    .map((r) => normalizeSlotPeriod(String(r.id), r.data))
    .filter((p): p is SlotPeriod => p !== null)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export async function savePeriod(
  admin: GrowthAdminClient,
  p: SlotPeriod,
  by: string,
  seedMark = false
): Promise<void> {
  const { id, ...data } = p;
  await upsert(admin, SLOT_PERIOD_TYPE, id, seedMark ? { ...data, [SEED_MARK]: true } : data, by);
}

export async function deletePeriod(admin: GrowthAdminClient, id: string): Promise<void> {
  await remove(admin, SLOT_PERIOD_TYPE, id);
}

// ─── 枠 ───

export async function fetchSlots(admin: GrowthAdminClient, periodId?: string): Promise<Slot[]> {
  let q = admin.from(GROWTH_TABLE).select("id, data").eq("record_type", SLOT_TYPE);
  if (periodId) q = q.eq("data->>periodId", periodId);
  const { data, error } = await q;
  wrap(error);
  return ((data ?? []) as Row[])
    .map((r) => normalizeSlot(String(r.id), r.data))
    .filter((s): s is Slot => s !== null);
}

/**
 * 期間の枠を作る（足りない分だけ）。
 * 枠idは「期間＋日付＋開始時刻」で決まるので、何度押しても二重には作らない。
 * 既にある枠（ブロックや予約が入っているもの）は**触らない**（205 §1-1）。
 */
export async function ensureSlots(
  admin: GrowthAdminClient,
  period: SlotPeriod,
  input: PeriodInput,
  by: string,
  seedMark = false
): Promise<{ created: number; kept: number }> {
  const existing = new Set((await fetchSlots(admin, period.id)).map((s) => s.id));
  const planned = planSlots(input);
  const now = new Date().toISOString();
  let created = 0;
  for (const s of planned) {
    const id = slotId(period.id, s.date, s.startTime);
    if (existing.has(id)) continue;
    const data: Record<string, unknown> = {
      periodId: period.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      blocked: false,
      createdAt: now,
      updatedAt: now,
    };
    await upsert(admin, SLOT_TYPE, id, seedMark ? { ...data, [SEED_MARK]: true } : data, by);
    created += 1;
  }
  return { created, kept: planned.length - created };
}

export async function setSlotBlocked(
  admin: GrowthAdminClient,
  slot: Slot,
  blocked: boolean,
  by: string
): Promise<void> {
  const { id, ...data } = slot;
  await upsert(admin, SLOT_TYPE, id, { ...data, blocked, updatedAt: new Date().toISOString() }, by);
}

export async function deleteSlot(admin: GrowthAdminClient, id: string): Promise<void> {
  await remove(admin, SLOT_TYPE, id);
}

/** 「元に戻す」で消した枠を戻す（同じidなので同じ枠として戻る） */
export async function restoreSlot(admin: GrowthAdminClient, slot: Slot, by: string): Promise<void> {
  const { id, ...data } = slot;
  await upsert(admin, SLOT_TYPE, id, { ...data, updatedAt: new Date().toISOString() }, by);
}

// ─── 予約 ───

export async function fetchBookings(admin: GrowthAdminClient, periodId?: string): Promise<Booking[]> {
  let q = admin.from(GROWTH_TABLE).select("id, data").eq("record_type", BOOKING_TYPE);
  if (periodId) q = q.eq("data->>periodId", periodId);
  const { data, error } = await q;
  wrap(error);
  return ((data ?? []) as Row[])
    .map((r) => normalizeBooking(String(r.id), r.data))
    .filter((b): b is Booking => b !== null);
}

/** 院長の userId（予定の相手に入れる） */
export async function findDirectorId(admin: GrowthAdminClient): Promise<string> {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of data?.users ?? []) {
    const app = (u.app_metadata ?? {}) as Record<string, unknown>;
    if (app.role === "admin") return u.id;
  }
  return "";
}

/**
 * 同じ時刻に院長の予定が入っていないか（205 §3）。
 * 院長が手で登録した予定（この日程調整から作った予定ではないもの）が同じ日時にあれば予約させない。
 */
export async function directorBusyAt(
  admin: GrowthAdminClient,
  date: string,
  startTime: string,
  ownScheduleId: string
): Promise<boolean> {
  const { schedules } = await fetchSchedules(admin);
  return schedules.some(
    (s) =>
      s.id !== ownScheduleId &&
      s.partnerIsDirector &&
      s.date === date &&
      s.time === startTime
  );
}

async function addNotice(
  admin: GrowthAdminClient,
  kind: BookingNoticeKind,
  args: { userId: string; staffName: string; date: string; startTime: string },
  by: string
): Promise<void> {
  const at = new Date().toISOString();
  await upsert(admin, BOOKING_NOTICE_TYPE, newNoticeId(), { kind, ...args, at }, by);
  // 古い知らせは捨てる（記録として積み上げない・205 §5）
  const all = (await selectType(admin, BOOKING_NOTICE_TYPE))
    .map((r) => normalizeBookingNotice(String(r.id), r.data))
    .filter((n): n is BookingNotice => n !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
  for (const old of all.slice(NOTICE_MAX)) await remove(admin, BOOKING_NOTICE_TYPE, old.id);
}

export async function fetchNotices(admin: GrowthAdminClient): Promise<BookingNotice[]> {
  return (await selectType(admin, BOOKING_NOTICE_TYPE))
    .map((r) => normalizeBookingNotice(String(r.id), r.data))
    .filter((n): n is BookingNotice => n !== null)
    .sort((a, b) => b.at.localeCompare(a.at));
}

export async function clearNotices(admin: GrowthAdminClient): Promise<number> {
  const all = await fetchNotices(admin);
  for (const n of all) await remove(admin, BOOKING_NOTICE_TYPE, n.id);
  return all.length;
}

// ─── 取り直しのお願い（205 §1-2） ───

/** その人に出ている取り直しのお願い（他の人の分は返さない） */
export async function fetchRebookRequests(
  admin: GrowthAdminClient,
  userId?: string
): Promise<RebookRequest[]> {
  let q = admin.from(GROWTH_TABLE).select("id, data").eq("record_type", BOOKING_REBOOK_TYPE);
  if (userId) q = q.eq("data->>userId", userId);
  const { data, error } = await q;
  wrap(error);
  return ((data ?? []) as Row[])
    .map((r) => normalizeRebookRequest(String(r.id), r.data))
    .filter((r): r is RebookRequest => r !== null);
}

async function askRebook(
  admin: GrowthAdminClient,
  b: Booking,
  by: string,
  seedMark: boolean
): Promise<void> {
  const data: Record<string, unknown> = {
    periodId: b.periodId,
    userId: b.userId,
    date: b.date,
    startTime: b.startTime,
    at: new Date().toISOString(),
  };
  if (seedMark) data[SEED_MARK] = true;
  await upsert(admin, BOOKING_REBOOK_TYPE, rebookId(b.periodId, b.userId), data, by);
}

async function clearRebook(admin: GrowthAdminClient, periodId: string, userId: string): Promise<void> {
  await remove(admin, BOOKING_REBOOK_TYPE, rebookId(periodId, userId));
}

/** 197の予定を作る・直す（相手は院長・行idは期間とスタッフで固定） */
async function upsertScheduleFor(
  admin: GrowthAdminClient,
  args: {
    scheduleId: string;
    userId: string;
    date: string;
    time: string;
    directorId: string;
    by: string;
    today: string;
    seedMark: boolean;
  }
): Promise<void> {
  const { schedules } = await fetchSchedules(admin, { userId: args.userId });
  const prev = schedules.find((s) => s.id === args.scheduleId) ?? null;
  const now = new Date().toISOString();
  const next: OneOnOneSchedule = normalizeSchedule(args.scheduleId, {
    userId: args.userId,
    date: args.date,
    time: args.time,
    partnerId: args.directorId,
    partnerName: "院長",
    partnerIsDirector: true,
    createdById: args.by,
    // 知らせの「登録より前の時点は出さない」の基準。取り直したら今日から数え直す
    registeredOn: args.today,
    createdAt: prev?.createdAt || now,
    updatedAt: now,
  })!;
  await saveSchedule(admin, next, args.by);
  if (args.seedMark) {
    // 検証用の印（一括削除の対象にする・205 §6）
    const { id, ...data } = next;
    await upsert(admin, "schedule", id, { ...data, [SEED_MARK]: true }, args.by);
  }
}

/** 事前アンケートの回答の日付だけを直す（**回答は消さない**・205 §3） */
async function movePresurveyHeldOn(
  admin: GrowthAdminClient,
  userId: string,
  scheduleId: string,
  date: string
): Promise<void> {
  const { data, error } = await admin
    .from("private_store")
    .select("record_key, data")
    .eq("owner_id", userId)
    .eq("content_type", PRESURVEY_CONTENT_TYPE);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as { record_key: string; data: unknown }[]) {
    const d = normalizePresurveyData(r.data);
    if (d.scheduleId !== scheduleId || d.heldOn === date) continue;
    const now = new Date().toISOString();
    const { error: upErr } = await admin.from("private_store").upsert(
      {
        owner_id: userId,
        content_type: PRESURVEY_CONTENT_TYPE,
        record_key: r.record_key,
        data: { ...(r.data as Record<string, unknown>), heldOn: date, updatedAt: now },
        updated_at: now,
      },
      { onConflict: "owner_id,content_type,record_key" }
    );
    if (upErr) throw new Error(upErr.message);
  }
}

export type BookResult = { booking: Booking; moved: boolean };

/**
 * 枠を予約する（本人・院長の代わりの予約の両方）。
 * 1期間1人1枠なので、同じ期間に自分の予約があれば**付け替える**（元の枠は空く）。
 */
export async function bookSlot(
  admin: GrowthAdminClient,
  args: {
    slot: Slot;
    userId: string;
    staffName: string;
    by: string;
    today: string;
    seedMark?: boolean;
  }
): Promise<BookResult> {
  const { slot, userId, by, today } = args;
  if (slot.blocked) throw new SlotTakenError();
  const scheduleId = scheduleIdFor(slot.periodId, userId);
  if (await directorBusyAt(admin, slot.date, slot.startTime, scheduleId)) {
    throw new DirectorBusyError();
  }

  // ─── 205-補: 同じ人が2台の端末から同時に別の枠を取るのを止める ───
  //
  // 先に「この期間に自分の予約があるか」を読む。
  //  ・無い → hold を **insert**。2台目は主キーの重複で false が返る。
  //    そのとき予約が実在していれば1台目が成立した＝2台目は AlreadyBookedError で止める。
  //    予約が無いのに hold が残っていた場合は、取り消し・枠の削除・ブロックの後片付けが
  //    残っただけなので**引き継いで続行する**（取り直しが止まらないようにする）。
  //  ・ある  → 変更（付け替え）なので hold の指す枠を書き換えるだけ。今までどおり動く。
  const myBefore = (await fetchBookings(admin, slot.periodId)).filter((b) => b.userId === userId);
  if (myBefore.length === 0) {
    const got = await insertHold(admin, slot.periodId, userId, slot.id, by, args.seedMark === true);
    if (!got) {
      const again = (await fetchBookings(admin, slot.periodId)).filter((b) => b.userId === userId);
      if (again.length > 0) throw new AlreadyBookedError();
      await writeHold(admin, slot.periodId, userId, slot.id, by, args.seedMark === true);
    }
  } else {
    await writeHold(admin, slot.periodId, userId, slot.id, by, args.seedMark === true);
  }

  const now = new Date().toISOString();
  const id = bookingId(slot.id);
  const data: Record<string, unknown> = {
    slotId: slot.id,
    periodId: slot.periodId,
    userId,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    scheduleId,
    createdBy: by,
    createdAt: now,
    updatedAt: now,
  };
  if (args.seedMark) data[SEED_MARK] = true;

  // **insert**（upsertではない）＝同じ枠の2件目は主キーの一意制約で必ず失敗する
  const { error } = await admin.from(GROWTH_TABLE).insert({
    id,
    record_type: BOOKING_TYPE,
    data,
    updated_by: by,
    updated_at: now,
  });
  if (error) {
    // 205-補: この呼び出しで hold を新しく取っていた場合は返す（枠が取れていないのに
    //   「予約あり」の印だけ残ると、別の枠を選び直せなくなる）
    if (myBefore.length === 0) await clearHold(admin, slot.periodId, userId);
    if (isMissingTable(error.message)) throw new GrowthTableMissingError();
    // 23505 = 主キーの重複＝先に予約されていた
    if (isDuplicateKey(error as { code?: string; message: string })) {
      throw new SlotTakenError();
    }
    throw new Error(error.message);
  }

  // 同じ期間の前の予約を外す（1期間1枠）
  const mine = (await fetchBookings(admin, slot.periodId)).filter(
    (b) => b.userId === userId && b.slotId !== slot.id
  );
  for (const old of mine) await remove(admin, BOOKING_TYPE, old.id);

  const directorId = await findDirectorId(admin);
  await upsertScheduleFor(admin, {
    scheduleId,
    userId,
    date: slot.date,
    time: slot.startTime,
    directorId,
    by,
    today,
    seedMark: args.seedMark === true,
  });
  // 取り直しのときは事前アンケートの日付も直す（回答は消さない）
  await movePresurveyHeldOn(admin, userId, scheduleId, slot.date);

  // 取り直しのお願いが出ていたら消す（予約し直せたので）
  await clearRebook(admin, slot.periodId, userId);

  await addNotice(
    admin,
    mine.length > 0 ? "moved" : "booked",
    { userId, staffName: args.staffName, date: slot.date, startTime: slot.startTime },
    by
  );

  const booking = normalizeBooking(id, data)!;
  return { booking, moved: mine.length > 0 };
}

/** 予約を取り消す（枠が空く・予定も消す。事前アンケートの回答は残す） */
export async function cancelBooking(
  admin: GrowthAdminClient,
  args: {
    booking: Booking;
    staffName: string;
    by: string;
    kind?: BookingNoticeKind;
    /** 検証用アカウントの分は一括削除の対象にする（205 §6） */
    seedMark?: boolean;
  }
): Promise<void> {
  const { booking, by } = args;
  await remove(admin, BOOKING_TYPE, booking.id);
  // 205-補: 「この期間に1枠持っている」の印も外す（取り消し・枠の削除・ブロックの全経路がここを通る）
  await clearHold(admin, booking.periodId, booking.userId);
  if (booking.scheduleId) await remove(admin, "schedule", booking.scheduleId);
  if (args.kind === "released") {
    // 205 §1-2: 枠の削除・ブロックで外れたときは、本人に取り直しをお願いする
    await askRebook(admin, booking, by, args.seedMark === true);
  } else {
    await clearRebook(admin, booking.periodId, booking.userId);
  }
  await addNotice(
    admin,
    args.kind ?? "canceled",
    { userId: booking.userId, staffName: args.staffName, date: booking.date, startTime: booking.startTime },
    by
  );
}
