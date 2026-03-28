"use client";

import { useState } from "react";
import { drugs, drugCategories, type Drug, type DrugCategory } from "@/data/drugs";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const groupedDrugs = drugCategories.reduce((acc, category) => {
  const items = drugs.filter((d) => d.category === category);
  if (items.length > 0) acc[category] = items;
  return acc;
}, {} as Partial<Record<DrugCategory, Drug[]>>);

const categoryCount = (cat: DrugCategory) => drugs.filter((d) => d.category === cat).length;

export default function DrugsPage() {
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<DrugCategory | null>(null);
  const [view, setView] = useState<"table" | "accordion">("table");

  const filtered = drugs.filter((d) => {
    const matchesCategory = !selectedCategory || d.category === selectedCategory;
    if (!matchesCategory) return false;
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.genericName?.toLowerCase().includes(q) ?? false) ||
      d.indication.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="薬剤規格リスト"
        description="当院で使用する主要薬剤の規格・適応を確認できます"
        badge={`収録数: ${drugs.length}件`}
      />

      {/* Search */}
      <input
        type="text"
        placeholder="薬品名・成分名・適応で検索..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-muted-foreground"
      />

      {/* View toggle + Category filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 mr-2">
          <button
            type="button"
            onClick={() => setView("table")}
            className={`rounded-md px-2 py-1 text-xs ${view === "table" ? "bg-teal text-teal-foreground" : "bg-muted text-muted-foreground"}`}
          >
            一覧
          </button>
          <button
            type="button"
            onClick={() => setView("accordion")}
            className={`rounded-md px-2 py-1 text-xs ${view === "accordion" ? "bg-teal text-teal-foreground" : "bg-muted text-muted-foreground"}`}
          >
            カテゴリ別
          </button>
        </div>
        {view === "table" && (
          <>
            <button
              type="button"
              onClick={() => setSelectedCategory(null)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategory === null
                  ? "bg-teal text-teal-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              すべて ({drugs.length})
            </button>
            {drugCategories.filter((cat) => categoryCount(cat) > 0).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? "bg-teal text-teal-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {cat} ({categoryCount(cat)})
              </button>
            ))}
          </>
        )}
      </div>

      {/* Count */}
      {view === "table" && (
        <p className="text-sm text-muted-foreground">{filtered.length}件表示中</p>
      )}

      {/* Table view */}
      {view === "table" && (
        filtered.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[280px]">薬品名</TableHead>
                  <TableHead className="w-[140px]">規格</TableHead>
                  <TableHead className="w-[130px]">カテゴリ</TableHead>
                  <TableHead>主な適応</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium text-sm">{d.name}</div>
                        {d.genericName && (
                          <div className="text-xs text-muted-foreground mt-0.5">{d.genericName}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-teal-light text-teal border-teal/20 text-xs">
                        {d.spec}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                        {d.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{d.indication}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-12">該当する薬剤が見つかりませんでした</p>
        )
      )}

      {/* Accordion view */}
      {view === "accordion" && (
        <div className="space-y-4">
          {Object.entries(groupedDrugs).map(([category, items]) => {
            if (!items) return null;
            const filteredItems = searchText
              ? items.filter((d) => {
                  const q = searchText.toLowerCase();
                  return d.name.toLowerCase().includes(q) || (d.genericName?.toLowerCase().includes(q) ?? false) || d.indication.toLowerCase().includes(q);
                })
              : items;
            if (filteredItems.length === 0) return null;
            return (
              <Card key={category}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 mr-2">{category}</Badge>
                      {filteredItems.length}件
                    </CardTitle>
                  </div>
                </CardHeader>
                <div className="px-6 pb-4 space-y-2">
                  {filteredItems.map((d) => (
                    <div key={d.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <div className="font-medium text-sm">{d.name}</div>
                      {d.genericName && (
                        <div className="text-xs text-muted-foreground">一般名: {d.genericName}</div>
                      )}
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="bg-teal-light text-teal border-teal/20 text-[10px]">{d.spec}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{d.indication}</p>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
