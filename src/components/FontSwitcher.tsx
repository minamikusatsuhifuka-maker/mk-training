"use client";

// 🔤 フォント切り替え（指示書139・271・272）
// 視認性の高いおすすめ6種（272で3つ足した）と、文字の大きさ4段階（小・標準・大・特大）から選ぶ。
// 272: ボタンは今のフォントのまま出す（各フォントで出すと6つ全部を読み込んでしまう）。
//      カーソルを合わせた・長押ししたときに、フォントの名前をそのフォント自身で吹き出しに出す（そのときだけ読み込む）。
// 271: 選んだものはアカウントに残す（パソコンでもスマートフォンでも同じ）。選んでいなければ院長が決めた全員の既定。
//      「既定に戻す」で自分の選択を消し、院長の既定に従う。
// 今のフォントの持ち方・サーバーとの合わせ方は lib/font-pref-client.ts（置き場所4か所が同じものを見る）。
// 最初の描画の前の適用は layout.tsx の初期化スクリプトが担当（このコンポーネントは表示と変更のみ）。

import { useEffect, useRef, useState } from "react";
import { FONT_CHOICES, SIZE_CHOICES, prefLabel, type FontId } from "@/lib/font-pref";
import { chooseFontPref, resetFontPref, syncFontPrefOnce, useFontState } from "@/lib/font-pref-client";

export function FontSwitcher({
  dark = false,
  showLabel = true,
  inline = false,
}: {
  dark?: boolean;
  showLabel?: boolean;
  /** 管理画面の上の帯（パソコン）：今の設定のボタンにまとめ、押すと種類と大きさが開く（272） */
  inline?: boolean;
}) {
  const { effective, mine, synced } = useFontState();
  // 名前の吹き出し：パソコンはカーソルを合わせている間、スマートフォンは長押しで出して、指を離して少しして消す
  const [tip, setTip] = useState<FontId | null>(null);
  const press = useRef<{ timer?: number; hide?: number; long: boolean }>({ long: false });
  const tipChoice = FONT_CHOICES.find((c) => c.id === tip);
  // 管理画面の上の帯：開いたパネルは、外を押す・Esc で閉じる
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // ページを開いたら1回だけ、アカウントに残した選択に合わせる（置き場所が複数あっても1回）
  useEffect(() => {
    syncFontPrefOnce();
  }, []);

  const group = `flex rounded-full border p-0.5 ${dark ? "border-slate-600 bg-slate-700" : "border-gray-200 bg-white"}`;
  const btn = (active: boolean) =>
    `flex-1 whitespace-nowrap text-xs px-2 py-1.5 rounded-full transition-colors ${
      active
        ? "bg-teal text-white font-bold"
        : dark
          ? "text-slate-200 hover:bg-slate-600"
          : "text-gray-600 hover:bg-teal-light"
    }`;
  const sub = `px-1 text-[11px] ${dark ? "text-slate-300" : "text-gray-500"}`;

  const fonts = (
    <div className="relative">
      <div
        className={`grid grid-cols-2 gap-0.5 rounded-2xl border p-0.5 ${
          dark ? "border-slate-600 bg-slate-700" : "border-gray-200 bg-white"
        }`}
        role="group"
        aria-label="表示フォントの切り替え"
      >
        {FONT_CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              // 長押しで名前を見ただけのときは選ばない
              if (press.current.long) {
                press.current.long = false;
                return;
              }
              void chooseFontPref({ font: c.id, size: effective.size });
            }}
            onPointerEnter={(e) => {
              if (e.pointerType === "mouse") setTip(c.id);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === "mouse") setTip((t) => (t === c.id ? null : t));
            }}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") return;
              press.current.long = false;
              window.clearTimeout(press.current.timer);
              window.clearTimeout(press.current.hide);
              press.current.timer = window.setTimeout(() => {
                press.current.long = true;
                setTip(c.id);
              }, 450);
            }}
            onPointerUp={() => {
              window.clearTimeout(press.current.timer);
              if (press.current.long) press.current.hide = window.setTimeout(() => setTip(null), 1500);
            }}
            onPointerCancel={() => {
              window.clearTimeout(press.current.timer);
              press.current.hide = window.setTimeout(() => setTip(null), 1500);
            }}
            onContextMenu={(e) => e.preventDefault()}
            aria-pressed={effective.font === c.id}
            aria-describedby={tip === c.id ? "font-switcher-tip" : undefined}
            data-font-choice={c.id}
            className={`${btn(effective.font === c.id)} select-none [-webkit-touch-callout:none]`}
          >
            あ<span className="ml-0.5">{c.label}</span>
          </button>
        ))}
      </div>
      {tipChoice && (
        <span
          id="font-switcher-tip"
          role="tooltip"
          className={`pointer-events-none absolute inset-x-0 bottom-full z-50 mx-auto mb-1 w-max max-w-full rounded-md bg-slate-900 px-2 py-1 text-center text-xs text-white shadow ${tipChoice.preview}`}
          data-font-tip
        >
          {tipChoice.desc}
        </span>
      )}
    </div>
  );

  const sizes = (
    <div className={group} role="group" aria-label="文字の大きさ" data-font-sizes>
      {SIZE_CHOICES.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => void chooseFontPref({ font: effective.font, size: c.id })}
          title={`文字の大きさ：${c.label}`}
          aria-pressed={effective.size === c.id}
          className={btn(effective.size === c.id)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );

  const reset = mine ? (
    <button
      type="button"
      onClick={() => void resetFontPref()}
      className={`text-[11px] underline underline-offset-2 whitespace-nowrap ${
        dark ? "text-slate-300 hover:text-white" : "text-gray-500 hover:text-teal"
      }`}
      data-font-reset
    >
      既定に戻す
    </button>
  ) : synced ? (
    <span className={`text-[11px] whitespace-nowrap ${dark ? "text-slate-400" : "text-gray-400"}`}>既定のまま</span>
  ) : null;

  const panel = (
    <div className="space-y-1">
      {(showLabel || inline) && (
        <p className={`px-1 text-[11px] font-semibold ${dark ? "text-slate-300" : "text-gray-500"}`}>🔤 フォント</p>
      )}
      {fonts}
      <div className="flex items-center justify-between">
        <span className={sub}>文字の大きさ</span>
        {reset}
      </div>
      {sizes}
    </div>
  );

  if (!inline) return panel;

  // 管理画面の上の帯（パソコン）：6つを並べると帯が2段になるので、今の設定を出すボタンにまとめて、押すと開く（272）
  return (
    <div ref={popRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="whitespace-nowrap rounded-full border border-slate-600 bg-slate-700 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-600"
        data-font-open
      >
        🔤 {prefLabel(effective)} ▾
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="フォント"
          className="absolute right-0 top-full z-50 mt-2 w-[15rem] rounded-xl border border-slate-600 bg-slate-800 p-3 shadow-xl"
        >
          {panel}
        </div>
      )}
    </div>
  );
}
