"use client";

// 📊 ガントチャートの画面（指示書250・デザインは250-補「さくらミルク（グラデーション）」）
//
// ・左に計画の名前、右に期間の横棒。1日だけのものは◆。表示は 月（列＝日）・四半期（列＝週）・年（列＝月・年度で区切る）
// ・◀ 今日 ▶ で前後に送る・今日の期間に戻る。今日の位置に縦の線と「今日」の札
// ・分類ごとに色。分類で絞り込める（色だけで見分けさせない＝分類の名前を必ず出す）
// ・横棒を押すと、くわしい内容（名前・分類・期間・担当・状態・メモ）
// ・書く人（院長・任された幹部）には「＋ 追加」「直す」「消す」と ↑↓。分類を直す欄は院長だけ。判定はサーバー
// ・スマホ：名前の列は止めたまま、横棒の部分だけ横にずらして見る（ページは横にはみ出さない）
// ・切り替えのボタンは幅を固定（246：表示を変えてもボタンが動かない）
// ・色・角の丸さ・影は見本（~/Downloads/250-補_見本_ガントチャートA_さくらミルク.html）の値。字はこの画面だけで読み込む

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useStoredChoice } from "@/components/calendar/CalendarViews";
import { C, FONT_HREF } from "./sakura-theme";
import { usePageTitle } from "@/lib/use-nav";
import { jstTodayYmd } from "@/lib/library";
import {
  GANTT_COLOR_KEYS,
  GANTT_PALETTES,
  OTHER_CATEGORY_ID,
  STATUS_LABEL,
  TEAM_CATEGORY_ID,
  TEAM_NAME_MAX,
  TEAM_OVERVIEW_MAX,
  firstLine,
  isFixedCategory,
  TASK_STATUSES,
  VIEW_LABEL,
  categoryOf,
  columnSpan,
  grad,
  groupPlans,
  periodLabel,
  planAssigneeLabel,
  rangeFor,
  shortDate,
  spanIn,
  swapOrder,
  todayIn,
  type GanttCategory,
  type GanttColorKey,
  type GanttPlan,
  type GanttRange,
  type GanttView,
  type PlanFields,
  type TeamMember,
  type TaskStatus,
} from "@/lib/gantt";
import { OVERDUE_LABEL, isOverdue, progressLabel, swapTaskOrder, tasksOfPlan, type GanttTask } from "@/lib/gantt-tasks";
import { JudgeChip, TaskForm, TaskList, TaskStatusChip, ganttApi, type TaskDraft, type TaskPerms } from "./GanttTasks";

// ─── 見本の値（sakura-theme.ts に置いた） ───

const VIEWS: readonly GanttView[] = ["month", "quarter", "year"];
const VIEW_LS_KEY = "mk_gantt_view";

/** 名前の列の幅（スマホ／PC）と、横棒の部分の最小の幅（表示ごと） */
const NAME_COL = "w-[132px] md:w-[260px]";
const TIMELINE_MIN: Record<GanttView, number> = { year: 720, quarter: 760, month: 930 };
const CAT_ROW_H = 44;
const ROW_H = 48;

// ─── サーバーとのやりとり ───

type GanttData = {
  categories: GanttCategory[];
  plans: GanttPlan[];
  /** 直す・消すを出してよい計画（判定はサーバー） */
  editableIds: string[];
  /** 252: チームプロジェクトを足せる（ログインしたスタッフ全員） */
  canAddTeam: boolean;
  /** 252: メンバーに選べる人 */
  teamCandidates: TeamMember[];
  /** 見ている人の id */
  me: string;
  /** 253: 「📜 当院の歩みに残す」を出す・もう残した計画 */
  canAyumi?: boolean;
  keptPlanIds?: string[];
  canWrite: boolean;
  canEditCategories: boolean;
  fiscalStartMonth: number;
  /** 263: 計画の中のタスク・タスクを書ける計画・院長か・どのひとことでも消せるか */
  tasks: GanttTask[];
  taskManageIds: string[];
  isDirector: boolean;
  canModerate: boolean;
};
const TASK_ROW_H = 36;

const api = ganttApi;

// ─── 小さな部品 ───

function Chip({ kind, children }: { kind: "status" | "matrix" | "white"; children: React.ReactNode }) {
  const style =
    kind === "matrix"
      ? { background: C.matrixChip, color: C.matrixText }
      : kind === "white"
        ? { background: "#FFFFFF", color: C.statusText }
        : { background: C.statusChip, color: C.statusText };
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full px-[9px] py-[3px] text-[11px] leading-none" style={style}>
      {children}
    </span>
  );
}

function CategoryDot({ color, size = 10 }: { color: GanttColorKey; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: grad(GANTT_PALETTES[color].dot, 135) }}
    />
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

/** 列の線・今の列の帯・土日・今日の線（図の全部の行の後ろに1枚だけ敷く＝帯や線が行ごとに切れない） */
function TimelineBackdrop({ range, today, showTodayLine }: { range: GanttRange; today: string; showTodayLine: boolean }) {
  const t = todayIn(range, today);
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {range.columns.map((col, i) => {
        const s = columnSpan(range, col);
        return (
          <div
            key={col.from}
            className="absolute top-0 bottom-0"
            style={{
              left: `${s.left * 100}%`,
              width: `${s.width * 100}%`,
              borderLeft: i === 0 ? undefined : `1px solid ${C.ruleMonth}`,
              background: col.current ? C.currentCol : col.weekend ? C.weekend : undefined,
            }}
          />
        );
      })}
      {showTodayLine && t !== null && (
        <div className="absolute top-0 bottom-0 w-[2px] rounded-[2px]" style={{ left: `calc(${t * 100}% - 1px)`, background: C.todayLine }} />
      )}
    </div>
  );
}

// ─── 1つの横棒（または◆） ───

function PlanBar({
  plan,
  depth,
  color,
  range,
  open,
  today,
  onOpen,
}: {
  plan: GanttPlan;
  depth: 0 | 1;
  color: GanttColorKey;
  range: GanttRange;
  open: boolean;
  today: string;
  onOpen: (el: HTMLElement) => void;
}) {
  const pal = GANTT_PALETTES[color];
  const span = spanIn(range, plan.start, plan.end);
  if (!span) return null;
  const label = `${plan.name}（${periodLabel(plan.start, plan.end, today)}）のくわしい内容`;
  if (plan.start === plan.end) {
    // 1日だけ：◆と日付
    return (
      <button
        type="button"
        onClick={(e) => onOpen(e.currentTarget)}
        aria-label={label}
        aria-expanded={open}
        data-gantt-bar={plan.id}
        data-gantt-diamond
        className="absolute top-1/2 flex -translate-y-1/2 items-center gap-2 rounded-full py-1 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-[#E7A6B8]"
        style={{ left: `calc(${(span.left + span.width / 2) * 100}% - 7px)` }}
      >
        <span
          className="block h-[14px] w-[14px] shrink-0 rotate-45 rounded-[3px]"
          style={{
            background: grad(open ? pal.open : pal.bar, 135),
            boxShadow: open ? `0 0 0 4px ${C.ring}, 0 6px 14px ${pal.shadow}` : `0 3px 8px ${pal.shadow}`,
          }}
        />
        <span className="whitespace-nowrap text-[11px]" style={{ color: pal.text }}>
          {plan.status === "done" && <span data-gantt-done>✓ </span>}
          {shortDate(plan.start)}
        </span>
      </button>
    );
  }
  const h = depth === 0 ? 26 : 16;
  const r = 999;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      aria-label={label}
      aria-expanded={open}
      data-gantt-bar={plan.id}
      data-gantt-bar-done={plan.status === "done" ? "1" : undefined}
      className="absolute top-1/2 -translate-y-1/2 outline-none focus-visible:ring-2 focus-visible:ring-[#E7A6B8]"
      style={{
        left: `${span.left * 100}%`,
        width: `max(${span.width * 100}%, 8px)`,
        height: h,
        borderRadius: `${span.cutStart ? 4 : r}px ${span.cutEnd ? 4 : r}px ${span.cutEnd ? 4 : r}px ${span.cutStart ? 4 : r}px`,
        background: grad(open ? pal.open : depth === 0 ? pal.bar : pal.sub),
        boxShadow: open
          ? `0 0 0 4px ${C.ring}, 0 8px 18px rgba(180, 83, 106, 0.25)`
          : depth === 0
            ? `inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 6px 14px ${pal.shadow}`
            : "inset 0 1px 0 rgba(255, 255, 255, 0.8)",
      }}
    >
      {/* 252 §3: 完了になったら横棒に✓ */}
      {plan.status === "done" && (
        <span
          aria-hidden="true"
          data-gantt-done
          className="absolute left-1.5 top-1/2 flex -translate-y-1/2 items-center justify-center rounded-full bg-white/90 font-bold leading-none"
          style={{ width: h - 8, height: h - 8, minWidth: 10, minHeight: 10, fontSize: depth === 0 ? 12 : 9, color: pal.text }}
        >
          ✓
        </span>
      )}
    </button>
  );
}

