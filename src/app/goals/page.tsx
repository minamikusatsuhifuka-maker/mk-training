"use client";

// 🎯 クリニック目標（指示書77。task-matrix のガントチャートを移植）
// 目標を期間バーで見える化。編集は管理者のみ（GanttChart 内部で isAdmin 判定・
// 保存も lib 境界で管理者チェック）。スタッフは閲覧専用。
// データは content_store 単一キー（portal_gantt）。

import NavPageHeader from "@/components/NavPageHeader";
import GanttChart from "@/components/GanttChart";

export default function GoalsPage() {
  return (
    <div className="p-4 md:p-8 max-w-[1536px] mx-auto space-y-6">
      <NavPageHeader navKey="/goals"
        title="🎯 クリニック目標"
        description="クリニックの目標を期間バーで見える化。全員で進捗を共有します。"
      />
      <GanttChart />
    </div>
  );
}
