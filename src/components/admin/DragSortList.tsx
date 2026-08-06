"use client";

// ドラッグ並び替えの共通部品（指示書148）
//
// なぜ HTML5 の draggable を使わないか:
//   draggable / onDragStart は**タッチ端末では発火しない**（iOS Safari・Android Chrome）。
//   従来のレイアウトエディタはこれで実装されていたため、iPad・スマホでは並び替えできなかった。
//   Pointer Events はマウス・タッチ・ペンを1つのコードパスで扱えるブラウザ標準機能なので、
//   **依存ライブラリを足さずに**タッチ対応にできる。
//
// つかむのは専用ハンドルだけ（行全体をつかめるようにすると縦スクロールと取り合いになる）。
// ハンドルには touch-action: none を当て、ドラッグ中はページがスクロールしないようにする。
// ドロップ位置は挿入線で示す。並び替えの確定は呼び出し側の onReorder に委ねる
// （＝このコンポーネントは保存しない。保存は従来どおり💾ボタンで行う）。

import { useState, type ReactNode } from "react";

export type DragHandleProps = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  style: React.CSSProperties;
  role: "button";
  tabIndex: number;
  "aria-label": string;
  title: string;
};

type Props<T> = {
  items: T[];
  keyOf: (item: T) => string;
  /** from を to の位置へ移動する（呼び出し側で state を更新する） */
  onReorder: (from: number, to: number) => void;
  renderRow: (args: {
    item: T;
    index: number;
    dragging: boolean;
    /** ドロップ先として狙われている（grid では枠を光らせる用） */
    over: boolean;
    /** つかむ要素に展開する props */
    handleProps: DragHandleProps;
  }) => ReactNode;
  className?: string;
  /**
   * "list": 縦一列。ドロップ位置を挿入線で示す（既定）
   * "grid": 複数列。中心が最も近いセルを移動先とし、そのセルの枠を光らせる
   *         （複数列では挿入線が意味を持たないため）
   */
  mode?: "list" | "grid";
};

export function DragSortList<T>({
  items,
  keyOf,
  onReorder,
  renderRow,
  className = "space-y-2",
  mode = "list",
}: Props<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  // ref は使わず、つかんだハンドルから DOM を辿ってコンテナを得る。
  // （render 中に ref を読まない構成にするため。矩形はポインタ操作のたびに取り直す）
  const rectsFrom = (handleEl: Element): (DOMRect | null)[] => {
    const container = handleEl.closest("[data-dragsort]");
    if (!container) return [];
    return (Array.from(container.children) as HTMLElement[])
      .slice(0, items.length)
      .map((k) => k.getBoundingClientRect());
  };

  /** list: ポインタのY座標から挿入位置（0〜items.length）を求める */
  const insertIndexAt = (rects: (DOMRect | null)[], clientY: number): number => {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!r) continue;
      if (clientY < r.top + r.height / 2) return i;
    }
    return items.length;
  };

  /** grid: 中心が最も近いセルの index を返す（見つからなければ null） */
  const nearestIndexAt = (
    rects: (DOMRect | null)[],
    clientX: number,
    clientY: number
  ): number | null => {
    let best: number | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!r) continue;
      const dx = clientX - (r.left + r.width / 2);
      const dy = clientY - (r.top + r.height / 2);
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  };

  /** モードに応じた「今の移動先」 */
  const targetAt = (e: React.PointerEvent): number | null => {
    const rects = rectsFrom(e.currentTarget as Element);
    if (rects.length === 0) return null;
    return mode === "grid"
      ? nearestIndexAt(rects, e.clientX, e.clientY)
      : insertIndexAt(rects, e.clientY);
  };

  const handlePropsFor = (index: number): DragHandleProps => ({
    onPointerDown: (e) => {
      // 主ボタン以外（右クリック等）は無視
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      setDragIndex(index);
      setOverIndex(index);
    },
    onPointerMove: (e) => {
      if (dragIndex === null) return;
      e.preventDefault();
      setOverIndex(targetAt(e));
    },
    onPointerUp: (e) => {
      if (dragIndex === null) return;
      e.preventDefault();
      const to = targetAt(e);
      if (to !== null) {
        // list は挿入位置なので、自分を抜いた分のずれを補正する
        const dest =
          mode === "grid" ? to : to > dragIndex ? to - 1 : to;
        if (dest !== dragIndex && dest >= 0 && dest < items.length) {
          onReorder(dragIndex, dest);
        }
      }
      setDragIndex(null);
      setOverIndex(null);
    },
    onPointerCancel: () => {
      setDragIndex(null);
      setOverIndex(null);
    },
    style: { touchAction: "none", cursor: "grab" },
    role: "button",
    tabIndex: -1,
    "aria-label": "ドラッグして並び替え",
    title: "ドラッグして並び替え（上下のボタンでも動かせます）",
  });

  const dragging = dragIndex !== null;

  return (
    <div data-dragsort="" className={className}>
      {items.map((item, index) => (
        <div key={keyOf(item)}>
          {/* ドロップ位置の挿入線（縦一列のときだけ） */}
          {mode === "list" &&
            dragging &&
            overIndex === index &&
            index !== dragIndex && (
              <div
                aria-hidden="true"
                className="h-0.5 -mt-1 mb-1 rounded bg-teal-500"
              />
            )}
          {renderRow({
            item,
            index,
            dragging: dragIndex === index,
            over: dragging && overIndex === index && dragIndex !== index,
            handleProps: handlePropsFor(index),
          })}
        </div>
      ))}
      {/* 末尾に落とす場合の挿入線（縦一列のときだけ） */}
      {mode === "list" && dragging && overIndex === items.length && (
        <div aria-hidden="true" className="h-0.5 rounded bg-teal-500" />
      )}
    </div>
  );
}
