// 事前アンケートの「年」「半期」の区切り（指示書204 §2）— 純関数
//
// 1-4（1年後）・1-5（今期末）の問いに、区切りの日付を自動で表示するための計算。
//
// 【区切りの出どころ】
// 育成カルテ自体には年度・半期の定義が無い。クリニックで1つだけ決まっている年度の定義
// （「クリニックの歩み」の `fiscalStartMonth`・既定は6月始まり＝ clinic-metrics-core）を使う。
// 院長がそこを変えれば、この表示も一緒に変わる。
//
// 半期は年度を前半6か月・後半6か月に分ける（上期／下期）。

import { DEFAULT_FISCAL_START_MONTH } from "./clinic-metrics-core";

export { DEFAULT_FISCAL_START_MONTH };

export type PresurveyPeriods = {
  /** 年度の始まりの月（1〜12） */
  startMonth: number;
  /** 年度の始まりの日 YYYY-MM-DD */
  annualStart: string;
  /** 年度の終わりの日 YYYY-MM-DD */
  annualEnd: string;
  /** いまの半期の始まりの日 */
  halfStart: string;
  /** いまの半期の終わりの日 */
  halfEnd: string;
  /** 「上期」／「下期」 */
  halfLabel: string;
};

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** その年月の末日 */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 月を足す（年をまたぐ） */
function addMonths(y: number, m: number, add: number): { y: number; m: number } {
  const total = (y * 12 + (m - 1)) + add;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

/**
 * 今日（YYYY-MM-DD）が属する年度・半期の区切りを返す。
 * startMonth が範囲外なら既定（6月）に倒す。
 */
export function presurveyPeriods(
  today: string,
  startMonth: number = DEFAULT_FISCAL_START_MONTH
): PresurveyPeriods {
  const sm =
    Number.isInteger(startMonth) && startMonth >= 1 && startMonth <= 12
      ? startMonth
      : DEFAULT_FISCAL_START_MONTH;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  const now = m
    ? { y: Number(m[1]), m: Number(m[2]) }
    : { y: new Date().getUTCFullYear(), m: new Date().getUTCMonth() + 1 };

  // 年度の始まりの年
  const startYear = now.m >= sm ? now.y : now.y - 1;
  const annualStart = ymd(startYear, sm, 1);
  const endMonth = addMonths(startYear, sm, 11);
  const annualEnd = ymd(endMonth.y, endMonth.m, lastDayOfMonth(endMonth.y, endMonth.m));

  // いまが上期（0〜5か月目）か下期（6〜11か月目）か
  const offset = (now.m - sm + 12) % 12;
  const half = offset < 6 ? 0 : 1;
  const hs = addMonths(startYear, sm, half * 6);
  const he = addMonths(startYear, sm, half * 6 + 5);
  return {
    startMonth: sm,
    annualStart,
    annualEnd,
    halfStart: ymd(hs.y, hs.m, 1),
    halfEnd: ymd(he.y, he.m, lastDayOfMonth(he.y, he.m)),
    halfLabel: half === 0 ? "上期" : "下期",
  };
}

/** "2027-05-31" → "2027年5月31日" */
export function formatJpDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
}

/** 1-4（年）の添え書き（区切りの日付） */
export function annualPeriodNote(p: PresurveyPeriods): string {
  return `いまの年度は ${formatJpDate(p.annualStart)}〜${formatJpDate(p.annualEnd)} です（年度末：${formatJpDate(p.annualEnd)}）。`;
}

/** 1-5（半期）の添え書き（区切りの日付） */
export function halfPeriodNote(p: PresurveyPeriods): string {
  return `いまは${p.halfLabel}（${formatJpDate(p.halfStart)}〜${formatJpDate(p.halfEnd)}）です（今期末：${formatJpDate(p.halfEnd)}）。`;
}
