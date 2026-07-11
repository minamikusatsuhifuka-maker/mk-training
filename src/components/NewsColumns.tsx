"use client";

// お知らせカードの列数切替（指示書42）
// みんなのタスク（/tasks）の列数実装と同じ方式:
//   セグメント切替＋localStorage保持＋レスポンシブクランプ＋gridTemplateColumnsインラインstyle。
// ホーム（新着情報）と /news-history で共用する（localStorageキーも共用）。

import { useEffect, useState, type ReactNode } from "react";

export type NewsColumnCount = 1 | 2 | 3 | 4;

const NEWS_COLUMNS_LS_KEY = "news_view_columns";

export function useNewsColumns(): {
  columns: NewsColumnCount;
  effectiveCols: number;
  changeColumns: (c: NewsColumnCount) => void;
} {
  // 既定は2列
  const [columns, setColumns] = useState<NewsColumnCount>(2);
  const [winW, setWinW] = useState(0);

  // 列数設定の読み込み＋画面幅の追従（SSRハイドレーション安全：mount後のみ）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NEWS_COLUMNS_LS_KEY);
      if (saved === "1" || saved === "2" || saved === "3" || saved === "4") {
        setColumns(Number(saved) as NewsColumnCount);
      }
    } catch {
      /* ignore */
    }
    const onResize = () => setWinW(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const changeColumns = (c: NewsColumnCount) => {
    setColumns(c);
    try {
      localStorage.setItem(NEWS_COLUMNS_LS_KEY, String(c));
    } catch {
      /* ignore */
    }
  };

  // 選択列数は「広い画面での最大列数」。狭い画面では自動で減らす。
  const effectiveCols =
    winW === 0 || winW < 768
      ? 1
      : winW < 1024
        ? Math.min(columns, 2)
        : winW < 1440
          ? Math.min(columns, 3)
          : columns;

  return { columns, effectiveCols, changeColumns };
}

// 1〜4列のセグメント切替（控えめな見た目）
export function NewsColumnsSelector({
  columns,
  onChange,
}: {
  columns: NewsColumnCount;
  onChange: (c: NewsColumnCount) => void;
}) {
  return (
    <div className="flex gap-0.5 rounded-md border border-gray-200 bg-white p-0.5">
      {([1, 2, 3, 4] as const).map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`px-1.5 py-0.5 text-[11px] rounded transition-colors ${
            columns === c
              ? "bg-teal-600 text-white font-medium"
              : "text-gray-500 hover:bg-gray-50"
          }`}
          title={`${c}列表示`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

// 列数に応じたグリッドコンテナ（高さは揃えない）
export function NewsGrid({
  cols,
  children,
}: {
  cols: number;
  children: ReactNode;
}) {
  return (
    <div
      className="grid gap-3 items-start"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}
