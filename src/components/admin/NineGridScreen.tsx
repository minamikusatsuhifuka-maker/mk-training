"use client";

// 9マス（マンダラチャート）の専用画面（指示書202 §3）
//
// ・四象限のモーダルの中ではなく **専用の画面**（/admin/priority-matrix/grid/[id]?p=…）
// ・上部にたどった道筋（四象限 › 採用を強くする › 面接の質）。各段に戻れる
// ・中央＝いま開いている題。中央をクリックするとその題を直せる
// ・周りの8マスは**クリックするとその場で書ける**（下の入力パネルは無い）
//   － Enterで確定して**時計回りに次の空きマス**へ。Escで取り消し。欄から離れたら確定
//   － 各マスの角に完了チェック。「8マス中◯つ完了」
// ・書いてあるマスの「▦」で、そのマスを中央にした9マスへ（**最初の9マスから3段まで**）
// ・下の段に中身があるマスは右下に点。空にする・消すときは**下の段も消える**ことを確認してから
// ・「…」から「四象限に行として追加」（元のマスは残す）
// ・自動保存（保存中・保存済み・失敗を出し、失敗は赤い帯）。版が食い違えば保存せず赤い帯（202 §5）
//
// 9マス帳（202 §4）も同じこの画面で開く。中身は入れ子で1レコードに入っている。

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CELL_COUNT,
  CLOCKWISE,
  GRID_SLOTS,
  MAX_DEPTH,
  QUADRANTS,
  QUADRANT_META,
  canDigInto,
  cellAt,
  clearGridCell,
  createTask,
  depthOf,
  fetchRecord,
  gridCells,
  hasChildContent,
  levelProgress,
  parsePathParam,
  pathToParam,
  progressLabel,
  setCellText,
  setGridCell,
  updateBook,
  updateTask,
  type MatrixRecord,
  type NineCell,
  type Quadrant,
} from "@/lib/priority-matrix";
import { SAVED_MARK_MS, SaveMark, useTextDraft, type SaveState } from "./PriorityPieces";

// ─── マスの中の入力欄（確定したら次の空きマスへ） ───

function CellEditor({
  draftKey,
  initial,
  onDone,
  onCancel,
}: {
  draftKey: string;
  initial: string;
  /** 確定。advance＝Enterで確定したので次の空きマスへ進む */
  onDone: (text: string, advance: boolean) => void;
  onCancel: () => void;
}) {
  const { value, change, settle } = useTextDraft(draftKey, initial);
  const ref = useRef<HTMLInputElement | null>(null);
  /** Enter／Escで決着したあとの blur で二重に確定しないための印 */
  const settled = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (advance: boolean) => {
    if (settled.current) return;
    settled.current = true;
    settle(value);
    onDone(value, advance);
  };

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      aria-label="このマスに書く"
      onChange={(e) => change(e.target.value)}
      onBlur={() => finish(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          if (settled.current) return;
          settled.current = true;
          settle(initial);
          onCancel();
        }
      }}
      className="h-full w-full resize-none rounded border border-teal-500 bg-white px-1 py-0.5 text-[11px] leading-tight text-slate-800 outline-none"
    />
  );
}

// ─── 1マス ───

