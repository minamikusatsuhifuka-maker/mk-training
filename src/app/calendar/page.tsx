"use client";

// 🗓 院内カレンダー（指示書114・機能ID calendar / 月間グリッド追加=指示書121）
// - 243: 📅 週表示・月表示の「大きく」・日付を押すとその日の予定を全部（部品は components/calendar/CalendarViews.tsx・1on1カレンダーと共通）。
//   院長のGoogleカレンダーの予定を色を変えて出す（時刻と題名だけ・「非公開」は題名を出さない・判定はサーバー）。
// - 予定の源泉は Google カレンダー（管理はGoogle側で直接・ポータル側に管理UIは作らない）。
// - 取得は認証付き /api/calendar のみ。260: 表示している月（週）の分だけ ?from&to で読む（今月の前後12か月まで進める）。
//   読んだ期間は画面の中で覚える（同じ月へ戻ったときは読み直さない・「再読み込み」で今の期間を読み直す）。表示:
//   📋 リスト=今月から4か月分を4列（261・今月は今日以降）／🗓 月表示=2グリッド（121）。
//   切替は localStorage "mk_calendar_view" に記憶（102/116の流儀・既定は月表示=指示書125）。
// - 246: 説明は別の行・ボタンは CalendarToolbar で1行に（切り替えてもボタンが動かない）。月表示の「大きく」は既定ON
// - env未設定・接続失敗はスタッフに「準備中」の穏やかな表示。管理者にのみ詳細
//   （detail はサーバー側 isAdminUser 判定で応答に含まれる。クライアントは有無だけ見る）。

