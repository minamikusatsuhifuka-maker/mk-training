"use client";

// 院長の四象限マトリクス（指示書201 C・E → 202 §1・§2・§4）
//
//   ★ いま注力すること（最大3件）… 画面の一番上（201 C-3）
//   四象限の図                … 2×2。第一・第二象限を大きく。**1項目＝1行**・空いている所をクリックで
//                               その場に1行入力。ドラッグ／「移す」で象限を移せる（202 §1・§2）
//   今月完了した件数          … 図の下に参考表示。**173の配分には書き込まない**（201 E）
//   象限ごとのリスト          … 第一→第二→第三→第四。期限順／手動の並び・状態で絞り込み（201 C-2）
//   9マス帳                   … 四象限とは別の独立した9マス。★・今月の完了数に入れない（202 §4）
//   操作の記録・保存の点検    … 本文は残さない（201 F）／保存先の不具合をその場で名指し（202 §0）
//
// 見える人は院長だけ（201 A）。到達可否は /admin/priority-matrix のページとAPIで判定しており、
// この部品は「開けた人に見せるもの」だけを持つ。
//
// 【「タスクを追加」モーダルは廃止（202 §2）】
// 追加も編集もその場で行う。書きかけは入力欄・展開欄の未確定分を sessionStorage に預ける
// （PriorityPieces の useTextDraft／InlineAddInput）。
//
// 【部品は必ずモジュール直下に置く（201の実測）】
// 描画関数の中で定義すると再描画で作り直され、押した瞬間にクリックが落ちることがある。

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FOCUS_MAX,
  QUADRANTS,
  QUADRANT_META,
  STATUS_LABEL,
  TASK_STATUSES,
  cellProgressLabel,
  createBook,
  createTask,
  deleteRecord,
  doneCountsOfMonth,
  fetchMatrix,
  filterTasks,
  focusCount,
  focusTasks,
  isConflict,
  isOverdue,
  monthKey,
  runSelfTest,
  sortTasks,
  tasksOfQuadrant,
  todayKey,
  updateBook,
  updateTask,
  type GridBook,
  type MatrixLog,
  type PriorityTask,
  type Quadrant,
  type SelfTestResult,
  type SortMode,
  type TaskFields,
  type TaskStatus,
} from "@/lib/priority-matrix";
import { PriorityTaskRow } from "./PriorityTaskRow";
import {
  InlineAddHint,
  InlineAddInput,
  SAVED_MARK_MS,
  SaveMark,
  useTextDraft,
  type SaveState,
} from "./PriorityPieces";

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

/** 行に渡す道具をひとまとめにする（図とリストで同じものを使う） */
type RowTools = {
  today: string;
  expandedId: string;
  focusUsed: number;
  dragId: string;
  onToggleExpand: (id: string) => void;
  onPatch: (task: PriorityTask, fields: TaskFields) => Promise<void>;
  onDelete: (task: PriorityTask) => Promise<void>;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
};

function TaskRows({ list, tools }: { list: PriorityTask[]; tools: RowTools }) {
  return (
    <ul className="divide-y divide-slate-100">
      {list.map((t) => (
        <PriorityTaskRow
          key={t.id}
          task={t}
          today={tools.today}
          expanded={tools.expandedId === t.id}
          focusFull={!t.focus && tools.focusUsed >= FOCUS_MAX}
          dragging={tools.dragId === t.id}
          onToggleExpand={() => tools.onToggleExpand(t.id)}
          onPatch={(fields) => tools.onPatch(t, fields)}
          onDelete={() => tools.onDelete(t)}
          onDragStart={() => tools.onDragStart(t.id)}
          onDragEnd={tools.onDragEnd}
        />
      ))}
    </ul>
  );
}

// ─── 図の1象限 ───

