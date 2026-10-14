"use client";

// 院内カレンダー・1on1カレンダーで共通の表示の部品（指示書243）
// - 📋 リスト／🗓 月表示／📅 週表示 の切り替え、月表示の「大きく」、日付を押したときのその日の予定、週表示
// - 1件 = 時刻＋題名（院内カレンダーは場所も）。tone="director" は院長の予定（色を変える）
// - 「大きく」と表示の選択は、そのブラウザで覚える（読み書きに失敗しても画面は正しく出る）

import { useEffect, useState } from "react";
import { WEEKDAY_HEADERS, buildMonthWeeks, formatDayHeading, formatWeekRange, weekDays } from "@/lib/calendar-views";

export type CalItem = {
  id: string;
  /** JST の暦日 "YYYY-MM-DD" */
  ymd: string;
  /** 時刻（例「10:00〜11:30」「13:30-13:45」）。終日は空で allDay */
  time: string;
  allDay?: boolean;
  title: string;
  location?: string;
  /** 院長の予定（243） */
  tone?: "director";
};

export type CalView = "list" | "month" | "week";

/** 色の見本の呼び名（院長の言葉） */
export const DIRECTOR_LABEL = "院長の予定";

/** その日の並び：終日 → 時刻の順（同じ時刻は元の順） */
export function sortDay(items: CalItem[]): CalItem[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => Number(!a.it.allDay) - Number(!b.it.allDay) || a.it.time.localeCompare(b.it.time) || a.i - b.i)
    .map((x) => x.it);
}

export function groupByYmd(items: CalItem[]): Map<string, CalItem[]> {
  const m = new Map<string, CalItem[]>();
  for (const it of items) {
    if (!m.has(it.ymd)) m.set(it.ymd, []);
    m.get(it.ymd)!.push(it);
  }
  for (const [k, v] of m) m.set(k, sortDay(v));
  return m;
}

/** localStorage に覚える値（読むのは画面を出したあと・失敗しても既定のまま） */
export function useStoredChoice<T extends string>(key: string, allowed: readonly T[], initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      try {
        const s = localStorage.getItem(key) as T | null;
        if (alive && s && allowed.includes(s)) setV(s);
      } catch {
        /* 既定のまま */
      }
    });
    return () => {
      alive = false;
    };
    // allowed は呼び出し側の定数
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = (next: T) => {
    setV(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* 覚えられなくても切り替えは有効 */
    }
  };
  return [v, set];
}

const chipCls = (it: CalItem) =>
  it.tone === "director" ? "bg-violet-100 text-violet-900 border border-violet-200" : "bg-teal-50 text-teal-800";
const dotCls = (it: CalItem) => (it.tone === "director" ? "bg-violet-500" : "bg-teal-500");
const timeLabel = (it: CalItem) => (it.allDay ? "終日" : it.time);

/** 1件（リスト・日付を押したとき） */
export function ItemRow({ it }: { it: CalItem }) {
  const director = it.tone === "director";
  return (
    <li
      className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${director ? "bg-violet-50 border-violet-200" : "bg-gray-50/60 border-gray-100"}`}
      data-cal-item={director ? "director" : "clinic"}
    >
      {it.allDay ? (
        <span className="text-[10px] font-medium bg-sky-100 text-sky-800 rounded-full px-2 py-0.5 shrink-0 mt-0.5">終日</span>
      ) : (
        <span className="text-xs text-gray-600 tabular-nums shrink-0 mt-0.5 w-24">{it.time}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm break-words ${director ? "text-violet-900" : "text-gray-800"}`}>{it.title}</p>
        {it.location && <p className="text-xs text-gray-500 break-words">📍 {it.location}</p>}
      </div>
    </li>
  );
}

/** 色の見本（院長の予定があるときだけ） */
export function DirectorLegend() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-700" data-cal-legend>
      <span className="inline-block w-3 h-3 rounded bg-violet-200 border border-violet-300" />
      {DIRECTOR_LABEL}
    </span>
  );
}

export function TodayBadge() {
  return <span className="text-[10px] font-medium bg-teal-100 text-teal-700 rounded-full px-2 py-0.5">今日</span>;
}