import { useState, useEffect, useCallback, useRef } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { jstTodayYmd } from "@/lib/library";
import { addDays, addMonths, calendarWindow, lastDayOfMonth, monthsRange, weekFetchRange, weekOverlaps, weekStartOf } from "@/lib/calendar-views";
import {
  BigToggle,
  CalendarToolbar,
  DIRECTOR_LABEL,
  DayDetail,
  DirectorLegend,
  MonthColumnsList,
  MonthGrid,
  MonthNav,
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

/** 260: 1つの期間を読んだ結果 */
type Loaded = {
  events: CalendarEvent[];
  directorEvents: DirectorEvent[] | null;
  directorDetail: string;
};
const rangeKeyOf = (r: { from: string; to: string }) => `${r.from}~${r.to}`;

const CALENDAR_INTRO =
  "勉強会・研修・院内イベントなどの予定です。予定の追加・変更はGoogleカレンダーで行われます。";
// 261: 予定の無い月の列に出す（今ある文）
const CALENDAR_MONTH_EMPTY = "予定はありません。";
/** 261: リストに出す月の数（今月・来月・再来月・3か月先） */
const LIST_MONTHS = 4;
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
  // 260: 期間ごとに読んだ結果（"from~to" → 結果）。今の表示の期間がまだ無ければ、読むあいだは直前の結果を出す
  const [loaded, setLoaded] = useState<Record<string, Loaded>>({});
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [adminDetail, setAdminDetail] = useState("");
  const [reloading, setReloading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  // 表示切替（📋 リスト / 🗓 月表示 / 📅 週表示）。既定は月表示（指示書125）。選択は localStorage に記憶
  const [view, setView] = useStoredChoice<CalView>(CALENDAR_VIEW_LS_KEY, VIEWS, "month");
  const [big, setBig] = useStoredChoice(CALENDAR_BIG_LS_KEY, ON_OFF, "on"); // 246: 既定は「大きく」
  const [selectedYmd, setSelectedYmd] = useState<string | null>(null);
  const [weekSunday, setWeekSunday] = useState<string | null>(null);
  // 260: 月表示で、今月から何か月ずらしているか（0＝今月と翌月）
  const [monthOffset, setMonthOffset] = useState(0);

  // 今の表示に要る期間（月表示＝出している2か月・週表示＝その週を含む月・リスト＝今月から4か月（261））
  const today = jstTodayYmd();
  const thisY = Number(today.slice(0, 4));
  const thisM = Number(today.slice(5, 7));
  const win = calendarWindow(today);
  const first = addMonths(thisY, thisM, monthOffset);
  const sunday = weekSunday ?? weekStartOf(today);
  const need =
    view === "month" ? monthsRange(first.y, first.m, 2) : view === "week" ? weekFetchRange(sunday) : monthsRange(thisY, thisM, LIST_MONTHS);
  const needKey = rangeKeyOf(need);

  const load = useCallback(async (range: { from: string; to: string }, isReload: boolean) => {
    if (isReload) setReloading(true);
    setFetching(true);
    try {
      const qs = new URLSearchParams({ from: range.from, to: range.to });
      const res = await fetch(`/api/calendar?${qs.toString()}`, { cache: "no-store" });
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
      };
      const key = rangeKeyOf(range);
      setLoaded((prev) => ({
        ...prev,
        [key]: {
          events: Array.isArray(j.events) ? j.events : [],
          // 243: 院長の予定（見せない人・つながらないときは来ない → 院内の予定だけ出す）
          directorEvents: Array.isArray(j.directorEvents) ? j.directorEvents : null,
          directorDetail: typeof j.directorDetail === "string" ? j.directorDetail : "",
        },
      }));
      setLastKey(key);
      setState("ready");
    } catch {
      setAdminDetail("");
      setState("unavailable");
    } finally {
      if (isReload) setReloading(false);
      setFetching(false);
    }
  }, []);

  // 表示の期間がまだ読めていなければ読む（読んだ期間は覚えておく）
  useEffect(() => {
    if (loadedRef.current[needKey]) return;
    const [from, to] = needKey.split("~");
    void (async () => {
      await load({ from, to }, false);
    })();
  }, [needKey, load]);

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

  const data = loaded[needKey] ?? (lastKey ? loaded[lastKey] : undefined);
  const events = data?.events ?? [];
  const directorEvents = data?.directorEvents ?? null;
  const directorDetail = data?.directorDetail ?? "";
  const items: CalItem[] = [...events.map(clinicItem), ...(directorEvents ?? []).map(directorItem)];
  // 日付→予定（終日 → 時刻の順）
  const byYmd = groupByYmd(items);

  // 261: リストは今月から4か月分（今月の列は今日から先）
  const listMonths = Array.from({ length: LIST_MONTHS }, (_, i) => addMonths(thisY, thisM, i));

  // 月表示: 2ヶ月（指示書121）。260: ◀ ▶ で送る（今月の前後12か月まで）
  const second = addMonths(first.y, first.m, 1);
  const months: { y: number; m: number }[] = [first, second];
  const canPrevMonth = monthsRange(first.y, first.m, 1).from > win.from;
  const canNextMonth = lastDayOfMonth(second.y, second.m) < win.to;

  // 週表示（243）: 日曜から。◀ ▶ で送り、「今日」で今日のある週に戻る。260: 今月の前後12か月まで送れる

  const dayDetail = selectedYmd ? (
    <DayDetail ymd={selectedYmd} today={today} items={byYmd.get(selectedYmd) ?? []} onClose={() => setSelectedYmd(null)} />
  ) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm text-gray-600 leading-relaxed bg-teal-50/60 border border-teal-100 rounded-xl px-4 py-3">
          {CALENDAR_INTRO}
        </p>
        {/* 表示切替（指示書121・243で週表示を足した。選択はlocalStorageに記憶）。246: ボタンの位置は表示によって変えない */}
        <CalendarToolbar
          view={view}
          onViewChange={setView}
          reloading={reloading}
          onReload={() => load(need, true)}
          extra={
            view === "month" ? (
              <>
                <MonthNav
                  onPrev={() => setMonthOffset((o) => o - 1)}
                  onNext={() => setMonthOffset((o) => o + 1)}
                  onToday={() => setMonthOffset(0)}
                  canPrev={canPrevMonth}
                  canNext={canNextMonth}
                />
                <BigToggle on={big === "on"} onChange={(v) => setBig(v ? "on" : "off")} />
              </>
            ) : view === "week" ? (
              <WeekNav
                onPrev={() => setWeekSunday(addDays(sunday, -7))}
                onNext={() => setWeekSunday(addDays(sunday, 7))}
                onToday={() => setWeekSunday(null)}
                canPrev={weekOverlaps(addDays(sunday, -7), win)}
                canNext={weekOverlaps(addDays(sunday, 7), win)}
              />
            ) : null
          }
        />
        {/* 260: 先の月を読んでいるあいだ（直前の月の予定を出したまま） */}
        {fetching && !loaded[needKey] && (
          <p className="text-xs text-gray-500 animate-pulse" data-cal-fetching>読み込んでいます…</p>
        )}
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
        <MonthColumnsList months={listMonths} today={today} byYmd={byYmd} emptyText={CALENDAR_MONTH_EMPTY} />
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
                hoverPopover
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