function GridCellBox({
  cell,
  index,
  editing,
  canDig,
  menuOpen,
  digHref,
  draftKey,
  linkedTitle,
  onStartEdit,
  onDone,
  onCancel,
  onToggleDone,
  onToggleMenu,
  onClear,
  onSendToQuadrant,
}: {
  cell: NineCell;
  index: number;
  editing: boolean;
  canDig: boolean;
  menuOpen: boolean;
  digHref: string;
  draftKey: string;
  linkedTitle: string;
  onStartEdit: () => void;
  onDone: (text: string, advance: boolean) => void;
  onCancel: () => void;
  onToggleDone: () => void;
  onToggleMenu: () => void;
  onClear: () => void;
  onSendToQuadrant: (q: Quadrant) => void;
}) {
  const written = cell.text.trim().length > 0;
  const deeper = hasChildContent(cell);
  return (
    <div
      data-pm-cell={index}
      className={`relative flex min-h-[88px] flex-col rounded-md border p-1 text-[11px] leading-tight ${
        editing
          ? "border-teal-500 bg-teal-50"
          : cell.done
            ? "border-slate-200 bg-slate-100"
            : "border-slate-200 bg-white"
      }`}
    >
      {/* 角の完了チェック */}
      <div className="flex items-start justify-between gap-1">
        <label className="flex cursor-pointer items-center gap-0.5 text-[10px] text-slate-500">
          <input
            type="checkbox"
            checked={cell.done}
            onChange={onToggleDone}
            data-pm-cell-done={index}
            className="h-3 w-3"
            aria-label={`${index + 1}つ目のマスは完了`}
          />
        </label>
        <div className="flex items-center gap-0.5">
          {linkedTitle && <span title={`四象限に出した行：${linkedTitle}`}>🔗</span>}
          {written && canDig && (
            <Link
              href={digHref}
              data-pm-dig={index}
              title="このマスを中央にした9マスを開く"
              className="rounded border border-teal-300 px-1 text-[10px] font-bold text-teal-700"
            >
              ▦
            </Link>
          )}
          {written && (
            <button
              type="button"
              onClick={onToggleMenu}
              data-pm-cell-menu={index}
              aria-label={`${index + 1}つ目のマスの操作`}
              className="rounded border border-slate-300 px-1 text-[10px] text-slate-600"
            >
              …
            </button>
          )}
        </div>
      </div>

      {/* 本体（クリックでその場に入力欄） */}
      <div className="mt-0.5 flex-1">
        {editing ? (
          <CellEditor
            draftKey={draftKey}
            initial={cell.text}
            onDone={onDone}
            onCancel={onCancel}
          />
        ) : (
          <button
            type="button"
            onClick={onStartEdit}
            data-pm-cell-text={index}
            className={`h-full w-full break-words text-left ${
              cell.done ? "text-slate-500 line-through" : "text-slate-700"
            }`}
          >
            {written ? cell.text : <span className="text-slate-400">＋</span>}
          </button>
        )}
      </div>

      {/* 下の段に中身があるときの印（202 §3） */}
      {deeper && (
        <span
          className="absolute bottom-0.5 right-1 text-[12px] leading-none text-teal-600"
          title="下の段に書いてあります"
          data-pm-cell-deeper={index}
        >
          ・
        </span>
      )}

      {menuOpen && (
        <div
          className="absolute right-1 top-6 z-10 w-40 space-y-1 rounded-md border border-slate-300 bg-white p-1.5 shadow-lg"
          data-pm-cell-menu-panel={index}
        >
          <p className="text-[10px] font-bold text-slate-600">四象限に行として追加</p>
          {QUADRANTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onSendToQuadrant(q)}
              data-pm-send-to={q}
              className="block w-full rounded bg-slate-100 px-1.5 py-1 text-left text-[10px] text-slate-700 hover:bg-slate-200"
            >
              → {QUADRANT_META[q].label}
            </button>
          ))}
          <button
            type="button"
            onClick={onClear}
            data-pm-cell-clear={index}
            className="block w-full rounded border border-rose-300 px-1.5 py-1 text-left text-[10px] text-rose-700"
          >
            このマスを空にする
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 本体 ───

export function NineGridScreen({
  recordId,
  pathParam,
}: {
  recordId: string;
  pathParam: string;
}) {
  const path = parsePathParam(pathParam);
  const [record, setRecord] = useState<MatrixRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [state, setState] = useState<SaveState>("");
  const [editing, setEditing] = useState<number | null>(null);
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [editingCenter, setEditingCenter] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const load = useCallback(async () => {
    try {
      setRecord(await fetchRecord(recordId));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, [recordId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 9マス（と題）を保存する。版を添えて送り、食い違えば保存されない（202 §5） */
  const save = useCallback(
    async (patch: { cells?: NineCell[]; title?: string }) => {
      if (!record) return;
      setState("saving");
      try {
        const next =
          record.kind === "book"
            ? await updateBook(record.id, patch, record.updatedAt)
            : await updateTask(record.id, patch, record.updatedAt);
        setRecord(next);
        setState("saved");
        setError("");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState(""), SAVED_MARK_MS);
      } catch (e) {
        setState("error");
        setNotice("");
        setError(e instanceof Error ? e.message : "保存できませんでした");
      }
    },
    [record]
  );

  if (!loaded) {
    return <p className="text-sm text-slate-500">読み込み中…</p>;
  }
  if (!record) {
    return (
      <div className="space-y-3">
        <p className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
          {error || "開けませんでした"}
        </p>
        <Link href="/admin/priority-matrix" className="text-sm text-teal-700 underline">
          ← 四象限マトリクスへ戻る
        </Link>
      </div>
    );
  }

  const cells = gridCells(record.cells, path);
  const progress = levelProgress(cells);
  const depth = depthOf(path);
  const dig = canDigInto(path);
  const centerText =
    path.length === 0 ? record.title : (cellAt(record.cells, path)?.text ?? "");

  const hrefFor = (p: number[]) =>
    `/admin/priority-matrix/grid/${encodeURIComponent(record.id)}${
      p.length ? `?p=${pathToParam(p)}` : ""
    }`;

  /** たどった道筋（各段に戻れる） */
  const crumbs: { label: string; href: string | null }[] = [
    {
      label: record.kind === "book" ? "9マス帳" : "四象限",
      href: "/admin/priority-matrix",
    },
    { label: record.title, href: path.length === 0 ? null : hrefFor([]) },
    ...path.map((_, i) => {
      const prefix = path.slice(0, i + 1);
      const cell = cellAt(record.cells, prefix);
      return {
        label: cell?.text.trim() || "（空のマス）",
        href: i === path.length - 1 ? null : hrefFor(prefix),
      };
    }),
  ];

  const commitCell = (index: number, text: string, advance: boolean) => {
    setMenuAt(null);
    const current = cells[index];
    const next = text.trim();
    // 中身のあるマスを空にするときは、下の段も消えることを確認してから（202 §3）
    if (!next && current.text.trim() && hasChildContent(current)) {
      const ok = window.confirm(
        "このマスを空にすると、下の段に書いた内容も一緒に消えます。\n\nよろしいですか？"
      );
      if (!ok) {
        setEditing(null);
        return;
      }
      void save({ cells: clearGridCell(record.cells, path, index) });
      setEditing(null);
      return;
    }
    if (next !== current.text) {
      void save({ cells: setGridCell(record.cells, path, index, { text: next }) });
    }
    if (!advance) {
      setEditing(null);
      return;
    }
    // Enterで確定したら時計回りに次の空きマスへ（202 §3）
    const after = cells.map((c, i) => (i === index ? { ...c, text: next } : c));
    const at = CLOCKWISE.indexOf(index);
    let target: number | null = null;
    for (let step = 1; step <= CELL_COUNT; step++) {
      const cand = CLOCKWISE[(at + step) % CELL_COUNT];
      if (!after[cand].text.trim()) {
        target = cand;
        break;
      }
    }
    setEditing(target);
  };

  const clearCell = (index: number) => {
    setMenuAt(null);
    const current = cells[index];
    const warn = hasChildContent(current)
      ? "このマスを空にすると、下の段に書いた内容も一緒に消えます。\n\nよろしいですか？"
      : "このマスを空にします。\n\nよろしいですか？";
    if (!window.confirm(warn)) return;
    void save({ cells: clearGridCell(record.cells, path, index) });
  };

  /** マスの内容を四象限の行として追加する（元のマスは残す・202 §3） */
  const sendToQuadrant = async (index: number, quadrant: Quadrant) => {
    setMenuAt(null);
    const text = cells[index].text.trim();
    if (!text) return;
    setState("saving");
    try {
      const child = await createTask({
        title: text,
        quadrant,
        status: "todo",
        sourceTaskId: record.id,
        sourceCellIndex: index,
      });
      const nextCells = setGridCell(record.cells, path, index, { linkedTaskId: child.id });
      const next =
        record.kind === "book"
          ? await updateBook(record.id, { cells: nextCells }, record.updatedAt)
          : await updateTask(record.id, { cells: nextCells }, record.updatedAt);
      setRecord(next);
      setState("saved");
      setError("");
      setNotice(`「${text}」を${QUADRANT_META[quadrant].short}に行として追加しました`);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState(""), SAVED_MARK_MS);
    } catch (e) {
      setState("error");
      setNotice("");
      setError(e instanceof Error ? e.message : "四象限に追加できませんでした");
    }
  };

  const commitCenter = (text: string) => {
    setEditingCenter(false);
    const next = text.trim();
    if (!next || next === centerText) return;
    if (path.length === 0) void save({ title: next });
    else void save({ cells: setCellText(record.cells, path, next) });
  };

  return (
    <div className="max-w-3xl space-y-4">
      {/* 道筋（各段に戻れる） */}
      <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-600" data-pm-crumbs>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-400">›</span>}
            {c.href ? (
              <Link href={c.href} className="text-teal-700 underline underline-offset-2">
                {c.label}
              </Link>
            ) : (
              <span className="font-medium text-slate-800">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-bold text-slate-800">
          ▦ 9マス
          <span className="ml-2 text-xs font-normal text-slate-500">
            {depth}段目（{MAX_DEPTH}段まで）
          </span>
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-600" data-pm-progress>
            {progressLabel(progress)}
          </span>
          <SaveMark state={state} />
        </div>
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

      <div className="grid grid-cols-3 gap-1.5" data-pm-grid>
        {GRID_SLOTS.map((slot, pos) => {
          if (slot === "center") {
            return (
              <div
                key="center"
                data-pm-center
                className="flex min-h-[88px] items-center justify-center rounded-md bg-teal-600 p-1"
              >
                {editingCenter ? (
                  <CellEditor
                    draftKey={`pm:center:${record.id}:${pathToParam(path)}`}
                    initial={centerText}
                    onDone={(t) => commitCenter(t)}
                    onCancel={() => setEditingCenter(false)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingCenter(true)}
                    data-pm-center-edit
                    title="この題を直す"
                    className="h-full w-full break-words text-center text-[11px] font-bold leading-tight text-white"
                  >
                    {centerText || "（空のマス）"}
                  </button>
                )}
              </div>
            );
          }
          const index = slot;
          return (
            <GridCellBox
              key={pos}
              cell={cells[index]}
              index={index}
              editing={editing === index}
              canDig={dig}
              menuOpen={menuAt === index}
              digHref={hrefFor([...path, index])}
              draftKey={`pm:cell:${record.id}:${pathToParam(path)}:${index}`}
              linkedTitle={cells[index].linkedTaskId ? "追加済み" : ""}
              onStartEdit={() => {
                setMenuAt(null);
                setEditing(index);
              }}
              onDone={(text, advance) => commitCell(index, text, advance)}
              onCancel={() => setEditing(null)}
              onToggleDone={() =>
                void save({
                  cells: setGridCell(record.cells, path, index, { done: !cells[index].done }),
                })
              }
              onToggleMenu={() => setMenuAt((prev) => (prev === index ? null : index))}
              onClear={() => clearCell(index)}
              onSendToQuadrant={(q) => void sendToQuadrant(index, q)}
            />
          );
        })}
      </div>

      <p className="text-[11px] text-slate-500">
        マスをクリックすると、その場で書けます。Enterで確定して時計回りに次の空きマスへ進み、
        Escで取り消します。{dig ? "書いてあるマスの「▦」で下の段へ進めます。" : `ここは${MAX_DEPTH}段目なので、これ以上下の段は作れません。`}
        変えたところはその場で保存されます。
      </p>

      <Link href="/admin/priority-matrix" className="inline-block text-sm text-teal-700 underline">
        ← 四象限マトリクスへ戻る
      </Link>
    </div>
  );
}
