"use client";

import { useState } from "react";
import { drugs, drugCategories, type DrugCategory } from "@/data/drugs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function DrugsPage() {
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<DrugCategory | null>(null);

  const filtered = drugs.filter((d) => {
    const matchesCategory = !selectedCategory || d.category === selectedCategory;
    if (!matchesCategory) return false;
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
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

      {/* Category filter buttons */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selectedCategory === null
              ? "bg-teal text-teal-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          すべて
        </button>
        {drugCategories.map((cat) => (
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
            {cat}
          </button>
        ))}
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        {filtered.length}件表示中
      </p>

      {/* Table */}
      {filtered.length > 0 ? (
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
                  <TableCell className="font-medium text-sm">{d.name}</TableCell>
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
        <p className="text-center text-muted-foreground py-12">
          該当する薬剤が見つかりませんでした
        </p>
      )}
    </div>
  );
}
