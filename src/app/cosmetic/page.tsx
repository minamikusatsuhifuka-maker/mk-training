"use client";

import { useState, useEffect } from "react";
import { cosmeticItems as initialData, cosmeticCategories, type CosmeticItem, type CosmeticCategory } from "@/data/cosmetic";
import { getContent, CONTENT_KEYS } from "@/lib/content-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

export default function CosmeticPage() {
  const [items, setItems] = useState<CosmeticItem[]>(initialData);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CosmeticCategory | null>(null);

  useEffect(() => {
    getContent<CosmeticItem>(CONTENT_KEYS.cosmetic, initialData).then(setItems).catch(() => {});
  }, []);

  const filtered = items.filter((item) => {
    const matchesCat = !selectedCategory || item.category === selectedCategory;
    if (!matchesCat) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.concern.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="当院の美容施術・機器"
        description="美容皮膚科で提供している施術・機器の一覧です"
        badge={`${items.length}メニュー`}
      />

      {/* Search */}
      <input
        type="text"
        placeholder="施術名・対象悩みで検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-muted-foreground"
      />

      {/* Category filter */}
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
        {cosmeticCategories.map((cat) => (
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

      {/* Cards */}
      <div className="space-y-4">
        {filtered.map((item) => (
          <Card key={item.id} className="overflow-hidden">
            <CardHeader>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge
                  variant="outline"
                  className={
                    item.type === "機器"
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : "bg-purple-50 text-purple-700 border-purple-200"
                  }
                >
                  {item.type}
                </Badge>
                <Badge variant="outline" className="bg-teal-light text-teal border-teal/20">
                  {item.category}
                </Badge>
              </div>
              <CardTitle className="text-base">{item.name}</CardTitle>
              <CardDescription className="text-sm mt-1">
                {item.description}
              </CardDescription>

              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant="outline" className="bg-teal-light text-teal border-teal/20 text-xs">
                  対象: {item.concern}
                </Badge>
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                  DT: {item.downtime}
                </Badge>
              </div>

              <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                <span className="mr-1">⚠</span>
                {item.caution}
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          該当する施術・機器が見つかりません
        </p>
      )}
    </div>
  );
}
