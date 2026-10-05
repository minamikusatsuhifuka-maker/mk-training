// 1on1の日程調整（指示書205）— 型と純粋関数
// クライアント・サーバーの両方から使う（"use client" のモジュールを import しないこと）。
//
// 【置き場所（205 §3）— 新しい表は作らない＝交付するSQLも無い】
// 既存の `clinic_staff_growth`（RLS有効・ポリシー0＝全拒否・service-role のみ・179のテーブル）に
// record_type を足して入れる。
//   "slot_period"   … 院長が作った期間（実施期間・曜日・時間帯・刻み・対象スタッフ）
//   "slot"          … 枠1つ（空き／ブロック）
//   "booking"       … 予約1つ
//   "booking_notice"… 院長へのアプリ内の知らせ（予約・変更・取り消しが入った）
//
// 【同じ枠の二重予約をDBで防ぐ（205 §3・§7-9）】
// 予約の行idを **`booking-<枠id>`** に固定する。clinic_staff_growth の id は主キーなので、
// 同じ枠への2件目の **insert は主キーの一意制約で必ず失敗する**（Postgres 23505）。
// ＝「新しい表＋一意制約」を作らずに、DBの一意制約で二重予約を防げる。**upsert を使わないこと**
// （upsert にすると2件目が1件目を上書きしてしまい、一意制約の意味が無くなる）。
//
// 【枠idも決まった形にする（205 §1-1「同じ時刻の枠は二重に作らない」）】
//   `slot-<期間id>-<YYYYMMDD>-<HHMM>`。同じ期間・同じ日時の枠は必ず同じidになるので、
//   「枠を足す」を何度押しても重複しない（既にあるものは上書きしても中身が同じ）。
//
// 【197の「次回1on1の予定」との関係（205 §3）】
//   予約1件＝予定1件。予定の行idは **`sch-<期間id>-<userId>`** に固定する。
//   こうすると**枠を変えても予定の行は同じ**なので、204の事前アンケート（scheduleId でひもづく）が
//   そのまま新しい予約に引き継がれる（回答は消さない・日付だけ直す）。

import { addDays, isHm, isYmd } from "./one-on-one-schedule";

export const SLOT_PERIOD_TYPE = "slot_period";
export const SLOT_TYPE = "slot";
export const BOOKING_TYPE = "booking";
export const BOOKING_NOTICE_TYPE = "booking_notice";

/** 既定の時間帯（205 §0-2） */
export const DEFAULT_SLOT_FROM = "13:00";
export const DEFAULT_SLOT_TO = "15:00";

/** 刻み（205 §0-2） */
export const SLOT_STEPS = [5, 10, 15, 30] as const;
export type SlotStep = (typeof SLOT_STEPS)[number];

export function isSlotStep(v: unknown): v is SlotStep {
  return (SLOT_STEPS as readonly number[]).includes(v as number);
}

/** スタッフが自分で予約・変更・取り消しできるのは実施日の何日前までか（205 §0-5） */
export const BOOKING_CHANGE_DAYS = 4;

/** 1回の作成で作れる枠の上限（押し間違いで膨大な行を作らないための歯止め） */
export const SLOT_MAX_PER_PERIOD = 2000;

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

