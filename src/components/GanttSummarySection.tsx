"use client";

// ホームの「クリニック目標」要約セクション（指示書77）
// - 今日が期間内の目標（進行中）を上から最大5件。タイトル＋期間＋進捗バー。
// - 「すべて見る →」で /goals（フルガント）へ。
// - 0件のときはセクションを丸ごと非表示（既存の流儀）。
// - 閲覧のみ（ホームでは管理者にも編集UIを出さない。編集は /goals で）。

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadGanttGoals,
  isGoalActive,
  formatGoalRange,
  getGanttGradient,
  type GanttGoal,
} from "@/lib/gantt-goals";

export function GanttSummarySection() {
  const [active, setActive] = useState<GanttGoal[] | null>(null); // null=読込中

  useEffect(() => {
    loadGanttGoals()
      .then((goals) => {
        const now = new Date();
        setActive(goals.filter((g) => isGoalActive(g, now)).slice(0, 5));
      })
      .catch(() => setActive([]));
  }, []);

  // 読込中・0件は非表示
  if (!active || active.length === 0) return null;

  return (
    <section className="px-4 py-5 border-b border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
          🎯 クリニック目標（進行中）
        </h2>
        <Link
          href="/goals"
          className="text-xs text-teal-700 hover:text-teal-800 underline underline-offset-2"
        >
          すべて見る →
        </Link>
      </div>

      <div className="space-y-2">
        {active.map((goal) => {
          const g = getGanttGradient(goal.color);
          return (
            <Link
              key={goal.id}
              href="/goals"
              className="block p-3 bg-white border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {goal.title}
                </p>
                <span className="text-xs text-gray-500 shrink-0">
                  {goal.progress}%
                </span>
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {goal.category} · {formatGoalRange(goal)}
              </p>
              {/* 進捗バー */}
              <div className="mt-2 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${g.from} ${g.to}`}
                  style={{ width: `${goal.progress}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
