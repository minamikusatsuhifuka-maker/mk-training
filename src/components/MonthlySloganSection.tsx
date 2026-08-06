"use client";

// ホーム「🎯 今月の意識目標」セクション（指示書141）
// 当月（YYYY-MM）のスローガンが未設定の月はカード自体を非表示（return null）。
// 過去月・翌月分は表示しない（管理は admin/portal の経営方針タブ内）。

import { useEffect, useState } from "react";
import {
  loadMonthlySlogans,
  sloganForYm,
  currentYm,
  formatYmJa,
  type MonthlySlogan,
} from "@/lib/monthly-slogan";

export function MonthlySloganSection() {
  const [item, setItem] = useState<MonthlySlogan | null>(null);

  useEffect(() => {
    loadMonthlySlogans()
      .then((items) => setItem(sloganForYm(items, currentYm())))
      .catch(() => {});
  }, []);

  if (!item) return null;

  return (
    <section className="px-4 py-5 border-b border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
          🎯 今月の意識目標
        </h2>
        <span className="text-xs text-gray-600">{formatYmJa(item.ym)}</span>
      </div>
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-base font-semibold text-amber-900 leading-relaxed max-w-prose whitespace-pre-wrap">
          {item.slogan}
        </p>
        {item.note && (
          <p className="text-xs text-amber-700 mt-3 max-w-prose whitespace-pre-wrap">
            {item.note}
          </p>
        )}
      </div>
    </section>
  );
}
