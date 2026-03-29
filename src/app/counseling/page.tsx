"use client";

import { useState } from "react";
import { counselingGuides } from "@/data/counseling";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";

const categoryConfig: Record<string, { label: string; color: string }> = {
  contraindication: { label: "禁忌確認", color: "bg-red-100 text-red-700 border-red-200" },
  history: { label: "問診", color: "bg-amber-100 text-amber-700 border-amber-200" },
  consent: { label: "同意確認", color: "bg-blue-100 text-blue-700 border-blue-200" },
  preparation: { label: "準備確認", color: "bg-teal-light text-teal border-teal/20" },
};

export default function CounselingPage() {
  const [selectedId, setSelectedId] = useState(counselingGuides[0].id);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const guide = counselingGuides.find((g) => g.id === selectedId)!;
  const allChecked = guide.clearChecks.filter((c) => c.required).every((c) => checked[c.id]);
  const checkedCount = guide.clearChecks.filter((c) => checked[c.id]).length;

  const toggle = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  const resetChecks = () => {
    const next = { ...checked };
    guide.clearChecks.forEach((c) => { next[c.id] = false; });
    setChecked(next);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="カウンセリングガイド"
        description="美容施術のトークスクリプトとクリアチェックリスト"
        badge={`${counselingGuides.length}施術`}
      />

      {/* Tabs */}
      <Tabs value={selectedId} onValueChange={(v) => { setSelectedId(v ?? selectedId); }}>
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 overflow-x-auto">
          {counselingGuides.map((g) => (
            <TabsTrigger key={g.id} value={g.id} className="text-xs">{g.treatment}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Clear Checklist */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">施術前必須確認チェックリスト</CardTitle>
            <div className="flex items-center gap-2">
              {allChecked && <Badge className="bg-green-100 text-green-700 border-green-200">✅ 全確認完了</Badge>}
              <span className="text-xs text-muted-foreground">{checkedCount}/{guide.clearChecks.length}</span>
              <button type="button" onClick={resetChecks} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border">リセット</button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {guide.clearChecks.map((item) => (
            <div key={item.id} className="flex gap-3 items-start py-1.5">
              <Checkbox
                id={item.id}
                checked={!!checked[item.id]}
                onCheckedChange={() => toggle(item.id)}
                className="mt-0.5 shrink-0"
              />
              <label htmlFor={item.id} className="cursor-pointer flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-[10px] ${categoryConfig[item.category].color}`}>
                    {categoryConfig[item.category].label}
                  </Badge>
                  {item.required && <Badge variant="outline" className="text-[10px] bg-red-50 text-red-600 border-red-200">必須</Badge>}
                </div>
                <p className={`text-sm mt-0.5 ${checked[item.id] ? "line-through text-muted-foreground" : ""}`}>{item.text}</p>
                {item.note && <p className="text-xs text-muted-foreground mt-0.5">{item.note}</p>}
              </label>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Talk Scripts */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold">トークスクリプト</h2>
        {guide.talkScripts.map((s, i) => (
          <Card key={i} className="p-4">
            <Badge variant="outline" className="bg-teal-light text-teal border-teal/20 mb-2">{s.phase}</Badge>
            <p className="text-sm leading-relaxed">{s.script}</p>
            {s.tips && <p className="text-xs text-muted-foreground mt-2 italic">💡 {s.tips}</p>}
          </Card>
        ))}
      </div>

      {/* FAQ */}
      {guide.commonQuestions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-base font-semibold">よくある質問</h2>
          {guide.commonQuestions.map((q, i) => {
            const faqId = `${guide.id}_faq_${i}`;
            const isOpen = openFaq === faqId;
            return (
              <Card key={i}>
                <button type="button" className="w-full text-left p-4 flex items-center justify-between" onClick={() => setOpenFaq(isOpen ? null : faqId)}>
                  <span className="text-sm font-medium">Q. {q.question}</span>
                  <span className="text-muted-foreground shrink-0 ml-2">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4">
                    <p className="text-sm text-muted-foreground">A. {q.answer}</p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* General tips */}
      <Card className="bg-slate-50 p-4">
        <h3 className="text-sm font-semibold mb-2">カウンセリングの基本姿勢</h3>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
          <li>ゴールを最初に確認（どんな状態になりたいか）</li>
          <li>複数プランを提示・選択を尊重</li>
          <li>過度な期待を与えない（効果・回数・ダウンタイムを正直に）</li>
          <li>クーリングオフ8日間を必ず説明</li>
        </ol>
      </Card>
    </div>
  );
}