// ─── 263: 計画の下のタスクの行（期限の日に小さな◆・完了は✓） ───

function TaskRow({
  task,
  color,
  range,
  view,
  open,
  onOpen,
}: {
  task: GanttTask;
  color: GanttColorKey;
  range: GanttRange;
  view: GanttView;
  open: boolean;
  onOpen: (el: HTMLElement) => void;
}) {
  const pal = GANTT_PALETTES[color];
  const span = spanIn(range, task.due, task.due);
  const done = task.status === "done";
  return (
    <div className="flex" data-gantt-task-row={task.id}>
      <div
        className={`${NAME_COL} sticky left-0 z-10 flex shrink-0 items-center gap-1 pr-2 md:pr-3.5`}
        style={{ height: TASK_ROW_H, paddingLeft: 30, background: "rgba(255,255,255,0.97)" }}
      >
        <span aria-hidden="true" className="h-[6px] w-[6px] shrink-0 rotate-45 rounded-[1px]" style={{ background: pal.dot[0] }} />
        <span className="min-w-0 flex-1 truncate text-[11px] md:text-[12px]" style={{ color: done ? C.sub : C.ink }} title={task.title}>
          {done && "✓ "}
          {task.title}
        </span>
        {task.directorJudge && (
          <span className="hidden md:inline">
            <JudgeChip small />
          </span>
        )}
      </div>
      <div className="relative flex-1" style={{ minWidth: TIMELINE_MIN[view], height: TASK_ROW_H }}>
        {span && (
          <button
            type="button"
            onClick={(e) => onOpen(e.currentTarget)}
            aria-label={`タスク「${task.title}」（期限 ${shortDate(task.due)}・${STATUS_LABEL[task.status]}${task.directorJudge ? "・院長が判断" : ""}）のくわしい内容`}
            aria-expanded={open}
            data-gantt-task-diamond={task.id}
            data-gantt-task-done={done ? "1" : undefined}
            className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full py-1 pr-2 outline-none focus-visible:ring-2 focus-visible:ring-[#E7A6B8]"
            style={{ left: `calc(${(span.left + span.width / 2) * 100}% - 5px)` }}
          >
            <span
              className="block h-[10px] w-[10px] shrink-0 rotate-45 rounded-[2px]"
              style={{
                background: grad(open ? pal.open : pal.bar, 135),
                boxShadow: open ? `0 0 0 3px ${C.ring}, 0 4px 10px ${pal.shadow}` : `0 2px 6px ${pal.shadow}`,
                outline: task.directorJudge ? "1.5px solid #8E5BB5" : undefined,
                outlineOffset: 1,
              }}
            />
            <span className="whitespace-nowrap text-[10px]" style={{ color: pal.text }}>
              {done && <span data-gantt-done>✓ </span>}
              {shortDate(task.due)}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── くわしい内容（横棒を押したとき） ───

function PlanDetail({
  plan,
  category,
  today,
  anchor,
  canWrite,
  canEdit,
  isDirector,
  ayumi,
  tasksSlot,
  onEdit,
  onDelete,
  onClose,
}: {
  plan: GanttPlan;
  category: GanttCategory;
  today: string;
  anchor: HTMLElement;
  canWrite: boolean;
  /** この計画の「直す」「消す」を出す（サーバーの editableIds） */
  canEdit: boolean;
  isDirector: boolean;
  /** 253: 「📜 当院の歩みに残す」（当院の歩みを書ける人だけ・null＝出さない） */
  ayumi: { kept: boolean; busy: boolean; onKeep: () => void } | null;
  /** 263: 「担当」「状態」の下に出すタスクの一覧 */
  tasksSlot?: React.ReactNode;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => {
      const b = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = Math.min(Math.max(8, b.left), Math.max(8, window.innerWidth - w - 8));
      let top = b.bottom + 8;
      if (top + h > window.innerHeight - 8) top = b.top - h - 8 >= 8 ? b.top - h - 8 : Math.max(8, window.innerHeight - h - 8);
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.visibility = "visible";
    };
    place();
    // 263: タスクを開く・足すと高さが変わるので、置き直す
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (ref.current?.contains(t) || anchor.contains(t))) return;
      // 263: タスクを足す・直す欄（別の重ね画面）を触っているあいだは閉じない
      if (t instanceof Element && t.closest("[data-gantt-keep-detail]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  const fromMatrix = plan.source === "matrix";
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`${plan.name} のくわしい内容`}
      data-gantt-detail={plan.id}
      className="overflow-y-auto overflow-x-hidden overscroll-contain"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        visibility: "hidden",
        zIndex: 60,
        width: tasksSlot ? "min(420px, calc(100vw - 16px))" : "min(300px, calc(100vw - 16px))",
        maxHeight: "calc(100dvh - 16px)",
        background: tasksSlot ? "#FFFFFF" : "rgba(255, 255, 255, 0.96)",
        border: "1px solid rgba(240, 213, 220, 0.9)",
        borderRadius: 20,
        boxShadow: "0 20px 44px rgba(142, 91, 181, 0.18)",
        fontFamily: C.sans,
        color: C.ink,
      }}
    >
      <div className="flex items-center justify-between gap-2 px-[18px] py-[14px]" style={{ background: C.detailHead }}>
        <strong className="min-w-0 break-words text-[15px]">{plan.name}</strong>
        <span className="flex shrink-0 gap-1.5">
          {fromMatrix && <Chip kind="matrix">四象限</Chip>}
          <Chip kind="white">{STATUS_LABEL[plan.status]}</Chip>
        </span>
      </div>
      {plan.kind === "team" ? (
        // 252 §3: チーム名・プロジェクト概要の全文・目標の達成期間・メンバー・状態・作った人
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-[14px] gap-y-1.5 px-[18px] pb-4 pt-[14px] text-[13px]" data-gantt-team-detail>
          <dt style={{ color: C.sub }}>分類</dt>
          <dd className="m-0">{category.name}</dd>
          <dt style={{ color: C.sub }}>プロジェクト概要</dt>
          <dd className="m-0 whitespace-pre-wrap break-words">{plan.memo}</dd>
          <dt style={{ color: C.sub }}>目標の達成期間</dt>
          <dd className="m-0">{periodLabel(plan.start, plan.end, today)}</dd>
          <dt style={{ color: C.sub }}>メンバー</dt>
          <dd className="m-0 break-words">{(plan.members ?? []).map((m) => m.name || "名前未設定").join("、")}</dd>
          <dt style={{ color: C.sub }}>状態</dt>
          <dd className="m-0">{STATUS_LABEL[plan.status]}</dd>
          <dt style={{ color: C.sub }}>作った人</dt>
          <dd className="m-0">{plan.createdByName || "—"}</dd>
        </dl>
      ) : (
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-[14px] gap-y-1.5 px-[18px] pb-4 pt-[14px] text-[13px]">
        <dt style={{ color: C.sub }}>分類</dt>
        <dd className="m-0">{category.name}</dd>
        <dt style={{ color: C.sub }}>期間</dt>
        <dd className="m-0">{periodLabel(plan.start, plan.end, today)}</dd>
        {planAssigneeLabel(plan) && (
          <>
            <dt style={{ color: C.sub }}>担当</dt>
            {/* 264: 一覧から選んだスタッフの名前と、文字で入れたものを並べる */}
            <dd className="m-0 break-words" data-gantt-detail-assignee>
              {planAssigneeLabel(plan)}
            </dd>
          </>
        )}
        <dt style={{ color: C.sub }}>状態</dt>
        <dd className="m-0">{STATUS_LABEL[plan.status]}</dd>
        {plan.memo && (
          <>
            <dt style={{ color: C.sub }}>メモ</dt>
            <dd className="m-0 whitespace-pre-wrap break-words">{plan.memo}</dd>
          </>
        )}
      </dl>
      )}
      {tasksSlot}
      {canWrite && fromMatrix && (
        <p className="px-[18px] pb-3 text-[12px]" style={{ color: C.sub }} data-gantt-matrix-note>
          四象限マトリクスの項目です。直すのは四象限マトリクスで行います。
          {isDirector && (
            <>
              {" "}
              <Link href="/admin/priority-matrix" className="underline" style={{ color: C.currentText }}>
                🧭 四象限マトリクスを開く
              </Link>
            </>
          )}
        </p>
      )}
      {ayumi && (
        <div className="px-[18px] pb-2">
          {ayumi.kept ? (
            <Link href="/ayumi" className="text-[12px] underline" style={{ color: C.currentText }} data-gantt-ayumi-kept>
              📜 当院の歩みに残しています
            </Link>
          ) : (
            <button
              type="button"
              onClick={ayumi.onKeep}
              disabled={ayumi.busy}
              className="min-h-[36px] w-full rounded-full border px-4 text-[13px] disabled:opacity-50"
              style={{ borderColor: "rgba(240, 209, 218, 0.9)", color: C.statusText, background: C.todayBtn }}
              data-gantt-ayumi-keep
            >
              {ayumi.busy ? "保存しています…" : "📜 当院の歩みに残す"}
            </button>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 px-[18px] pb-4">
        {canEdit && !fromMatrix && (
          <>
            <button type="button" onClick={onEdit} data-gantt-edit className="min-h-[36px] rounded-full px-4 text-[13px] font-bold text-white" style={{ background: C.hero, boxShadow: C.heroShadow }}>
              直す
            </button>
            <button type="button" onClick={onDelete} data-gantt-delete className="min-h-[36px] rounded-full border px-4 text-[13px]" style={{ borderColor: "rgba(240, 209, 218, 0.9)", color: C.statusText, background: "#FFFFFF" }}>
              消す
            </button>
          </>
        )}
        <button type="button" onClick={onClose} data-gantt-detail-close className="min-h-[36px] rounded-full border px-4 text-[13px]" style={{ borderColor: "rgba(240, 209, 218, 0.9)", color: C.sub, background: "#FFFFFF" }}>
          閉じる
        </button>
      </div>
    </div>,
    document.body
  );
}

// ─── 計画を足す・直す ───

type Draft = {
  name: string;
  categoryId: string;
  parentId: string;
  start: string;
  end: string;
  oneDay: boolean;
  /** 264: 担当のうち文字で入れたもの（役割など） */
  assignee: string;
  /** 264: 担当に選んだスタッフ */
  assigneeIds: string[];
  status: TaskStatus;
  memo: string;
};

function PlanForm({
  initial,
  editingId,
  categories,
  plans,
  candidates,
  busy,
  error,
  onSave,
  onClose,
}: {
  initial: Draft;
  editingId: string | null;
  categories: GanttCategory[];
  plans: GanttPlan[];
  /** 264: 担当に選べるスタッフ */
  candidates: TeamMember[];
  busy: boolean;
  error: string;
  onSave: (d: Draft) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [q, setQ] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const toggleAssignee = (id: string) => set("assigneeIds", d.assigneeIds.includes(id) ? d.assigneeIds.filter((x) => x !== id) : [...d.assigneeIds, id]);
  const shownCandidates = candidates.filter((c) => !q.trim() || c.name.includes(q.trim()));
  const hasChildren = editingId ? plans.some((p) => p.parentId === editingId) : false;
  const parents = plans.filter((p) => !p.parentId && p.source !== "matrix" && p.kind !== "team" && p.id !== editingId);
  const parent = parents.find((p) => p.id === d.parentId);
  const missing = !d.name.trim() ? "名前を入れてください" : !d.start ? "開始日を入れてください" : !d.oneDay && d.end && d.end < d.start ? "終了日は開始日より後にしてください" : "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const field = "mt-1 w-full rounded-xl border bg-white px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-[#F2C6D3]";
  const fieldStyle = { borderColor: "rgba(240, 209, 218, 0.9)", color: C.ink };
  const lab = "block text-[12px] font-medium";
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/25 sm:items-center" data-gantt-form-backdrop>
      <form
        role="dialog"
        aria-label={editingId ? "計画を直す" : "計画を追加"}
        data-gantt-form
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing && !busy) onSave(d);
        }}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] p-5 sm:max-w-[520px] sm:rounded-[24px]"
        style={{ background: "#FFFFFF", fontFamily: C.sans, color: C.ink, boxShadow: "0 20px 44px rgba(142, 91, 181, 0.18)" }}
      >
        <h2 className="mb-3 text-[18px] font-bold" style={{ fontFamily: C.serif }}>
          {editingId ? "計画を直す" : "＋ 追加"}
        </h2>
        <div className="space-y-3">
          <label className={lab} style={{ color: C.sub }}>
            名前
            <input type="text" value={d.name} maxLength={80} onChange={(e) => set("name", e.target.value)} className={field} style={fieldStyle} data-gantt-f-name />
          </label>
          {!hasChildren && (
            <label className={lab} style={{ color: C.sub }}>
              この計画の中に入れる（任意）
              <select value={d.parentId} onChange={(e) => set("parentId", e.target.value)} className={field} style={fieldStyle} data-gantt-f-parent>
                <option value="">入れない（ひとつの計画として出す）</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {categoryOf(categories, p.categoryId).name} ／ {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={lab} style={{ color: C.sub }}>
            分類
            <select
              value={parent ? parent.categoryId : d.categoryId}
              disabled={!!parent}
              onChange={(e) => set("categoryId", e.target.value)}
              className={`${field} disabled:opacity-60`}
              style={fieldStyle}
              data-gantt-f-category
            >
              {/* 252: 「チームプロジェクト」はスタッフが「＋ チームプロジェクトを追加」から書く分類なので、院の計画では選ばない */}
              {categories.filter((c) => c.id !== TEAM_CATEGORY_ID).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {parent && <span className="mt-1 block text-[11px]">中に入れた計画は、入れた先と同じ分類になります</span>}
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={lab} style={{ color: C.sub }}>
              開始日
              <input type="date" value={d.start} onChange={(e) => set("start", e.target.value)} className={field} style={fieldStyle} data-gantt-f-start />
            </label>
            {!d.oneDay && (
              <label className={lab} style={{ color: C.sub }}>
                終了日
                <input type="date" value={d.end} min={d.start || undefined} onChange={(e) => set("end", e.target.value)} className={field} style={fieldStyle} data-gantt-f-end />
              </label>
            )}
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-[13px]">
            <input type="checkbox" checked={d.oneDay} onChange={(e) => set("oneDay", e.target.checked)} className="h-4 w-4" data-gantt-f-oneday />
            1日だけ（◆で出します）
          </label>
          {/* 264: 担当はスタッフの一覧から選ぶ（チームプロジェクトのメンバーと同じ選び方）。役割などは文字でも入れられる */}
          <fieldset data-gantt-f-assignees>
            <legend className="text-[12px] font-medium" style={{ color: C.sub }}>
              担当（{d.assigneeIds.length}人・任意）
            </legend>
            {candidates.length > 8 && (
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前でさがす" aria-label="名前でさがす" className={field} style={fieldStyle} />
            )}
            <div className="mt-1.5 flex max-h-[180px] flex-wrap gap-1.5 overflow-y-auto">
              {shownCandidates.map((c) => {
                const on = d.assigneeIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleAssignee(c.id)}
                    data-gantt-f-assignee-pick={c.id}
                    className="min-h-[40px] rounded-full border px-3 text-[13px]"
                    style={{
                      borderColor: on ? "#E68AA0" : "rgba(240, 209, 218, 0.9)",
                      background: on ? "linear-gradient(135deg, #FBE1E8 0%, #F6E6F5 100%)" : "#FFFFFF",
                      color: on ? C.statusText : C.ink,
                      fontWeight: on ? 700 : 400,
                    }}
                  >
                    {on ? "✓ " : ""}
                    {c.name}
                  </button>
                );
              })}
            </div>
            <label className={`${lab} mt-2`} style={{ color: C.sub }}>
              役割など（文字で入れる・任意）
              <input type="text" value={d.assignee} maxLength={60} onChange={(e) => set("assignee", e.target.value)} placeholder="例：看護師、受付" className={field} style={fieldStyle} data-gantt-f-assignee />
            </label>
            <span className="mt-1 block text-[11px]" style={{ color: C.sub }}>
              一覧から選んだ人は、この計画のタスクを足す・直すことができます
            </span>
          </fieldset>
          <label className={lab} style={{ color: C.sub }}>
            状態
            <select value={d.status} onChange={(e) => set("status", e.target.value as TaskStatus)} className={field} style={fieldStyle} data-gantt-f-status>
              {TASK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className={lab} style={{ color: C.sub }}>
            メモ（任意）
            <textarea value={d.memo} rows={3} maxLength={2000} onChange={(e) => set("memo", e.target.value)} className={field} style={fieldStyle} data-gantt-f-memo />
          </label>
        </div>
        {(error || missing) && (
          <p role="alert" className="mt-3 rounded-xl px-3 py-2 text-[13px]" style={{ background: "#FCEEF1", color: C.statusText }} data-gantt-f-error>
            {error || missing}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded-full border px-5 text-[14px]" style={{ borderColor: "rgba(240, 209, 218, 0.9)", color: C.sub }}>
            閉じる
          </button>
          <button type="submit" disabled={!!missing || busy} className="min-h-[44px] rounded-full px-6 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: C.hero, boxShadow: C.heroShadow }} data-gantt-f-save>
            {busy ? "保存しています…" : "保存"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

// ─── 252: チームプロジェクトを足す・直す ───

type TeamDraft = { name: string; memo: string; start: string; end: string; memberIds: string[]; status: TaskStatus };

function TeamForm({
  initial,
  editing,
  candidates,
  myId,
  busy,
  error,
  onSave,
  onClose,
}: {
  initial: TeamDraft;
  editing: boolean;
  candidates: TeamMember[];
  myId: string;
  busy: boolean;
  error: string;
  onSave: (d: TeamDraft) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<TeamDraft>(initial);
  const [q, setQ] = useState("");
  const set = <K extends keyof TeamDraft>(k: K, v: TeamDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const missing = !d.name.trim()
    ? "チーム名を入れてください"
    : !d.memo.trim()
      ? "プロジェクト概要を入れてください"
      : !d.start || !d.end
        ? "目標の達成期間（開始日と達成日）を入れてください"
        : d.end < d.start
          ? "達成日は開始日より後にしてください"
          : "";
  const toggle = (id: string) => set("memberIds", d.memberIds.includes(id) ? d.memberIds.filter((x) => x !== id) : [...d.memberIds, id]);
  const shown = candidates.filter((c) => !q.trim() || c.name.includes(q.trim()));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const field = "mt-1 w-full rounded-xl border bg-white px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-[#F2C6D3]";
  const fieldStyle = { borderColor: "rgba(240, 209, 218, 0.9)", color: C.ink };
  const lab = "block text-[12px] font-medium";
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/25 sm:items-center" data-gantt-form-backdrop>
      <form
        role="dialog"
        aria-label={editing ? "チームプロジェクトを直す" : "チームプロジェクトを追加"}
        data-gantt-team-form
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing && !busy) onSave(d);
        }}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] p-5 sm:max-w-[560px] sm:rounded-[24px]"
        style={{ background: "#FFFFFF", fontFamily: C.sans, color: C.ink, boxShadow: "0 20px 44px rgba(142, 91, 181, 0.18)" }}
      >
        <h2 className="mb-1 text-[18px] font-bold" style={{ fontFamily: C.serif }}>
          {editing ? "チームプロジェクトを直す" : "＋ チームプロジェクトを追加"}
        </h2>
        {!editing && (
          <p className="mb-3 text-[12px]" style={{ color: C.sub }}>
            保存すると、すぐにガントチャートに出て、「📣 お知らせ・イベント」で全員に知らせます。
          </p>
        )}
        <div className="space-y-3">
          <label className={lab} style={{ color: C.sub }}>
            チーム名
            <input type="text" value={d.name} maxLength={TEAM_NAME_MAX} onChange={(e) => set("name", e.target.value)} className={field} style={fieldStyle} data-gantt-t-name />
          </label>
          <label className={lab} style={{ color: C.sub }}>
            プロジェクト概要（{TEAM_OVERVIEW_MAX}字まで）
            <textarea value={d.memo} rows={4} maxLength={TEAM_OVERVIEW_MAX} onChange={(e) => set("memo", e.target.value)} className={field} style={fieldStyle} data-gantt-t-memo />
            <span className="mt-0.5 block text-right text-[11px]" data-gantt-t-count>
              {d.memo.length}／{TEAM_OVERVIEW_MAX}
            </span>
          </label>
          <fieldset>
            <legend className="text-[12px] font-medium" style={{ color: C.sub }}>
              目標の達成期間
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <label className={lab} style={{ color: C.sub }}>
                開始日
                <input type="date" value={d.start} onChange={(e) => set("start", e.target.value)} className={field} style={fieldStyle} data-gantt-t-start />
              </label>
              <label className={lab} style={{ color: C.sub }}>
                達成日
                <input type="date" value={d.end} min={d.start || undefined} onChange={(e) => set("end", e.target.value)} className={field} style={fieldStyle} data-gantt-t-end />
              </label>
            </div>
          </fieldset>
          <fieldset data-gantt-t-members>
            <legend className="text-[12px] font-medium" style={{ color: C.sub }}>
              メンバー（{d.memberIds.length}人）
            </legend>
            {candidates.length > 8 && (
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前でさがす" aria-label="名前でさがす" className={field} style={fieldStyle} />
            )}
            <div className="mt-1.5 flex max-h-[180px] flex-wrap gap-1.5 overflow-y-auto">
              {shown.map((c) => {
                const on = d.memberIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(c.id)}
                    data-gantt-t-member={c.id}
                    className="min-h-[40px] rounded-full border px-3 text-[13px]"
                    style={{
                      borderColor: on ? "#E8C35A" : "rgba(240, 209, 218, 0.9)",
                      background: on ? "linear-gradient(135deg, #FDF0C8 0%, #FBE3CF 100%)" : "#FFFFFF",
                      color: on ? "#86650F" : C.ink,
                      fontWeight: on ? 700 : 400,
                    }}
                  >
                    {on ? "✓ " : ""}
                    {c.name}
                    {c.id === myId ? "（自分）" : ""}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className={lab} style={{ color: C.sub }}>
            状態
            <select value={d.status} onChange={(e) => set("status", e.target.value as TaskStatus)} className={field} style={fieldStyle} data-gantt-t-status>
              {TASK_STATUSES.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {(error || missing) && (
          <p role="alert" className="mt-3 rounded-xl px-3 py-2 text-[13px]" style={{ background: "#FCEEF1", color: C.statusText }} data-gantt-t-error>
            {error || missing}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded-full border px-5 text-[14px]" style={{ borderColor: "rgba(240, 209, 218, 0.9)", color: C.sub }}>
            閉じる
          </button>
          <button type="submit" disabled={!!missing || busy} className="min-h-[44px] rounded-full px-6 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: C.hero, boxShadow: C.heroShadow }} data-gantt-t-save>
            {busy ? "保存しています…" : "保存"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

// ─── 分類を直す（院長だけ） ───

function CategoryEditor({ categories, onSaved }: { categories: GanttCategory[]; onSaved: (c: GanttCategory[], moved: number) => void }) {
  const [rows, setRows] = useState<GanttCategory[]>(categories);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const dirty = JSON.stringify(rows) !== JSON.stringify(categories);

  const update = (i: number, patch: Partial<GanttCategory>) => setRows((p) => p.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const move = (i: number, dir: -1 | 1) =>
    setRows((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length || p[j].id === OTHER_CATEGORY_ID || p[i].id === OTHER_CATEGORY_ID) return p;
      // チームプロジェクトは動かさないが、ほかの分類はその上下へ動ける
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  const remove = (i: number) => {
    const c = rows[i];
    if (!window.confirm(`分類「${c.name}」を消します。この分類の計画は「その他」に移ります。\n\n（「保存」を押すまでは消えません）`)) return;
    setRows((p) => p.filter((_, k) => k !== i));
  };
  const add = () => {
    const used = new Set(rows.map((c) => c.color));
    const color = GANTT_COLOR_KEYS.find((k) => !used.has(k)) ?? "butter";
    const id = `c-${Date.now().toString(36)}`;
    setRows((p) => [...p.filter((c) => c.id !== OTHER_CATEGORY_ID), { id, name: "", color }, ...p.filter((c) => c.id === OTHER_CATEGORY_ID)]);
  };
  const save = async () => {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const j = await api<{ categories: GanttCategory[]; moved: number }>("/api/gantt", { method: "PUT", body: JSON.stringify({ categories: rows.filter((c) => c.name.trim()) }) });
      setRows(j.categories);
      onSaved(j.categories, j.moved);
      setMsg(j.moved > 0 ? `保存しました（${j.moved}件の計画を「その他」に移しました）` : "保存しました");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-[28px] p-5" style={{ background: C.cardBg, border: C.cardBorder, boxShadow: C.cardShadow }} data-gantt-categories>
      <summary className="cursor-pointer text-[15px] font-bold" style={{ fontFamily: C.serif }}>
        分類を直す（院長だけ）
      </summary>
      <p className="mt-2 text-[12px]" style={{ color: C.sub }}>
        分類を足す・名前を変える・色を選ぶ・消すことができます。消した分類の計画は「その他」に移ります。「チームプロジェクト」と「その他」は消せません（名前は変えられます）。
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/80 p-2" data-gantt-cat-row={c.id}>
            <CategoryDot color={c.color} size={14} />
            <input
              type="text"
              value={c.name}
              maxLength={30}
              placeholder="分類の名前"
              onChange={(e) => update(i, { name: e.target.value })}
              aria-label="分類の名前"
              className="min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 text-[14px]"
              style={{ borderColor: "rgba(240, 209, 218, 0.9)" }}
              data-gantt-cat-name
            />
            {c.id === TEAM_CATEGORY_ID ? (
              <span className="text-[11px]" style={{ color: C.sub }} data-gantt-cat-fixed-color>
                色はバターで決まっています・消せません
              </span>
            ) : (
            <span className="flex flex-wrap gap-1" role="radiogroup" aria-label="色">
              {GANTT_COLOR_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={c.color === k}
                  aria-label={GANTT_PALETTES[k].label}
                  title={GANTT_PALETTES[k].label}
                  onClick={() => update(i, { color: k })}
                  className="h-[30px] w-[30px] rounded-full"
                  style={{ background: grad(GANTT_PALETTES[k].bar, 135), boxShadow: c.color === k ? `0 0 0 2px #FFFFFF, 0 0 0 4px ${GANTT_PALETTES[k].text}` : "none" }}
                  data-gantt-cat-color={k}
                />
              ))}
            </span>
            )}
            {!isFixedCategory(c.id) && (
              <span className="flex gap-1">
                <button type="button" onClick={() => move(i, -1)} aria-label="上へ" className="h-[36px] w-[36px] rounded-full border bg-white text-[12px]" style={{ borderColor: "rgba(240, 209, 218, 0.9)" }}>
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} aria-label="下へ" className="h-[36px] w-[36px] rounded-full border bg-white text-[12px]" style={{ borderColor: "rgba(240, 209, 218, 0.9)" }}>
                  ↓
                </button>
                <button type="button" onClick={() => remove(i)} className="min-h-[36px] rounded-full border bg-white px-3 text-[12px]" style={{ borderColor: "rgba(240, 209, 218, 0.9)", color: C.statusText }} data-gantt-cat-delete={c.id}>
                  消す
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={add} className="min-h-[44px] rounded-full border bg-white px-4 text-[13px]" style={{ borderColor: "rgba(240, 209, 218, 0.9)" }} data-gantt-cat-add>
          ＋ 分類を足す
        </button>
        <button type="button" onClick={() => void save()} disabled={!dirty || busy} className="min-h-[44px] rounded-full px-6 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: C.hero, boxShadow: C.heroShadow }} data-gantt-cat-save>
          {busy ? "保存しています…" : "保存"}
        </button>
        {msg && <span className="text-[12px]" style={{ color: "#337559" }}>{msg}</span>}
        {err && <span role="alert" className="text-[12px]" style={{ color: C.statusText }}>{err}</span>}
      </div>
    </details>
  );
}

/** 直すとき：今のメンバーが一覧に無い（アカウントが止まった等）なら、名前だけ足して外せるようにする */
function teamCandidatesWithMembers(candidates: TeamMember[], members: TeamMember[]): TeamMember[] {
  const extra = members.filter((m) => !candidates.some((c) => c.id === m.id));
  return [...candidates, ...extra];
}

// ─── 本体 ───

export function GanttBoard() {
  const today = jstTodayYmd();
  const pageTitle = usePageTitle("/gantt", "📊 ガントチャート").replace(/^\p{Extended_Pictographic}️?\s*/u, "");
  const [view, setView] = useStoredChoice<GanttView>(VIEW_LS_KEY, VIEWS, "year");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<GanttData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [hiddenCats, setHiddenCats] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<{ id: string; el: HTMLElement; taskId?: string } | null>(null);
  // 263: タスクを開いている計画（最初はたたむ）・タスクを足す/直す欄・「院長が判断」の一覧
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [taskForm, setTaskForm] = useState<{ planId: string; editing: GanttTask | null; initial: TaskDraft } | null>(null);
  const [judgeOpen, setJudgeOpen] = useState(false);
  const [form, setForm] = useState<{ editingId: string | null; initial: Draft } | null>(null);
  const [teamForm, setTeamForm] = useState<{ editingId: string | null; initial: TeamDraft } | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    try {
      const j = await api<GanttData>("/api/gantt");
      setData({
        ...j,
        editableIds: j.editableIds ?? [],
        teamCandidates: j.teamCandidates ?? [],
        canAddTeam: !!j.canAddTeam,
        tasks: j.tasks ?? [],
        taskManageIds: j.taskManageIds ?? [],
      });
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "読み込めませんでした");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const range = useMemo(() => rangeFor(view, today, offset, data?.fiscalStartMonth ?? 6), [view, today, offset, data?.fiscalStartMonth]);
  const categories = useMemo(() => data?.categories ?? [], [data]);
  const visibleCats = useMemo(() => new Set(categories.map((c) => c.id).filter((id) => !hiddenCats.has(id))), [categories, hiddenCats]);
  const groups = useMemo(() => groupPlans(data?.plans ?? [], categories, visibleCats), [data, categories, visibleCats]);
  const canWrite = !!data?.canWrite;
  const openedPlan = opened ? data?.plans.find((p) => p.id === opened.id) ?? null : null;

  // 横にずらして見る画面（スマホなど）では、今日の位置が見えるところまで自動でずらす
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasData = !!data;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const t = todayIn(range, today);
    const nameW = el.querySelector<HTMLElement>("[data-gantt-namehead]")?.offsetWidth ?? 0;
    const timelineW = el.scrollWidth - nameW;
    const visibleW = el.clientWidth - nameW;
    el.scrollLeft = t === null ? 0 : Math.max(0, t * timelineW - visibleW / 3);
  }, [range, today, hasData]);

  const changeView = (v: GanttView) => {
    setView(v);
    setOffset(0);
    setOpened(null);
  };

  const canEditPlan = (p: GanttPlan) => !!data?.editableIds.includes(p.id);

  // ─── 263: 計画の中のタスク ───
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const taskPerms = (planId: string): TaskPerms => ({
    me: data?.me ?? "",
    manage: !!data?.taskManageIds.includes(planId),
    isDirector: !!data?.isDirector,
    canModerate: !!data?.canModerate,
  });
  const upsertTask = (t: GanttTask) =>
    setData((d) => (d ? { ...d, tasks: d.tasks.some((x) => x.id === t.id) ? d.tasks.map((x) => (x.id === t.id ? t : x)) : [...d.tasks, t] } : d));
  const removeTask = (id: string) => setData((d) => (d ? { ...d, tasks: d.tasks.filter((x) => x.id !== id) } : d));
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  /** 院長：「院長が判断」のタスクで完了していないもの */
  const judgePending = useMemo(() => tasks.filter((t) => t.directorJudge && t.status !== "done"), [tasks]);

  const openTaskForm = (planId: string, editing: GanttTask | null) => {
    setFormError("");
    setTaskForm({
      planId,
      editing,
      initial: editing
        ? { title: editing.title, assigneeIds: editing.assignees.map((a) => a.id), due: editing.due, directorJudge: editing.directorJudge, status: editing.status, memo: editing.memo }
        : { title: "", assigneeIds: [], due: "", directorJudge: false, status: "todo", memo: "" },
    });
  };

  const saveTask = async (d: TaskDraft) => {
    if (!taskForm) return;
    setFormBusy(true);
    setFormError("");
    const fields = { title: d.title.trim(), assignees: d.assigneeIds, due: d.due, directorJudge: d.directorJudge, status: d.status, memo: d.memo };
    try {
      const j = taskForm.editing
        ? await ganttApi<{ task: GanttTask }>("/api/gantt/tasks", { method: "PATCH", body: JSON.stringify({ id: taskForm.editing.id, fields }) })
        : await ganttApi<{ task: GanttTask }>("/api/gantt/tasks", { method: "POST", body: JSON.stringify({ planId: taskForm.planId, fields }) });
      upsertTask(j.task);
      setTaskForm(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setFormBusy(false);
    }
  };

  const reorderTask = async (planId: string, id: string, dir: -1 | 1) => {
    if (!data) return;
    const next = swapTaskOrder(data.tasks, id, dir);
    if (!next) return;
    setActionError("");
    setData({ ...data, tasks: data.tasks.map((t) => ({ ...t, order: next.find((n) => n.id === t.id)?.order ?? t.order })) });
    try {
      await ganttApi("/api/gantt/tasks", { method: "PATCH", body: JSON.stringify({ planId, reorder: next }) });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "並べ替えられませんでした");
      await load();
    }
  };

  /** 計画のくわしい内容を開く（棒が今の期間に無いときは、名前の欄から開く） */
  const openPlanById = (planId: string, taskId?: string) => {
    const el =
      document.querySelector<HTMLElement>(`[data-gantt-bar="${CSS.escape(planId)}"]`) ??
      document.querySelector<HTMLElement>(`[data-gantt-name="${CSS.escape(planId)}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    setOpened({ id: planId, el, taskId });
    return true;
  };

  // 263: 「📋 みんなのタスク」から来たとき（/gantt?plan=…&task=…）は、その計画のくわしい内容を開く
  const deepLinked = useRef(false);
  useEffect(() => {
    if (!data || deepLinked.current) return;
    deepLinked.current = true;
    const q = new URLSearchParams(window.location.search);
    const planId = q.get("plan");
    if (!planId) return;
    requestAnimationFrame(() => {
      if (!openPlanById(planId, q.get("task") ?? undefined)) setActionError("その計画は見つかりませんでした（消されたか、見られない計画です）");
    });
  }, [data]);

  // 253: ガントチャートの中身（題名・期間・分類・チーム名とメンバー）を写して、当院の歩みの1件をつくる
  const [keeping, setKeeping] = useState(false);
  const keepToAyumi = async (p: GanttPlan) => {
    setKeeping(true);
    setActionError("");
    try {
      await api("/api/ayumi", { method: "POST", body: JSON.stringify({ fromPlanId: p.id }) });
      setData((d) => (d ? { ...d, keptPlanIds: [...(d.keptPlanIds ?? []), p.id] } : d));
      setNotice("「📜 当院の歩み」に残しました。想いなどは「📜 当院の歩み」で書き足せます");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "残せませんでした");
    } finally {
      setKeeping(false);
    }
  };
  /** 自分の id（メンバーに最初から入れる。サーバーでも必ず入れる） */
  const myId = data?.me ?? "";

  const newTeamDraft = (): TeamDraft => ({
    name: "",
    memo: "",
    start: today,
    end: today,
    memberIds: myId ? [myId] : [],
    status: "todo",
  });

  const saveTeam = async (d: TeamDraft) => {
    if (!teamForm) return;
    setFormBusy(true);
    setFormError("");
    const fields = { name: d.name.trim(), memo: d.memo, start: d.start, end: d.end, status: d.status, members: d.memberIds };
    try {
      if (teamForm.editingId) {
        await api("/api/gantt", { method: "PATCH", body: JSON.stringify({ id: teamForm.editingId, fields }) });
        setNotice("直しました");
      } else {
        const j = await api<{ noticeError?: string }>("/api/gantt", { method: "POST", body: JSON.stringify({ kind: "team", fields }) });
        setNotice(j.noticeError ? `追加しました（お知らせは出せませんでした：${j.noticeError}）` : "追加しました。「📣 お知らせ・イベント」で全員に知らせました");
      }
      setTeamForm(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setFormBusy(false);
    }
  };

  const newDraft = (): Draft => ({
    name: "",
    categoryId: categories.find((c) => c.id !== TEAM_CATEGORY_ID)?.id ?? OTHER_CATEGORY_ID,
    parentId: "",
    start: today,
    end: today,
    oneDay: false,
    assignee: "",
    assigneeIds: [],
    status: "todo",
    memo: "",
  });

  const draftOf = (p: GanttPlan): Draft => ({
    name: p.name,
    categoryId: p.categoryId,
    parentId: p.parentId,
    start: p.start,
    end: p.end,
    oneDay: p.start === p.end,
    assignee: p.assignee,
    assigneeIds: (p.assignees ?? []).map((a) => a.id),
    status: p.status,
    memo: p.memo,
  });

  const savePlan = async (d: Draft) => {
    if (!form) return;
    setFormBusy(true);
    setFormError("");
    const fields: PlanFields = {
      name: d.name.trim(),
      categoryId: d.categoryId,
      parentId: d.parentId,
      start: d.start,
      end: d.oneDay ? d.start : d.end || d.start,
      assignee: d.assignee.trim(),
      assignees: d.assigneeIds,
      status: d.status,
      memo: d.memo,
    };
    try {
      if (form.editingId) await api("/api/gantt", { method: "PATCH", body: JSON.stringify({ id: form.editingId, fields }) });
      else await api("/api/gantt", { method: "POST", body: JSON.stringify({ fields }) });
      setForm(null);
      setNotice(form.editingId ? "直しました" : "追加しました");
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setFormBusy(false);
    }
  };

  const removePlan = async (p: GanttPlan) => {
    const kids = data?.plans.filter((x) => x.parentId === p.id).length ?? 0;
    if (!window.confirm(`「${p.name}」を消します。${kids > 0 ? `中の小さな計画（${kids}件）も一緒に消えます。` : ""}\n\nよろしいですか？`)) return;
    setOpened(null);
    setActionError("");
    try {
      await api(`/api/gantt?id=${encodeURIComponent(p.id)}`, { method: "DELETE" });
      setNotice("消しました");
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "消せませんでした");
    }
  };

  const reorder = async (id: string, dir: -1 | 1) => {
    if (!data) return;
    const next = swapOrder(data.plans, categories, id, dir);
    if (!next) return;
    setActionError("");
    // 先に画面を並べ替える（保存に失敗したら読み直す）
    setData({ ...data, plans: data.plans.map((p) => ({ ...p, order: next.find((n) => n.id === p.id)?.order ?? p.order })) });
    try {
      await api("/api/gantt", { method: "PATCH", body: JSON.stringify({ reorder: next }) });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "並べ替えられませんでした");
      await load();
    }
  };

  const toggleCat = (id: string) =>
    setHiddenCats((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const pill = { background: C.pillBg, border: C.pillBorder, boxShadow: C.pillShadow };

  return (
    <div className="-mx-4 -my-4 px-4 py-6 md:-mx-8 md:-my-8 md:px-6 md:py-10" style={{ background: C.bg, fontFamily: C.sans, color: C.ink, minHeight: "100%" }} data-gantt-page>
      {/* この画面だけで読み込む字（250-補 §1） */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href={FONT_HREF} precedence="default" />
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
        {/* 題 */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-3">
              <span
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[15px]"
                style={{ background: "linear-gradient(135deg, #F9D3DD 0%, #E6DAF7 100%)", boxShadow: "0 6px 16px rgba(180, 83, 106, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.8)" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8E3A50" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 6h9" />
                  <path d="M8 12h11" />
                  <path d="M6 18h7" />
                </svg>
              </span>
              <h1 className="m-0 text-[26px] font-bold tracking-[0.04em] md:text-[32px]" style={{ fontFamily: C.serif }} data-gantt-title>
                {pageTitle}
              </h1>
            </div>
            <p className="m-0 text-[14px]" style={{ color: C.sub }} data-gantt-range>
              {range.title}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* 252: チームプロジェクトはログインしたスタッフ全員が足せる */}
            {data?.canAddTeam && (
              <button
                type="button"
                onClick={() => {
                  setFormError("");
                  setTeamForm({ editingId: null, initial: newTeamDraft() });
                }}
                className="min-h-[44px] rounded-full px-5 text-[14px] font-bold"
                style={{ background: "linear-gradient(135deg, #FDF0C8 0%, #FBE3CF 100%)", color: "#86650F", boxShadow: "0 8px 20px rgba(134, 101, 15, 0.18)" }}
                data-gantt-add-team
              >
                ＋ チームプロジェクトを追加
              </button>
            )}
            {canWrite && (
              <button
                type="button"
                onClick={() => {
                  setFormError("");
                  setForm({ editingId: null, initial: newDraft() });
                }}
                className="min-h-[44px] rounded-full px-6 text-[14px] font-bold text-white"
                style={{ background: C.hero, boxShadow: C.heroShadow }}
                data-gantt-add
              >
                ＋ 追加
              </button>
            )}
          </div>
        </div>

        {/* 表示の単位・◀ 今日 ▶（幅を固定＝切り替えても動かない） */}
        <div className="flex flex-wrap items-center gap-3" data-gantt-toolbar>
          <div role="group" aria-label="表示の単位" className="flex rounded-full p-1" style={pill}>
            {VIEWS.map((v) => {
              const on = view === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => changeView(v)}
                  data-gantt-view={v}
                  className="min-h-[44px] rounded-full text-[14px]"
                  style={{
                    width: v === "quarter" ? 84 : 64,
                    background: on ? C.hero : "transparent",
                    color: on ? "#FFFFFF" : C.sub,
                    fontWeight: on ? 700 : 400,
                    boxShadow: on ? "0 4px 12px rgba(142, 91, 181, 0.25)" : "none",
                  }}
                >
                  {VIEW_LABEL[v]}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-0.5 rounded-full p-1" style={pill}>
            <button type="button" aria-label={range.prevLabel} onClick={() => { setOffset((o) => o - 1); setOpened(null); }} className="flex h-[44px] w-[44px] items-center justify-center rounded-full" data-gantt-prev>
              <Chevron dir="left" />
            </button>
            <button type="button" onClick={() => { setOffset(0); setOpened(null); }} className="min-h-[44px] w-[64px] rounded-full text-[14px]" style={{ background: C.todayBtn, color: C.statusText }} data-gantt-today>
              今日
            </button>
            <button type="button" aria-label={range.nextLabel} onClick={() => { setOffset((o) => o + 1); setOpened(null); }} className="flex h-[44px] w-[44px] items-center justify-center rounded-full" data-gantt-next>
              <Chevron dir="right" />
            </button>
          </div>
        </div>

        {/* 分類の絞り込み（名前を必ず出す） */}
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="分類で絞り込む" data-gantt-filters>
            {categories.map((c) => {
              const on = !hiddenCats.has(c.id);
              const pal = GANTT_PALETTES[c.color];
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCat(c.id)}
                  data-gantt-filter={c.id}
                  className="flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[13px]"
                  style={{ border: `1px solid ${pal.chipBorder}`, background: on ? "rgba(255, 255, 255, 0.8)" : "rgba(255, 255, 255, 0.35)", color: on ? C.ink : C.sub, opacity: on ? 1 : 0.75 }}
                >
                  <span className="h-[14px] w-[14px] rounded-full" style={{ background: on ? grad(pal.bar, 135) : "transparent", border: on ? "none" : `1.5px solid ${pal.text}` }} />
                  {c.name}
                  {!on && <span className="sr-only">（出していません）</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* 263: 院長には「院長が判断」のタスクで完了していないものの件数。押すと一覧 */}
        {data?.isDirector && (
          <div className="rounded-2xl px-4 py-2.5" style={{ background: "rgba(255,255,255,0.8)", border: C.pillBorder }} data-gantt-judge-panel>
            <button
              type="button"
              onClick={() => setJudgeOpen((v) => !v)}
              aria-expanded={judgeOpen}
              className="flex min-h-[40px] flex-wrap items-center gap-2 text-left text-[14px]"
              data-gantt-judge-count={judgePending.length}
            >
              <JudgeChip />
              <span>
                のタスク（未完了）<strong className="text-[16px]">{judgePending.length}</strong>件
              </span>
              <span aria-hidden="true" style={{ color: C.sub }}>
                {judgeOpen ? "▾" : "▸"}
              </span>
            </button>
            {judgeOpen && (
              <ul className="m-0 mt-1.5 list-none space-y-1 p-0" data-gantt-judge-list>
                {judgePending.length === 0 && (
                  <li className="text-[13px]" style={{ color: C.sub }}>
                    ありません
                  </li>
                )}
                {judgePending.map((t) => {
                  const plan = data.plans.find((p) => p.id === t.planId);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setJudgeOpen(false);
                          openPlanById(t.planId, t.id);
                        }}
                        className="flex min-h-[40px] w-full flex-wrap items-center gap-x-2 rounded-xl px-2 text-left text-[13px] hover:bg-white"
                        data-gantt-judge-item={t.id}
                      >
                        <TaskStatusChip status={t.status} />
                        <span className="font-medium">{t.title}</span>
                        <span className="text-[12px]" style={{ color: C.sub }}>
                          {plan?.name ?? ""}
                          {t.due ? ` ・期限 ${shortDate(t.due)}` : ""}
                          {isOverdue(t, today) ? `（${OVERDUE_LABEL}）` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {notice && (
          <p className="rounded-2xl px-4 py-2 text-[13px]" style={{ background: "rgba(255,255,255,0.8)", color: "#337559" }} role="status" data-gantt-notice>
            {notice}
          </p>
        )}
        {(actionError || loadError) && (
          <p className="rounded-2xl px-4 py-2 text-[13px]" style={{ background: "#FCEEF1", color: C.statusText }} role="alert" data-gantt-error>
            {actionError || loadError}
          </p>
        )}

        {/* 図 */}
        <div className="rounded-[28px] px-3 pb-6 pt-4 md:px-5 md:pb-7 md:pt-5" style={{ background: C.cardBg, border: C.cardBorder, boxShadow: C.cardShadow }} data-gantt-chart>
          {!data && !loadError ? (
            <p className="py-10 text-center text-[14px]" style={{ color: C.sub }}>
              読み込んでいます…
            </p>
          ) : (
            <div ref={scrollRef} className="overflow-x-auto" data-gantt-scroll>
              <div style={{ minWidth: "max-content" }}>
                {/* 見出し（列の名前・今日の札） */}
                <div className="flex" style={{ borderBottom: `1px solid ${C.ruleHead}` }}>
                  <div className={`${NAME_COL} sticky left-0 z-20 flex shrink-0 items-end pb-2.5 pl-3 text-[12px]`} style={{ color: C.sub, background: "rgba(255,255,255,0.97)", height: 56 }} data-gantt-namehead>
                    計画
                  </div>
                  <div className="relative flex-1" style={{ minWidth: TIMELINE_MIN[view], height: 56 }}>
                    {range.columns.map((col) => {
                      const s = columnSpan(range, col);
                      return (
                        <div
                          key={col.from}
                          className="absolute bottom-0 flex flex-col justify-end overflow-hidden pb-2.5 pl-1 text-[12px] leading-tight md:pl-2"
                          style={{
                            left: `${s.left * 100}%`,
                            width: `${s.width * 100}%`,
                            color: col.current ? C.currentText : col.weekend ? "#9A8A90" : C.sub,
                            fontWeight: col.current ? 700 : 400,
                            fontSize: view === "month" ? 11 : 12,
                          }}
                          data-gantt-col={col.from}
                          data-gantt-col-current={col.current ? "1" : undefined}
                        >
                          {col.yearMark && <span className="text-[10px]" style={{ color: "#8E5BB5" }}>{col.yearMark}</span>}
                          {col.label}
                        </div>
                      );
                    })}
                    {todayIn(range, today) !== null && (
                      <div
                        className="absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11px] font-bold text-white"
                        style={{ left: `${(todayIn(range, today) ?? 0) * 100}%`, background: C.hero, boxShadow: "0 4px 10px rgba(142, 91, 181, 0.25)" }}
                        data-gantt-today-tag
                      >
                        今日
                      </div>
                    )}
                  </div>
                </div>

                {groups.length === 0 && (
                  <div className="flex">
                    <div className={`${NAME_COL} sticky left-0 shrink-0`} style={{ background: "rgba(255,255,255,0.97)" }} />
                    <div className="relative flex-1 py-10 text-center text-[14px]" style={{ minWidth: TIMELINE_MIN[view], color: C.sub }} data-gantt-empty>
                      {data?.plans.length ? "選んだ分類の計画はありません" : canWrite ? "まだ計画はありません。「＋ 追加」から書けます" : "まだ計画はありません。「＋ チームプロジェクトを追加」から書けます"}
                    </div>
                  </div>
                )}

                <div className="relative">
                {groups.length > 0 && (
                  <div aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 top-0 left-[132px] md:left-[260px]">
                    <TimelineBackdrop range={range} today={today} showTodayLine />
                  </div>
                )}
                {groups.map(({ category, rows }) => {
                  const pal = GANTT_PALETTES[category.color];
                  return (
                    <div key={category.id} data-gantt-group={category.id}>
                      {/* 分類の見出し */}
                      <div className="flex">
                        <div
                          className={`${NAME_COL} sticky left-0 z-10 flex shrink-0 items-center gap-2 pl-3 text-[12px] font-bold tracking-[0.04em]`}
                          style={{ height: CAT_ROW_H, color: pal.text, background: "rgba(255,255,255,0.97)" }}
                        >
                          <CategoryDot color={category.color} />
                          <span className="min-w-0 overflow-hidden leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]" title={category.name}>
                            {category.name}
                          </span>
                        </div>
                        <div className="relative flex-1" style={{ minWidth: TIMELINE_MIN[view], height: CAT_ROW_H }} />
                      </div>
                      {rows.map(({ plan, depth }) => {
                        const fromMatrix = plan.source === "matrix";
                        const planTasks = tasksOfPlan(tasks, plan.id);
                        const isOpen = expanded.has(plan.id);
                        const datedTasks = isOpen ? planTasks.filter((t) => t.due) : [];
                        return (
                          <Fragment key={plan.id}>
                          <div className="flex" data-gantt-row={plan.id}>
                            <div
                              className={`${NAME_COL} sticky left-0 z-10 flex shrink-0 items-center gap-1.5 pr-2 md:gap-2 md:pr-3.5`}
                              style={{ height: ROW_H, paddingLeft: planTasks.length ? (depth ? 14 : 4) : depth ? 22 : 12, background: "rgba(255,255,255,0.97)" }}
                              data-gantt-name={plan.id}
                            >
                              {/* 263: タスクのある計画は、開く・たたむ（最初はたたむ） */}
                              {planTasks.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpanded(plan.id)}
                                  aria-expanded={isOpen}
                                  aria-label={`${plan.name}のタスク（${progressLabel(planTasks)}）を${isOpen ? "たたむ" : "開く"}`}
                                  className="flex h-[28px] w-[20px] shrink-0 items-center justify-center rounded-md text-[11px]"
                                  style={{ color: C.statusText }}
                                  data-gantt-expand={plan.id}
                                >
                                  {isOpen ? "▾" : "▸"}
                                </button>
                              )}
                              {depth === 1 && (
                                <span aria-hidden="true" className="-mt-1.5 h-[10px] w-[10px] shrink-0 rounded-bl-[4px]" style={{ borderLeft: "1.5px solid #E3C4CB", borderBottom: "1.5px solid #E3C4CB" }} />
                              )}
                              {plan.kind === "team" ? (
                                // 252 §3: チーム名と、プロジェクト概要の最初の1行（はみ出す分は「…」）
                                <span className="min-w-0 flex-1 leading-tight" title={`${plan.name}\n${plan.memo}`}>
                                  <span className="block truncate text-[12px] font-medium md:text-[14px]" style={{ color: C.ink }}>
                                    {plan.name}
                                  </span>
                                  <span className="mt-0.5 block truncate text-[11px]" style={{ color: C.sub }} data-gantt-team-line>
                                    {firstLine(plan.memo)}
                                  </span>
                                </span>
                              ) : (
                                <span
                                  className={`min-w-0 flex-1 leading-tight [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden break-all ${depth ? "text-[12px] md:text-[13px]" : "text-[12px] font-medium md:text-[14px]"}`}
                                  style={{ color: depth ? C.sub : C.ink }}
                                  title={plan.name}
                                >
                                  {plan.name}
                                </span>
                              )}
                              <span className="hidden shrink-0 gap-1.5 md:flex">
                                {planTasks.length > 0 && (
                                  <span className="whitespace-nowrap text-[11px]" style={{ color: C.sub }} data-gantt-row-progress>
                                    {progressLabel(planTasks)}
                                  </span>
                                )}
                                {fromMatrix && <Chip kind="matrix">四象限</Chip>}
                                {/* 「未着手」は札にしない（見本どおり・くわしい内容には出る） */}
                                {depth === 0 && plan.status !== "todo" && <Chip kind="status">{STATUS_LABEL[plan.status]}</Chip>}
                              </span>
                              {canWrite && !fromMatrix && (
                                <span className="flex shrink-0 flex-col">
                                  <button type="button" onClick={() => void reorder(plan.id, -1)} aria-label={`${plan.name}を上へ`} className="h-[22px] w-[22px] text-[11px] leading-none" style={{ color: C.sub }} data-gantt-up={plan.id}>
                                    ↑
                                  </button>
                                  <button type="button" onClick={() => void reorder(plan.id, 1)} aria-label={`${plan.name}を下へ`} className="h-[22px] w-[22px] text-[11px] leading-none" style={{ color: C.sub }} data-gantt-down={plan.id}>
                                    ↓
                                  </button>
                                </span>
                              )}
                            </div>
                            <div className="relative flex-1" style={{ minWidth: TIMELINE_MIN[view], height: ROW_H }}>
                              <PlanBar
                                plan={plan}
                                depth={depth}
                                color={category.color}
                                range={range}
                                today={today}
                                open={opened?.id === plan.id}
                                onOpen={(el) => setOpened((prev) => (prev?.id === plan.id && !prev.taskId ? null : { id: plan.id, el }))}
                              />
                            </div>
                          </div>
                          {/* 263: 開いた計画の下に、期限のあるタスクを1行ずつ（期限の日に◆・完了は✓） */}
                          {datedTasks.map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              color={category.color}
                              range={range}
                              view={view}
                              open={opened?.taskId === t.id}
                              onOpen={(el) => setOpened((prev) => (prev?.taskId === t.id ? null : { id: plan.id, el, taskId: t.id }))}
                            />
                          ))}
                          </Fragment>
                        );
                      })}
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          )}
        </div>

        {data?.canEditCategories && (
          <CategoryEditor
            categories={categories}
            onSaved={(next, moved) => {
              setData((d) => (d ? { ...d, categories: next } : d));
              if (moved > 0) void load();
            }}
          />
        )}
      </div>

      {openedPlan && opened && (
        <PlanDetail
          plan={openedPlan}
          category={categoryOf(categories, openedPlan.categoryId)}
          today={today}
          anchor={opened.el}
          canWrite={canWrite}
          canEdit={canEditPlan(openedPlan)}
          isDirector={!!data?.canEditCategories}
          ayumi={
            data?.canAyumi
              ? { kept: (data.keptPlanIds ?? []).includes(openedPlan.id), busy: keeping, onKeep: () => void keepToAyumi(openedPlan) }
              : null
          }
          onEdit={() => {
            setOpened(null);
            setFormError("");
            if (openedPlan.kind === "team") {
              setTeamForm({
                editingId: openedPlan.id,
                initial: {
                  name: openedPlan.name,
                  memo: openedPlan.memo,
                  start: openedPlan.start,
                  end: openedPlan.end,
                  memberIds: (openedPlan.members ?? []).map((m) => m.id),
                  status: openedPlan.status,
                },
              });
            } else {
              setForm({ editingId: openedPlan.id, initial: draftOf(openedPlan) });
            }
          }}
          tasksSlot={
            tasksOfPlan(tasks, openedPlan.id).length > 0 || taskPerms(openedPlan.id).manage ? (
              <TaskList
                key={`${openedPlan.id}:${opened.taskId ?? ""}`}
                planId={openedPlan.id}
                tasks={tasks}
                today={today}
                perms={taskPerms(openedPlan.id)}
                initialOpenId={opened.taskId}
                onAdd={() => openTaskForm(openedPlan.id, null)}
                onEdit={(t) => openTaskForm(openedPlan.id, t)}
                onSaved={upsertTask}
                onRemoved={removeTask}
                onReorder={(id, dir) => void reorderTask(openedPlan.id, id, dir)}
              />
            ) : undefined
          }
          onDelete={() => void removePlan(openedPlan)}
          onClose={() => setOpened(null)}
        />
      )}
      {taskForm && (
        <TaskForm
          planName={data?.plans.find((p) => p.id === taskForm.planId)?.name ?? ""}
          initial={taskForm.initial}
          editing={!!taskForm.editing}
          wasJudge={!!taskForm.editing?.directorJudge}
          candidates={teamCandidatesWithMembers(data?.teamCandidates ?? [], taskForm.editing?.assignees ?? [])}
          isDirector={!!data?.isDirector}
          busy={formBusy}
          error={formError}
          onSave={(d) => void saveTask(d)}
          onClose={() => setTaskForm(null)}
        />
      )}
      {form && (
        <PlanForm
          initial={form.initial}
          editingId={form.editingId}
          categories={categories}
          plans={data?.plans ?? []}
          candidates={teamCandidatesWithMembers(data?.teamCandidates ?? [], data?.plans.find((p) => p.id === form.editingId)?.assignees ?? [])}
          busy={formBusy}
          error={formError}
          onSave={(d) => void savePlan(d)}
          onClose={() => setForm(null)}
        />
      )}
      {teamForm && (
        <TeamForm
          initial={teamForm.initial}
          editing={!!teamForm.editingId}
          candidates={teamCandidatesWithMembers(data?.teamCandidates ?? [], data?.plans.find((p) => p.id === teamForm.editingId)?.members ?? [])}
          myId={myId}
          busy={formBusy}
          error={formError}
          onSave={(d) => void saveTeam(d)}
          onClose={() => setTeamForm(null)}
        />
      )}
    </div>
  );
}
