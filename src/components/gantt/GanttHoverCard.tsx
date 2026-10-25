"use client";

// 267: 年間計画の項目にカーソルを合わせると、全部の内容をポップアップで出す
//
// ・出す所：左の名前の欄（計画・チームプロジェクト・開いたときのタスクの行）、横棒、◆、タスクの◆
// ・出し方（パソコン＝マウス）：0.3秒止めたら出す（通り過ぎただけでは出さない）。行の外へ出たら閉じる。
//   キーボードでフォーカスを当てたときも出す。Esc で閉じる。押したときの動き（くわしい内容を開く）は今のまま
// ・場所：その行の右側。入りきらなければ左側。下の方では上へずらして画面の中に収める。
//   ポップアップはカーソルを受けない（pointer-events: none）ので、下の行へまっすぐ動かせる（256〜258と同じ考え方）
// ・スマートフォン（タッチ）では出さない
// ・中身はその人が今見られるもの（画面が持っている計画・タスク）だけ。長い文は始めの3行、目的は始めの2行

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C } from "./sakura-theme";
import { GANTT_PALETTES, STATUS_LABEL, grad, periodLabel, planAssigneeLabel, shortDate, type GanttCategory, type GanttPlan } from "@/lib/gantt";
import { OVERDUE_LABEL, isOverdue, progressLabel, type GanttTask } from "@/lib/gantt-tasks";
import type { ClinicGoalBrief } from "@/lib/plan-goals";
import { JudgeChip } from "./GanttTasks";

export type HoverTarget = { kind: "plan"; planId: string } | { kind: "task"; planId: string; taskId: string };

type Rect = { left: number; right: number; top: number; bottom: number };
type HoverState = { target: HoverTarget; rect: Rect };

const DELAY_MS = 300;

/** マウスなどの細かく指せる道具か（タッチだけの画面では出さない） */
function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFine(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return fine;
}

/**
 * 項目に付ける出し入れの props と、いま出しているもの。
 *   anchor="cell"   … 項目の箱の右（名前の欄・◆）
 *   anchor="pointer" … カーソルを合わせた位置の右（長い横棒は箱の右だと遠いので）
 */
