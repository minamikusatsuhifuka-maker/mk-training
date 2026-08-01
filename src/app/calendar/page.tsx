"use client";

// 🗓 院内カレンダー（指示書114・機能ID calendar / 月間グリッド追加=指示書121）
// - 予定の源泉は Google カレンダー（管理はGoogle側で直接・ポータル側に管理UIは作らない）。
// - 取得は認証付き /api/calendar のみ（今月1日〜翌月末）。表示は2形態:
//   📋 リスト=今日以降のみ（従来どおり）／🗓 月表示=今月＋翌月の2グリッド（121）。
//   切替は localStorage "mk_calendar_view" に記憶（102/116の流儀・既定はリスト）。
// - env未設定・接続失敗はスタッフに「準備中」の穏やかな表示。管理者にのみ詳細
//   （detail はサーバー側 isAdminUser 判定で応答に含まれる。クライアントは有無だけ見る）。

import { useState, useEffect, useCallback } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { jstTodayYmd } from "@/lib/library";

type CalendarEvent = {
  id: string;
  title: string;
  start: string; // ISO日時（終日は "YYYY-MM-DD"）
  end: string;
  allDay: boolean;
  location: string;
};

type LoadState = "loading" | "ready" | "unauthenticated" | "unavailable";

const CALENDAR_INTRO =
  "勉強会・研修・院内イベントなどの予定です。予定の追加・変更はGoogleカレンダーで行われます。";
const CALENDAR_EMPTY = "今日から翌月末までの予定はありません。";
const CALENDAR_VIEW_LS_KEY = "mk_calendar_view";
const CALENDAR_PREPARING =
  "カレンダーは準備中です。もうすこしお待ちください。";

// 予定のJST暦日（"YYYY-MM-DD"）。終日はそのまま・時刻ありは jstTodayYmd に日時を渡して変換
function jstYmdOf(start: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  const d = new Date(start);
  if (isNaN(d.getTime())) return start;
  return jstTodayYmd(d);
}

// 日付見出し「7/29（水）」（JST基準・TZ非依存: ymd文字列からUTC構築で曜日算出）
function formatDayHeading(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const [, y, mo, da] = m;
  const week = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da))).getUTCDay()
  ];
  return `${Number(mo)}/${Number(da)}（${week}）`;
}

// 時刻表示「10:00〜11:30」（JST固定・閲覧環境のTZに依存させない）
function formatTimeRange(ev: CalendarEvent): string {
  const fmt = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    });
  };
  const s = fmt(ev.start);
  const e = fmt(ev.end);
  if (!s) return "";
  return e ? `${s}〜${e}` : s;
}

