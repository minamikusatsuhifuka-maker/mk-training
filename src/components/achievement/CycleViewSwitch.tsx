"use client";

// 「円で見る／リストで見る」の切り替え（指示書 mk_training_success_cycle.md 6）
// - 押すまでは画面幅で決める（560px 未満＝リスト）。最初の描画は CSS だけで分けるので、ちらつかない
// - 図そのもの（文言）はサーバーで描いたものを受け取る。ここには文言を持たない
// - 選んだ表示は保存しない（ページを離れたら画面幅の既定に戻る）

import { useState, type ReactNode } from "react";

type Mode = "auto" | "circle" | "list";

export function CycleViewSwitch({ circle, list }: { circle: ReactNode; list: ReactNode }) {
  const [mode, setMode] = useState<Mode>("auto");
  const circleCls = mode === "auto" ? "hidden min-[560px]:block" : mode === "circle" ? "block" : "hidden";
  const listCls = mode === "auto" ? "block min-[560px]:hidden" : mode === "list" ? "block" : "hidden";
  const btn = (m: Exclude<Mode, "auto">, label: string) => {
    // 押す前は画面幅で見えている方を選択中の見た目にする（CSS だけで）
    const active =
      mode === m
        ? "bg-teal-600 text-white font-medium"
        : mode === "auto"
          ? m === "circle"
            ? "text-gray-600 min-[560px]:bg-teal-600 min-[560px]:text-white min-[560px]:font-medium"
            : "bg-teal-600 text-white font-medium min-[560px]:bg-transparent min-[560px]:text-gray-600 min-[560px]:font-normal"
          : "text-gray-600 hover:bg-gray-50";
    return (
      <button
        type="button"
        onClick={() => setMode(m)}
        aria-pressed={mode === m}
        className={`min-h-[40px] w-[120px] rounded-full text-sm ${active}`}
        data-cycle-view={m}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-gray-200 bg-white p-1">
          {btn("circle", "円で見る")}
          {btn("list", "リストで見る")}
        </div>
      </div>
      <div className={circleCls} data-cycle-mode="circle">
        {circle}
      </div>
      <div className={listCls} data-cycle-mode="list">
        {list}
      </div>
    </div>
  );
}
