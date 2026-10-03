"use client";

// 院長の四象限マトリクス（指示書201 C・E）
//
//   ★ いま注力すること（最大3件）… 画面の一番上（C-3）
//   四象限の図              … 2×2。第一・第二象限を大きく。ドラッグ／「移す」で象限を移せる（C-1）
//   今月完了した件数        … 図の下に参考表示。**173の配分には書き込まない**（E）
//   象限ごとのリスト        … 第一→第二→第三→第四。期限順／手動の並び・状態で絞り込み（C-2）
//   操作の記録              … 本文は残さない（F）
//
// 見える人は院長だけ（A）。画面の到達可否は /admin/priority-matrix のページとAPIで判定しており、
// この部品は「開けた人に見せるもの」だけを持つ。
//
// 【カード・象限の枠を関数の外に出している理由（実測で直したこと）】
// はじめは PriorityMatrixBoard の中で FigureCard / QuadrantBox を定義していた。
// 描画のたびに**別の部品**として作り直されるため、読み込み完了などで再描画が入った瞬間に
// 押したカードのDOMが差し替わり、クリックが React に届かずに落ちることがあった
//（Playwrightの実測で「追加」が無反応になった）。部品は必ず外に置き、props で渡す。

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FOCUS_MAX,
  QUADRANTS,
  QUADRANT_META,
  STATUS_LABEL,
  TASK_STATUSES,
  cellProgressLabel,
  createTask,
  deleteTask,
  doneCountsOfMonth,
  fetchMatrix,
  filterTasks,
  focusCount,
  focusTasks,
  isOverdue,
  monthKey,
  sortTasks,
  tasksOfQuadrant,
  todayKey,
  updateTask,
  type MatrixLog,
  type PriorityTask,
  type Quadrant,
  type SortMode,
  type TaskFields,
  type TaskStatus,
} from "@/lib/priority-matrix";
import { PriorityTaskDialog } from "@/components/admin/PriorityTaskDialog";

/** 図の並び（上段＝重要／右列＝緊急）。第二・第一／第四・第三の順に置く */
const FIGURE_ROWS: Quadrant[][] = [
  [2, 1],
  [4, 3],
];

const QUADRANT_TONE: Record<Quadrant, { border: string; head: string; chip: string }> = {
  1: { border: "border-rose-300", head: "text-rose-800", chip: "bg-rose-100 text-rose-800" },
  2: { border: "border-teal-300", head: "text-teal-800", chip: "bg-teal-100 text-teal-800" },
  3: { border: "border-amber-300", head: "text-amber-800", chip: "bg-amber-100 text-amber-800" },
  4: { border: "border-slate-300", head: "text-slate-600", chip: "bg-slate-100 text-slate-700" },
};

function dueLabel(t: PriorityTask, today: string): string {
  if (!t.due) return "期限なし";
  return isOverdue(t, today) ? `${t.due}（期限切れ）` : t.due;
}

// ─── 図のカード ───

