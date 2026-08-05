"use client";

// 🔤 フォント切り替え（指示書139）
// 視認性の高いおすすめ3種から選択し、端末ごとに localStorage へ保存する。
// 適用は <html data-font="..."> → globals.css の --app-font 切替（未選択・読み込み失敗時は Noto Sans JP）。
// FOUC防止の初期適用は layout.tsx のインラインスクリプトが担当（このコンポーネントは表示と変更のみ）。

import { useEffect, useState } from "react";

export const FONT_STORAGE_KEY = "app_font";

const FONT_CHOICES = [
  { id: "noto", label: "標準", desc: "Noto Sans JP", preview: "font-preview-noto" },
  { id: "biz", label: "UD", desc: "BIZ UDPゴシック", preview: "font-preview-biz" },
  { id: "rounded", label: "まる", desc: "M PLUS Rounded 1c", preview: "font-preview-rounded" },
] as const;

type FontChoice = (typeof FONT_CHOICES)[number]["id"];

function applyFont(id: FontChoice) {
  if (id === "noto") {
    document.documentElement.removeAttribute("data-font");
  } else {
    document.documentElement.setAttribute("data-font", id);
  }
}

export function FontSwitcher({
  dark = false,
  showLabel = true,
}: {
  dark?: boolean;
  showLabel?: boolean;
}) {
  const [font, setFont] = useState<FontChoice>("noto");

  // 保存済みの選択を表示に反映（適用自体は初期化スクリプト済み）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FONT_STORAGE_KEY);
      if (saved === "biz" || saved === "rounded") setFont(saved);
    } catch {
      /* localStorage不可の環境では標準のまま */
    }
  }, []);

  const select = (id: FontChoice) => {
    setFont(id);
    applyFont(id);
    try {
      localStorage.setItem(FONT_STORAGE_KEY, id);
    } catch {
      /* 保存できなくても表示中は適用される */
    }
  };

  return (
    <div>
      {showLabel && (
        <p
          className={`px-1 mb-1 text-[11px] font-semibold ${
            dark ? "text-slate-300" : "text-gray-500"
          }`}
        >
          🔤 フォント
        </p>
      )}
      <div
        className={`flex rounded-full border p-0.5 ${
          dark ? "border-slate-600 bg-slate-700" : "border-gray-200 bg-white"
        }`}
        role="group"
        aria-label="表示フォントの切り替え"
      >
        {FONT_CHOICES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => select(c.id)}
            title={c.desc}
            aria-pressed={font === c.id}
            className={`flex-1 text-xs px-2 py-1.5 rounded-full transition-colors ${c.preview} ${
              font === c.id
                ? "bg-teal text-white font-bold"
                : dark
                  ? "text-slate-200 hover:bg-slate-600"
                  : "text-gray-600 hover:bg-teal-light"
            }`}
          >
            あ<span className="ml-0.5">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
