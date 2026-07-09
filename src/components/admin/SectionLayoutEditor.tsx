"use client";

// セクション並び順エディタ（管理画面「レイアウト」タブ共通）
// ドラッグ&ドロップ＋上下ボタンで並び替え、チェックで表示/非表示を切り替える。
// ホーム画面（portal_home_layout）と みんなのタスク（tasks_page_layout）の両方で使う。

import { useState } from "react";
import type { SectionConfig } from "@/lib/section-layout";

type Props<K extends string> = {
  layout: SectionConfig<K>[];
  labels: Record<K, string>;
  onChange: (next: SectionConfig<K>[]) => void;
  onSave: () => void;
  saving: boolean;
  onReload: () => void;
  onReset: () => void;
  description: string;
  previewTitle: string;
};

export function SectionLayoutEditor<K extends string>({
  layout,
  labels,
  onChange,
  onSave,
  saving,
  onReload,
  onReset,
  description,
  previewTitle,
}: Props<K>) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= layout.length) return;
    const next = [...layout];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const toggleHidden = (key: K) => {
    onChange(
      layout.map((s) => (s.key === key ? { ...s, hidden: !s.hidden } : s))
    );
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      return;
    }
    const next = [...layout];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(index, 0, moved);
    onChange(next);
    setDraggedIndex(null);
  };

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-gray-600">{description}</p>

      <div className="space-y-2">
        {layout.map((section, index) => (
          <div
            key={section.key}
            draggable
            onDragStart={() => setDraggedIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(index)}
            className={`flex items-center gap-3 p-3 border rounded-xl bg-white cursor-move transition-colors ${
              draggedIndex === index
                ? "border-teal-400 bg-teal-50"
                : "border-gray-200"
            } ${section.hidden ? "opacity-50" : ""}`}
          >
            <span className="text-gray-600 select-none" title="ドラッグして並び替え">
              ⠿
            </span>
            <span className="flex-1 text-sm font-medium text-gray-800">
              {labels[section.key] ?? section.key}
            </span>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={!section.hidden}
                onChange={() => toggleHidden(section.key)}
              />
              表示
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30"
                title="上へ"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === layout.length - 1}
                className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30"
                title="下へ"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* プレビュー（簡易：現在の表示順のみのリスト） */}
      <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
        <p className="text-xs font-medium text-gray-800 mb-1.5">{previewTitle}</p>
        <ol className="text-xs text-gray-700 list-decimal list-inside space-y-0.5">
          {layout
            .filter((s) => !s.hidden)
            .map((s) => (
              <li key={s.key}>{labels[s.key] ?? s.key}</li>
            ))}
        </ol>
        {layout.every((s) => s.hidden) && (
          <p className="text-xs text-gray-600">すべて非表示に設定されています</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : "💾 保存"}
        </button>
        <button
          type="button"
          onClick={onReload}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
        >
          🔄 保存済みの並びを読み込む
        </button>
        <button
          type="button"
          onClick={onReset}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50"
        >
          ↩️ 既定に戻す
        </button>
      </div>
    </div>
  );
}
