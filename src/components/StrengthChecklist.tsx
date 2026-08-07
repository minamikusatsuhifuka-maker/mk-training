"use client";

// 才・徳・美チェックリスト（指示書151）
// 才／徳／美の3タブ・各50項目。チェックした項目がそのメンバーの強みとして保存される。
// 保存は項目のid（例 "sai-01"）で行い、文言は表示のたびに引く（文言を直しても
// 過去のチェックが外れないようにするため）。自由記述欄はこれとは別枠でそのまま残る。

import { useMemo, useState } from "react";
import {
  STRENGTH_CATEGORIES,
  STRENGTH_ITEM_BY_ID,
  countByCategory,
  type StrengthCategoryKey,
} from "@/lib/strength-checklist";

export function StrengthChecklist({
  checked,
  onChange,
  disabled = false,
}: {
  checked: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [tab, setTab] = useState<StrengthCategoryKey>("sai");
  const [q, setQ] = useState("");

  const counts = useMemo(() => countByCategory(checked), [checked]);
  const checkedSet = useMemo(() => new Set(checked), [checked]);

  const current = STRENGTH_CATEGORIES.find((c) => c.key === tab)!;
  const query = q.trim();
  const visible = query
    ? current.items.filter((it) => it.label.includes(query))
    : current.items;

  const toggle = (id: string) => {
    if (disabled) return;
    onChange(
      checkedSet.has(id) ? checked.filter((x) => x !== id) : [...checked, id]
    );
  };

  return (
    <div className="space-y-3">
      {/* サマリ＋チェック済み一覧（対話の準備で一目で見返せるように） */}
      <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl">
        <div className="flex items-center gap-3 flex-wrap text-sm text-gray-800">
          {STRENGTH_CATEGORIES.map((c) => (
            <span key={c.key}>
              <strong>{c.short}</strong> {counts[c.key]}個
            </span>
          ))}
          <span className="text-xs text-gray-600">
            （合計 {checked.length}個 / 150）
          </span>
        </div>
        {checked.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {checked.map((id) => {
              const it = STRENGTH_ITEM_BY_ID.get(id);
              if (!it) return null;
              return (
                <button
                  type="button"
                  key={id}
                  onClick={() => toggle(id)}
                  disabled={disabled}
                  title="クリックで外す"
                  className="text-xs px-2 py-1 bg-white border border-teal-300 text-teal-800 rounded-full hover:bg-teal-100 disabled:opacity-50"
                >
                  {it.label} ×
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-gray-600 mt-1">
            まだチェックがありません。下のタブから当てはまる項目を選んでください。
          </p>
        )}
      </div>

      {/* タブ */}
      <div className="flex items-center gap-2">
        {STRENGTH_CATEGORIES.map((c) => (
          <button
            type="button"
            key={c.key}
            onClick={() => setTab(c.key)}
            className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border min-h-[44px] ${
              tab === c.key
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {c.short}
            <span className="ml-1.5 text-xs font-normal">
              {counts[c.key]}/{c.items.length}
            </span>
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-600">{current.title}</p>

      {/* キーワード絞り込み（150項目は多いので） */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="キーワードで絞り込む（例: 丁寧）"
          className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="text-xs px-3 py-2 border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50"
          >
            クリア
          </button>
        )}
      </div>

      {/* 項目一覧（タップ領域を大きく・チェック済みは色付き） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[26rem] overflow-y-auto pr-1">
        {visible.map((it) => {
          const on = checkedSet.has(it.id);
          return (
            <label
              key={it.id}
              className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer min-h-[48px] transition-colors ${
                on
                  ? "bg-teal-50 border-teal-300"
                  : "bg-white border-gray-200 hover:bg-gray-50"
              } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(it.id)}
                disabled={disabled}
                className="mt-0.5 shrink-0"
              />
              <span
                className={`text-sm leading-snug ${
                  on ? "text-teal-900 font-medium" : "text-gray-800"
                }`}
              >
                {it.label}
              </span>
            </label>
          );
        })}
        {visible.length === 0 && (
          <p className="text-xs text-gray-600 p-2">
            「{query}」に当てはまる項目はありません。
          </p>
        )}
      </div>
    </div>
  );
}
