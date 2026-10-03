"use client";

// 四象限マトリクスのタスク編集と9マス（指示書201 B・D）
//
// ・上半分：タスクの項目（タイトル・象限・期限・状態・メモ・任せる相手・★）
// ・下半分：9マス。**中央はタスクのタイトル（固定）**、周りの8マスに分解を書く
//   － 各マスに完了のチェック
//   － マスの内容から「新しいタスクにする」（象限を選んで追加。元のマスにはリンクが残る）
//   － スマートフォンでも9マスが画面に収まるよう、マスは省略表示。押すと下に全文の入力欄が出る
// ・入力欄は176-補の下書き保持を使う（保存を押す前の入力を、閉じる・再読み込みで失わない）
//
// 下書きは sessionStorage。useDraft は初回描画時の値を基準にするので、
// この部品は**開くタスクごとに key で作り直す**こと（呼び出し側で key を付けている）。

import { useState } from "react";
import { createPortal } from "react-dom";
import {
  CELL_COUNT,
  FOCUS_HINT_LOW_QUADRANT,
  QUADRANTS,
  QUADRANT_META,
  TASK_STATUSES,
  cellProgress,
  emptyCells,
  type NineCell,
  type PriorityTask,
  type Quadrant,
  type TaskFields,
  type TaskStatus,
} from "@/lib/priority-matrix";
import { DISCARD_CONFIRM, useDraft } from "@/lib/retro-drafts";

/** 9マスの並び。中央（index 4）はタイトル、それ以外が入力マス0〜7 */
const GRID_SLOTS: (number | "center")[] = [0, 1, 2, 3, "center", 4, 5, 6, 7];

type FormValues = {
  title: string;
  quadrant: Quadrant;
  due: string;
  status: TaskStatus;
  memo: string;
  assignee: string;
  focus: boolean;
  cells: NineCell[];
};

function initialValues(task: PriorityTask | null, defaultQuadrant: Quadrant): FormValues {
  return {
    title: task?.title ?? "",
    quadrant: task?.quadrant ?? defaultQuadrant,
    due: task?.due ?? "",
    status: task?.status ?? "todo",
    memo: task?.memo ?? "",
    assignee: task?.assignee ?? "",
    focus: task?.focus ?? false,
    cells: task ? task.cells.map((c) => ({ ...c })) : emptyCells(),
  };
}

