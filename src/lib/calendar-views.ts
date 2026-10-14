// 院内カレンダー・1on1カレンダーの表示の計算（指示書243）— 純関数・依存なし
// 日付はすべて "YYYY-MM-DD"（JST の暦日）。TZ に依存させないため、ymd 文字列と UTC の組み立てだけを使う。
// 依存なし（"@/" を使わない）＝ node --experimental-strip-types で直接確かめられる。

export const WEEKDAY_HEADERS = ["日", "月", "火", "水", "木", "金", "土"] as const;

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtc(ymd: string): Date | null {
  const m = ymd.match(YMD_RE);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
const fromUtc = (d: Date) => d.toISOString().slice(0, 10);

/** ymd に日数を足す（マイナスも可） */
export function addDays(ymd: string, n: number): string {
  const d = toUtc(ymd);
  if (!d) return ymd;
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** その日を含む週の日曜（週は日曜から・月表示と同じ） */
export function weekStartOf(ymd: string): string {
  const d = toUtc(ymd);
  if (!d) return ymd;
  return addDays(ymd, -d.getUTCDay());
}

/** 日曜から7日 */
export function weekDays(sunday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

/** 日付見出し「7/29（水）」 */
export function formatDayHeading(ymd: string): string {
  const d = toUtc(ymd);
  if (!d) return ymd;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WEEKDAY_HEADERS[d.getUTCDay()]}）`;
}

/** 週の見出し「10/11〜10/17」（年が変わるときは年も付ける） */
export function formatWeekRange(sunday: string): string {
  const sat = addDays(sunday, 6);
  const f = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
  const y1 = sunday.slice(0, 4);
  const y2 = sat.slice(0, 4);
  return y1 === y2 ? `${y1}年 ${f(sunday)}〜${f(sat)}` : `${y1}年 ${f(sunday)}〜${y2}年 ${f(sat)}`;
}

/** 月グリッド（日曜始まり）。null = 前後の月の埋めのマス */
export function buildMonthWeeks(year: number, month: number): (string | null)[][] {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function addMonths(y: number, m: number, add: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + add;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** その月の末日 */
export function lastDayOfMonth(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

/**
 * 院内カレンダーで Google から読む期間（243）。週表示で前後へ送れるよう、
 * 先月1日 〜 翌々月末（月表示・リストは今までどおり「今月と翌月」）。
 * to は「この日まで」（含む）。
 */
export function clinicCalendarRange(today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const prev = addMonths(y, m, -1);
  const last = addMonths(y, m, 2);
  return { from: `${prev.y}-${String(prev.m).padStart(2, "0")}-01`, to: lastDayOfMonth(last.y, last.m) };
}

/** 週がデータの期間に少しでも入るか（入らない週へは送らない） */
export function weekOverlaps(sunday: string, range: { from: string; to: string } | null): boolean {
  if (!range) return true;
  return addDays(sunday, 6) >= range.from && sunday <= range.to;
}
