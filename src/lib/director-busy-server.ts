// 院長のGoogleカレンダーの「予定あり」で1on1の枠をふさぐ（指示書245）— サーバー専用
//
// 【スイッチ】director_calendar_busy（既定OFF）。OFFの間は何もしない（今までどおり）。
// 【カレンダー】243でつないだ院長のカレンダー（環境変数 GOOGLE_DIRECTOR_CALENDAR_ID・院内カレンダーと同じサービスアカウント）。
// 【枠は消さない（245 §2）】そのときのGoogleカレンダーを見て、予約できるかどうかを決める。
//   ・画面の読み込み：5分は前の結果を使う（BUSY_TTL_MS）
//   ・予約する瞬間：その枠の時間だけ、新しく読む（freshSlotCheck）
// 【読めないとき（245 §4）】
//   最後に読めた結果（24時間以内）があれば使う（status "stale"）。
//   それもなければ status "unknown"＝ふさがない（予約は受け付ける）。院長の画面に「⚠」を出す。
//   最後に読めた結果は、このサーバーの中（メモリ）と、既存の clinic_staff_growth の1行に置く
//   （サーバーが入れ替わっても使えるように）。**表に置くのは時刻だけ**（題名は置かない）。新しい表・SQLは無い。
//
// クライアントから import しないこと。

import { GROWTH_TABLE, serverFeatureEnabled, type GrowthAdminClient } from "./staff-growth-server";
import { fetchCalendarItemsBetween, loadCalendarConfig, loadDirectorCalendarId } from "./google-calendar";
import {
  BUSY_STALE_MS,
  BUSY_TTL_MS,
  busyIntervalsFromItems,
  jstMidnightIso,
  overlapsOf,
  type BusyInterval,
} from "./director-busy";
import { addDays } from "./calendar-views";

export const DIRECTOR_BUSY_FLAG = "director_calendar_busy";
const SNAPSHOT_TYPE = "director_gcal_busy";
const SNAPSHOT_ID = "director-gcal-busy";

/** off＝スイッチOFF／ok＝読めた／stale＝読めず、24時間以内の結果を使った／unknown＝確かめられない */
export type BusyStatus = "off" | "ok" | "stale" | "unknown";
export type BusyCheck = { status: BusyStatus; intervals: BusyInterval[]; checkedAt: string };

/** "YYYY-MM-DD" の範囲（両端を含む）で読んだ結果 */
type Snapshot = { from: string; to: string; intervals: BusyInterval[]; at: number };

let memory: Snapshot | null = null;
let inFlight: { key: string; p: Promise<Snapshot> } | null = null;

export async function directorBusyEnabled(): Promise<boolean> {
  return serverFeatureEnabled(DIRECTOR_BUSY_FLAG);
}

const covers = (s: Snapshot | null, from: string, to: string): s is Snapshot =>
  !!s && s.from <= from && s.to >= to;

/** Googleから読む（未設定・失敗は throw） */
async function fetchBusy(timeMin: string, timeMax: string): Promise<BusyInterval[]> {
  const { config } = loadCalendarConfig();
  const calendarId = loadDirectorCalendarId();
  if (!config || !calendarId) throw new Error("院長のGoogleカレンダーが設定されていません");
  return busyIntervalsFromItems(await fetchCalendarItemsBetween(config, calendarId, timeMin, timeMax));
}

async function readStoredSnapshot(admin: GrowthAdminClient): Promise<Snapshot | null> {
  try {
    const { data } = await admin.from(GROWTH_TABLE).select("data").eq("id", SNAPSHOT_ID).eq("record_type", SNAPSHOT_TYPE).maybeSingle();
    const d = (data as { data?: unknown } | null)?.data as Record<string, unknown> | undefined;
    if (!d || typeof d.from !== "string" || typeof d.to !== "string" || typeof d.at !== "number" || !Array.isArray(d.intervals)) return null;
    const intervals = d.intervals
      .map((x) => x as Record<string, unknown>)
      .filter((x) => typeof x.start === "string" && typeof x.end === "string")
      .map((x) => ({ start: String(x.start), end: String(x.end), title: "", allDay: x.allDay === true }));
    return { from: d.from, to: d.to, at: d.at, intervals };
  } catch {
    return null;
  }
}

async function storeSnapshot(admin: GrowthAdminClient, s: Snapshot): Promise<void> {
  try {
    await admin.from(GROWTH_TABLE).upsert({
      id: SNAPSHOT_ID,
      record_type: SNAPSHOT_TYPE,
      // 題名は置かない（時刻だけ）
      data: { from: s.from, to: s.to, at: s.at, intervals: s.intervals.map(({ start, end, allDay }) => ({ start, end, allDay })) },
      updated_by: "system",
      updated_at: new Date(s.at).toISOString(),
    });
  } catch {
    /* 置けなくても、今回の判定には使える */
  }
}

/** 読めなかったとき：24時間以内の結果（メモリ → 表の順）。範囲が足りなければ使わない */
async function staleFor(admin: GrowthAdminClient, from: string, to: string): Promise<Snapshot | null> {
  const fresh = (s: Snapshot | null) => covers(s, from, to) && Date.now() - s.at < BUSY_STALE_MS;
  if (fresh(memory)) return memory;
  const stored = await readStoredSnapshot(admin);
  return fresh(stored) ? stored : null;
}

const result = (status: BusyStatus, s: Snapshot | null): BusyCheck => ({
  status,
  intervals: s?.intervals ?? [],
  checkedAt: s ? new Date(s.at).toISOString() : "",
});

/**
 * 画面の読み込み用：from〜to（"YYYY-MM-DD"・両端を含む）の院長の「予定あり」。
 * 5分は前の結果を使う。スイッチOFFなら status "off"（何もふさがない）。
 */
export async function loadDirectorBusy(admin: GrowthAdminClient, from: string, to: string): Promise<BusyCheck> {
  if (!(await directorBusyEnabled())) return result("off", null);
  if (to < from) to = from;
  if (covers(memory, from, to) && Date.now() - memory.at < BUSY_TTL_MS) return result("ok", memory);
  const key = `${from}~${to}`;
  try {
    if (!inFlight || inFlight.key !== key) {
      const p = (async () => {
        const intervals = await fetchBusy(jstMidnightIso(from), jstMidnightIso(addDays(to, 1)));
        const snap: Snapshot = { from, to, intervals, at: Date.now() };
        memory = snap;
        await storeSnapshot(admin, snap);
        return snap;
      })();
      inFlight = { key, p };
      p.finally(() => {
        if (inFlight?.p === p) inFlight = null;
      }).catch(() => {});
    }
    return result("ok", await inFlight.p);
  } catch {
    const stale = await staleFor(admin, from, to);
    return stale ? result("stale", stale) : result("unknown", null);
  }
}

/**
 * 予約する瞬間の確かめ（245 §2）：その枠の時間だけ、新しく読む。
 * 重なる「予定あり」があれば true。読めなければ24時間以内の結果で判定し、それも無ければ false（受け付ける）。
 */
export async function directorGcalBusyForSlot(
  admin: GrowthAdminClient,
  slot: { date: string; startTime: string; endTime: string }
): Promise<boolean> {
  if (!(await directorBusyEnabled())) return false;
  try {
    const intervals = await fetchBusy(`${slot.date}T${slot.startTime}:00+09:00`, `${slot.date}T${slot.endTime}:00+09:00`);
    return overlapsOf(intervals, slot).length > 0;
  } catch {
    const stale = await staleFor(admin, slot.date, slot.date);
    return stale ? overlapsOf(stale.intervals, slot).length > 0 : false;
  }
}
