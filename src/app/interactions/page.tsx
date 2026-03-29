"use client";

import { useState } from "react";
import { drugInteractions, interactionDrugList, type InteractionSeverity } from "@/data/interactions";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/PageHeader";

const severityConfig: Record<InteractionSeverity, { label: string; icon: string; color: string; border: string }> = {
  contraindicated: { label: "絶対禁忌", icon: "🚫", color: "bg-red-100 text-red-700 border-red-200", border: "border-red-300" },
  major: { label: "重大", icon: "⚠️", color: "bg-orange-100 text-orange-700 border-orange-200", border: "border-orange-300" },
  moderate: { label: "中程度", icon: "⚡", color: "bg-amber-100 text-amber-700 border-amber-200", border: "border-amber-300" },
  minor: { label: "軽微", icon: "ℹ️", color: "bg-green-100 text-green-700 border-green-200", border: "border-green-300" },
};

const quickChecks = [
  { label: "イトリゾール + スタチン", d1: "イトリゾール（イトラコナゾール）", d2: "スタチン系薬（シンバスタチン等）" },
  { label: "MTX + NSAIDs", d1: "メソトレキサート（MTX）", d2: "ロキソプロフェン（ロキソニン）" },
  { label: "ロアキュテイン + テトラサイクリン", d1: "ロアキュテイン（イソトレチノイン）", d2: "ドキシサイクリン" },
  { label: "ネオーラル + グレープフルーツ", d1: "ネオーラル（シクロスポリン）", d2: "" },
];

function findInteractions(d1: string, d2: string) {
  if (!d1 && !d2) return [];
  const q1 = d1.toLowerCase();
  const q2 = d2.toLowerCase();
  return drugInteractions.filter((i) => {
    const id1 = i.drug1.toLowerCase();
    const id2 = i.drug2.toLowerCase();
    if (d1 && d2) {
      return (
        (id1.includes(q1) && id2.includes(q2)) ||
        (id1.includes(q2) && id2.includes(q1)) ||
        (id2.includes(q1) && id1.includes(q2)) ||
        (id2.includes(q2) && id1.includes(q1))
      );
    }
    return id1.includes(q1 || q2) || id2.includes(q1 || q2) || id1.includes(q2 || q1) || id2.includes(q2 || q1);
  });
}

const grouped = {
  contraindicated: drugInteractions.filter((i) => i.severity === "contraindicated"),
  major: drugInteractions.filter((i) => i.severity === "major"),
  moderate: drugInteractions.filter((i) => i.severity === "moderate"),
};

export default function InteractionsPage() {
  const [drug1, setDrug1] = useState("");
  const [drug2, setDrug2] = useState("");
  const [results, setResults] = useState<typeof drugInteractions | null>(null);
  const [openSection, setOpenSection] = useState<string | null>(null);

  const handleCheck = () => {
    setResults(findInteractions(drug1, drug2));
  };

  const handleQuick = (d1: string, d2: string) => {
    setDrug1(d1);
    setDrug2(d2);
    setResults(findInteractions(d1, d2));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="薬剤相互作用チェック"
        description="2つの薬剤を選択して相互作用を確認できます"
        badge={`${drugInteractions.length}件登録`}
      />

      <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        このツールは研修・学習用です。実際の処方判断は必ず医師・薬剤師が行ってください。
      </div>

      {/* Drug selection */}
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium">薬剤1を選択</label>
            <Select value={drug1} onValueChange={(v) => setDrug1(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="薬剤1を選択..." /></SelectTrigger>
              <SelectContent>
                {interactionDrugList.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">薬剤2を選択</label>
            <Select value={drug2} onValueChange={(v) => setDrug2(v ?? "")}>
              <SelectTrigger><SelectValue placeholder="薬剤2を選択..." /></SelectTrigger>
              <SelectContent>
                {interactionDrugList.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleCheck} disabled={!drug1 && !drug2} className="w-full">チェック</Button>
      </Card>

      {/* Quick checks */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">よく確認される組み合わせ:</p>
        <div className="flex flex-wrap gap-2">
          {quickChecks.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => handleQuick(q.d1, q.d2)}
              className="rounded-full bg-muted px-3 py-1.5 text-xs hover:bg-accent transition-colors min-h-[36px]"
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {results !== null && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">チェック結果</h2>
          {results.length > 0 ? (
            results.map((r) => {
              const cfg = severityConfig[r.severity];
              return (
                <Card key={r.id} className={`p-4 border-2 ${cfg.border}`}>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={cfg.color}>
                        {cfg.icon} {cfg.label}
                      </Badge>
                      <span className="text-sm font-medium">{r.drug1}</span>
                      <span className="text-xs text-muted-foreground">×</span>
                      <span className="text-sm font-medium">{r.drug2}</span>
                    </div>
                    <div className="space-y-1.5 text-sm">
                      <div><span className="font-medium text-xs text-muted-foreground">メカニズム:</span> <span className="text-xs">{r.mechanism}</span></div>
                      <div><span className="font-medium text-xs text-muted-foreground">起こりうる副作用:</span> <span className="text-xs">{r.effect}</span></div>
                      <div className="bg-muted/50 rounded-md p-2"><span className="font-medium text-xs">対処法:</span> <span className="text-xs">{r.management}</span></div>
                    </div>
                  </div>
                </Card>
              );
            })
          ) : (
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">
                登録された相互作用は見つかりませんでした。ただし全ての相互作用を網羅していません。不明な場合は薬剤師に確認してください。
              </p>
            </Card>
          )}
        </div>
      )}

      {/* All interactions accordion */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">全相互作用一覧</h2>
        {(["contraindicated", "major", "moderate"] as const).map((sev) => {
          const items = grouped[sev];
          const cfg = severityConfig[sev];
          const isOpen = openSection === sev;
          return (
            <Card key={sev}>
              <button
                type="button"
                className="w-full text-left p-3 flex items-center justify-between"
                onClick={() => setOpenSection(isOpen ? null : sev)}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cfg.color}>{cfg.icon} {cfg.label}</Badge>
                  <span className="text-sm">（{items.length}件）</span>
                </div>
                <span className="text-muted-foreground">{isOpen ? "▲" : "▼"}</span>
              </button>
              {isOpen && (
                <CardContent className="pt-0 space-y-2">
                  {items.map((r) => (
                    <div key={r.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <div className="text-sm font-medium">{r.drug1} × {r.drug2}</div>
                      <p className="text-xs text-muted-foreground mt-0.5">{r.effect}</p>
                      <p className="text-xs mt-0.5"><span className="font-medium">対処:</span> {r.management}</p>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
