"use client";

// 文の長さに合わせて高さが伸びる入力欄（指示書224 →225で共通部品にした）
//
// 【なぜ必要か】1行の入力欄・固定の高さだと、長い文が途中で切れて、
//   保存の前に全文を確かめられない（224で「本人の言葉」が切れていた）。
//
// 【枠線の分を足す理由】`scrollHeight` は枠線を含まない。Tailwindの既定は border-box なので、
//   高さに scrollHeight をそのまま入れると**最後の行が枠線の分だけ隠れる**（224で実測）。
//
// 【空のとき・短いとき】`minRows` 行ぶんの高さを残す（`rows` に渡すので、
//   高さを auto に戻した時点の箱の高さが下限になる）。短い文なら短いまま。
//
// 【高さを状態に入れない理由】描画のあとに測る必要があるため。状態に入れると描き直しが連鎖し、
//   lint の `react-hooks/set-state-in-effect` にも触れる（223で同じ判断をした）。

import { useLayoutEffect, useRef } from "react";

export function fitHeight(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const cs = getComputedStyle(el);
  const extra =
    cs.boxSizing === "border-box"
      ? (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
      : -((parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0));
  el.style.height = `${el.scrollHeight + extra}px`;
}

export function AutoGrowTextarea({
  value,
  onChange,
  className,
  ariaLabel,
  /** 空のときに残す行数（225 §3「空の欄は2行分の高さを残す」） */
  minRows = 2,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  ariaLabel?: string;
  minRows?: number;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    fitHeight(ref.current);
  }, [value, minRows]);
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        fitHeight(e.currentTarget);
        onChange(e.target.value);
      }}
      className={`${className} resize-none overflow-hidden`}
      aria-label={ariaLabel}
      data-autogrow
    />
  );
}
