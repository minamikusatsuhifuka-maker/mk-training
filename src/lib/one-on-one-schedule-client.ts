// 自分に関係する1on1の予定の取得（指示書197 B-2・C）— クライアント専用
// ホームの知らせ・メニューの印・マイ成長記録・事前アンケート・1on1画面が同じ応答を使うので、
// 1回の画面表示で何度も取りに行かないよう、短い間だけ共有する（30秒）。
// 回答を保存したら invalidateMySchedules() で取り直す（知らせをすぐ消すため）。

import { useEffect, useState } from "react";
import type { ScheduleView } from "./one-on-one-schedule";

export type MySchedulesResponse = {
  mine: ScheduleView[];
  partner: ScheduleView[];
  alertsEnabled: boolean;
  today: string;
};

const EMPTY: MySchedulesResponse = { mine: [], partner: [], alertsEnabled: false, today: "" };
const TTL_MS = 30_000;

let cache: { at: number; promise: Promise<MySchedulesResponse> } | null = null;
const listeners = new Set<(r: MySchedulesResponse) => void>();

export function fetchMySchedules(force = false): Promise<MySchedulesResponse> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.promise;
  const promise = fetch("/api/one-on-one/schedule", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<Partial<MySchedulesResponse>>) : ({} as Partial<MySchedulesResponse>)))
    .then((j): MySchedulesResponse => ({
      mine: Array.isArray(j.mine) ? j.mine : [],
      partner: Array.isArray(j.partner) ? j.partner : [],
      alertsEnabled: j.alertsEnabled === true,
      today: typeof j.today === "string" ? j.today : "",
    }))
    .catch(() => EMPTY);
  cache = { at: Date.now(), promise };
  return promise;
}

/** 取り直して、表示中の部品（知らせ・印）にも配る */
export async function invalidateMySchedules(): Promise<void> {
  const r = await fetchMySchedules(true);
  for (const fn of listeners) fn(r);
}

export function useMySchedules(): MySchedulesResponse | null {
  const [data, setData] = useState<MySchedulesResponse | null>(null);
  useEffect(() => {
    let alive = true;
    const on = (r: MySchedulesResponse) => {
      if (alive) setData(r);
    };
    listeners.add(on);
    void fetchMySchedules().then(on);
    return () => {
      alive = false;
      listeners.delete(on);
    };
  }, []);
  return data;
}

/** 本人に出ている知らせ（機能フラグOFFなら出さない） */
export function activeAlerts(r: MySchedulesResponse | null): NonNullable<ScheduleView["alert"]>[] {
  if (!r || !r.alertsEnabled) return [];
  return r.mine.map((s) => s.alert).filter((a): a is NonNullable<ScheduleView["alert"]> => !!a);
}

/**
 * 205 §4: 本人に出ている「1on1の予定」の知らせ（前日・当日）。
 * 事前アンケートの提出とは関係なく出る（提出していても出す）。
 * 機能フラグ（1on1の日程調整）がOFFのときはサーバーが入れてこない。
 */
export function activeReminders(
  r: MySchedulesResponse | null
): NonNullable<NonNullable<ScheduleView["reminder"]>>[] {
  if (!r) return [];
  return r.mine
    .map((s) => s.reminder)
    .filter((x): x is NonNullable<NonNullable<ScheduleView["reminder"]>> => !!x);
}
