"use client";

import { useState } from "react";
import { medicalFees, billingTips, type FeeCategory } from "@/data/medical_fees";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";

const categories: (FeeCategory | "全て")[] = ["全て", "初診・再診", "医学管理", "検査", "皮膚科処置", "処置", "手術", "注射", "投薬"];

export default function MedicalFeesPage() {
  const [tab, setTab] = useState<string>("全て");
  const [search, setSearch] = useState("");

  const filtered = medicalFees.filter((f) => {
    if (tab !== "全て" && f.category !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return f.name.toLowerCase().includes(q) || f.code.toLowerCase().includes(q) || f.description.toLowerCase().includes(q);
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="保険診療算定項目・点数表"
        description="皮膚科外来でよく使用する診療報酬算定項目の点数一覧です"
        badge={`${medicalFees.length}項目`}
      />

      <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        点数は2024年度改定版を基準としています。定期的に改定があるため最新の点数表で確認してください。
      </div>

      {/* Quick reference cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="text-center p-3">
          <p className="text-2xl font-bold text-teal">1点=10円</p>
          <p className="text-xs text-muted-foreground">診療報酬の基本</p>
        </Card>
        <Card className="text-center p-3">
          <p className="text-2xl font-bold text-teal">3割負担</p>
          <p className="text-xs text-muted-foreground">1点あたり3円</p>
        </Card>
        <Card className="text-center p-3">
          <p className="text-lg font-bold">初診 291点</p>
          <p className="text-xs text-muted-foreground">患者負担 873円</p>
        </Card>
        <Card className="text-center p-3">
          <p className="text-lg font-bold">再診 75点</p>
          <p className="text-xs text-muted-foreground">患者負担 225円</p>
        </Card>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="名称・コードで検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-muted-foreground"
      />

      {/* Category tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v ?? tab)}>
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 overflow-x-auto">
          {categories.map((c) => (
            <TabsTrigger key={c} value={c} className="text-xs">{c}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <p className="text-sm text-muted-foreground">{filtered.length}件表示中</p>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.map((f) => (
          <Card key={f.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] bg-slate-100">{f.code}</Badge>
                  <span className="font-medium text-sm">{f.name}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{f.description}</p>
                {f.notes && <p className="text-xs text-amber-700 mt-1">{f.notes}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-bold text-teal">{f.points}点</p>
                <p className="text-[10px] text-muted-foreground">{f.points * 3}円(3割)</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[80px]">コード</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[220px]">名称</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[80px]">点数</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b">説明</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[200px]">注意点</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => (
                <tr key={f.id} className="hover:bg-muted/50">
                  <td className="px-2 py-1.5 border-b align-top text-xs font-mono">{f.code}</td>
                  <td className="px-2 py-1.5 border-b align-top font-medium text-sm">{f.name}</td>
                  <td className="px-2 py-1.5 border-b align-top text-right">
                    <span className="text-lg font-bold text-teal">{f.points}</span>
                    <span className="text-[10px] text-muted-foreground block">{f.points * 3}円(3割)</span>
                  </td>
                  <td className="px-2 py-1.5 border-b align-top text-xs text-muted-foreground">{f.description}</td>
                  <td className="px-2 py-1.5 border-b align-top text-xs text-amber-700">{f.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Billing Tips */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold">算定のポイント（よく間違える注意事項）</h2>
        {billingTips.map((tip, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-start gap-2">
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px] shrink-0 mt-0.5">注意</Badge>
              <div>
                <p className="text-sm font-medium">{tip.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tip.detail}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Mini quiz */}
      <Card className="p-4">
        <CardHeader className="p-0 pb-3">
          <CardTitle className="text-base">確認テスト</CardTitle>
        </CardHeader>
        <CardContent className="p-0 space-y-3">
          {[
            {q:"外来管理加算は処置と同日に算定できる？",a:"✕ 処置・検査・注射等を行った場合は算定不可"},
            {q:"液体窒素の最短算定間隔は？",a:"2週間以上"},
            {q:"院外処方の処方箋料は何点？",a:"68点"},
          ].map((item, i) => (
            <QuizItem key={i} question={item.q} answer={item.a} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function QuizItem({ question, answer }: { question: string; answer: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="border rounded-md p-3">
      <p className="text-sm font-medium">Q. {question}</p>
      {show ? (
        <p className="text-sm text-teal mt-1">A. {answer}</p>
      ) : (
        <button type="button" onClick={() => setShow(true)} className="text-xs text-teal hover:underline mt-1 min-h-[32px]">回答を表示</button>
      )}
    </div>
  );
}
