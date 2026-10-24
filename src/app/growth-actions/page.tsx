"use client";

// 🌱 成長の行動例（成功の原則×行動例・考え方の例）— ログイン中のスタッフ全員（院長の承認済み）
// - 本文は /api/success-principles（ログイン中のみ・問い／※の行は入っていない）
// - 「👣 今週の一歩」は本人だけ（weekly_steps の RLS）。SQL 実行前は出さない
// - 上部に「🌱 アチーブメントの教え」（成功のサイクルの図）への入口
// - 見出しは「🧭 サイドバー構成」の表示名に合わせる（NavPageHeader）

import Link from "next/link";
import { Suspense } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import { GrowthActionsBoard } from "@/components/growth-actions/GrowthActionsBoard";

export default function GrowthActionsPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader navKey="/growth-actions" title="🌱 成長の行動例" description="成功の原則と、日々の行動例・考え方の例" />
      {/* アチーブメントの教え（成功のサイクルの図など）への入口 */}
      <Link
        href="/achievement#cycle"
        className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-medium text-teal-900 hover:bg-teal-100"
        data-achievement-link
      >
        <span>🔄 成功のサイクル・失敗のサイクル（🌱 アチーブメントの教え）</span>
        <span aria-hidden="true">→</span>
      </Link>
      <Suspense>
        <GrowthActionsBoard />
      </Suspense>
    </div>
  );
}
