"use client";

// 9マスの中身が分かる印「▦」とポップアップ（指示書247 §4）
//
// ・9マスに1マスでも書いてある項目にだけ出す（何も書いていない項目には出さない）
// ・印の形は、9マスを開くボタンの「▦」と同じ
// ・パソコン：印にカーソルを合わせると出る（クリックで出したままにもできる）。
//   スマホ：印を押すと出て、もう一度押すか、外を押すと閉じる
// ・中身は、中央のタイトルとまわりの8マスを3×3で。完了の✓・改行はそのまま。1段目だけ
//   （下の段があるマスには、9マス画面と同じ「・」の印）
// ・出す場所は院長だけの画面（四象限マトリクス・管理画面のトップ）なので、見られる人は変わらない
// ・ポップアップは body の直下に出す（行のドラッグ・overflow・祖先の効果に巻き込まれないように）

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  GRID_SLOTS,
  hasChildContent,
  hasGridText,
  type NineCell,
} from "@/lib/priority-matrix";

export function GridPeek({
  title,
  cells,
  dataKey,
}: {
  title: string;
  cells: NineCell[];
  /** 検証用の目印（項目のid） */
  dataKey: string;
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const btn = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  const open = hover || pinned;

  // 画面からはみ出さない所に置く（state は使わず、出した直後に直接位置を決める）
  useLayoutEffect(() => {
    if (!open) return;
    const b = btn.current?.getBoundingClientRect();
    const p = pop.current;
    if (!b || !p) return;
    const w = p.offsetWidth;
    const h = p.offsetHeight;
    const left = Math.min(Math.max(8, b.left), Math.max(8, window.innerWidth - w - 8));
    let top = b.bottom + 4;
    if (top + h > window.innerHeight - 8) top = Math.max(8, b.top - h - 4);
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
    p.style.visibility = "visible";
  }, [open]);

  // 出したままのとき：外を押す／Escで閉じる
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (btn.current?.contains(t) || pop.current?.contains(t))) return;
      setPinned(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinned(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  // 何も書いていない項目には出さない
  if (!hasGridText(cells)) return null;

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setPinned((v) => !v)}
        // マウスのときだけ「合わせたら出る」。指で押したときは押すたびに開閉（押した直後に閉じてしまわないように）
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setHover(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setHover(false);
        }}
        aria-label="9マスの中身を見る"
        aria-expanded={open}
        title="9マスに書いてあります"
        data-pm-peek={dataKey}
        className="shrink-0 rounded border border-teal-300 px-1 text-[10px] font-bold leading-4 text-teal-700 hover:bg-teal-50"
      >
        ▦
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            role="dialog"
            aria-label={`${title}の9マス`}
            data-pm-peek-pop={dataKey}
            style={{ position: "fixed", left: 0, top: 0, visibility: "hidden", zIndex: 60 }}
            className="w-[min(20rem,calc(100vw-16px))] rounded-lg border border-slate-300 bg-white p-2 shadow-xl"
          >
            <div className="grid grid-cols-3 gap-1">
              {GRID_SLOTS.map((slot, pos) =>
                slot === "center" ? (
                  <div
                    key="center"
                    data-pm-peek-center
                    className="flex min-h-[3.5rem] items-center justify-center whitespace-pre-wrap break-words rounded bg-teal-600 p-1 text-center text-[11px] font-bold leading-tight text-white"
                  >
                    {title}
                  </div>
                ) : (
                  <PeekCell key={pos} cell={cells[slot]} index={slot} />
                )
              )}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              1段目だけ出しています。「・」は下の段にも書いてあるマスです。
            </p>
          </div>,
          document.body
        )}
    </>
  );
}

function PeekCell({ cell, index }: { cell: NineCell; index: number }) {
  const written = cell.text.trim().length > 0;
  return (
    <div
      data-pm-peek-cell={index}
      className={`relative min-h-[3.5rem] rounded border p-1 text-[11px] leading-tight ${
        cell.done ? "border-slate-200 bg-slate-100" : "border-slate-200 bg-white"
      }`}
    >
      {cell.done && (
        <span className="absolute left-0.5 top-0 text-[10px] font-bold text-teal-600" data-pm-peek-done={index}>
          ✓
        </span>
      )}
      <p
        className={`whitespace-pre-wrap break-words ${cell.done ? "pt-2.5" : ""} ${
          cell.done ? "text-slate-500 line-through" : "text-slate-700"
        }`}
      >
        {written ? cell.text : ""}
      </p>
      {hasChildContent(cell) && (
        <span
          className="absolute bottom-0.5 right-1 text-[12px] leading-none text-teal-600"
          title="下の段に書いてあります"
          data-pm-peek-deeper={index}
        >
          ・
        </span>
      )}
    </div>
  );
}
