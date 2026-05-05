"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { diseases } from "@/data/diseases";
import { drugs } from "@/data/drugs";
import { quizQuestions } from "@/data/quiz";
import { contraindications } from "@/data/contraindications";
import { EXPERT_ROLES } from "@/data/expertRoles";

const stats = [
  { label: "疾患", count: diseases.length, unit: "件", href: "/admin/diseases" },
  { label: "薬剤", count: drugs.length, unit: "件", href: "/admin/drugs" },
  { label: "クイズ", count: quizQuestions.length, unit: "問", href: "/admin/quiz" },
  { label: "禁忌", count: contraindications.length, unit: "件", href: "/admin/contraindications" },
];

export default function AdminDashboard() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">管理ダッシュボード</h1>
        <p className="text-sm text-slate-500 mt-1">コンテンツの管理・編集が行えます</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="text-center">
            <CardHeader className="pb-2 pt-4 px-4">
              <p className="text-3xl font-bold text-slate-700">
                {s.count}
                <span className="text-base font-normal text-slate-400 ml-1">{s.unit}</span>
              </p>
              <CardDescription>{s.label}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* ポータル管理（最上部に配置） */}
        <Link href="/admin/portal">
          <Card className="hover:shadow-md transition-shadow cursor-pointer hover:border-pink-400 border-l-4 border-l-pink-500 sm:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">🏠 ポータル管理</CardTitle>
              <CardDescription className="text-xs">
                LUMINAポータルトップ（新着情報・気づきシェア・ありがとうカード・経営方針・今日の一言）の管理
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* 組織知識ベース管理 */}
        <Link href="/admin/knowledge-system">
          <Card className="hover:shadow-md transition-shadow cursor-pointer hover:border-purple-400 border-l-4 border-l-purple-500 sm:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">🏛️ 組織知識ベース管理</CardTitle>
              <CardDescription className="text-xs">
                マニュアル・スキルマップ・組織ナレッジをAIと共に構築・管理（生成・改善・公開・承認）
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {stats.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer hover:border-slate-400">
              <CardHeader>
                <CardTitle className="text-base">{s.label}管理</CardTitle>
                <CardDescription className="text-xs">
                  {s.label}データの追加・編集・削除({s.count}{s.unit})
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}

        {/* エキスパート要件管理 */}
        <Link href="/admin/expert">
          <Card className="hover:shadow-md transition-shadow cursor-pointer hover:border-teal-400 border-l-4 border-l-teal-500">
            <CardHeader>
              <CardTitle className="text-base">⭐ エキスパート要件管理</CardTitle>
              <CardDescription className="text-xs">
                各ロールのエキスパート要件をAIの力を借りて改善・追加できます({EXPERT_ROLES.length}ロール)
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </div>
    </div>
  );
}