/** 日付ごとのリスト */
export function ListView({ groups, today }: { groups: { ymd: string; items: CalItem[] }[]; today: string }) {
  return (
    <div className="space-y-4" data-cal-list>
      {groups.map((g) => (
        <section key={g.ymd} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            {formatDayHeading(g.ymd)}
            {g.ymd === today && <TodayBadge />}
          </h2>
          <ul className="space-y-1.5">
            {g.items.map((it) => (
              <ItemRow key={it.id} it={it} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * 1か月のマス目（日曜始まり）。
 * ふつう：スマホ＝点（4件以上は件数）、md以上＝題名を2件＋「+n」。
 * 大きく（big）：マス目が予定の数に合わせて広がり、全部の予定を時刻と題名で出す（省いたり「…」で切ったりしない）。
 * 予定のある日を押すと onSelect（その日の予定を全部出す）。
 */
export function MonthGrid({
  year,
  month,
  today,
  byYmd,
  selectedYmd,
  onSelect,
  big,
}: {
  year: number;
  month: number;
  today: string;
  byYmd: Map<string, CalItem[]>;
  selectedYmd: string | null;
  onSelect: (ymd: string) => void;
  big: boolean;
}) {
  const weeks = buildMonthWeeks(year, month);
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-3 md:p-4 space-y-2" data-cal-month={`${year}-${month}`} data-cal-big={big ? "on" : "off"}>
      <h2 className="text-sm font-semibold text-gray-800">
        {year}年{month}月
      </h2>
      <div className="grid grid-cols-7 text-center text-[10px] text-gray-500">
        {WEEKDAY_HEADERS.map((w, i) => (
          <div key={w} className={`py-1 ${i === 0 ? "text-red-400" : i === 6 ? "text-sky-500" : ""}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden border border-gray-100">
        {weeks.flat().map((ymd, i) => {
          if (!ymd) return <div key={`fill-${i}`} className="bg-gray-50/80 min-h-12 md:min-h-20" />;
          const items = byYmd.get(ymd) ?? [];
          return (
            <button
              key={ymd}
              type="button"
              disabled={items.length === 0}
              onClick={() => onSelect(ymd)}
              className={`bg-white min-h-12 md:min-h-20 p-1 text-left align-top flex flex-col ${ymd === selectedYmd ? "ring-2 ring-teal-500 ring-inset" : ""} ${
                items.length > 0 ? "hover:bg-teal-50/50" : ""
              }`}
              data-cal-day={ymd}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 text-[11px] rounded-full shrink-0 ${
                  ymd === today ? "bg-teal-600 text-white font-bold" : "text-gray-700"
                }`}
              >
                {Number(ymd.slice(8))}
              </span>
              {big ? (
                <div className="mt-0.5 space-y-0.5 w-full">
                  {items.map((it) => (
                    <div key={it.id} className={`text-[9px] md:text-[10px] leading-tight rounded px-0.5 md:px-1 py-0.5 break-words whitespace-normal ${chipCls(it)}`} data-cal-chip>
                      {timeLabel(it) && <span className="tabular-nums block md:inline md:mr-1">{timeLabel(it)}</span>}
                      {it.title}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {items.length > 0 && (
                    <div className="md:hidden mt-0.5 flex items-center justify-center gap-0.5">
                      {items.length <= 3 ? (
                        items.map((it) => <span key={it.id} className={`w-1.5 h-1.5 rounded-full ${dotCls(it)}`} />)
                      ) : (
                        <span className="text-[9px] text-teal-700 font-medium">●{items.length}</span>
                      )}
                    </div>
                  )}
                  <div className="hidden md:block mt-0.5 space-y-0.5 w-full">
                    {items.slice(0, 2).map((it) => (
                      <div key={it.id} className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 ${chipCls(it)}`} data-cal-chip>
                        {it.title}
                      </div>
                    ))}
                    {items.length > 2 && <div className="text-[10px] text-gray-500 px-1">+{items.length - 2}</div>}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 日付を押したとき：その日の予定を全部（時刻と題名） */
export function DayDetail({ ymd, today, items, onClose }: { ymd: string; today: string; items: CalItem[]; onClose: () => void }) {
  return (
    <section className="bg-white border border-teal-200 rounded-xl p-4 space-y-2" data-cal-day-detail={ymd}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          {formatDayHeading(ymd)}
          {ymd === today && <TodayBadge />}
        </h2>
        <button type="button" onClick={onClose} className="text-xs px-3 py-1.5 border border-gray-200 rounded-full hover:bg-gray-50" data-cal-day-close>
          閉じる
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <ItemRow key={it.id} it={it} />
        ))}
      </ul>
    </section>
  );
}

/** 週表示：日曜から7日。各日の予定を時刻の順に全部。md以上は7列、スマホは縦に並べる */
export function WeekView({ sunday, today, byYmd }: { sunday: string; today: string; byYmd: Map<string, CalItem[]> }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-3 md:p-4 space-y-2" data-cal-week={sunday}>
      <h2 className="text-sm font-semibold text-gray-800">{formatWeekRange(sunday)}</h2>
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2 md:gap-px md:bg-gray-100 md:rounded-lg md:overflow-hidden md:border md:border-gray-100">
        {weekDays(sunday).map((ymd, i) => {
          const items = byYmd.get(ymd) ?? [];
          return (
            <div key={ymd} className={`bg-white p-2 md:p-1.5 md:min-h-40 rounded-lg md:rounded-none border md:border-0 ${ymd === today ? "border-teal-300 md:bg-teal-50/40" : "border-gray-100"}`} data-cal-week-day={ymd}>
              <div className={`text-xs font-semibold mb-1 flex items-center gap-1.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-sky-600" : "text-gray-700"}`}>
                {formatDayHeading(ymd)}
                {ymd === today && <TodayBadge />}
              </div>
              <div className="space-y-1">
                {items.map((it) => (
                  <div key={it.id} className={`text-[11px] md:text-[10px] leading-snug rounded px-1.5 md:px-1 py-1 md:py-0.5 break-words ${chipCls(it)}`} data-cal-chip>
                    {timeLabel(it) && <span className="tabular-nums mr-1 md:block md:mr-0">{timeLabel(it)}</span>}
                    {it.title}
                    {it.location && <span className="block text-[10px] text-gray-500">📍 {it.location}</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const segOn = "px-3 py-2 bg-teal-600 text-white";
const segOff = "px-3 py-2 text-gray-600 hover:bg-gray-50";

/** 📋 リスト／🗓 月表示／📅 週表示 */
export function ViewSwitch({ view, onChange }: { view: CalView; onChange: (v: CalView) => void }) {
  const b = (v: CalView, label: string) => (
    <button type="button" onClick={() => onChange(v)} className={view === v ? segOn : segOff} aria-pressed={view === v} data-cal-view={v}>
      {label}
    </button>
  );
  return (
    <div className="flex rounded-full border border-gray-200 overflow-hidden text-sm">
      {b("list", "📋 リスト")}
      {b("month", "🗓 月表示")}
      {b("week", "📅 週表示")}
    </div>
  );
}

/** ◀ 今日 ▶（週を送る・今日のある週に戻る） */
export function WeekNav({
  onPrev,
  onNext,
  onToday,
  canPrev = true,
  canNext = true,
}: {
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  canPrev?: boolean;
  canNext?: boolean;
}) {
  return (
    <div className="flex rounded-full border border-gray-200 overflow-hidden text-sm">
      <button type="button" onClick={onPrev} disabled={!canPrev} className={`${segOff} disabled:opacity-40`} aria-label="前の週" data-cal-week-prev>
        ◀
      </button>
      <button type="button" onClick={onToday} className={segOff} data-cal-week-today>
        今日
      </button>
      <button type="button" onClick={onNext} disabled={!canNext} className={`${segOff} disabled:opacity-40`} aria-label="次の週" data-cal-week-next>
        ▶
      </button>
    </div>
  );
}

/** 月表示の「大きく」 */
export function BigToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`text-sm rounded-full border ${on ? "border-teal-600 " + segOn : "border-gray-200 " + segOff}`}
      data-cal-big-toggle
    >
      大きく
    </button>
  );
}