// 月グリッド構築（指示書121・日曜始まり）。TZ非依存: ymd文字列とUTC構築のみ使う
// （formatDayHeading と同じ流儀）。null = 前後月の埋めセル。
function buildMonthWeeks(year: number, month: number): (string | null)[][] {
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(
      `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// 予定1行（終日バッジ/時刻＋タイトル＋場所）。リスト表示と月表示の日別詳細で共用
function EventRow({ ev }: { ev: CalendarEvent }) {
  return (
    <li className="flex items-start gap-3 rounded-lg bg-gray-50/60 border border-gray-100 px-3 py-2">
      {ev.allDay ? (
        <span className="text-[10px] font-medium bg-sky-100 text-sky-800 rounded-full px-2 py-0.5 shrink-0 mt-0.5">
          終日
        </span>
      ) : (
        <span className="text-xs text-gray-600 tabular-nums shrink-0 mt-0.5 w-24">
          {formatTimeRange(ev)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-800 break-words">{ev.title}</p>
        {ev.location && (
          <p className="text-xs text-gray-500 break-words">📍 {ev.location}</p>
        )}
      </div>
    </li>
  );
}

const WEEKDAY_HEADERS = ["日", "月", "火", "水", "木", "金", "土"];

// 1ヶ月分のグリッド（指示書121）。セル内はスマホ=ドット（最大3・4件以上は件数）、
// md以上=タイトルチップ最大2件＋「+n」。予定のある日のみタップ可能。
function MonthGrid({
  year,
  month,
  today,
  eventsByYmd,
  selectedYmd,
  onSelect,
}: {
  year: number;
  month: number;
  today: string;
  eventsByYmd: Map<string, CalendarEvent[]>;
  selectedYmd: string | null;
  onSelect: (ymd: string) => void;
}) {
  const weeks = buildMonthWeeks(year, month);
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-3 md:p-4 space-y-2">
      <h2 className="text-sm font-semibold text-gray-800">
        {year}年{month}月
      </h2>
      <div className="grid grid-cols-7 text-center text-[10px] text-gray-500">
        {WEEKDAY_HEADERS.map((w, i) => (
          <div
            key={w}
            className={`py-1 ${
              i === 0 ? "text-red-400" : i === 6 ? "text-sky-500" : ""
            }`}
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden border border-gray-100">
        {weeks.flat().map((ymd, i) => {
          if (!ymd) {
            return (
              <div key={`fill-${i}`} className="bg-gray-50/80 min-h-12 md:min-h-20" />
            );
          }
          const dayEvents = eventsByYmd.get(ymd) ?? [];
          const isToday = ymd === today;
          const isSelected = ymd === selectedYmd;
          return (
            <button
              key={ymd}
              type="button"
              disabled={dayEvents.length === 0}
              onClick={() => onSelect(ymd)}
              className={`bg-white min-h-12 md:min-h-20 p-1 text-left ${
                isSelected ? "ring-2 ring-teal-500 ring-inset" : ""
              } ${dayEvents.length > 0 ? "hover:bg-teal-50/50" : ""}`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 text-[11px] rounded-full ${
                  isToday
                    ? "bg-teal-600 text-white font-bold"
                    : "text-gray-700"
                }`}
              >
                {Number(ymd.slice(8))}
              </span>
              {dayEvents.length > 0 && (
                <div className="md:hidden mt-0.5 flex items-center justify-center gap-0.5">
                  {dayEvents.length <= 3 ? (
                    dayEvents.map((ev) => (
                      <span
                        key={ev.id}
                        className="w-1.5 h-1.5 rounded-full bg-teal-500"
                      />
                    ))
                  ) : (
                    <span className="text-[9px] text-teal-700 font-medium">
                      ●{dayEvents.length}
                    </span>
                  )}
                </div>
              )}
              <div className="hidden md:block mt-0.5 space-y-0.5">
                {dayEvents.slice(0, 2).map((ev) => (
                  <div
                    key={ev.id}
                    className="text-[10px] leading-tight truncate rounded bg-teal-50 text-teal-800 px-1 py-0.5"
                  >
                    {ev.title}
                  </div>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-[10px] text-gray-500 px-1">
                    +{dayEvents.length - 2}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CalendarPageBody() {
  const [state, setState] = useState<LoadState>("loading");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [adminDetail, setAdminDetail] = useState("");
  const [reloading, setReloading] = useState(false);
  // 表示切替（📋 リスト / 🗓 月表示・指示書121）。既定はリスト＝現行と同じ。
  // localStorage 不可の環境では既定のまま（102/116の流儀）
  const [view, setView] = useState<"list" | "month">("list");
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(CALENDAR_VIEW_LS_KEY) === "month") {
        setView("month");
      }
    } catch {
      /* 既定のまま */
    }
  }, []);

  const changeView = (v: "list" | "month") => {
    setView(v);
    try {
      localStorage.setItem(CALENDAR_VIEW_LS_KEY, v);
    } catch {
      /* 記憶できなくても切替自体は有効 */
    }
  };

  const load = useCallback(async (isReload: boolean) => {
    if (isReload) setReloading(true);
    try {
      const res = await fetch("/api/calendar", { cache: "no-store" });
      if (res.status === 401) {
        setState("unauthenticated");
        return;
      }
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as {
          detail?: string;
        };
        setAdminDetail(typeof j.detail === "string" ? j.detail : "");
        setState("unavailable");
        return;
      }
      const j = (await res.json()) as { events?: CalendarEvent[] };
      setEvents(Array.isArray(j.events) ? j.events : []);
      setState("ready");
    } catch {
      setAdminDetail("");
      setState("unavailable");
    } finally {
      if (isReload) setReloading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  if (state === "loading") {
    return (
      <p className="text-sm text-gray-500 py-16 text-center animate-pulse">
        読み込んでいます…
      </p>
    );
  }

  if (state === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <p className="text-sm text-gray-800">
          カレンダーの閲覧にはログインが必要です。
        </p>
        <a
          href="/login"
          className="text-sm px-4 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700"
        >
          ログインする
        </a>
      </div>
    );
  }

  if (state === "unavailable") {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-sm text-gray-600">{CALENDAR_PREPARING}</p>
        {adminDetail && (
          <div className="text-left max-w-xl mx-auto space-y-2">
            <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 break-all whitespace-pre-wrap">
              【管理者向け】{adminDetail}
            </p>
            <p className="text-xs text-gray-500">
              設定手順書（GCP設定手順書）をご確認ください。
            </p>
          </div>
        )}
      </div>
    );
  }

  const today = jstTodayYmd();

  // 日付（JST）でグループ化。API側で開始時刻順のため、日付キーの出現順で安定。
  // リストは今日以降のみ（APIは月初からの過去分も返すが、リストには出さない・指示書121）
  const groups: { ymd: string; items: CalendarEvent[] }[] = [];
  for (const ev of events) {
    const ymd = jstYmdOf(ev.start);
    if (ymd < today) continue;
    const last = groups[groups.length - 1];
    if (last && last.ymd === ymd) {
      last.items.push(ev);
    } else {
      groups.push({ ymd, items: [ev] });
    }
  }

  // 月表示用: 日付→予定の索引と、今月・翌月の2ヶ月（指示書121）
  const eventsByYmd = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const ymd = jstYmdOf(ev.start);
    if (!eventsByYmd.has(ymd)) eventsByYmd.set(ymd, []);
    eventsByYmd.get(ymd)!.push(ev);
  }
  const thisY = Number(today.slice(0, 4));
  const thisM = Number(today.slice(5, 7));
  const months: { y: number; m: number }[] = [
    { y: thisY, m: thisM },
    thisM === 12 ? { y: thisY + 1, m: 1 } : { y: thisY, m: thisM + 1 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-600 leading-relaxed bg-teal-50/60 border border-teal-100 rounded-xl px-4 py-3 flex-1 min-w-[240px]">
          {CALENDAR_INTRO}
        </p>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* 表示切替（指示書121・選択はlocalStorageに記憶） */}
          <div className="flex rounded-full border border-gray-200 overflow-hidden text-sm">
            <button
              type="button"
              onClick={() => changeView("list")}
              className={
                view === "list"
                  ? "px-3 py-2 bg-teal-600 text-white"
                  : "px-3 py-2 text-gray-600 hover:bg-gray-50"
              }
            >
              📋 リスト
            </button>
            <button
              type="button"
              onClick={() => changeView("month")}
              className={
                view === "month"
                  ? "px-3 py-2 bg-teal-600 text-white"
                  : "px-3 py-2 text-gray-600 hover:bg-gray-50"
              }
            >
              🗓 月表示
            </button>
          </div>
          <button
            type="button"
            onClick={() => load(true)}
            disabled={reloading}
            className="text-sm px-3 py-2 border border-gray-200 rounded-full hover:bg-gray-50 disabled:opacity-50 shrink-0"
          >
            {reloading ? "更新中…" : "🔄 再読み込み"}
          </button>
        </div>
      </div>

      {view === "list" ? (
        groups.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-12">
            {CALENDAR_EMPTY}
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <section
                key={g.ymd}
                className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
              >
                <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  {formatDayHeading(g.ymd)}
                  {g.ymd === today && (
                    <span className="text-[10px] font-medium bg-teal-100 text-teal-700 rounded-full px-2 py-0.5">
                      今日
                    </span>
                  )}
                </h2>
                <ul className="space-y-1.5">
                  {g.items.map((ev) => (
                    <EventRow key={ev.id} ev={ev} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {months.map(({ y, m }) => (
            <div key={`${y}-${m}`} className="space-y-4">
              <MonthGrid
                year={y}
                month={m}
                today={today}
                eventsByYmd={eventsByYmd}
                selectedYmd={selectedYmd}
                onSelect={(ymd) =>
                  setSelectedYmd((prev) => (prev === ymd ? null : ymd))
                }
              />
              {/* タップした日の詳細（タップした月のグリッド直下に表示・終日/時刻と場所はここで見せる） */}
              {selectedYmd &&
                Number(selectedYmd.slice(0, 4)) === y &&
                Number(selectedYmd.slice(5, 7)) === m && (
                  <section className="bg-white border border-teal-200 rounded-xl p-4 space-y-2">
                    <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                      {formatDayHeading(selectedYmd)}
                      {selectedYmd === today && (
                        <span className="text-[10px] font-medium bg-teal-100 text-teal-700 rounded-full px-2 py-0.5">
                          今日
                        </span>
                      )}
                    </h2>
                    <ul className="space-y-1.5">
                      {(eventsByYmd.get(selectedYmd) ?? []).map((ev) => (
                        <EventRow key={ev.id} ev={ev} />
                      ))}
                    </ul>
                  </section>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader navKey="/calendar"
        title="🗓 院内カレンダー"
        description="勉強会・イベントの予定共有"
      />
      <FeatureGate feature="calendar">
        <CalendarPageBody />
      </FeatureGate>
    </div>
  );
}
