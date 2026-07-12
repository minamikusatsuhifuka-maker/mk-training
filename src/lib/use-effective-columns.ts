"use client";

// 列数のレスポンシブクランプ共通フック（指示書42/45）
// 引数 columns は「広い画面での最大列数」。狭い画面では自動で減らす:
//   <768px → 1列 ／ <1024px → 最大2列 ／ <1440px → 最大3列 ／ それ以上 → columns
// SSRハイドレーション安全: mount前（winW=0）は1列で描画する。

import { useEffect, useState } from "react";

export function useEffectiveColumns(columns: number): number {
  const [winW, setWinW] = useState(0);

  useEffect(() => {
    const onResize = () => setWinW(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return winW === 0 || winW < 768
    ? 1
    : winW < 1024
      ? Math.min(columns, 2)
      : winW < 1440
        ? Math.min(columns, 3)
        : columns;
}