export type SlotPeriod = {
  id: string;
  /** 実施期間 */
  startDate: string;
  endDate: string;
  /** 曜日（0=日〜6=土・複数） */
  weekdays: number[];
  /** 時間帯 */
  fromTime: string;
  toTime: string;
  stepMinutes: SlotStep;
  /** 対象スタッフの userId（空＝対象なし。既定は全員を入れて作る） */
  staffIds: string[];
  /** 表示用の名前（院長が付ける。空なら期間の日付で表す） */
  label: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type Slot = {
  id: string;
  periodId: string;
  date: string;
  startTime: string;
  endTime: string;
  /** 院長がブロックした枠（スタッフには出さない） */
  blocked: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Booking = {
  id: string;
  slotId: string;
  periodId: string;
  userId: string;
  date: string;
  startTime: string;
  endTime: string;
  /** 197の「次回1on1の予定」の行id */
  scheduleId: string;
  /** 誰が入れたか（本人 or 院長の代わりの予約） */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type BookingNoticeKind = "booked" | "moved" | "canceled" | "released";

export type BookingNotice = {
  id: string;
  kind: BookingNoticeKind;
  /** 誰の予約か（表示用の氏名はサーバーが名簿から入れる） */
  userId: string;
  staffName: string;
  date: string;
  startTime: string;
  at: string;
};

// ─── id の作り方（決まった形にして重複と二重予約を防ぐ） ───

export function newPeriodId(now: number = Date.now()): string {
  return `sp-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 枠id。同じ期間・同じ日時なら必ず同じ */
export function slotId(periodId: string, date: string, startTime: string): string {
  return `slot-${periodId}-${date.replaceAll("-", "")}-${startTime.replace(":", "")}`;
}

/** 予約の行id。**枠1つにつき必ず1つ**＝主キーの一意制約が二重予約を防ぐ */
export function bookingId(slot: string): string {
  return `booking-${slot}`;
}

/** 197の予定の行id。期間とスタッフで固定＝枠を変えても予定の行は同じ（事前アンケートが引き継がれる） */
export function scheduleIdFor(periodId: string, userId: string): string {
  return `sch-${periodId}-${userId}`;
}

export function newNoticeId(now: number = Date.now()): string {
  return `bn-${now}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 時刻の計算 ───

/** "13:05" → 785（分） */
export function toMinutes(hm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hm);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 785 → "13:05" */
export function toHm(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function addMinutes(hm: string, add: number): string {
  return toHm(toMinutes(hm) + add);
}

/** その日の曜日（0=日） */
export function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay();
}

export function weekdayLabel(ymd: string): string {
  return WEEKDAY_LABELS[weekdayOf(ymd)];
}

/** "2026-10-20" → "10月20日（火）" */
export function formatDateW(ymd: string): string {
  if (!isYmd(ymd)) return ymd;
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEKDAY_LABELS[d.getUTCDay()]}）`;
}

/** 枠の表示（"13:15〜13:30"） */
export function slotTimeLabel(s: Pick<Slot, "startTime" | "endTime">): string {
  return `${s.startTime}〜${s.endTime}`;
}

// ─── 期間の検証と枠の組み立て ───

export type PeriodInput = {
  startDate: string;
  endDate: string;
  weekdays: number[];
  fromTime: string;
  toTime: string;
  stepMinutes: number;
  staffIds: string[];
  label: string;
};

/** 入力の検証。問題があればその文言、無ければ null */
export function validatePeriod(p: PeriodInput): string | null {
  if (!isYmd(p.startDate) || !isYmd(p.endDate)) return "実施期間の日付を入れてください";
  if (p.endDate < p.startDate) return "終了日は開始日より後にしてください";
  if (p.weekdays.length === 0) return "曜日を1つ以上選んでください";
  if (p.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "曜日が不正です";
  if (!isHm(p.fromTime) || !isHm(p.toTime)) return "時間帯を入れてください";
  if (toMinutes(p.fromTime) % 5 !== 0 || toMinutes(p.toTime) % 5 !== 0) {
    return "時間帯は5分単位で指定してください";
  }
  if (toMinutes(p.toTime) <= toMinutes(p.fromTime)) return "終了時刻は開始時刻より後にしてください";
  if (!isSlotStep(p.stepMinutes)) return "刻みは5・10・15・30分から選んでください";
  if (toMinutes(p.toTime) - toMinutes(p.fromTime) < p.stepMinutes) {
    return "時間帯が刻みより短いため、枠を作れません";
  }
  if (p.label.length > 100) return "名前が長すぎます（100文字まで）";
  return null;
}

/** その日の枠の時刻（終了時刻までに**終わる**ものだけ・205 §1-1） */
export function slotTimesOfDay(
  fromTime: string,
  toTime: string,
  stepMinutes: number
): { startTime: string; endTime: string }[] {
  const out: { startTime: string; endTime: string }[] = [];
  const from = toMinutes(fromTime);
  const to = toMinutes(toTime);
  if (from < 0 || to < 0 || stepMinutes <= 0) return out;
  for (let t = from; t + stepMinutes <= to; t += stepMinutes) {
    out.push({ startTime: toHm(t), endTime: toHm(t + stepMinutes) });
  }
  return out;
}

/** 期間の中で枠を作る日（曜日で絞る・日付の早い順） */
export function datesOfPeriod(p: Pick<PeriodInput, "startDate" | "endDate" | "weekdays">): string[] {
  const out: string[] = [];
  if (!isYmd(p.startDate) || !isYmd(p.endDate)) return out;
  const set = new Set(p.weekdays);
  let d = p.startDate;
  // 念のための上限（1年分）
  for (let i = 0; i < 400 && d <= p.endDate; i++) {
    if (set.has(weekdayOf(d))) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export type PlannedSlot = { date: string; startTime: string; endTime: string };

/** 作る枠の一覧（確認の表示にも、実際の作成にも同じこれを使う） */
export function planSlots(p: PeriodInput): PlannedSlot[] {
  const times = slotTimesOfDay(p.fromTime, p.toTime, p.stepMinutes);
  const out: PlannedSlot[] = [];
  for (const date of datesOfPeriod(p)) {
    for (const t of times) out.push({ date, ...t });
  }
  return out;
}

/** 作る前に見せるまとめ（205 §1-1「枠の数と最初・最後の枠」） */
export type SlotPlanSummary = {
  count: number;
  first: PlannedSlot | null;
  last: PlannedSlot | null;
  dates: number;
  perDay: number;
  tooMany: boolean;
};

export function summarizePlan(p: PeriodInput): SlotPlanSummary {
  const slots = planSlots(p);
  const perDay = slotTimesOfDay(p.fromTime, p.toTime, p.stepMinutes).length;
  return {
    count: slots.length,
    first: slots[0] ?? null,
    last: slots[slots.length - 1] ?? null,
    dates: datesOfPeriod(p).length,
    perDay,
    tooMany: slots.length > SLOT_MAX_PER_PERIOD,
  };
}

export function planSummaryText(s: SlotPlanSummary): string {
  if (s.count === 0) return "作れる枠がありません（曜日・時間帯・刻みを見直してください）";
  const first = s.first ? `${formatDateW(s.first.date)} ${s.first.startTime}〜${s.first.endTime}` : "";
  const last = s.last ? `${formatDateW(s.last.date)} ${s.last.startTime}〜${s.last.endTime}` : "";
  return `${s.dates}日ぶん・1日あたり${s.perDay}枠・あわせて${s.count}枠を作ります。最初は ${first}、最後は ${last} です。`;
}

// ─── 4日前の決まり（205 §0-5・§2） ───

/** スタッフが自分で動かせる最終日（実施日の4日前） */
export function bookingChangeDeadline(date: string): string {
  return addDays(date, -BOOKING_CHANGE_DAYS);
}

/** スタッフがその枠を自分で予約・変更・取り消しできるか（当日の23:59まで＝日付で比べる） */
export function canStaffChange(date: string, today: string): boolean {
  return today <= bookingChangeDeadline(date);
}

export const BOOKING_LOCKED_MESSAGE = "変更・取り消しは院長に伝えてください";
export const BOOKING_TAKEN_MESSAGE = "この枠は先に予約されました。別の枠を選んでください";
export const BOOKING_NONE_LEFT_MESSAGE = "予約できる枠がありません。院長に伝えてください";
export const BOOKING_PLEASE_MESSAGE = "1on1の予約をしてください";
export const BOOKING_REBOOK_MESSAGE = "1on1の日程の取り直しをお願いします";

// ─── 正規化（保存された値・送られてきた値を整える） ───

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function ids(v: unknown, max = 500): string[] {
  return Array.isArray(v)
    ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && !!x))).slice(0, max)
    : [];
}

export function normalizeSlotPeriod(id: string, raw: unknown): SlotPeriod | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (!isYmd(g.startDate) || !isYmd(g.endDate)) return null;
  const createdAt = str(g.createdAt, 64);
  return {
    id,
    startDate: g.startDate,
    endDate: g.endDate,
    weekdays: Array.isArray(g.weekdays)
      ? Array.from(new Set(g.weekdays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))).sort()
      : [],
    fromTime: isHm(g.fromTime) ? g.fromTime : DEFAULT_SLOT_FROM,
    toTime: isHm(g.toTime) ? g.toTime : DEFAULT_SLOT_TO,
    stepMinutes: isSlotStep(g.stepMinutes) ? g.stepMinutes : 15,
    staffIds: ids(g.staffIds),
    label: str(g.label, 100),
    createdBy: str(g.createdBy, 100),
    createdAt,
    updatedAt: str(g.updatedAt, 64) || createdAt,
  };
}

export function normalizeSlot(id: string, raw: unknown): Slot | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (!isYmd(g.date) || !isHm(g.startTime) || !isHm(g.endTime)) return null;
  const periodId = str(g.periodId, 100);
  if (!periodId) return null;
  const createdAt = str(g.createdAt, 64);
  return {
    id,
    periodId,
    date: g.date,
    startTime: g.startTime,
    endTime: g.endTime,
    blocked: g.blocked === true,
    createdAt,
    updatedAt: str(g.updatedAt, 64) || createdAt,
  };
}

export function normalizeBooking(id: string, raw: unknown): Booking | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const slot = str(g.slotId, 200);
  const userId = str(g.userId, 100);
  if (!slot || !userId || !isYmd(g.date) || !isHm(g.startTime)) return null;
  const createdAt = str(g.createdAt, 64);
  return {
    id,
    slotId: slot,
    periodId: str(g.periodId, 100),
    userId,
    date: g.date,
    startTime: g.startTime,
    endTime: isHm(g.endTime) ? g.endTime : g.startTime,
    scheduleId: str(g.scheduleId, 200),
    createdBy: str(g.createdBy, 100),
    createdAt,
    updatedAt: str(g.updatedAt, 64) || createdAt,
  };
}

export function normalizeBookingNotice(id: string, raw: unknown): BookingNotice | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const kind = g.kind;
  if (kind !== "booked" && kind !== "moved" && kind !== "canceled" && kind !== "released") return null;
  return {
    id,
    kind,
    userId: str(g.userId, 100),
    staffName: str(g.staffName, 100),
    date: isYmd(g.date) ? g.date : "",
    startTime: isHm(g.startTime) ? g.startTime : "",
    at: str(g.at, 64),
  };
}

/** 院長への知らせの文（氏名・日時・種類だけ。早さ・回数は数えない・205 §5） */
export function bookingNoticeText(n: BookingNotice): string {
  const when = n.date ? `${formatDateW(n.date)} ${n.startTime}` : "";
  switch (n.kind) {
    case "booked":
      return `${n.staffName}さんが ${when} に予約しました`;
    case "moved":
      return `${n.staffName}さんが ${when} に変更しました`;
    case "canceled":
      return `${n.staffName}さんが予約を取り消しました（${when}）`;
    case "released":
      return `${n.staffName}さんの予約（${when}）が枠の削除・ブロックで外れました`;
  }
}

// ─── 画面に出すための組み立て（純関数） ───

export type SlotView = Slot & {
  /** 予約が入っていれば、その予約 */
  booking: Booking | null;
  /** 表示用の氏名（院長の画面だけ） */
  staffName?: string;
  /** 過ぎた枠（操作できない） */
  past: boolean;
};

export function sortSlots<T extends Pick<Slot, "date" | "startTime">>(list: T[]): T[] {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

/** 日付ごとにまとめる（日付の早い順） */
export function groupByDate<T extends { date: string }>(list: T[]): { date: string; items: T[] }[] {
  const m = new Map<string, T[]>();
  for (const x of list) {
    const a = m.get(x.date) ?? [];
    a.push(x);
    m.set(x.date, a);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, items]) => ({ date, items }));
}

/** スタッフに出す空き枠（ブロック・予約済み・過去・4日前を過ぎた枠は出さない・205 §2） */
export function openSlotsForStaff(
  slots: Slot[],
  bookings: Booking[],
  today: string
): Slot[] {
  const taken = new Set(bookings.map((b) => b.slotId));
  return sortSlots(
    slots.filter(
      (s) => !s.blocked && !taken.has(s.id) && s.date >= today && canStaffChange(s.date, today)
    )
  );
}

/** その期間で予約していない対象スタッフ */
export function unbookedStaffIds(period: SlotPeriod, bookings: Booking[]): string[] {
  const booked = new Set(bookings.filter((b) => b.periodId === period.id).map((b) => b.userId));
  return period.staffIds.filter((id) => !booked.has(id));
}

/** 今日・明日の1on1（院長の画面の上部・205 §1-3） */
export function todayTomorrowBookings(bookings: Booking[], today: string): Booking[] {
  const tomorrow = addDays(today, 1);
  return sortSlots(bookings.filter((b) => b.date === today || b.date === tomorrow));
}
