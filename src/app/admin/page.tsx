"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { diseases } from "@/data/diseases";
import { drugs } from "@/data/drugs";
import { quizQuestions } from "@/data/quiz";
import { contraindications } from "@/data/contraindications";

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
        {stats.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer hover:border-slate-400">
              <CardHeader>
                <CardTitle className="text-base">{s.label}管理</CardTitle>
                <CardDescription className="text-xs">
                  {s.label}データの追加・編集・削除（{s.count}{s.unit}）
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