function QuadrantFigureBox({
  q,
  large,
  list,
  tools,
  adding,
  onOpenAdd,
  onCloseAdd,
  onAdd,
  onDrop,
}: {
  q: Quadrant;
  large: boolean;
  list: PriorityTask[];
  tools: RowTools;
  adding: boolean;
  onOpenAdd: (q: Quadrant) => void;
  onCloseAdd: () => void;
  onAdd: (q: Quadrant, text: string) => Promise<void>;
  onDrop: (id: string, q: Quadrant) => void;
}) {
  const tone = QUADRANT_TONE[q];
  return (
    <div
      onDragOver={(e) => {
        if (tools.dragId) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(e.dataTransfer.getData("text/plain") || tools.dragId, q);
      }}
      data-pm-quadrant-box={q}
      className={`flex flex-col rounded-xl border-2 bg-white/70 p-2 ${tone.border} ${
        large ? "min-h-[208px]" : "min-h-[128px]"
      }`}
    >
      <div className="mb-1">
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

      <TaskRows list={list} tools={tools} />

      {adding ? (
        <div className="mt-1">
          <InlineAddInput
            draftKey={`pm:add:figure:${q}`}
            label={`${QUADRANT_META[q].short}に追加`}
            placeholder="やることを1行で"
            onSubmit={(text) => onAdd(q, text)}
            onClose={onCloseAdd}
          />
          <InlineAddHint />
        </div>
      ) : (
        <>
          {/* 象限の「空いている所」をクリックしても入力欄が出る（202 §1） */}
          <button
            type="button"
            onClick={() => onOpenAdd(q)}
            data-pm-empty-space={q}
            aria-label={`${QUADRANT_META[q].short}に追加`}
            className="min-h-[18px] flex-1 cursor-text rounded"
          />
          <button
            type="button"
            onClick={() => onOpenAdd(q)}
            data-pm-add={q}
            className="mt-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-500 hover:border-teal-400 hover:text-teal-700"
          >
            ＋ ここに追加
          </button>
        </>
      )}
    </div>
  );
}

// ─── 9マス帳の1冊（202 §4） ───

