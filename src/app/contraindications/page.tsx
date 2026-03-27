"use client";

import { useState } from "react";
import { contraindications, type Severity } from "@/data/contraindications";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const severityConfig: Record<
  Severity,
  { label: string; border: string; badge: string }
> = {
  critical: {
    label: "絶対禁忌",
    border: "border-l-red-500",
    badge: "bg-red-100 text-red-700 border-red-200",
  },
  caution: {
    label: "要注意",
    border: "border-l-amber-500",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
  },
  note: {
    label: "参考",
    border: "border-l-teal",
    badge: "bg-teal-light text-teal border-teal/20",
  },
};

export default function ContraindicationsPage() {
  const [search, setSearch] = useState("");

  const filtered = contraindications.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.drug.toLowerCase().includes(q) ||
      c.disease.toLowerCase().includes(q) ||
      c.detail.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">禁忌事項</h1>
        <p className="text-muted-foreground text-sm mt-1">
          薬剤・施術の禁忌・注意事項を確認できます（絶対禁忌 / 要注意 / 参考 の3段階）
        </p>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="薬品名・疾患・詳細で検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-muted-foreground"
      />

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        {filtered.length}件表示中
      </p>

      {/* Cards */}
      <div className="space-y-3">
        {filtered.map((c) => {
          const cfg = severityConfig[c.severity];
          return (
            <Card
              key={c.id}
              className={`border-l-4 ${cfg.border} p-5`}
            >
              <div className="flex items-start gap-3 flex-wrap mb-2">
                <h3 className="font-bold text-sm flex-1 min-w-0">
                  {c.drug}
                </h3>
                <Badge variant="outline" className={cfg.badge}>
                  {cfg.label}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                対象: {c.disease}
              </p>
              <p className="text-sm text-foreground/80">{c.detail}</p>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          該当する禁忌事項が見つかりません
        </p>
      )}
    </div>
  );
}
