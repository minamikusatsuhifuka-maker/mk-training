"use client";

// 院内カレンダー・1on1カレンダーで共通の表示の部品（指示書243）
// - 📋 リスト／🗓 月表示／📅 週表示 の切り替え、月表示の「大きく」、日付を押したときのその日の予定、週表示
// - 1件 = 時刻＋題名（院内カレンダーは場所も）。tone="director" は院長の予定（色を変える）
// - 「大きく」と表示の選択は、そのブラウザで覚える（読み書きに失敗しても画面は正しく出る）

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
 * 261: 院内カレンダーの「📋 リスト」。今月から4か月分を、1か月＝1列で横に並べる。
 * パソコン（xl以上）＝4列／タブレットくらい（md〜xl）＝2列×2段／スマートフォン＝1列で縦に。
 * 列の中は今のリストと同じ：日ごとのまとまりに、終日→時刻の順。題名は折り返して全文。
 * 列ごとに中だけ縦に動く（md以上・列の高さをそろえる）。予定の無い月は「予定はありません。」
 */
export function MonthColumnsList({
  months,
  today,
  byYmd,
  emptyText,
}: {
  months: { y: number; m: number }[];
  today: string;
  byYmd: Map<string, CalItem[]>;
  emptyText: string;
}) {
  const days = Array.from(byYmd.keys()).sort();
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4" data-cal-list-columns>
      {months.map(({ y, m }) => {
        const prefix = `${y}-${String(m).padStart(2, "0")}-`;
        // 今月の列は今日から先（今のリストの決まりどおり）
        const groups = days.filter((d) => d.startsWith(prefix) && d >= today).map((ymd) => ({ ymd, items: byYmd.get(ymd)! }));
        return (
          <section
            key={prefix}
            className="flex min-w-0 flex-col rounded-xl border border-gray-200 bg-white md:h-[70vh] md:min-h-[420px]"
            data-cal-list-month={`${y}-${m}`}
          >
            <h2 className="shrink-0 border-b border-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-800">
              {y}年{m}月
            </h2>
            <div className="min-h-0 flex-1 space-y-3 px-2.5 py-2.5 md:overflow-y-auto" data-cal-list-scroll>
              {groups.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500">{emptyText}</p>
              ) : (
                groups.map((g) => (
                  <div key={g.ymd} className="space-y-1" data-cal-list-day={g.ymd}>
                    <h3 className="flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                      {formatDayHeading(g.ymd)}
                      {g.ymd === today && <TodayBadge />}
                    </h3>
                    <ul className="space-y-1">
                      {g.items.map((it) => (
                        <CompactItem key={it.id} it={it} />
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** 261: リストの列の1件（少し詰める）。「終日」の札と時刻は今のまま・題名は折り返して全文 */
function CompactItem({ it }: { it: CalItem }) {
  const director = it.tone === "director";
  return (
    <li
      className={`rounded-md border px-2 py-1.5 ${director ? "border-violet-200 bg-violet-50" : "border-gray-100 bg-gray-50/60"}`}
      data-cal-item={director ? "director" : "clinic"}
    >
      {it.allDay ? (
        <span className="mr-1.5 inline-block rounded-full bg-sky-100 px-2 py-0.5 align-middle text-[10px] font-medium text-sky-800">終日</span>
      ) : (
        <span className="mr-1.5 align-middle text-[11px] tabular-nums text-gray-600">{it.time}</span>
      )}
      <span className={`break-words align-middle text-[13px] leading-snug ${director ? "text-violet-900" : "text-gray-800"}`}>{it.title}</span>
      {it.location && <span className="block break-words text-[11px] text-gray-500">📍 {it.location}</span>}
    </li>
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
  hoverPopover = false,
}: {
  year: number;
  month: number;
  today: string;
  byYmd: Map<string, CalItem[]>;
  selectedYmd: string | null;
  onSelect: (ymd: string) => void;
  big: boolean;
  /** 259: パソコンで日にカーソルを合わせて止める（キーボードはフォーカス）と、その日の予定を全部ポップアップで出す（院内カレンダーだけ） */
  hoverPopover?: boolean;
}) {
  const weeks = buildMonthWeeks(year, month);
  const pop = useDayPopover(hoverPopover);
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
              {...(hoverPopover && items.length > 0 ? pop.bind(ymd, i % 7) : {})}
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
      {pop.open && (
        <DayPopover
          ymd={pop.open.ymd}
          today={today}
          items={byYmd.get(pop.open.ymd) ?? []}
          anchor={pop.open.el}
          col={pop.open.col}
          onEnter={pop.cancelClose}
          onLeave={pop.scheduleClose}
          onClose={pop.close}
        />
      )}
    </section>
  );
}

// ─── 259: その日の予定のポップアップ（院内カレンダーの月表示） ───────────────────────────
/** カーソルを止めてから出すまで（通り過ぎただけでは出さない） */
export const DAY_POPOVER_OPEN_MS = 300;
/** マスとポップアップの両方から離れてから閉じるまで（間を渡れるように） */
const DAY_POPOVER_CLOSE_MS = 250;

type OpenDay = { ymd: string; el: HTMLElement; col: number };

/**
 * マスに付けるイベントと、開いている日。
 * - マウス：止まって0.3秒で開く。別のマスに0.3秒止まればそのマスへ切り替わる
 * - キーボード：フォーカスですぐ開く・Esc で閉じる
 * - 指（タッチ・ペン）では開かない（スマートフォンは、今までどおり押すと下にその日の予定）
 */
function useDayPopover(enabled: boolean) {
  const [open, setOpen] = useState<OpenDay | null>(null);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);
  const clear = (r: { current: number | null }) => {
    if (r.current !== null) {
      window.clearTimeout(r.current);
      r.current = null;
    }
  };
  const cancelClose = useCallback(() => clear(closeTimer), []);
  const close = useCallback(() => {
    clear(openTimer);
    clear(closeTimer);
    setOpen(null);
  }, []);
  const scheduleClose = useCallback(() => {
    clear(closeTimer);
    closeTimer.current = window.setTimeout(() => setOpen(null), DAY_POPOVER_CLOSE_MS);
  }, []);
  useEffect(() => () => {
    clear(openTimer);
    clear(closeTimer);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const bind = (ymd: string, col: number) =>
    enabled
      ? {
          onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
            if (e.pointerType !== "mouse") return;
            const el = e.currentTarget;
            clear(openTimer);
            // 開いているあいだに別のマスへ移ったら、今のポップアップは残したまま0.3秒待って切り替える（消えてまた出る、をしない）
            cancelClose();
            if (open?.ymd === ymd) return;
            openTimer.current = window.setTimeout(() => {
              clear(closeTimer);
              setOpen({ ymd, el, col });
            }, DAY_POPOVER_OPEN_MS);
          },
          onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
            if (e.pointerType !== "mouse") return;
            clear(openTimer);
            if (open) scheduleClose();
          },
          onFocus: (e: React.FocusEvent<HTMLElement>) => {
            // マウスで押したときのフォーカスでは開かない（キーボードで移ったときだけ）
            if (!e.currentTarget.matches(":focus-visible")) return;
            clear(openTimer);
            clear(closeTimer);
            setOpen({ ymd, el: e.currentTarget, col });
          },
          onBlur: (e: React.FocusEvent<HTMLElement>) => {
            const next = e.relatedTarget as HTMLElement | null;
            if (next?.closest?.("[data-cal-day-popover]")) return;
            if (open?.ymd === ymd) scheduleClose();
          },
          "aria-haspopup": "dialog" as const,
          "aria-expanded": open?.ymd === ymd,
        }
      : {};

  return { open, bind, cancelClose, scheduleClose, close };
}

/**
 * ポップアップの置き場所（純関数）。マスの右（金・土は左）に、となりのマス1つぶんを空けて出す
 * ＝となりのマス（上下左右・斜め）へカーソルを動かす道をふさがない。入りきらなければ画面の中に寄せる。
 * 上はマスの上端にそろえ、下の方の週では上へずらして画面の中に収める。
 */
export function placeDayPopover(
  cell: { left: number; right: number; top: number; width: number },
  size: { w: number; h: number },
  view: { w: number; h: number },
  col: number
): { left: number; top: number } {
  const m = 8;
  const gap = cell.width; // となりのマス1つぶん
  let left =
    col >= 5
      ? cell.left - gap - size.w // 金・土は左へ
      : cell.right + gap;
  if (col >= 5 && left < m) left = cell.right + gap; // 左に入らなければ右
  if (col < 5 && left + size.w > view.w - m) {
    const alt = cell.left - gap - size.w;
    left = alt >= m ? alt : view.w - m - size.w; // 右に入らなければ左、それも無理なら画面の右端の中
  }
  left = Math.max(m, Math.min(left, view.w - m - size.w));
  const top = Math.max(m, Math.min(cell.top, view.h - m - size.h));
  return { left, top };
}

function DayPopover({
  ymd,
  today,
  items,
  anchor,
  col,
  onEnter,
  onLeave,
  onClose,
}: {
  ymd: string;
  today: string;
  items: CalItem[];
  anchor: HTMLElement;
  col: number;
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const c = anchor.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const { left, top } = placeDayPopover(c, { w: b.width, h: b.height }, { w: window.innerWidth, h: window.innerHeight }, col);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.visibility = "visible";
    };
    place();
    // ページが動いたら、マスについて行く（キーボードで移ったときのページの動きでも消えない）。
    // マスが画面から出たら閉じる（マスから離れた所に残さない）。ポップアップの中を動かすのは何もしない
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && el.contains(e.target)) return;
      const c = anchor.getBoundingClientRect();
      if (c.bottom < 0 || c.top > window.innerHeight) onClose();
      else place();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, col, ymd, items.length, onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={formatDayHeading(ymd)}
      data-cal-day-popover={ymd}
      onPointerEnter={(e) => e.pointerType === "mouse" && onEnter()}
      onPointerLeave={(e) => e.pointerType === "mouse" && onLeave()}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onLeave();
      }}
      style={{ position: "fixed", left: 0, top: 0, visibility: "hidden", zIndex: 60, width: "min(300px, calc(100vw - 16px))", maxHeight: "min(440px, calc(100vh - 16px))" }}
      className="flex flex-col rounded-2xl border border-teal-200 bg-white p-3 shadow-[0_14px_34px_rgba(24,66,58,0.16)]"
    >
      <h2 className="mb-2 flex shrink-0 items-center gap-2 text-sm font-semibold text-gray-800">
        {formatDayHeading(ymd)}
        {ymd === today && <TodayBadge />}
      </h2>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto" data-cal-day-popover-list>
        {items.map((it) => (
          <PopoverItem key={it.id} it={it} />
        ))}
      </ul>
    </div>,
    document.body
  );
}

/** ポップアップの1件：時刻（終日）・題名の全文・色の印（院長の予定は文字も添える）。院内の予定は場所も（今の「その日の予定」と同じ） */
function PopoverItem({ it }: { it: CalItem }) {
  const director = it.tone === "director";
  return (
    <li
      className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 ${director ? "border-violet-200 bg-violet-50" : "border-gray-100 bg-gray-50/60"}`}
      data-cal-item={director ? "director" : "clinic"}
    >
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotCls(it)}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          {it.allDay ? (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">終日</span>
          ) : (
            <span className="text-xs tabular-nums text-gray-600">{it.time}</span>
          )}
          {director && <span className="text-[10px] font-medium text-violet-700" data-cal-director-tag>{DIRECTOR_LABEL}</span>}
        </div>
        <p className={`break-words text-sm ${director ? "text-violet-900" : "text-gray-800"}`}>{it.title}</p>
        {it.location && <p className="break-words text-xs text-gray-500">📍 {it.location}</p>}
      </div>
    </li>
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

/**
 * 切り替えのボタンの行（246）。表示を切り替えても、切り替えのボタンと「🔄 再読み込み」の位置を動かさない。
 * - lg以上：1行に [📋 🗓 📅] [表示ごとのボタン（残りの幅）] [🔄 再読み込み]
 * - lg未満：1行目に [📋 🗓 📅]、2行目に [表示ごとのボタン] [🔄 再読み込み]。表示ごとのボタンが無い表示でも2行目の高さは同じ
 *   折り返し方を中身ではなく画面の幅だけで決めるので、どの表示でも同じ折り返し方になる
 */
export function CalendarToolbar({
  view,
  onViewChange,
  extra,
  reloading,
  onReload,
}: {
  view: CalView;
  onViewChange: (v: CalView) => void;
  extra?: ReactNode;
  reloading: boolean;
  onReload: () => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2" data-cal-toolbar>
      <div className="col-span-2 lg:col-span-1 lg:col-start-1 lg:row-start-1 justify-self-start" data-cal-toolbar-switch>
        <ViewSwitch view={view} onChange={onViewChange} />
      </div>
      <div className="col-start-1 row-start-2 lg:col-start-2 lg:row-start-1 min-w-0 min-h-[38px] flex items-center gap-2 flex-wrap" data-cal-toolbar-extra>
        {extra}
      </div>
      <button
        type="button"
        onClick={onReload}
        disabled={reloading}
        className="col-start-2 row-start-2 lg:col-start-3 lg:row-start-1 self-start justify-self-end min-w-[8.5rem] text-sm px-3 py-2 border border-gray-200 rounded-full hover:bg-gray-50 disabled:opacity-50"
        data-cal-reload
      >
        {reloading ? "更新中…" : "🔄 再読み込み"}
      </button>
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

/** ◀ 今月 ▶（260: 月表示で月を送る・今月に戻る） */
export function MonthNav({
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
      <button type="button" onClick={onPrev} disabled={!canPrev} className={`${segOff} disabled:opacity-40`} aria-label="前の月" data-cal-month-prev>
        ◀
      </button>
      <button type="button" onClick={onToday} className={segOff} data-cal-month-today>
        今月
      </button>
      <button type="button" onClick={onNext} disabled={!canNext} className={`${segOff} disabled:opacity-40`} aria-label="次の月" data-cal-month-next>
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
