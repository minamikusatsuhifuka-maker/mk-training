"use client";

// 🗓 院内カレンダー（指示書114・機能ID calendar / 月間グリッド追加=指示書121）
// - 243: 📅 週表示・月表示の「大きく」・日付を押すとその日の予定を全部（部品は components/calendar/CalendarViews.tsx・1on1カレンダーと共通）。
//   院長のGoogleカレンダーの予定を色を変えて出す（時刻と題名だけ・「非公開」は題名を出さない・判定はサーバー）。
// - 予定の源泉は Google カレンダー（管理はGoogle側で直接・ポータル側に管理UIは作らない）。
// - 取得は認証付き /api/calendar のみ（243から先月1日〜翌々月末＝週表示で前後へ送れるように）。表示:
//   📋 リスト=今日以降のみ（従来どおり）／🗓 月表示=今月＋翌月の2グリッド（121）。
//   切替は localStorage "mk_calendar_view" に記憶（102/116の流儀・既定は月表示=指示書125）。
// - env未設定・接続失敗はスタッフに「準備中」の穏やかな表示。管理者にのみ詳細
//   （detail はサーバー側 isAdminUser 判定で応答に含まれる。クライアントは有無だけ見る）。

import { useState, useEffect, useCallback } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { jstTodayYmd } from "@/lib/library";
import { addDays, addMonths, lastDayOfMonth, weekOverlaps, weekStartOf } from "@/lib/calendar-views";
import {
  BigToggle,
  DIRECTOR_LABEL,
  DayDetail,
  DirectorLegend,
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

type CalendarEvent = {
  id: string;
  title: string;
  start: string; // ISO日時（終日は "YYYY-MM-DD"）
  end: string;
  allDay: boolean;
  location: string;
};
/** 243: 院長の予定（title が空＝Googleカレンダーで「非公開」にした予定） */
type DirectorEvent = { id: string; title: string; start: string; end: string; allDay: boolean };

type LoadState = "loading" | "ready" | "unauthenticated" | "unavailable";

const CALENDAR_INTRO =
  "勉強会・研修・院内イベントなどの予定です。予定の追加・変更はGoogleカレンダーで行われます。";
const CALENDAR_EMPTY = "今日から翌月末までの予定はありません。";
const CALENDAR_VIEW_LS_KEY = "mk_calendar_view";
const CALENDAR_BIG_LS_KEY = "mk_calendar_big"; // 243: 月表示の「大きく」
const VIEWS: readonly CalView[] = ["list", "month", "week"];
const ON_OFF = ["on", "off"] as const;
const CALENDAR_PREPARING =
  "カレンダーは準備中です。もうすこしお待ちください。";

// 予定のJST暦日（"YYYY-MM-DD"）。終日はそのまま・時刻ありは jstTodayYmd に日時を渡して変換
function jstYmdOf(start: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  const d = new Date(start);
  if (isNaN(d.getTime())) return start;
  return jstTodayYmd(d);
}

// 時刻表示「10:00〜11:30」（JST固定・閲覧環境のTZに依存させない）
function formatTimeRange(ev: { start: string; end: string }): string {
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

// 院内の予定・院長の予定を、表示の1件（CalItem）にそろえる（243）
const clinicItem = (ev: CalendarEvent): CalItem => ({
  id: `c-${ev.id}`,
  ymd: jstYmdOf(ev.start),
  time: ev.allDay ? "" : formatTimeRange(ev),
  allDay: ev.allDay,
  title: ev.title,
  location: ev.location,
});
// 院長の予定は時刻と題名だけ。「非公開」の予定（題名が空）は「院長の予定」とだけ出す
const directorItem = (ev: DirectorEvent): CalItem => ({
  id: `d-${ev.id}`,
  ymd: jstYmdOf(ev.start),
  time: ev.allDay ? "" : formatTimeRange(ev),
  allDay: ev.allDay,
  title: ev.title || DIRECTOR_LABEL,
  tone: "director",
});

function CalendarPageBody() {
  const [state, setState] = useState<LoadState>("loading");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [directorEvents, setDirectorEvents] = useState<DirectorEvent[] | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [adminDetail, setAdminDetail] = useState("");
  const [directorDetail, setDirectorDetail] = useState("");
  const [reloading, setReloading] = useState(false);
  // 表示切替（📋 リスト / 🗓 月表示 / 📅 週表示）。既定は月表示（指示書125）。選択は localStorage に記憶
  const [view, setView] = useStoredChoice<CalView>(CALENDAR_VIEW_LS_KEY, VIEWS, "month");
  const [big, setBig] = useStoredChoice(CALENDAR_BIG_LS_KEY, ON_OFF, "off");
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const [weekSunday, setWeekSunday] = useState<string | null>(null);

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
      const j = (await res.json()) as {
        events?: CalendarEvent[];
        directorEvents?: DirectorEvent[];
        directorDetail?: string;
        range?: { from: string; to: string };
      };
      setEvents(Array.isArray(j.events) ? j.events : []);
      // 243: 院長の予定（見せない人・つながらないときは来ない → 院内の予定だけ出す）
      setDirectorEvents(Array.isArray(j.directorEvents) ? j.directorEvents : null);
      setDirectorDetail(typeof j.directorDetail === "string" ? j.directorDetail : "");
      setRange(j.range && typeof j.range.from === "string" && typeof j.range.to === "string" ? j.range : null);
      setState("ready");
    } catch {
      setAdminDetail("");
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
  const items: CalItem[] = [...events.map(clinicItem), ...(directorEvents ?? []).map(directorItem)];
  // 日付→予定（終日 → 時刻の順）
  const byYmd = groupByYmd(items);

  // リストは今日〜翌月末（従来どおり・指示書121。APIは週表示のために前後も返す）
  const thisY = Number(today.slice(0, 4));
  const thisM = Number(today.slice(5, 7));
  const next = addMonths(thisY, thisM, 1);
  const listEnd = lastDayOfMonth(next.y, next.m);
  const groups = Array.from(byYmd.keys())
    .filter((ymd) => ymd >= today && ymd <= listEnd)
    .sort()
    .map((ymd) => ({ ymd, items: byYmd.get(ymd)! }));

  // 月表示: 今月・翌月の2ヶ月（指示書121）
  const months: { y: number; m: number }[] = [{ y: thisY, m: thisM }, next];

  // 週表示（243）: 日曜から。◀ ▶ で送り、「今日」で今日のある週に戻る。読んである期間の外へは送らない
  const sunday = weekSunday ?? weekStartOf(today);

  const dayDetail = selectedYmd ? (
    <DayDetail ymd={selectedYmd} today={today} items={byYmd.get(selectedYmd) ?? []} onClose={() => setSelectedYmd(null)} />
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-600 leading-relaxed bg-teal-50/60 border border-teal-100 rounded-xl px-4 py-3 flex-1 min-w-[240px]">
          {CALENDAR_INTRO}
        </p>
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* 表示切替（指示書121・243で週表示を足した。選択はlocalStorageに記憶） */}
          <ViewSwitch view={view} onChange={setView} />
          {view === "month" && <BigToggle on={big === "on"} onChange={(v) => setBig(v ? "on" : "off")} />}
          {view === "week" && (
            <WeekNav
              onPrev={() => setWeekSunday(addDays(sunday, -7))}
              onNext={() => setWeekSunday(addDays(sunday, 7))}
              onToday={() => setWeekSunday(null)}
              canPrev={weekOverlaps(addDays(sunday, -7), range)}
              canNext={weekOverlaps(addDays(sunday, 7), range)}
            />
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
      </div>

      {/* 243: 院長の予定の色の見本（院長の予定が出ているときだけ）／院長だけに、つながらない理由 */}
      {(directorEvents || directorDetail) && (
        <div className="flex items-center gap-3 flex-wrap">
          {directorEvents && <DirectorLegend />}
          {directorDetail && (
            <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 break-all">
              【管理者向け】{DIRECTOR_LABEL}：{directorDetail}
            </p>
          )}
        </div>
      )}

      {view === "list" ? (
        groups.length === 0 ? (
          <p className="text-sm text-gray-600 text-center py-12">
            {CALENDAR_EMPTY}
          </p>
        ) : (
          <ListView groups={groups} today={today} />
        )
      ) : view === "week" ? (
        <WeekView sunday={sunday} today={today} byYmd={byYmd} />
      ) : (
        // 月表示: xl以上は2グリッド横並び（指示書127）・lg以下は従来の縦並び
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
                onSelect={(ymd) =>
                  setSelectedYmd((prev) => (prev === ymd ? null : ymd))
                }
              />
              {/* 縦並び時: タップした月のグリッド直下（現行UX維持） */}
              {selectedYmd &&
                Number(selectedYmd.slice(0, 4)) === y &&
                Number(selectedYmd.slice(5, 7)) === m && (
                  <div className="xl:hidden">{dayDetail}</div>
                )}
            </div>
          ))}
          {/* 横並び時: 両グリッドの下に全幅で1つ（どちらの月をタップしても同じ位置） */}
          {dayDetail && (
            <div className="hidden xl:block xl:col-span-2">{dayDetail}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl xl:max-w-6xl mx-auto space-y-6">
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
