"use client";

// 🔤 フォント切り替え（指示書139・271）
// 視認性の高いおすすめ3種と、文字の大きさ4段階（小・標準・大・特大）から選ぶ。
// 271: 選んだものはアカウントに残す（パソコンでもスマートフォンでも同じ）。選んでいなければ院長が決めた全員の既定。
//      「既定に戻す」で自分の選択を消し、院長の既定に従う。
// 今のフォントの持ち方・サーバーとの合わせ方は lib/font-pref-client.ts（置き場所4か所が同じものを見る）。
// 最初の描画の前の適用は layout.tsx の初期化スクリプトが担当（このコンポーネントは表示と変更のみ）。

import { useEffect } from "react";
import { FONT_CHOICES, SIZE_CHOICES } from "@/lib/font-pref";
import { chooseFontPref, resetFontPref, syncFontPrefOnce, useFontState } from "@/lib/font-pref-client";

export function FontSwitcher({
  dark = false,
  showLabel = true,
  inline = false,
}: {
  dark?: boolean;
  showLabel?: boolean;
  /** 管理画面の上の帯（パソコン）：種類と大きさを横に並べる */
  inline?: boolean;
}) {
  const { effective, mine, synced } = useFontState();

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
    <div className={group} role="group" aria-label="表示フォントの切り替え">
      {FONT_CHOICES.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => void chooseFontPref({ font: c.id, size: effective.size })}
          title={c.desc}
          aria-pressed={effective.font === c.id}
          className={`${btn(effective.font === c.id)} ${c.preview}`}
        >
          あ<span className="ml-0.5">{c.label}</span>
        </button>
      ))}
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

  if (inline) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-[200px]">{fonts}</div>
        <div className="w-[170px]">{sizes}</div>
        {reset}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {showLabel && (
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
}