export function useGanttHover() {
  const fine = useFinePointer();
  const [hover, setHover] = useState<HoverState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 押したときのフォーカスでは出さない（キーボードで当てたときだけ出す）
  const pressedAt = useRef(0);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const close = useCallback(() => {
    clear();
    setHover(null);
  }, [clear]);

  useEffect(() => {
    if (!hover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // 横や縦にずらしたら、場所が合わなくなるので閉じる
    const onScroll = () => close();
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [hover, close]);

  useEffect(() => clear, [clear]);

  const bind = useCallback(
    (target: HoverTarget, anchor: "cell" | "pointer" = "cell") => ({
      onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
        if (!fine || e.pointerType !== "mouse") return;
        clear();
        const el = e.currentTarget;
        const x = e.clientX;
        timer.current = setTimeout(() => {
          const b = el.getBoundingClientRect();
          const rect = anchor === "pointer" ? { left: x - 1, right: x + 1, top: b.top, bottom: b.bottom } : { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
          setHover({ target, rect });
        }, DELAY_MS);
      },
      onPointerLeave: () => close(),
      // 押したら（くわしい内容が開く）ポップアップは閉じる
      onPointerDown: () => {
        pressedAt.current = Date.now();
        close();
      },
      onFocus: (e: React.FocusEvent<HTMLElement>) => {
        if (!fine || Date.now() - pressedAt.current < 600) return;
        const el = e.currentTarget;
        const b = el.getBoundingClientRect();
        clear();
        setHover({ target, rect: { left: b.left, right: b.right, top: b.top, bottom: b.bottom } });
      },
      onBlur: () => close(),
    }),
    [fine, clear, close]
  );

  return { hover, bind, close };
}

function Clamp({ lines, children, data }: { lines: 2 | 3; children: React.ReactNode; data?: string }) {
  return (
    <span
      className={`whitespace-pre-wrap break-words overflow-hidden [display:-webkit-box] [-webkit-box-orient:vertical] ${lines === 2 ? "[-webkit-line-clamp:2]" : "[-webkit-line-clamp:3]"}`}
      data-gantt-hover-clamp={data}
    >
      {children}
    </span>
  );
}

export function GanttHoverCard({
  hover,
  plan,
  task,
  category,
  planTasks,
  goal,
  today,
}: {
  hover: HoverState;
  plan: GanttPlan;
  task: GanttTask | null;
  category: GanttCategory;
  planTasks: GanttTask[];
  goal: ClinicGoalBrief | null;
  today: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { rect } = hover;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const gap = 12;
    let left = rect.right + gap;
    if (left + w > window.innerWidth - 8) left = rect.left - gap - w;
    if (left < 8) left = Math.max(8, window.innerWidth - w - 8);
    let top = rect.top;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }, [hover, plan, task]);

  const pal = GANTT_PALETTES[category.color];
  const row = (label: string, value: React.ReactNode, data?: string) => (
    <>
      <dt style={{ color: C.sub }}>{label}</dt>
      <dd className="m-0 min-w-0 break-words" data-gantt-hover-row={data}>
        {value}
      </dd>
    </>
  );
  const cat = (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="inline-block h-[10px] w-[10px] shrink-0 rounded-full" style={{ background: grad(pal.dot, 135) }} />
      {category.name}
    </span>
  );

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      data-gantt-hover={task ? `task:${task.id}` : `plan:${plan.id}`}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        visibility: "hidden",
        zIndex: 65,
        width: "min(320px, calc(100vw - 16px))",
        maxHeight: "calc(100dvh - 16px)",
        overflow: "hidden",
        pointerEvents: "none",
        background: "#FFFFFF",
        border: "1px solid rgba(240, 213, 220, 0.9)",
        borderRadius: 16,
        boxShadow: "0 16px 36px rgba(142, 91, 181, 0.18)",
        fontFamily: C.sans,
        color: C.ink,
      }}
    >
      <div className="px-4 py-2.5" style={{ background: C.detailHead }}>
        <strong className="block whitespace-pre-wrap break-words text-[14px] leading-snug" data-gantt-hover-title>
          {task ? task.title : plan.name}
        </strong>
        {task && (
          <span className="mt-0.5 block break-words text-[11px]" style={{ color: C.sub }}>
            {plan.name}
          </span>
        )}
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-4 py-2.5 text-[12px]">
        {row("分類", cat)}
        {task ? (
          <>
            {task.due && row("期限", shortDate(task.due))}
            {task.assignees.length > 0 && row("担当", task.assignees.map((a) => a.name || "名前未設定").join("、"))}
            {row(
              "状態",
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {STATUS_LABEL[task.status]}
                {task.directorJudge && <JudgeChip small />}
                {isOverdue(task, today) && (
                  <span className="rounded-full px-[6px] py-[2px] text-[10px] leading-none" style={{ background: "#FDE7E4", color: "#B42318" }} data-gantt-hover-overdue>
                    {OVERDUE_LABEL}
                  </span>
                )}
              </span>
            )}
            {task.memo.trim() && row("メモ", <Clamp lines={3} data="memo">{task.memo}</Clamp>)}
          </>
        ) : (
          <>
            {row(plan.kind === "team" ? "目標の達成期間" : "期間", periodLabel(plan.start, plan.end, today))}
            {plan.kind === "team"
              ? row("メンバー", (plan.members ?? []).map((m) => m.name || "名前未設定").join("、") || "—")
              : planAssigneeLabel(plan) && row("担当", planAssigneeLabel(plan))}
            {row("状態", STATUS_LABEL[plan.status])}
            {planTasks.length > 0 && row("タスク", progressLabel(planTasks), "progress")}
            {goal && row("クリニック目標", <>🎯 {goal.title}{goal.purpose && <Clamp lines={2} data="purpose">{goal.purpose}</Clamp>}</>, "goal")}
            {plan.memo.trim() && row(plan.kind === "team" ? "プロジェクト概要" : "メモ", <Clamp lines={3} data="memo">{plan.memo}</Clamp>)}
          </>
        )}
      </dl>
    </div>,
    document.body
  );
}
