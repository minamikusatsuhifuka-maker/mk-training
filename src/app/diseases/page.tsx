"use client";

import { useState } from "react";
import { diseases, type Disease } from "@/data/diseases";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const badgeColorMap: Record<Disease["badgeColor"], string> = {
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  teal: "bg-teal-light text-teal border-teal/20",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  red: "bg-red-100 text-red-700 border-red-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function DiseasesPage() {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = diseases.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.nameEn.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.cause.toLowerCase().includes(q) ||
      d.badge.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">疾患一覧</h1>
          <p className="text-muted-foreground text-sm mt-1">
            当院で扱う主要な皮膚疾患の知識を確認できます
          </p>
        </div>
        <Badge className="bg-teal text-teal-foreground text-sm px-3 py-1">
          疾患数: {diseases.length}
        </Badge>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="疾患名・英語名・症状・原因で検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-muted-foreground"
      />

      {/* Results count */}
      {search && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} 件の疾患が見つかりました
        </p>
      )}

      {/* Disease cards */}
      <div className="space-y-3">
        {filtered.map((d) => {
          const isOpen = openId === d.id;
          return (
            <Card key={d.id} className="overflow-hidden">
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setOpenId(isOpen ? null : d.id)}
              >
                <CardHeader className="flex-row items-start gap-3 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge
                        variant="outline"
                        className={badgeColorMap[d.badgeColor]}
                      >
                        {d.badge}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {d.nameEn}
                      </span>
                    </div>
                    <CardTitle className="text-base">{d.name}</CardTitle>
                    <CardDescription className="text-xs mt-1 line-clamp-2">
                      {d.description}
                    </CardDescription>
                  </div>
                  <span className="text-muted-foreground text-lg shrink-0 mt-1">
                    {isOpen ? "▲" : "▼"}
                  </span>
                </CardHeader>
              </button>

              {isOpen && (
                <div className="px-6 pb-5 space-y-4">
                  <Separator />

                  <section>
                    <h3 className="text-sm font-semibold mb-1">疾患概要</h3>
                    <p className="text-sm text-muted-foreground">
                      {d.description}
                    </p>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold mb-1">原因・誘因</h3>
                    <p className="text-sm text-muted-foreground">{d.cause}</p>
                  </section>

                  <section>
                    <h3 className="text-sm font-semibold mb-1">主な治療法</h3>
                    <p className="text-sm text-muted-foreground">
                      {d.treatment}
                    </p>
                  </section>

                  <section className="rounded-md bg-teal-light p-4">
                    <h3 className="text-sm font-semibold text-teal mb-1">
                      患者さんへの説明例
                    </h3>
                    <p className="text-sm text-teal/80">
                      {d.patientExplanation}
                    </p>
                  </section>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          該当する疾患が見つかりません
        </p>
      )}
    </div>
  );
}