function shorten(s: string, max: number): string {
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function PriorityTaskDialog({
  task,
  defaultQuadrant,
  focusUsedByOthers,
  focusMax,
  onClose,
  onSave,
  onDelete,
  onSpawn,
  linkedTitleOf,
}: {
  /** null＝新規 */
  task: PriorityTask | null;
  defaultQuadrant: Quadrant;
  /** このタスク以外で★が付いている件数（上限の案内に使う） */
  focusUsedByOthers: number;
  focusMax: number;
  onClose: () => void;
  onSave: (fields: TaskFields) => Promise<void>;
  onDelete?: () => Promise<void>;
  /** マスから新しいタスクを作る。先にこのタスクの内容を保存してから作る */
  onSpawn: (args: {
    fields: TaskFields;
    cellIndex: number;
    quadrant: Quadrant;
  }) => Promise<void>;
  /** リンク先のタスクのタイトル（消えていれば空） */
  linkedTitleOf: (id: string) => string;
}) {
  const draftKey = `pm:task:${task ? task.id : "new"}`;
  const { values, set, setValues, dirty, discard } = useDraft<FormValues>(
    draftKey,
    initialValues(task, defaultQuadrant)
  );
  /** 開いているマス（全文の入力欄を出す）。null＝閉じている */
  const [openCell, setOpenCell] = useState<number | null>(null);
  const [spawnQuadrant, setSpawnQuadrant] = useState<Quadrant>(2);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const progress = cellProgress({
    ...(task ?? ({} as PriorityTask)),
    cells: values.cells,
  } as PriorityTask);

  const focusLimitReached = !values.focus && focusUsedByOthers >= focusMax;
  const focusHintLow = values.focus && (values.quadrant === 3 || values.quadrant === 4);

  const setCell = (index: number, patch: Partial<NineCell>) =>
    setValues((prev) => ({
      ...prev,
      cells: prev.cells.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));

  const fields = (): TaskFields => ({
    title: values.title.trim(),
    quadrant: values.quadrant,
    due: values.due,
    status: values.status,
    memo: values.memo,
    assignee: values.assignee.trim(),
    focus: values.focus,
    cells: values.cells,
  });

  const handleSave = async () => {
    if (!values.title.trim()) {
      setMessage("タイトルを入力してください");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await onSave(fields());
      discard(); // 保存できたら下書きは残さない
      onClose();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleSpawn = async (index: number) => {
    const text = values.cells[index]?.text.trim() ?? "";
    if (!text) {
      setMessage("このマスには何も書かれていません");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await onSpawn({ fields: fields(), cellIndex: index, quadrant: spawnQuadrant });
      discard();
      onClose();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "新しいタスクを作れませんでした");
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (dirty && !window.confirm(DISCARD_CONFIRM)) return;
    onClose();
  };

  const body = (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-3 sm:p-6"
      data-pm-dialog
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        {/* 見出し */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-bold text-slate-800">
            {task ? "タスクを編集" : "タスクを追加"}
            {dirty && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-normal text-amber-800">
                下書きあり
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 px-4 py-4">
          {/* ─── タスクの項目（201 B） ─── */}
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">タイトル（必須）</span>
              <input
                type="text"
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                data-pm-title
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                placeholder="例：第二象限の時間を毎週2時間とる"
              />
            </label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">象限</span>
                <select
                  value={values.quadrant}
                  onChange={(e) => set("quadrant", Number(e.target.value) as Quadrant)}
                  data-pm-quadrant
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {QUADRANTS.map((q) => (
                    <option key={q} value={q}>
                      {QUADRANT_META[q].label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">期限（任意）</span>
                <input
                  type="date"
                  value={values.due}
                  onChange={(e) => set("due", e.target.value)}
                  data-pm-due
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">状態</span>
                <select
                  value={values.status}
                  onChange={(e) => set("status", e.target.value as TaskStatus)}
                  data-pm-status
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">
                  任せる相手（任意・氏名または役割）
                </span>
                <input
                  type="text"
                  value={values.assignee}
                  onChange={(e) => set("assignee", e.target.value)}
                  data-pm-assignee
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="例：受付リーダー"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-xs font-medium text-slate-600">メモ（任意）</span>
              <textarea
                value={values.memo}
                onChange={(e) => set("memo", e.target.value)}
                rows={3}
                data-pm-memo
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>

            {/* ★ 注力の印（201 C-3） */}
            <div className="rounded-lg bg-slate-50 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={values.focus}
                  disabled={focusLimitReached}
                  onChange={(e) => set("focus", e.target.checked)}
                  data-pm-focus
                />
                <span>★ いま注力することに入れる（同時に{focusMax}件まで）</span>
              </label>
              {focusLimitReached && (
                <p className="mt-1 text-[11px] text-slate-500">
                  すでに{focusMax}件に★が付いています。どれかの★を外すと付けられます。
                </p>
              )}
              {focusHintLow && (
                <p className="mt-1 text-[11px] text-amber-700" data-pm-focus-hint>
                  {QUADRANT_META[values.quadrant].short}です。{FOCUS_HINT_LOW_QUADRANT}
                </p>
              )}
            </div>
          </div>

          {/* ─── 9マス（201 D） ─── */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-800">9マスで分解する</h3>
              <span className="text-[11px] text-slate-500" data-pm-progress>
                {progress.total}マス中{progress.done}つ完了
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              中央はタスクのタイトル（固定）。周りの8マスに、進めるための要素・具体的な行動を書きます。
            </p>

            <div className="grid grid-cols-3 gap-1.5" data-pm-grid>
              {GRID_SLOTS.map((slot, pos) => {
                if (slot === "center") {
                  return (
                    <div
                      key="center"
                      data-pm-center
                      className="flex min-h-[72px] items-center justify-center rounded-md bg-teal-600 p-1.5 text-center text-[11px] font-bold leading-tight text-white"
                    >
                      {shorten(values.title, 40) || "（タイトル未入力）"}
                    </div>
                  );
                }
                const cell = values.cells[slot] ?? { text: "", done: false, linkedTaskId: "" };
                const linked = cell.linkedTaskId ? linkedTitleOf(cell.linkedTaskId) : "";
                const active = openCell === slot;
                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setOpenCell(active ? null : slot)}
                    data-pm-cell={slot}
                    className={`flex min-h-[72px] flex-col gap-1 rounded-md border p-1.5 text-left text-[11px] leading-tight transition-colors ${
                      active
                        ? "border-teal-500 bg-teal-50"
                        : cell.done
                          ? "border-slate-200 bg-slate-100"
                          : "border-slate-200 bg-white hover:border-teal-300"
                    }`}
                  >
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <span>{cell.done ? "☑" : "☐"}</span>
                      {linked && <span title={linked}>🔗</span>}
                    </span>
                    <span
                      className={`flex-1 break-words ${cell.done ? "text-slate-500 line-through" : "text-slate-700"}`}
                    >
                      {cell.text.trim() ? shorten(cell.text, 28) : <span className="text-slate-400">＋</span>}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 押したマスの全文（201 D: 文字が多いマスは省略表示し、押すと全文） */}
            {openCell !== null && openCell < CELL_COUNT && (
              <div className="space-y-2 rounded-lg border border-teal-200 bg-teal-50/60 p-3" data-pm-cell-panel>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">
                    {openCell + 1}つ目のマス
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpenCell(null)}
                    className="text-xs text-slate-500 underline underline-offset-2"
                  >
                    閉じる
                  </button>
                </div>
                <textarea
                  value={values.cells[openCell]?.text ?? ""}
                  onChange={(e) => setCell(openCell, { text: e.target.value })}
                  rows={3}
                  data-pm-cell-text
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  placeholder="このタスクを進めるための要素・具体的な行動"
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={values.cells[openCell]?.done ?? false}
                    onChange={(e) => setCell(openCell, { done: e.target.checked })}
                    data-pm-cell-done
                  />
                  <span>このマスは完了</span>
                </label>

                {/* マスから新しいタスクを作る（201 D） */}
                <div className="space-y-1 border-t border-teal-200 pt-2">
                  {values.cells[openCell]?.linkedTaskId &&
                  linkedTitleOf(values.cells[openCell]!.linkedTaskId) ? (
                    <p className="text-[11px] text-slate-600" data-pm-cell-link>
                      🔗 このマスは「{linkedTitleOf(values.cells[openCell]!.linkedTaskId)}」という
                      タスクになっています
                    </p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={spawnQuadrant}
                        onChange={(e) => setSpawnQuadrant(Number(e.target.value) as Quadrant)}
                        data-pm-spawn-quadrant
                        className="rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                      >
                        {QUADRANTS.map((q) => (
                          <option key={q} value={q}>
                            {QUADRANT_META[q].label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleSpawn(openCell)}
                        disabled={busy || !(values.cells[openCell]?.text.trim())}
                        data-pm-spawn
                        className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                      >
                        このマスを新しいタスクにする
                      </button>
                      <span className="text-[11px] text-slate-500">
                        （このタスクも一緒に保存されます）
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {message && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700" data-pm-message>
              {message}
            </p>
          )}
        </div>

        {/* 操作 */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            {onDelete && (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("このタスクを削除します。よろしいですか？")) return;
                  setBusy(true);
                  try {
                    await onDelete();
                    discard();
                    onClose();
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : "削除に失敗しました");
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                data-pm-delete
                className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-700 disabled:opacity-50"
              >
                削除
              </button>
            )}
            {dirty && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(DISCARD_CONFIRM)) discard();
                }}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600"
              >
                書きかけを破棄
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700"
            >
              閉じる
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy}
              data-pm-save
              className="rounded-md bg-teal-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // 祖先の装飾（filter・transform）に左右されないよう body 直下に出す
  return typeof document === "undefined" ? body : createPortal(body, document.body);
}
