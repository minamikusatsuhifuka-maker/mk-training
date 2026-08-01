"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import NavPageHeader from "@/components/NavPageHeader";

type QuizResult = {
  id: string;
  date: string;
  category: string;
  score: number;
  total: number;
  percentage: number;
};

const RESULTS_KEY = "mk_quiz_results";

const categoryLabels: Record<string, string> = {
  disease: "疾患問題",
  drug: "薬剤問題",
  cosmetic: "美容・施術",
  ops: "業務・接遇",
  all: "全カテゴリ",
};

const categoryEmojis: Record<string, string> = {
  disease: "🦠",
  drug: "💊",
  cosmetic: "✨",
  ops: "📋",
  all: "📝",
};

function resultBadge(pct: number) {
  if (pct >= 80) return { label: "優秀", className: "bg-green-100 text-green-700 border-green-200" };
  if (pct >= 60) return { label: "合格", className: "bg-blue-100 text-blue-700 border-blue-200" };
  return { label: "要復習", className: "bg-amber-100 text-amber-700 border-amber-200" };
}

export default function ProgressPage() {
  const [results, setResults] = useState<QuizResult[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RESULTS_KEY);
      if (saved) setResults(JSON.parse(saved));
    } catch {}
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  const totalAttempts = results.length;
  const avgPct = totalAttempts > 0 ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / totalAttempts) : 0;
  const bestPct = totalAttempts > 0 ? Math.max(...results.map((r) => r.percentage)) : 0;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentCount = results.filter((r) => new Date(r.date) >= sevenDaysAgo).length;

  const categoryAvg = (cat: string) => {
    const catResults = cat === "all" ? results : results.filter((r) => r.category === cat);
    if (catResults.length === 0) return 0;
    return Math.round(catResults.reduce((s, r) => s + r.percentage, 0) / catResults.length);
  };

  const handleReset = () => {
    localStorage.removeItem(RESULTS_KEY);
    setResults([]);
    setConfirmReset(false);
  };

  const recent10 = results.slice(0, 10);

  if (totalAttempts === 0) {
    return (
      <div className="p-4 md:p-8 max-w-[1536px] mx-auto space-y-6">
        <NavPageHeader navKey="/progress" title="学習進捗" description="クイズの結果を記録・分析します" />
        <Card className="p-8 text-center space-y-4">
          <p className="text-muted-foreground">まだクイズに挑戦していません。クイズに挑戦して学習の記録を始めましょう！</p>
          <Link href="/quiz">
            <Button>クイズに挑戦する</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-[1536px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <NavPageHeader navKey="/progress" title="学習進捗" description="クイズの結果を記録・分析します" />
        <Button variant="outline" size="sm" onClick={() => setConfirmReset(true)}>記録をリセット</Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="text-center p-4">
          <p className="text-3xl font-bold text-teal">{totalAttempts}</p>
          <p className="text-xs text-muted-foreground">総挑戦回数</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-3xl font-bold text-teal">{avgPct}%</p>
          <p className="text-xs text-muted-foreground">全体平均正答率</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-3xl font-bold text-teal">{bestPct}%</p>
          <p className="text-xs text-muted-foreground">最高正答率</p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-3xl font-bold text-teal">{recentCount}</p>
          <p className="text-xs text-muted-foreground">最近7日間の挑戦</p>
        </Card>
      </div>

      {/* Category averages */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">カテゴリ別平均正答率</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(["disease", "drug", "cosmetic", "ops", "all"] as const).map((cat) => {
            const avg = categoryAvg(cat);
            return (
              <div key={cat} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{categoryEmojis[cat]} {categoryLabels[cat]}</span>
                  <span className="font-medium">{avg}%</span>
                </div>
                <Progress value={avg} className="h-2" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Recent history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">最近の挑戦履歴</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {recent10.map((r) => {
              const badge = resultBadge(r.percentage);
              return (
                <div key={r.id} className="border rounded-md p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{new Date(r.date).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                    <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{categoryEmojis[r.category] ?? ""} {categoryLabels[r.category] ?? r.category}</span>
                    <span className="text-sm font-medium">{r.score}/{r.total}問 ({r.percentage}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>日時</TableHead>
                  <TableHead>カテゴリ</TableHead>
                  <TableHead className="text-right">スコア</TableHead>
                  <TableHead className="text-right">正答率</TableHead>
                  <TableHead className="w-[80px]">結果</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent10.map((r) => {
                  const badge = resultBadge(r.percentage);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">
                        {new Date(r.date).toLocaleString("ja-JP", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {categoryEmojis[r.category] ?? ""} {categoryLabels[r.category] ?? r.category}
                      </TableCell>
                      <TableCell className="text-sm text-right">{r.score}/{r.total}問</TableCell>
                      <TableCell className="text-sm text-right font-medium">{r.percentage}%</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badge.className}>{badge.label}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Reset confirm */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>学習記録をリセットしますか？</AlertDialogTitle>
            <AlertDialogDescription>すべてのクイズ結果が削除されます。この操作は元に戻せません。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>リセットする</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