function BookRow({
  book,
  onRename,
  onDelete,
}: {
  book: GridBook;
  onRename: (title: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [state, setState] = useState<SaveState>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const title = useTextDraft(`pm:book:${book.id}:title`, book.title);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const commit = async () => {
    const next = title.value.trim();
    if (!next || next === book.title) {
      title.settle(book.title);
      return;
    }
    title.settle(next);
    setState("saving");
    try {
      await onRename(next);
      setState("saved");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState(""), SAVED_MARK_MS);
    } catch {
      setState("error");
    }
  };

  return (
    <li
      data-pm-book={book.id}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-100 py-1.5 text-xs last:border-b-0"
    >
      <input
        type="text"
        value={title.value}
        onChange={(e) => title.change(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
        aria-label="9マス帳の名前"
        data-pm-book-title={book.id}
        className="min-w-[8rem] flex-1 rounded-md border border-transparent px-1.5 py-0.5 font-medium text-slate-800 hover:border-slate-300 focus:border-teal-400"
      />
      <span className="shrink-0 text-[10px] text-slate-500" data-pm-book-progress={book.id}>
        {cellProgressLabel(book)}
      </span>
      <span className="shrink-0 text-[10px] text-slate-400">
        更新 {book.updatedAt.replace("T", " ").slice(0, 16)}
      </span>
      <SaveMark state={state} />
      <Link
        href={`/admin/priority-matrix/grid/${encodeURIComponent(book.id)}`}
        data-pm-book-open={book.id}
        className="shrink-0 rounded-md border border-teal-300 px-2 py-0.5 text-[11px] font-medium text-teal-700"
      >
        ▦ 開く
      </Link>
      <button
        type="button"
        onClick={() => {
          if (
            !window.confirm(
              `9マス帳「${book.title}」を削除します。書いた9マスも一緒に消えます。\n\nよろしいですか？`
            )
          )
            return;
          void onDelete();
        }}
        data-pm-book-delete={book.id}
        className="shrink-0 rounded-md border border-rose-300 px-2 py-0.5 text-[11px] text-rose-700"
      >
        削除
      </button>
    </li>
  );
}

// ─── 保存の点検（202 §0） ───

function SelfTestPanel() {
  const [result, setResult] = useState<SelfTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-600">
        「保存したのに増えない」が起きたときは、ここを押すと保存先に書ける／読み戻せる／消せるを
        その場で確かめます（点検用の記録はすぐ消えます）。
      </p>
      <button
        type="button"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            setResult(await runSelfTest());
          } catch (e) {
            setResult(null);
            setError(e instanceof Error ? e.message : "点検できませんでした");
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        data-pm-selftest
        className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-700 disabled:opacity-50"
      >
        {busy ? "点検中…" : "保存の点検をする"}
      </button>
      {error && (
        <p className="rounded-md bg-rose-50 px-2 py-1 text-[11px] text-rose-700" data-pm-selftest-error>
          {error}
        </p>
      )}
      {result && (
        <ul className="space-y-1 text-[11px]" data-pm-selftest-result={result.ok ? "ok" : "ng"}>
          {result.steps.map((s, i) => (
            <li key={i} className={s.ok ? "text-slate-600" : "text-rose-700"}>
              {s.ok ? "✅" : "❌"} {s.name}：{s.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── 本体 ───

export function PriorityMatrixBoard() {
  const [tasks, setTasks] = useState<PriorityTask[]>([]);
  const [books, setBooks] = useState<GridBook[]>([]);
  const [logs, setLogs] = useState<MatrixLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [sortMode, setSortMode] = useState<SortMode>("due");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [showDone, setShowDone] = useState(false);

  /** 開いている行（図とリストで別に持つ＝両方が同時に開かない） */
  const [expandedFigure, setExpandedFigure] = useState("");
  const [expandedList, setExpandedList] = useState("");
  /** 入力欄を出している象限（図・リストそれぞれ1か所） */
  const [addingFigure, setAddingFigure] = useState<Quadrant | 0>(0);
  const [addingList, setAddingList] = useState<Quadrant | 0>(0);
  const [addingBook, setAddingBook] = useState(false);
  /** ドラッグ中のid（パソコン） */
  const [dragId, setDragId] = useState("");

  const today = todayKey();

  const reload = useCallback(async () => {
    try {
      const payload = await fetchMatrix();
      setTasks(payload.tasks);
      setBooks(payload.books);
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

  const focus = useMemo(() => focusTasks(tasks), [tasks]);
  const doneCounts = useMemo(() => doneCountsOfMonth(tasks, monthKey()), [tasks]);
  const usedFocus = focusCount(tasks);

  /** 失敗の文言を赤い帯に出す。版の食い違いは言い方を変える（202 §5） */
  const showError = useCallback((e: unknown) => {
    setNotice("");
    setError(e instanceof Error ? e.message : "処理に失敗しました");
    if (isConflict(e)) setLoaded(true);
  }, []);

  /** 1件だけ差し替える（画面全体を読み直さない＝開いている欄が閉じない） */
  const replaceTask = useCallback((t: PriorityTask) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? t : x)));
  }, []);

  const patchTask = useCallback(
    async (task: PriorityTask, fields: TaskFields) => {
      // ★の4件目は呼ぶ前に断る（サーバー側でも上限を強制している）
      if (fields.focus === true && !task.focus && usedFocus >= FOCUS_MAX) {
        const e = new Error(
          `★（いま注力すること）は${FOCUS_MAX}件までです。どれかの★を外してください`
        );
        showError(e);
        throw e;
      }
      try {
        const next = await updateTask(task.id, fields, task.updatedAt);
        replaceTask(next);
        setError("");
      } catch (e) {
        showError(e);
        throw e;
      }
    },
    [usedFocus, replaceTask, showError]
  );

  const addTask = useCallback(
    async (quadrant: Quadrant, title: string) => {
      try {
        // 登録時の初期値：その象限・未着手・期限なし・★なし（202 §1）
        await createTask({ title, quadrant, status: "todo", due: "", focus: false });
        await reload();
        setNotice(`${QUADRANT_META[quadrant].short}に追加しました`);
        setError("");
      } catch (e) {
        showError(e);
        throw e;
      }
    },
    [reload, showError]
  );

  const removeTask = useCallback(
    async (task: PriorityTask) => {
      try {
        await deleteRecord(task.id);
        await reload();
        setNotice("削除しました");
      } catch (e) {
        showError(e);
      }
    },
    [reload, showError]
  );

  const moveQuadrant = useCallback(
    (id: string, quadrant: Quadrant) => {
      setDragId("");
      const task = tasks.find((t) => t.id === id);
      if (!task || task.quadrant === quadrant) return;
      void (async () => {
        try {
          const next = await updateTask(task.id, { quadrant }, task.updatedAt);
          replaceTask(next);
          setNotice(`「${task.title}」を${QUADRANT_META[quadrant].short}に移しました`);
          setError("");
        } catch (e) {
          showError(e);
        }
      })();
    },
    [tasks, replaceTask, showError]
  );

  const addBook = useCallback(
    async (title: string) => {
      try {
        await createBook(title);
        await reload();
        setNotice("9マス帳を作りました");
        setError("");
      } catch (e) {
        showError(e);
        throw e;
      }
    },
    [reload, showError]
  );

  const renameBook = useCallback(
    async (book: GridBook, title: string) => {
      try {
        const next = await updateBook(book.id, { title }, book.updatedAt);
        setBooks((prev) => prev.map((b) => (b.id === next.id ? next : b)));
        setError("");
      } catch (e) {
        showError(e);
        throw e;
      }
    },
    [showError]
  );

  const removeBook = useCallback(
    async (book: GridBook) => {
      try {
        await deleteRecord(book.id);
        await reload();
        setNotice("9マス帳を削除しました");
      } catch (e) {
        showError(e);
      }
    },
    [reload, showError]
  );

  const figureTools: RowTools = {
    today,
    expandedId: expandedFigure,
    focusUsed: usedFocus,
    dragId,
    onToggleExpand: (id) => setExpandedFigure((prev) => (prev === id ? "" : id)),
    onPatch: patchTask,
    onDelete: removeTask,
    onDragStart: (id) => setDragId(id),
    onDragEnd: () => setDragId(""),
  };

  const listTools: RowTools = {
    ...figureTools,
    expandedId: expandedList,
    onToggleExpand: (id) => setExpandedList((prev) => (prev === id ? "" : id)),
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">🧭 四象限マトリクス</h1>
        <p className="mt-1 text-sm text-slate-600">
          やることを緊急度×重要度の四象限で管理します。とくに<strong>第一象限</strong>と
          <strong>第二象限</strong>に目を向けるための画面です（院長のみ）。
          空いている所をクリックするとその場に1行の入力欄が出ます。
        </p>
      </div>

      {error && (
        <p
          className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
          data-pm-error
          role="alert"
        >
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md bg-teal-50 px-3 py-2 text-sm text-teal-800" data-pm-notice>
          {notice}
        </p>
      )}

      {/* ─── ★ いま注力すること（201 C-3） ─── */}
      <section className="rounded-xl border-2 border-amber-300 bg-amber-50/70 p-3" data-pm-focus-bar>
        <h2 className="text-sm font-bold text-amber-900">
          ★ いま注力すること
          <span className="ml-1 font-normal text-amber-800">
            （{usedFocus}/{FOCUS_MAX}件）
          </span>
        </h2>
        {focus.length === 0 ? (
          <p className="mt-1 text-xs text-amber-800">
            行の★を押すと、ここに最大{FOCUS_MAX}件まで出ます。
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
                <p className="mt-1 break-words text-xs font-medium text-slate-800">{t.title}</p>
                <span className="text-[10px] text-slate-500">
                  {dueLabel(t, today)}・{STATUS_LABEL[t.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── 四象限の図（201 C-1・202 §1・§2） ─── */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-800">四象限の図</h2>
          <p className="text-[11px] text-slate-500">
            パソコンは行をドラッグ、スマートフォンは行を開いて「移す」で象限を変えられます
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
            <QuadrantFigureBox
              key={q}
              q={q}
              large
              list={sortTasks(filterTasks(tasksOfQuadrant(tasks, q), { showDone }), sortMode)}
              tools={figureTools}
              adding={addingFigure === q}
              onOpenAdd={(x) => setAddingFigure(x)}
              onCloseAdd={() => setAddingFigure(0)}
              onAdd={addTask}
              onDrop={moveQuadrant}
            />
          ))}

          <div className="flex items-center justify-center text-[10px] text-slate-400">
            <span style={{ writingMode: "vertical-rl" }}>重要でない</span>
          </div>
          {FIGURE_ROWS[1].map((q) => (
            <QuadrantFigureBox
              key={q}
              q={q}
              large={false}
              list={sortTasks(filterTasks(tasksOfQuadrant(tasks, q), { showDone }), sortMode)}
              tools={figureTools}
              adding={addingFigure === q}
              onOpenAdd={(x) => setAddingFigure(x)}
              onCloseAdd={() => setAddingFigure(0)}
              onAdd={addTask}
              onDrop={moveQuadrant}
            />
          ))}

          {/* 横軸＝緊急度（右が緊急） */}
          <div />
          <div className="text-center text-[10px] text-slate-400">緊急でない</div>
          <div className="text-center text-[10px] font-bold text-slate-500">緊急</div>
        </div>

        {/* 今月完了した件数（201 E・参考表示） */}
        <div className="rounded-lg bg-slate-50 p-3" data-pm-done-counts>
          <p className="text-xs font-bold text-slate-700">今月（{monthKey()}）完了した項目</p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            {QUADRANTS.map((q) => (
              <li key={q} data-pm-done-count={q}>
                {QUADRANT_META[q].short}：{doneCounts[q]}件
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-slate-500">
            参考の表示です（9マス帳は入りません）。院長の振り返り記録（173）の
            「時間管理スナップショット」の配分には<strong>自動で書き込みません</strong>。
          </p>
        </div>
      </section>

      {/* ─── 象限ごとのリスト（201 C-2） ─── */}
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
                <p className="py-1 text-xs text-slate-400">該当する項目はありません</p>
              ) : (
                <div className="mt-1">
                  <TaskRows list={list} tools={listTools} />
                </div>
              )}
              {addingList === q ? (
                <div className="mt-1.5">
                  <InlineAddInput
                    draftKey={`pm:add:list:${q}`}
                    label={`${QUADRANT_META[q].short}に追加`}
                    placeholder="やることを1行で"
                    onSubmit={(text) => addTask(q, text)}
                    onClose={() => setAddingList(0)}
                  />
                  <InlineAddHint />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingList(q)}
                  data-pm-list-add={q}
                  className="mt-1.5 rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-500 hover:border-teal-400 hover:text-teal-700"
                >
                  ＋ ここに追加
                </button>
              )}
            </div>
          );
        })}
      </section>

      {/* ─── 9マス帳（202 §4） ─── */}
      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-pm-books>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold text-slate-800">
            ▦ 9マス帳
            <span className="ml-1 text-xs font-normal text-slate-500">{books.length}冊</span>
          </h2>
          <p className="text-[11px] text-slate-500">
            四象限とは別の、独立した9マスです（★・今月の完了数には入りません）
          </p>
        </div>

        {books.length === 0 ? (
          <p className="py-1 text-xs text-slate-400">まだありません</p>
        ) : (
          <ul>
            {[...books]
              .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
              .map((b) => (
                <BookRow
                  key={b.id}
                  book={b}
                  onRename={(title) => renameBook(b, title)}
                  onDelete={() => removeBook(b)}
                />
              ))}
          </ul>
        )}

        {addingBook ? (
          <div>
            <InlineAddInput
              draftKey="pm:add:book"
              label="9マス帳のテーマ"
              placeholder="テーマを1行で（例：採用を強くする）"
              onSubmit={addBook}
              onClose={() => setAddingBook(false)}
            />
            <InlineAddHint />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingBook(true)}
            data-pm-book-add
            className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-500 hover:border-teal-400 hover:text-teal-700"
          >
            ＋ 9マス帳を作る
          </button>
        )}
      </section>

      {/* ─── 操作の記録（201 F: 本文は残さない）・保存の点検（202 §0） ─── */}
      <details className="rounded-lg border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          操作の記録（{logs.length}件）・保存の点検
        </summary>
        <div className="mt-2 space-y-3">
          <SelfTestPanel />
          <div>
            <p className="text-[11px] text-slate-500">
              いつ・誰が・どの項目に何をしたかだけを残しています
              （タイトル・メモ・9マスの本文は残しません）。
            </p>
            {logs.length === 0 ? (
              <p className="mt-1 text-xs text-slate-400">まだありません</p>
            ) : (
              <ul className="mt-1 space-y-1 text-[11px] text-slate-600">
                {logs.map((l) => (
                  <li key={l.id}>
                    {l.at.replace("T", " ").slice(0, 16)}・{l.action}・
                    {l.quadrant ? QUADRANT_META[l.quadrant].short : "―"}・{l.taskId}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>

      {!loaded && <p className="text-xs text-slate-500">読み込み中…</p>}
    </div>
  );
}