function FigureCard({
  task,
  today,
  dragging,
  moveOpen,
  onDragStart,
  onDragEnd,
  onToggleMove,
  onOpen,
  onMove,
}: {
  task: PriorityTask;
  today: string;
  dragging: boolean;
  moveOpen: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onToggleMove: (id: string) => void;
  onOpen: (task: PriorityTask) => void;
  onMove: (task: PriorityTask, quadrant: Quadrant) => void;
}) {
  const overdue = isOverdue(task, today);
  return (
    <div
      draggable
      onDragStart={(e) => {
        onDragStart(task.id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
      }}
      onDragEnd={onDragEnd}
      data-pm-card={task.id}
      className={`rounded-md border bg-white px-2 py-1.5 text-left text-xs shadow-sm ${
        overdue ? "border-rose-400" : "border-slate-200"
      } ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex items-start gap-1">
        {overdue && (
          <span className="shrink-0 text-rose-600" title="期限切れ" data-pm-overdue>
            ●
          </span>
        )}
        {task.focus && <span className="shrink-0 text-amber-500">★</span>}
        <button
          type="button"
          onClick={() => onOpen(task)}
          className="flex-1 break-words text-left text-slate-800 hover:underline"
        >
          {task.title}
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-slate-500">
        <span className={overdue ? "font-medium text-rose-600" : ""}>
          {task.due || "期限なし"}
        </span>
        <button
          type="button"
          onClick={() => onToggleMove(task.id)}
          data-pm-move-open={task.id}
          className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-600"
        >
          移す
        </button>
      </div>
      {moveOpen && (
        <div className="mt-1 space-y-0.5" data-pm-move-menu={task.id}>
          {QUADRANTS.filter((q) => q !== task.quadrant).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onMove(task, q)}
              data-pm-move-to={q}
              className="block w-full rounded bg-slate-100 px-1.5 py-1 text-left text-[10px] text-slate-700 hover:bg-slate-200"
            >
              → {QUADRANT_META[q].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuadrantBox({
  q,
  large,
  list,
  today,
  dragId,
  movingId,
  onDragStart,
  onDragEnd,
  onToggleMove,
  onOpen,
  onMove,
  onAdd,
  onDrop,
}: {
  q: Quadrant;
  large: boolean;
  list: PriorityTask[];
  today: string;
  dragId: string;
  movingId: string;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onToggleMove: (id: string) => void;
  onOpen: (task: PriorityTask) => void;
  onMove: (task: PriorityTask, quadrant: Quadrant) => void;
  onAdd: (quadrant: Quadrant) => void;
  onDrop: (id: string, quadrant: Quadrant) => void;
}) {
  const tone = QUADRANT_TONE[q];
  return (
    <div
      onDragOver={(e) => {
        if (dragId) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(e.dataTransfer.getData("text/plain") || dragId, q);
      }}
      data-pm-quadrant-box={q}
      className={`flex flex-col rounded-xl border-2 bg-white/70 p-2 ${tone.border} ${
        large ? "min-h-[200px]" : "min-h-[112px]"
      }`}
    >
      <div className="mb-1.5">
        <p className={`text-xs font-bold ${tone.head}`}>
          {QUADRANT_META[q].label}
          <span className="ml-1 font-normal text-slate-500" data-pm-count={q}>
            {list.length}件
          </span>
        </p>
        <p className={`text-[11px] ${q === 2 ? "font-bold text-teal-700" : "text-slate-500"}`}>
          {QUADRANT_META[q].advice}
        </p>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {list.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-slate-400">（なし）</p>
        ) : (
          list.map((t) => (
            <FigureCard
              key={t.id}
              task={t}
              today={today}
              dragging={dragId === t.id}
              moveOpen={movingId === t.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onToggleMove={onToggleMove}
              onOpen={onOpen}
              onMove={onMove}
            />
          ))
        )}
      </div>
      <button
        type="button"
        onClick={() => onAdd(q)}
        data-pm-add={q}
        className="mt-1.5 rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-500 hover:border-teal-400 hover:text-teal-700"
      >
        ＋ ここに追加
      </button>
    </div>
  );
}

// ─── 一覧の1行 ───

function TaskRow({
  task,
  today,
  manualAt,
  manualLast,
  showNudge,
  onOpen,
  onToggleFocus,
  onStatus,
  onNudge,
}: {
  task: PriorityTask;
  today: string;
  manualAt: number;
  manualLast: number;
  showNudge: boolean;
  onOpen: (task: PriorityTask) => void;
  onToggleFocus: (task: PriorityTask) => void;
  onStatus: (task: PriorityTask, status: TaskStatus) => void;
  onNudge: (task: PriorityTask, dir: -1 | 1) => void;
}) {
  return (
    <li data-pm-row={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-xs">
      <button
        type="button"
        onClick={() => onToggleFocus(task)}
        data-pm-star={task.id}
        title={task.focus ? "★を外す" : "★を付ける"}
        className={`shrink-0 text-base leading-none ${
          task.focus ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
        }`}
      >
        ★
      </button>
      <button
        type="button"
        onClick={() => onOpen(task)}
        data-pm-row-title={task.id}
        className="min-w-[8rem] flex-1 break-words text-left font-medium text-slate-800 hover:underline"
      >
        {task.title}
      </button>
      <span
        className={`shrink-0 ${isOverdue(task, today) ? "font-bold text-rose-600" : "text-slate-500"}`}
      >
        {dueLabel(task, today)}
      </span>
      <select
        value={task.status}
        onChange={(e) => onStatus(task, e.target.value as TaskStatus)}
        data-pm-row-status={task.id}
        className="shrink-0 rounded border border-slate-300 px-1.5 py-0.5"
      >
        {TASK_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {task.assignee && (
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">
          任せる：{task.assignee}
        </span>
      )}
      <span className="shrink-0 text-slate-500" data-pm-row-progress={task.id}>
        {cellProgressLabel(task)}
      </span>
      {showNudge && (
        <span className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => onNudge(task, -1)}
            disabled={manualAt <= 0}
            data-pm-up={task.id}
            className="rounded border border-slate-300 px-1 disabled:opacity-30"
            aria-label="1つ上へ"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onNudge(task, 1)}
            disabled={manualAt < 0 || manualAt >= manualLast}
            data-pm-down={task.id}
            className="rounded border border-slate-300 px-1 disabled:opacity-30"
            aria-label="1つ下へ"
          >
            ↓
          </button>
        </span>
      )}
      <button
        type="button"
        onClick={() => onOpen(task)}
        data-pm-open-nine={task.id}
        className="shrink-0 rounded border border-teal-300 px-2 py-0.5 text-teal-700"
      >
        9マス
      </button>
    </li>
  );
}

// ─── 本体 ───

export function PriorityMatrixBoard() {
  const [tasks, setTasks] = useState<PriorityTask[]>([]);
  const [logs, setLogs] = useState<MatrixLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [sortMode, setSortMode] = useState<SortMode>("due");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [showDone, setShowDone] = useState(false);

  /** 編集中（task: null＝新規） */
  const [editing, setEditing] = useState<{ task: PriorityTask | null; quadrant: Quadrant } | null>(
    null
  );
  /** ドラッグ中のタスクid（パソコン） */
  const [dragId, setDragId] = useState("");
  /** 「移す先」を開いているタスクid（スマートフォン・パソコン共通で使える） */
  const [movingId, setMovingId] = useState("");

  const today = todayKey();

  const reload = useCallback(async () => {
    try {
      const payload = await fetchMatrix();
      setTasks(payload.tasks);
      setLogs(payload.logs);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const titleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tasks) m.set(t.id, t.title);
    return m;
  }, [tasks]);

  const linkedTitleOf = useCallback((id: string) => titleById.get(id) ?? "", [titleById]);

  const focus = useMemo(() => focusTasks(tasks), [tasks]);
  const doneCounts = useMemo(() => doneCountsOfMonth(tasks, monthKey()), [tasks]);
  const usedFocus = focusCount(tasks);

  /** その象限の一番下に置くための order */
  const orderAtBottom = useCallback(
    (quadrant: Quadrant) => {
      const same = tasks.filter((t) => t.quadrant === quadrant);
      return same.length === 0 ? 0 : Math.max(...same.map((t) => t.order)) + 1;
    },
    [tasks]
  );

  const run = useCallback(
    async (job: () => Promise<void>, ok?: string) => {
      try {
        await job();
        await reload();
        setError("");
        if (ok) setNotice(ok);
      } catch (e) {
        setNotice("");
        setError(e instanceof Error ? e.message : "処理に失敗しました");
      }
    },
    [reload]
  );

  const openTask = useCallback(
    (task: PriorityTask) => setEditing({ task, quadrant: task.quadrant }),
    []
  );
  const openNew = useCallback(
    (quadrant: Quadrant) => setEditing({ task: null, quadrant }),
    []
  );
  const toggleMove = useCallback(
    (id: string) => setMovingId((prev) => (prev === id ? "" : id)),
    []
  );
  const startDrag = useCallback((id: string) => setDragId(id), []);
  const endDrag = useCallback(() => setDragId(""), []);

  const handleSave = useCallback(
    async (fields: TaskFields) => {
      const target = editing?.task ?? null;
      if (target) await updateTask(target.id, fields);
      else await createTask(fields);
      await reload();
      setNotice(target ? "タスクを更新しました" : "タスクを追加しました");
      setError("");
    },
    [editing, reload]
  );

  const handleSpawn = useCallback(
    async ({
      fields,
      cellIndex,
      quadrant,
    }: {
      fields: TaskFields;
      cellIndex: number;
      quadrant: Quadrant;
    }) => {
      // 元のタスクを先に保存する（マスの本文を残したうえで新しいタスクを作る）
      const parent = editing?.task
        ? await updateTask(editing.task.id, fields)
        : await createTask(fields);
      const text = (fields.cells?.[cellIndex]?.text ?? "").trim();
      const child = await createTask({
        title: text,
        quadrant,
        sourceTaskId: parent.id,
        sourceCellIndex: cellIndex,
      });
      // 元のマスにリンクを残す（201 D）
      const cells = parent.cells.map((c, i) =>
        i === cellIndex ? { ...c, linkedTaskId: child.id } : c
      );
      await updateTask(parent.id, { cells });
      await reload();
      setNotice(`「${child.title}」を${QUADRANT_META[quadrant].short}に追加しました`);
      setError("");
    },
    [editing, reload]
  );

  const moveQuadrant = useCallback(
    (task: PriorityTask, quadrant: Quadrant) => {
      setMovingId("");
      if (task.quadrant === quadrant) return;
      void run(async () => {
        await updateTask(task.id, { quadrant, order: orderAtBottom(quadrant) });
      }, `「${task.title}」を${QUADRANT_META[quadrant].short}に移しました`);
    },
    [orderAtBottom, run]
  );

  const dropOn = useCallback(
    (id: string, quadrant: Quadrant) => {
      setDragId("");
      const task = tasks.find((t) => t.id === id);
      if (task) moveQuadrant(task, quadrant);
    },
    [tasks, moveQuadrant]
  );

  const toggleFocus = useCallback(
    (task: PriorityTask) => {
      void run(async () => {
        await updateTask(task.id, { focus: !task.focus });
      });
    },
    [run]
  );

  const setStatus = useCallback(
    (task: PriorityTask, status: TaskStatus) => {
      void run(async () => {
        await updateTask(task.id, { status });
      });
    },
    [run]
  );

  /** 手動の並びで1つ上／下へ（並び順を入れ替える） */
  const nudge = useCallback(
    (task: PriorityTask, dir: -1 | 1) => {
      const same = sortTasks(tasksOfQuadrant(tasks, task.quadrant), "manual");
      const at = same.findIndex((t) => t.id === task.id);
      const other = same[at + dir];
      if (!other) return;
      void run(async () => {
        await updateTask(task.id, { order: other.order });
        await updateTask(other.id, { order: task.order });
      });
    },
    [tasks, run]
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteTask(id);
      await reload();
      setNotice("タスクを削除しました");
    },
    [reload]
  );

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">🧭 四象限マトリクス</h1>
        <p className="mt-1 text-sm text-slate-600">
          タスクを緊急度×重要度の四象限で管理します。とくに<strong>第一象限</strong>と
          <strong>第二象限</strong>に目を向けるための画面です（院長のみ）。
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" data-pm-error>
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800" data-pm-notice>
          {notice}
        </p>
      )}

      {/* ─── ★ いま注力すること（C-3） ─── */}
      <section className="rounded-xl border-2 border-amber-300 bg-amber-50/70 p-3" data-pm-focus-bar>
        <h2 className="text-sm font-bold text-amber-900">
          ★ いま注力すること
          <span className="ml-1 font-normal text-amber-800">
            （{usedFocus}/{FOCUS_MAX}件）
          </span>
        </h2>
        {focus.length === 0 ? (
          <p className="mt-1 text-xs text-amber-800">
            タスクに★を付けると、ここに最大{FOCUS_MAX}件まで出ます。
          </p>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {focus.map((t) => (
              <li
                key={t.id}
                data-pm-focus-item={t.id}
                className="rounded-lg border border-amber-200 bg-white px-2 py-1.5"
              >
                <span className={`rounded px-1 py-0.5 text-[10px] ${QUADRANT_TONE[t.quadrant].chip}`}>
                  {QUADRANT_META[t.quadrant].short}
                </span>
                <button
                  type="button"
                  onClick={() => openTask(t)}
                  className="mt-1 block w-full break-words text-left text-xs font-medium text-slate-800 hover:underline"
                >
                  {t.title}
                </button>
                <span className="text-[10px] text-slate-500">
                  {dueLabel(t, today)}・{STATUS_LABEL[t.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── 四象限の図（C-1） ─── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-800">四象限の図</h2>
          <p className="text-[11px] text-slate-500">
            パソコンはカードをドラッグ、スマートフォンは「移す」から移す先を選べます
          </p>
        </div>

        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "1.25rem 1fr 1fr", gridTemplateRows: "auto auto auto" }}
          data-pm-figure
        >
          {/* 縦軸＝重要度（上が重要） */}
          <div className="flex items-center justify-center text-[10px] font-bold text-slate-500">
            <span style={{ writingMode: "vertical-rl" }}>重要</span>
          </div>
          {FIGURE_ROWS[0].map((q) => (
            <QuadrantBox
              key={q}
              q={q}
              large
              list={sortTasks(filterTasks(tasksOfQuadrant(tasks, q), { showDone }), sortMode)}
              today={today}
              dragId={dragId}
              movingId={movingId}
              onDragStart={startDrag}
              onDragEnd={endDrag}
              onToggleMove={toggleMove}
              onOpen={openTask}
              onMove={moveQuadrant}
              onAdd={openNew}
              onDrop={dropOn}
            />
          ))}

          <div className="flex items-center justify-center text-[10px] text-slate-400">
            <span style={{ writingMode: "vertical-rl" }}>重要でない</span>
          </div>
          {FIGURE_ROWS[1].map((q) => (
            <QuadrantBox
              key={q}
              q={q}
              large={false}
              list={sortTasks(filterTasks(tasksOfQuadrant(tasks, q), { showDone }), sortMode)}
              today={today}
              dragId={dragId}
              movingId={movingId}
              onDragStart={startDrag}
              onDragEnd={endDrag}
              onToggleMove={toggleMove}
              onOpen={openTask}
              onMove={moveQuadrant}
              onAdd={openNew}
              onDrop={dropOn}
            />
          ))}

          {/* 横軸＝緊急度（右が緊急） */}
          <div />
          <div className="text-center text-[10px] text-slate-400">緊急でない</div>
          <div className="text-center text-[10px] font-bold text-slate-500">緊急</div>
        </div>

        {/* 今月完了したタスクの象限ごとの件数（E・参考表示） */}
        <div className="rounded-lg bg-slate-50 p-3" data-pm-done-counts>
          <p className="text-xs font-bold text-slate-700">今月（{monthKey()}）完了したタスク</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            {QUADRANTS.map((q) => (
              <li key={q} data-pm-done-count={q}>
                {QUADRANT_META[q].short}：{doneCounts[q]}件
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-slate-500">
            参考の表示です。院長の振り返り記録（173）の「時間管理スナップショット」の配分には
            <strong>自動で書き込みません</strong>。配分は院長が自分で決めてください。
          </p>
        </div>
      </section>

      {/* ─── 象限ごとのリスト（C-2） ─── */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-800">象限ごとのリスト</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1">
              <span className="text-slate-600">並び順</span>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
                data-pm-sort
                className="rounded-md border border-slate-300 px-2 py-1"
              >
                <option value="due">期限が近い順</option>
                <option value="manual">手動の並び</option>
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-slate-600">状態</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | TaskStatus)}
                data-pm-status-filter
                className="rounded-md border border-slate-300 px-2 py-1"
              >
                <option value="all">すべて</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-slate-600">
              <input
                type="checkbox"
                checked={showDone}
                onChange={(e) => setShowDone(e.target.checked)}
                data-pm-show-done
              />
              <span>完了も表示</span>
            </label>
          </div>
        </div>

        {QUADRANTS.map((q) => {
          const list = sortTasks(
            filterTasks(tasksOfQuadrant(tasks, q), {
              showDone: showDone || statusFilter === "done",
              statuses: statusFilter === "all" ? [] : [statusFilter],
            }),
            sortMode
          );
          const manual = sortTasks(tasksOfQuadrant(tasks, q), "manual");
          return (
            <div
              key={q}
              data-pm-list={q}
              className={`rounded-xl border-l-4 bg-white p-3 ${QUADRANT_TONE[q].border}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className={`text-sm font-bold ${QUADRANT_TONE[q].head}`}>
                  {QUADRANT_META[q].label}
                  <span className="ml-1 font-normal text-slate-500">{list.length}件</span>
                </h3>
                <span className="text-[11px] text-slate-500">{QUADRANT_META[q].advice}</span>
              </div>
              {list.length === 0 ? (
                <p className="py-2 text-xs text-slate-400">該当するタスクはありません</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100">
                  {list.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      today={today}
                      manualAt={manual.findIndex((x) => x.id === t.id)}
                      manualLast={manual.length - 1}
                      showNudge={sortMode === "manual"}
                      onOpen={openTask}
                      onToggleFocus={toggleFocus}
                      onStatus={setStatus}
                      onNudge={nudge}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      {/* ─── 操作の記録（F: 本文は残さない） ─── */}
      <details className="rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          操作の記録（{logs.length}件）
        </summary>
        <p className="mt-1 text-[11px] text-slate-500">
          いつ・誰が・どのタスクに何をしたかだけを残しています（タイトル・メモ・9マスの本文は残しません）。
        </p>
        {logs.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">まだありません</p>
        ) : (
          <ul className="mt-2 space-y-1 text-[11px] text-slate-600">
            {logs.map((l) => (
              <li key={l.id}>
                {l.at.replace("T", " ").slice(0, 16)}・{l.action}・
                {l.quadrant ? QUADRANT_META[l.quadrant].short : "―"}・{l.taskId}
              </li>
            ))}
          </ul>
        )}
      </details>

      {!loaded && <p className="text-xs text-slate-500">読み込み中…</p>}

      {editing && (
        <PriorityTaskDialog
          key={editing.task ? `${editing.task.id}:${editing.task.updatedAt}` : `new:${editing.quadrant}`}
          task={editing.task}
          defaultQuadrant={editing.quadrant}
          focusUsedByOthers={tasks.filter((t) => t.focus && t.id !== editing.task?.id).length}
          focusMax={FOCUS_MAX}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onDelete={editing.task ? () => remove(editing.task!.id) : undefined}
          onSpawn={handleSpawn}
          linkedTitleOf={linkedTitleOf}
        />
      )}
    </div>
  );
}
