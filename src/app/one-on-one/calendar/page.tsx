"use client";

// 🗓 1on1カレンダー（指示書240・機能ID one_on_one_calendar）
// - いつ・誰が1on1をするかを、ログインしたスタッフ全員に。1件ごとに出すのは「時刻」と「スタッフの名前」だけ
// - 出すもとは「🗓 1on1の日程」で確定している予約（/api/one-on-one/calendar・判定はサーバー）
// - 見た目と使い方は「🗓 院内カレンダー」（/calendar）にそろえる：📋 リスト／🗓 月表示・🔄 再読み込み・月表示は今月と翌月を並べる。
//   月表示は ◀ ▶ で月を送れる。選んだ表示は localStorage "mk_1on1_calendar_view" に記憶（院内カレンダーと同じ流儀）
// - 見出しの下に説明文は付けない（240 §1）

import { useCallback, useEffect, useState } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { jstTodayYmd } from "@/lib/library";

type Entry = { id: string; date: string; startTime: string; endTime: string; name: string };
type LoadState = "loading" | "ready" | "unavailable";

const VIEW_LS_KEY = "mk_1on1_calendar_view";
const WEEKDAY_HEADERS = ["日", "月", "火", "水", "木", "金", "土"];

// 日付見出し「7/29（水）」（院内カレンダーと同じ表記）
function formatDayHeading(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const [, y, mo, da] = m;
  const week = WEEKDAY_HEADERS[new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da))).getUTCDay()];
  return `${Number(mo)}/${Number(da)}（${week}）`;
}

// 月グリッド（日曜始まり・院内カレンダーと同じ作り）
function buildMonthWeeks(year: number, month: number): (string | null)[][] {
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

const timeText = (e: Entry) => `${e.startTime}-${e.endTime}`;

// 1件（時刻＋名前だけ）
function EntryRow({ e }: { e: Entry }) {
  return (
    <li className="flex items-start gap-3 rounded-lg bg-gray-50/60 border border-gray-100 px-3 py-2" data-1on1-entry>
      <span className="text-xs text-gray-600 tabular-nums shrink-0 mt-0.5 w-24">{timeText(e)}</span>
      <p className="min-w-0 flex-1 text-sm text-gray-800 break-words">{e.name}</p>
    </li>
  );
}

function MonthGrid({
  year,
  month,
  today,
  byYmd,
  selectedYmd,
  onSelect,
}: {
  year: number;
  month: number;
  today: string;
  byYmd: Map<string, Entry[]>;
  selectedYmd: string | null;
  onSelect: (ymd: string) => void;
}) {
  const weeks = buildMonthWeeks(year, month);
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-3 md:p-4 space-y-2" data-1on1-month={`${year}-${month}`}>
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
              className={`bg-white min-h-12 md:min-h-20 p-1 text-left ${ymd === selectedYmd ? "ring-2 ring-teal-500 ring-inset" : ""} ${
                items.length > 0 ? "hover:bg-teal-50/50" : ""
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 text-[11px] rounded-full ${
                  ymd === today ? "bg-teal-600 text-white font-bold" : "text-gray-700"
                }`}
              >
                {Number(ymd.slice(8))}
              </span>
              {items.length > 0 && (
                <div className="md:hidden mt-0.5 flex items-center justify-center gap-0.5">
                  {items.length <= 3 ? (
                    items.map((e) => <span key={e.id} className="w-1.5 h-1.5 rounded-full bg-teal-500" />)
                  ) : (
                    <span className="text-[9px] text-teal-700 font-medium">●{items.length}</span>
                  )}
                </div>
              )}
              <div className="hidden md:block mt-0.5 space-y-0.5">
                {items.slice(0, 2).map((e) => (
                  <div key={e.id} className="text-[10px] leading-tight truncate rounded bg-teal-50 text-teal-800 px-1 py-0.5">
                    {e.startTime} {e.name}
                  </div>
                ))}
                {items.length > 2 && <div className="text-[10px] text-gray-500 px-1">+{items.length - 2}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function addMonths(y: number, m: number, add: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + add;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

function OneOnOneCalendarBody() {
  const [state, setState] = useState<LoadState>("loading");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [today, setToday] = useState(jstTodayYmd());
  const [reloading, setReloading] = useState(false);
  const [view, setView] = useState<"list" | "month">("month");
  const [offset, setOffset] = useState(0);
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(VIEW_LS_KEY) === "list") setView("list");
    } catch {
      /* 既定のまま */
    }
  }, []);

  const changeView = (v: "list" | "month") => {
    setView(v);
    try {
      localStorage.setItem(VIEW_LS_KEY, v);
    } catch {
      /* 記憶できなくても切替は有効 */
    }
  };

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

  const byYmd = new Map<string, Entry[]>();
  for (const e of entries) {
    if (!byYmd.has(e.date)) byYmd.set(e.date, []);
    byYmd.get(e.date)!.push(e);
  }
  // リストは今日以降（院内カレンダーと同じ）
  const groups: { ymd: string; items: Entry[] }[] = [];
  for (const e of entries) {
    if (e.date < today) continue;
    const last = groups[groups.length - 1];
    if (last && last.ymd === e.date) last.items.push(e);
    else groups.push({ ymd: e.date, items: [e] });
  }
  const base = addMonths(Number(today.slice(0, 4)), Number(today.slice(5, 7)), offset);
  const months = [base, addMonths(base.y, base.m, 1)];

  const dayDetail = selectedYmd ? (
    <section className="bg-white border border-teal-200 rounded-xl p-4 space-y-2" data-1on1-day>
      <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        {formatDayHeading(selectedYmd)}
        {selectedYmd === today && (
          <span className="text-[10px] font-medium bg-teal-100 text-teal-700 rounded-full px-2 py-0.5">今日</span>
        )}
      </h2>
      <ul className="space-y-1.5">
        {(byYmd.get(selectedYmd) ?? []).map((e) => (
          <EntryRow key={e.id} e={e} />
        ))}
      </ul>
    </section>
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <div className="flex rounded-full border border-gray-200 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => changeView("list")}
            className={view === "list" ? "px-3 py-2 bg-teal-600 text-white" : "px-3 py-2 text-gray-600 hover:bg-gray-50"}
            data-1on1-view="list"
          >
            📋 リスト
          </button>
          <button
            type="button"
            onClick={() => changeView("month")}
            className={view === "month" ? "px-3 py-2 bg-teal-600 text-white" : "px-3 py-2 text-gray-600 hover:bg-gray-50"}
            data-1on1-view="month"
          >
            🗓 月表示
          </button>
        </div>
        {view === "month" && (
          <div className="flex rounded-full border border-gray-200 overflow-hidden text-sm">
            <button type="button" onClick={() => setOffset((o) => o - 1)} className="px-3 py-2 text-gray-600 hover:bg-gray-50" aria-label="前の月" data-1on1-prev>
              ◀
            </button>
            <button type="button" onClick={() => setOffset((o) => o + 1)} className="px-3 py-2 text-gray-600 hover:bg-gray-50" aria-label="次の月" data-1on1-next>
              ▶
            </button>
          </div>
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
          <div className="space-y-4" data-1on1-list>
            {groups.map((g) => (
              <section key={g.ymd} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  {formatDayHeading(g.ymd)}
                  {g.ymd === today && (
                    <span className="text-[10px] font-medium bg-teal-100 text-teal-700 rounded-full px-2 py-0.5">今日</span>
                  )}
                </h2>
                <ul className="space-y-1.5">
                  {g.items.map((e) => (
                    <EntryRow key={e.id} e={e} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
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
