"use client";

// 四象限マトリクスの「1項目＝1行」と、その下に開く小さな編集欄（指示書202 §2）
//
// ・行は1行だけ（タイトル＋小さな印：★／期限／状態／9マスの進み具合）
// ・行をクリックすると**その行の下に小さく開く**（モーダルは使わない）
// ・開いた欄の変更は**自動保存**（入力の確定・欄から離れたとき）。
//   保存中・保存済み・失敗を行内に小さく出し、失敗は呼び出し側が赤い帯でも出す
// ・「▦ 9マスを開く」は専用画面へ（モーダルの外・202 §3）
//
// 図でもリストでも同じこの部品を使う（動きを1か所にする）。

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  QUADRANTS,
  QUADRANT_META,
  STATUS_MARK,
  TASK_STATUSES,
  cellProgressLabel,
  isOverdue,
  type PriorityTask,
  type Quadrant,
  type TaskFields,
  type TaskStatus,
} from "@/lib/priority-matrix";
import { SAVED_MARK_MS, SaveMark, useTextDraft, type SaveState } from "./PriorityPieces";

export function PriorityTaskRow({
  task,
  today,
  expanded,
  focusFull,
  dragging,
  onToggleExpand,
  onPatch,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  task: PriorityTask;
  today: string;
  expanded: boolean;
  /** ★がすでに上限まで使われていて、この行には付けられない */
  focusFull: boolean;
  dragging: boolean;
  onToggleExpand: () => void;
  /** 保存。失敗したら throw（呼び出し側が赤い帯を出す） */
  onPatch: (fields: TaskFields) => Promise<void>;
  onDelete: () => Promise<void>;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [state, setState] = useState<SaveState>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const save = useCallback(
    async (fields: TaskFields) => {
      setState("saving");
      try {
        await onPatch(fields);
        setState("saved");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState(""), SAVED_MARK_MS);
      } catch {
        setState("error"); // 文言は呼び出し側の赤い帯
      }
    },
    [onPatch]
  );

  const overdue = isOverdue(task, today);
  const statusMark = STATUS_MARK[task.status];

  const title = useTextDraft(`pm:row:${task.id}:title`, task.title);
  const memo = useTextDraft(`pm:row:${task.id}:memo`, task.memo);
  const assignee = useTextDraft(`pm:row:${task.id}:assignee`, task.assignee);

  const commitTitle = () => {
    const next = title.value.trim();
    if (!next) {
      // タイトルは必須。空にはできないので元に戻す
      title.settle(task.title);
      return;
    }
    if (next === task.title) {
      title.settle(next);
      return;
    }
    title.settle(next);
    void save({ title: next });
  };

  return (
    <li data-pm-row={task.id} className="border-b border-slate-100 last:border-b-0">
      {/* ─── 1行（タイトル＋小さな印） ─── */}
      <div
        draggable
        onDragStart={(e) => {
          onDragStart();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", task.id);
        }}
        onDragEnd={onDragEnd}
        className={`flex items-center gap-1.5 py-1 text-xs ${dragging ? "opacity-40" : ""}`}
      >
        <button
          type="button"
          onClick={() => void save({ focus: !task.focus })}
          data-pm-star={task.id}
          title={task.focus ? "★を外す" : focusFull ? "★は3件までです（押すと理由が出ます）" : "★を付ける"}
          className={`shrink-0 text-sm leading-none ${
            task.focus ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
          }`}
        >
          ★
        </button>
        <button
          type="button"
          onClick={onToggleExpand}
          data-pm-row-title={task.id}
          aria-expanded={expanded}
          className={`min-w-0 flex-1 truncate text-left ${
            task.status === "done" ? "text-slate-500 line-through" : "text-slate-800"
          } hover:underline`}
        >
          {task.title}
        </button>
        {task.due && (
          <span
            className={`shrink-0 text-[10px] ${overdue ? "font-bold text-rose-600" : "text-slate-500"}`}
            data-pm-row-due={task.id}
          >
            {overdue ? `●${task.due}` : task.due}
          </span>
        )}
        {statusMark && (
          <span
            className="shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-600"
            data-pm-row-status-mark={task.id}
          >
            {statusMark}
          </span>
        )}
        <span className="shrink-0 text-[10px] text-slate-400" data-pm-row-progress={task.id}>
          {cellProgressLabel(task)}
        </span>
        <SaveMark state={state} />
      </div>

      {/* ─── 行の下に小さく開く編集欄（モーダルは使わない） ─── */}
      {expanded && (
        <div
          className="mb-1.5 space-y-2 rounded-lg border border-teal-200 bg-teal-50/60 p-2.5"
          data-pm-row-panel={task.id}
        >
          <label className="block">
            <span className="text-[10px] font-medium text-slate-600">タイトル</span>
            <input
              type="text"
              value={title.value}
              onChange={(e) => title.change(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                }
              }}
              data-pm-panel-title
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </label>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-[10px] font-medium text-slate-600">期限</span>
              <input
                type="date"
                value={task.due}
                onChange={(e) => void save({ due: e.target.value })}
                data-pm-panel-due
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium text-slate-600">状態</span>
              <select
                value={task.status}
                onChange={(e) => void save({ status: e.target.value as TaskStatus })}
                data-pm-panel-status
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-medium text-slate-600">
                任せる相手（氏名または役割）
              </span>
              <input
                type="text"
                value={assignee.value}
                onChange={(e) => assignee.change(e.target.value)}
                onBlur={() => {
                  const next = assignee.value.trim();
                  assignee.settle(next);
                  if (next !== task.assignee) void save({ assignee: next });
                }}
                data-pm-panel-assignee
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium text-slate-600">移す（象限）</span>
              <select
                value={task.quadrant}
                onChange={(e) => void save({ quadrant: Number(e.target.value) as Quadrant })}
                data-pm-panel-quadrant
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
              >
                {QUADRANTS.map((q) => (
                  <option key={q} value={q}>
                    {QUADRANT_META[q].label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={task.focus}
              disabled={!task.focus && focusFull}
              onChange={(e) => void save({ focus: e.target.checked })}
              data-pm-panel-focus
            />
            <span>★ いま注力することに入れる</span>
            {!task.focus && focusFull && (
              <span className="text-[10px] text-slate-500">（もう上限です）</span>
            )}
          </label>

          <label className="block">
            <span className="text-[10px] font-medium text-slate-600">メモ</span>
            <textarea
              value={memo.value}
              rows={2}
              onChange={(e) => memo.change(e.target.value)}
              onBlur={() => {
                memo.settle(memo.value);
                if (memo.value !== task.memo) void save({ memo: memo.value });
              }}
              data-pm-panel-memo
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            <Link
              href={`/admin/priority-matrix/grid/${encodeURIComponent(task.id)}`}
              data-pm-open-grid={task.id}
              className="rounded-md border border-teal-300 bg-white px-2 py-1 text-[11px] font-medium text-teal-700"
            >
              ▦ 9マスを開く
            </Link>
            <div className="flex items-center gap-2">
              <SaveMark state={state} />
              <button
                type="button"
                onClick={() => {
                  if (
                    !window.confirm(
                      `「${task.title}」を削除します。9マスに書いた内容も一緒に消えます。\n\nよろしいですか？`
                    )
                  )
                    return;
                  void onDelete();
                }}
                data-pm-delete={task.id}
                className="rounded-md border border-rose-300 px-2 py-1 text-[11px] text-rose-700"
              >
                削除
              </button>
            </div>
          </div>
          <p className="text-[10px] text-slate-500">
            変えたところはその場で保存されます（入力欄から離れたとき・選び直したとき）。
          </p>
        </div>
      )}
    </li>
  );
}
