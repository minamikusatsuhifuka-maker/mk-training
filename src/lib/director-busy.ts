// 院長のGoogleカレンダーの「予定あり」で1on1の枠をふさぐ（指示書245）— 純関数・依存なし
// 依存なし（"@/" を使わない）＝ node --experimental-strip-types で直接確かめられる。
//
// 【ふさぐ予定（245 §1）】
//   Googleカレンダーで「予定あり」になっている予定だけ。「空き時間」（transparency = "transparent"）ではふさがない。
//   終日の予定はふつう「空き時間」なので、ふさがない（院長が「予定あり」にした終日の予定はふさぐ）。
//   「非公開」の予定も、「予定あり」ならふさぐ（visibility は見ない）。
//   取り消された予定（status = "cancelled"）と、院長が「いいえ」と答えた招待はふさがない。
// 【重なり】枠の時間と少しでも重なればふさぐ（ちょうど境目で接するだけは重ならない）。
// 時刻はすべて JST。枠は "YYYY-MM-DD" と "HH:mm"。

export type BusyInterval = {
  /** ISO（例 2026-10-20T14:00:00+09:00）。終日は JST 0時 */
  start: string;
  /** ISO（含まない）。終日は最後の日の翌日の JST 0時 */
  end: string;
  /** 題名（院長の画面だけで出す。非公開などで読めないときは空） */
  title: string;
  allDay: boolean;
};

/** 最後に読めた結果を使ってよい長さ（245 §4） */
export const BUSY_STALE_MS = 24 * 60 * 60 * 1000;
/** 画面の読み込みは、この間なら前の結果を使う（245 §2：数分） */
export const BUSY_TTL_MS = 5 * 60 * 1000;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});

/** 終日の日付 → その日の JST 0時 */
export function jstMidnightIso(ymd: string): string {
  return `${ymd}T00:00:00+09:00`;
}

/** Googleカレンダーの予定（events.list の items）から、ふさぐ予定だけを取り出す */
export function busyIntervalsFromItems(items: unknown[]): BusyInterval[] {
  const out: BusyInterval[] = [];
  for (const raw of items) {
    const it = rec(raw);
    if (str(it.status) === "cancelled") continue;
    // 「空き時間」はふさがない（既定は「予定あり」= opaque で、項目そのものが無い）
    if (str(it.transparency) === "transparent") continue;
    // 院長が「いいえ」と答えた招待はふさがない
    const attendees = Array.isArray(it.attendees) ? it.attendees : [];
    if (attendees.some((a) => rec(a).self === true && str(rec(a).responseStatus) === "declined")) continue;
    const s = rec(it.start);
    const e = rec(it.end);
    const sDate = str(s.date);
    const eDate = str(e.date);
    const allDay = YMD_RE.test(sDate);
    const start = allDay ? jstMidnightIso(sDate) : str(s.dateTime);
    const end = allDay ? (YMD_RE.test(eDate) ? jstMidnightIso(eDate) : "") : str(e.dateTime);
    const sMs = Date.parse(start);
    const eMs = Date.parse(end);
    if (!Number.isFinite(sMs) || !Number.isFinite(eMs) || eMs <= sMs) continue;
    out.push({ start, end, title: str(it.summary), allDay });
  }
  return out;
}

/** 枠の時間（JST）をミリ秒で */
export function slotRangeMs(date: string, startTime: string, endTime: string): [number, number] {
  return [Date.parse(`${date}T${startTime}:00+09:00`), Date.parse(`${date}T${endTime}:00+09:00`)];
}

/** 枠と少しでも重なる予定 */
export function overlapsOf(
  busy: BusyInterval[],
  slot: { date: string; startTime: string; endTime: string }
): BusyInterval[] {
  const [s, e] = slotRangeMs(slot.date, slot.startTime, slot.endTime);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return [];
  return busy.filter((b) => Date.parse(b.start) < e && Date.parse(b.end) > s);
}

/** 院長の画面に出す時刻「10/20 14:00〜16:00」「10/20 終日」（JST） */
export function formatBusyTime(b: BusyInterval): string {
  const md = (ms: number) => {
    const d = new Date(ms + 9 * 3600 * 1000);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };
  const hm = (ms: number) => {
    const d = new Date(ms + 9 * 3600 * 1000);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  };
  const s = Date.parse(b.start);
  const e = Date.parse(b.end);
  if (b.allDay) {
    const last = e - 24 * 3600 * 1000;
    return md(last) === md(s) ? `${md(s)} 終日` : `${md(s)}〜${md(last)} 終日`;
  }
  // 同じ日のうちに終わる（ちょうど0時に終わるものも含む）なら日付は1つだけ
  return md(s) === md(e) || (hm(e) === "00:00" && e - s <= 24 * 3600 * 1000)
    ? `${md(s)} ${hm(s)}〜${hm(e)}`
    : `${md(s)} ${hm(s)}〜${md(e)} ${hm(e)}`;
}
