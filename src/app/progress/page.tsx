"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/components/AuthProvider";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/PageHeader";

type QuizResult = {
  id: string;
  category: string;
  score: number;
  total: number;
  percentage: number;
  answered_at: string;
};

const categoryLabels: Record<string, string> = {
  all: "すべて",
  disease: "疾患",
  drug: "薬剤",
  cosmetic: "美容",
  ops: "業務",
};

export default function ProgressPage() {
  const { user, loading: authLoading } = useAuthContext();
  const [results, setResults] = useState<QuizResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }

    async function fetchResults() {
      const { data } = await supabase
        .from("quiz_results")
        .select("*")
        .eq("user_id", user!.id)
        .order("answered_at", { ascending: false })
        .limit(20);
      setResults(data ?? []);
      setLoading(false);
    }
    fetchResults();
  }, [user, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <div className="h-8 bg-muted animate-pulse rounded-md mb-4" />
        <div className="h-32 bg-muted animate-pulse rounded-md" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <PageHeader title="学習進捗" description="ログインすると進捗が記録されます" />
        <Card className="mt-6 p-8 text-center">
          <p className="text-muted-foreground">ログインすると進捗が記録・表示されます</p>
        </Card>
      </div>
    );
  }

  const totalAttempts = results.length;
  const overallAvg = totalAttempts > 0
    ? Math.round(results.reduce((sum, r) => sum + r.percentage, 0) / totalAttempts)
    : 0;

  const categoryStats = ["all", "disease", "drug", "cosmetic", "ops"].map((cat) => {
    const catResults = results.filter((r) => r.category === cat);
    const avg = catResults.length > 0
      ? Math.round(catResults.reduce((sum, r) => sum + r.percentage, 0) / catResults.length)
      : 0;
    return { category: cat, label: categoryLabels[cat], count: catResults.length, avg };
  }).filter((s) => s.count > 0);

  const recent = results.slice(0, 10);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="学習進捗"
        description="クイズの成績と学習状況を確認できます"
        badge={`挑戦回数: ${totalAttempts}回`}
      />

      {/* Overall stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="text-center">
          <CardHeader className="pb-2 pt-4">
            <p className="text-3xl font-bold text-teal">{totalAttempts}</p>
            <CardDescription>挑戦回数</CardDescription>
          </CardHeader>
        </Card>
        <Card className="text-center">
          <CardHeader className="pb-2 pt-4">
            <p className="text-3xl font-bold text-teal">{overallAvg}%</p>
            <CardDescription>平均正答率</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Category breakdown */}
      {categoryStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">カテゴリ別正答率</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {categoryStats.map((s) => (
              <div key={s.category} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{s.label}（{s.count}回）</span>
                  <span className="font-medium text-teal">{s.avg}%</span>
                </div>
                <Progress value={s.avg} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent results */}
      {recent.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近の結果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recent.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0 last:pb-0">
                  <div>
                    <span className="text-muted-foreground text-xs">
                      {new Date(r.answered_at).toLocaleDateString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="ml-2">{categoryLabels[r.category] ?? r.category}</span>
                  </div>
                  <span className="font-medium">
                    {r.score}/{r.total}（{r.percentage}%）
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {totalAttempts === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">まだクイズに挑戦していません。クイズに挑戦して進捗を記録しましょう！</p>
        </Card>
      )}
    </div>
  );
}
