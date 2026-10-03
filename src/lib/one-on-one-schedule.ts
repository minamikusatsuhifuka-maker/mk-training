// 次回1on1の予定と、事前アンケートの未回答の知らせ（指示書197 B-2・C）— 型と純粋関数
// クライアント・サーバーの両方から使う（"use client" のモジュールを import しないこと）。
//
// 【保存先】clinic_staff_growth の record_type = "schedule"（179のテーブル。SQL不要・RLS全拒否＋service-role）
//   登録できるのは院長と、そのスタッフの担当幹部（183・185の担当）だけ。書き分けはサーバー（API）で強制する。
//
// 【知らせの時点（C-1）】1on1の日を基準に、未回答なら
//   2週間前・1週間前 …「10月20日の1on1の事前アンケートをお願いします（10月17日まで）」
//   3日前（締切日）   …「本日が回答の締切です」
//   - 予定の登録がその時点より後なら、過ぎた時点の知らせは出さない（次の時点から出す）
//   - 回答を済ませたら、それ以降の知らせは出さない
//   - 締切を過ぎたら本人への知らせは止め、院長と担当者の画面に「未回答」と出す（C-3）

export const SCHEDULE_RECORD_TYPE = "schedule";

/** 回答の締切 = 1on1の何日前か（B-1） */
export const PRESURVEY_DEADLINE_DAYS = 3;
/** 知らせを出す時点（何日前か）。大きい順 */
export const PRESURVEY_ALERT_DAYS = [14, 7, 3] as const;

