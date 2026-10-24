"use client";

// 自己点検用の □（指示書 mk_training_achievement_formulas.md 5）
// - チェックは保存しない（DB・localStorage とも使わない）。React の state だけなので、再読み込みで必ず外れる
// - 文言はサーバーで描いた children を受け取る（ここに文言を持たない）

import { useState, type ReactNode } from "react";

export function SelfCheckItem({ children, accent }: { children: ReactNode; accent: "coral" | "teal" }) {
  const [checked, setChecked] = useState(false);
  return (
    <label className="flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-white/70" data-habit-item>
      <input
        type="checkbox"
        autoComplete="off"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className={`h-[18px] w-[18px] shrink-0 ${accent === "teal" ? "accent-teal-600" : "accent-[#E0866C]"}`}
        data-habit-check
      />
      <span className="text-[15px] text-gray-800">{children}</span>
    </label>
  );
}
