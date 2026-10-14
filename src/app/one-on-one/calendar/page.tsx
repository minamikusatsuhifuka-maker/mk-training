"use client";

// 🗓 1on1カレンダー（指示書240・機能ID one_on_one_calendar）
// - いつ・誰が1on1をするかを、ログインしたスタッフ全員に。1件ごとに出すのは「時刻」と「スタッフの名前」だけ
// - 出すもとは「🗓 1on1の日程」で確定している予約（/api/one-on-one/calendar・判定はサーバー）
// - 見た目と使い方は「🗓 院内カレンダー」（/calendar）にそろえる：📋 リスト／🗓 月表示・🔄 再読み込み・月表示は今月と翌月を並べる。
//   月表示は ◀ ▶ で月を送れる。選んだ表示は localStorage "mk_1on1_calendar_view" に記憶（院内カレンダーと同じ流儀）
// - 見出しの下に説明文は付けない（240 §1）
// - 243: 📅 週表示・月表示の「大きく」・日付を押すとその日の予定を全部（院内カレンダーと同じ部品）。院長のGoogleカレンダーは出さない

import { useCallback, useEffect, useState } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { jstTodayYmd } from "@/lib/library";
import { addDays, addMonths, weekStartOf } from "@/lib/calendar-views";
import {
  BigToggle,
  DayDetail,
  ListView,
  MonthGrid,
  ViewSwitch,
  WeekNav,
  WeekView,
  groupByYmd,
  useStoredChoice,
  type CalItem,
  type CalView,
} from "@/components/calendar/CalendarViews";

type Entry = { id: string; date: string; startTime: string; endTime: string; name: string };
type LoadState = "loading" | "ready" | "unavailable";

const VIEW_LS_KEY = "mk_1on1_calendar_view";
const BIG_LS_KEY = "mk_1on1_calendar_big"; // 243: 月表示の「大きく」
const VIEWS: readonly CalView[] = ["list", "month", "week"];
const ON_OFF = ["on", "off"] as const;

// 1件 = 時刻（13:30-13:45）＋名前だけ
const toItem = (e: Entry): CalItem => ({ id: e.id, ymd: e.date, time: `${e.startTime}-${e.endTime}`, title: e.name });

function OneOnOneCalendarBody() {
  const [state, setState] = useState<LoadState>("loading");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [today, setToday] = useState(jstTodayYmd());
  const [reloading, setReloading] = useState(false);
  const [view, setView] = useStoredChoice<CalView>(VIEW_LS_KEY, VIEWS, "month");
  const [big, setBig] = useStoredChoice(BIG_LS_KEY, ON_OFF, "off");
  const [offset, setOffset] = useState(0);
  const [weekSunday, setWeekSunday] = useState<string | null>(null);
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);

  const load = useCallback(async (isReload: boolean) => {
    if (isReload) setReloading(true);
    try {
      const res = await fetch("/api/one-on-one/calendar", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) {
        setState("unavailable");
        return;
      }
      const j = (await res.json()) as { entries?: Entry[]; today?: string };
      setEntries(Array.isArray(j.entries) ? j.entries : []);
      if (typeof j.today === "string" && j.today) setToday(j.today);
      setState("ready");
    } catch {
      setState("unavailable");
    } finally {
      if (isReload) setReloading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load(false);
    })();
  }, [load]);

  if (state === "loading") {
    return <p className="text-sm text-gray-500 py-16 text-center animate-pulse">読み込んでいます…</p>;
  }
  if (state === "unavailable") {
    return <p className="text-sm text-gray-600 py-16 text-center">読み込めませんでした</p>;
  }

  const byYmd = groupByYmd(entries.map(toItem));
  // リストは今日以降（院内カレンダーと同じ）
  const groups = Array.from(byYmd.keys())
    .filter((ymd) => ymd >= today)
    .sort()
    .map((ymd) => ({ ymd, items: byYmd.get(ymd)! }));
  const base = addMonths(Number(today.slice(0, 4)), Number(today.slice(5, 7)), offset);
  const months = [base, addMonths(base.y, base.m, 1)];
  const sunday = weekSunday ?? weekStartOf(today);

  const dayDetail = selectedYmd ? (
    <DayDetail ymd={selectedYmd} today={today} items={byYmd.get(selectedYmd) ?? []} onClose={() => setSelectedYmd(null)} />
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <ViewSwitch view={view} onChange={setView} />
        {view === "month" && (
          <>
            <BigToggle on={big === "on"} onChange={(v) => setBig(v ? "on" : "off")} />
            <div className="flex rounded-full border border-gray-200 overflow-hidden text-sm">
              <button type="button" onClick={() => setOffset((o) => o - 1)} className="px-3 py-2 text-gray-600 hover:bg-gray-50" aria-label="前の月" data-1on1-prev>
                ◀
              </button>
              <button type="button" onClick={() => setOffset((o) => o + 1)} className="px-3 py-2 text-gray-600 hover:bg-gray-50" aria-label="次の月" data-1on1-next>
                ▶
              </button>
            </div>
          </>
        )}
        {view === "week" && (
          <WeekNav onPrev={() => setWeekSunday(addDays(sunday, -7))} onNext={() => setWeekSunday(addDays(sunday, 7))} onToday={() => setWeekSunday(null)} />
        )}
        <button
          type="button"
          onClick={() => load(true)}
          disabled={reloading}
          className="text-sm px-3 py-2 border border-gray-200 rounded-full hover:bg-gray-50 disabled:opacity-50 shrink-0"
        >
          {reloading ? "更新中…" : "🔄 再読み込み"}
        </button>
      </div>

      {view === "list" ? (
        groups.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-12">予定はありません。</p>
        ) : (
          <ListView groups={groups} today={today} />
        )
      ) : view === "week" ? (
        <WeekView sunday={sunday} today={today} byYmd={byYmd} />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 xl:gap-6">
          {months.map(({ y, m }) => (
            <div key={`${y}-${m}`} className="space-y-4">
              <MonthGrid
                year={y}
                month={m}
                today={today}
                byYmd={byYmd}
                selectedYmd={selectedYmd}
                big={big === "on"}
                onSelect={(ymd) => setSelectedYmd((prev) => (prev === ymd ? null : ymd))}
              />
              {selectedYmd && Number(selectedYmd.slice(0, 4)) === y && Number(selectedYmd.slice(5, 7)) === m && (
                <div className="xl:hidden">{dayDetail}</div>
              )}
            </div>
          ))}
          {dayDetail && <div className="hidden xl:block xl:col-span-2">{dayDetail}</div>}
        </div>
      )}
    </div>
  );
}

export default function OneOnOneCalendarPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl xl:max-w-6xl mx-auto space-y-6">
      <NavPageHeader navKey="/one-on-one/calendar" title="🗓 1on1カレンダー" />
      <FeatureGate feature="one_on_one_calendar">
        <OneOnOneCalendarBody />
      </FeatureGate>
    </div>
  );
}