export type OneOnOneSchedule = {
  id: string;
  /** 1on1を受けるスタッフ */
  userId: string;
  /** 実施日 "YYYY-MM-DD" */
  date: string;
  /** 開始時刻 "HH:MM"（未定は空） */
  time: string;
  /** 担当者（1on1をする人） */
  partnerId: string;
  partnerName: string;
  /** 担当者が院長（管理者）か。表示を「院長と」にする */
  partnerIsDirector: boolean;
  /** 登録した人（userId） */
  createdById: string;
  /** 登録日 "YYYY-MM-DD"（JST）。「登録より前の時点の知らせは出さない」の判定に使う */
  registeredOn: string;
  createdAt: string;
  updatedAt: string;
};

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function isYmd(v: unknown): v is string {
  if (typeof v !== "string" || !YMD_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function isHm(v: unknown): v is string {
  return typeof v === "string" && HM_RE.test(v);
}

export function normalizeSchedule(id: string, raw: unknown): OneOnOneSchedule | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const userId = str(g.userId, 100);
  const partnerId = str(g.partnerId, 100);
  if (!userId || !partnerId || !isYmd(g.date)) return null;
  const createdAt = str(g.createdAt, 40);
  return {
    id,
    userId,
    date: g.date,
    time: isHm(g.time) ? g.time : "",
    partnerId,
    partnerName: str(g.partnerName, 100),
    partnerIsDirector: g.partnerIsDirector === true,
    createdById: str(g.createdById, 100),
    registeredOn: isYmd(g.registeredOn) ? g.registeredOn : createdAt.slice(0, 10),
    createdAt,
    updatedAt: str(g.updatedAt, 40) || createdAt,
  };
}

/** "YYYY-MM-DD" に日数を足す（UTCで計算・暦日のみ） */
export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 回答の締切日（1on1の3日前） */
export function presurveyDeadline(s: Pick<OneOnOneSchedule, "date">): string {
  return addDays(s.date, -PRESURVEY_DEADLINE_DAYS);
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** "2026-10-20" → "10月20日（火）" */
export function formatMonthDayW(ymd: string): string {
  if (!isYmd(ymd)) return ymd;
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEKDAYS[d.getUTCDay()]}）`;
}

/** "2026-10-20" → "10月20日" */
export function formatMonthDay(ymd: string): string {
  if (!isYmd(ymd)) return ymd;
  const d = new Date(`${ymd}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
}

/** 担当者の呼び方（院長なら「院長」） */
export function partnerLabel(s: Pick<OneOnOneSchedule, "partnerIsDirector" | "partnerName">): string {
  return s.partnerIsDirector ? "院長" : s.partnerName ? `${s.partnerName}さん` : "担当者";
}

/** 「10月20日（火）15:00　院長と」（B-2 本人の表示） */
export function formatScheduleLine(s: OneOnOneSchedule): string {
  return `${formatMonthDayW(s.date)}${s.time}　${partnerLabel(s)}と`;
}

/** これから（今日を含む）の予定だけ・日付の早い順 */
export function upcomingSchedules<T extends Pick<OneOnOneSchedule, "date" | "time">>(list: T[], today: string): T[] {
  return list
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

export type PresurveyAlertStage = "2w" | "1w" | "deadline";

export type PresurveyAlert = {
  scheduleId: string;
  stage: PresurveyAlertStage;
  /** 1on1の日 */
  date: string;
  /** 締切日 */
  deadline: string;
  message: string;
};

/**
 * 本人に出す知らせ（C-1）。出さないときは null。
 * - 回答済み → null
 * - 今日が「いずれかの時点 ≦ 今日 ≦ 締切日」で、その時点が登録日以後 → 最も新しい時点の知らせ
 */
export function presurveyAlertFor(
  s: OneOnOneSchedule,
  today: string,
  answered: boolean
): PresurveyAlert | null {
  if (answered) return null;
  const deadline = presurveyDeadline(s);
  if (today > deadline) return null;
  let stage: PresurveyAlertStage | null = null;
  for (const days of PRESURVEY_ALERT_DAYS) {
    const point = addDays(s.date, -days);
    if (point > today) continue; // まだその時点が来ていない
    if (s.registeredOn && point < s.registeredOn) continue; // 登録より前の時点は出さない
    stage = days === 14 ? "2w" : days === 7 ? "1w" : "deadline";
  }
  if (!stage) return null;
  const message =
    stage === "deadline"
      ? `本日が回答の締切です（${formatMonthDay(s.date)}の1on1の事前アンケート）`
      : `${formatMonthDay(s.date)}の1on1の事前アンケートをお願いします（${formatMonthDay(deadline)}まで）`;
  return { scheduleId: s.id, stage, date: s.date, deadline, message };
}

export type ScheduleAnswerState = "answered" | "waiting" | "overdue";

/**
 * 院長・担当者の画面に出す回答の状態（C-3）。
 * 締切（3日前）を過ぎて未回答なら overdue（当日の1on1は予定どおり行える）。
 */
export function scheduleAnswerState(s: OneOnOneSchedule, today: string, answered: boolean): ScheduleAnswerState {
  if (answered) return "answered";
  return today > presurveyDeadline(s) ? "overdue" : "waiting";
}

export const SCHEDULE_ANSWER_LABEL: Record<ScheduleAnswerState, string> = {
  answered: "事前アンケート 回答済み",
  waiting: "事前アンケート 回答待ち",
  overdue: "事前アンケート 未回答",
};

/**
 * その予定の事前アンケートが答えられているか。
 * 予定から回答した回（scheduleId が一致）か、同じ日・同じ相手で本人が自分で作った回を回答済みとみなす。
 */
export function isScheduleAnswered(
  s: Pick<OneOnOneSchedule, "id" | "date" | "partnerId">,
  presurveys: { scheduleId?: string; heldOn: string; participantIds: string[]; submittedAt: string }[]
): boolean {
  return presurveys.some(
    (p) =>
      !!p.submittedAt &&
      (p.scheduleId === s.id || (p.heldOn === s.date && p.participantIds.includes(s.partnerId)))
  );
}

/** API が返す予定（回答の状態つき）。本文は含まない */
export type ScheduleView = OneOnOneSchedule & {
  answered: boolean;
  state: ScheduleAnswerState;
  /** 本人向けの知らせ（院長・担当者向けの応答では null） */
  alert: PresurveyAlert | null;
  /** 担当者向け: スタッフの名前 */
  staffName?: string;
  /** カルテ向け: この人が変更・削除できるか */
  editable?: boolean;
};
