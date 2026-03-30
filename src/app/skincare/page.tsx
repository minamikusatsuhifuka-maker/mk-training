"use client";

import { useState, useEffect } from "react";
import { skincareItems as initialData, type SkincareItem } from "@/data/skincare";
import { getContent, CONTENT_KEYS } from "@/lib/content-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

const filterCategories = [
  "すべて",
  "医療グレードスキンケア",
  "美白外用薬",
  "美容内服",
  "日常ケア",
] as const;

type FilterCategory = (typeof filterCategories)[number];

function pregnancyBadge(safety: SkincareItem["pregnancySafety"]) {
  switch (safety) {
    case "safe":
      return (
        <Badge
          variant="outline"
          className="bg-green-50 text-green-700 border-green-200 text-xs"
        >
          🟢 妊娠中OK
        </Badge>
      );
    case "caution":
      return (
        <Badge
          variant="outline"
          className="bg-yellow-50 text-yellow-700 border-yellow-200 text-xs"
        >
          🟡 要相談
        </Badge>
      );
    case "avoid":
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-700 border-red-200 text-xs"
        >
          🔴 禁忌
        </Badge>
      );
  }
}

export default function SkincarePage() {
  const [items, setItems] = useState<SkincareItem[]>(initialData);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterCategory>("すべて");

  useEffect(() => {
    getContent<SkincareItem>(CONTENT_KEYS.skincare, initialData).then(setItems).catch(() => {});
  }, []);

  const filtered = items.filter((item) => {
    if (filter === "すべて") return true;
    return item.type === filter;
  });

  const toggle = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="スキンケア・美容内服製品"
        description="当院で取り扱うスキンケア製品・美容内服の一覧です"
        badge={`${items.length}製品`}
      />

      {/* Filter buttons */}
      <div className="flex flex-wrap gap-1.5">
        {filterCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilter(cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filter === cat
                ? "bg-teal text-teal-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">{filtered.length}件表示中</p>

      {/* Accordion cards */}
      <div className="space-y-3">
        {filtered.map((item) => {
          const isOpen = openId === item.id;

          return (
            <Card key={item.id} className="overflow-hidden">
              {/* Collapsed header - always visible */}
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className="w-full text-left"
              >
                <CardHeader>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="bg-purple-50 text-purple-700 border-purple-200 text-xs"
                    >
                      {item.type}
                    </Badge>
                    {pregnancyBadge(item.pregnancySafety)}
                  </div>
                  <CardTitle className="text-base mt-1">{item.name}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {item.tagline}
                  </p>
                  <div className="flex items-center justify-end mt-1">
                    <span
                      className={`text-muted-foreground text-xs transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`}
                    >
                      ▼
                    </span>
                  </div>
                </CardHeader>
              </button>

              {/* Expanded content */}
              {isOpen && (
                <CardContent className="border-t border-border pt-4 space-y-4">
                  {/* Brand */}
                  {item.brand && (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">
                        ブランド
                      </span>
                      <p className="text-sm mt-0.5">{item.brand}</p>
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      説明
                    </span>
                    <p className="text-sm mt-0.5 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Key Ingredients */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      主要成分
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1.5">
                      {item.keyIngredients.map((ing) => (
                        <div
                          key={ing.name}
                          className="rounded-lg bg-muted/60 p-2.5"
                        >
                          <p className="text-sm font-semibold">{ing.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {ing.effect}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* How to use */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      使用方法
                    </span>
                    <p className="text-sm mt-0.5 leading-relaxed">
                      {item.howToUse}
                    </p>
                  </div>

                  {/* Targets */}
                  <div>
                    <span className="text-xs font-medium text-muted-foreground">
                      対象悩み
                    </span>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {item.targets.map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="bg-teal-light text-teal border-teal/20 text-xs"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Caution */}
                  <div className="rounded-md bg-amber-50 p-3">
                    <span className="text-xs font-medium text-amber-800">
                      注意事項
                    </span>
                    <p className="text-sm text-amber-700 mt-0.5">
                      {item.caution}
                    </p>
                  </div>

                  {/* Pregnancy safety */}
                  <div className="rounded-md bg-muted/40 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-muted-foreground">
                        妊娠中の安全性
                      </span>
                      {pregnancyBadge(item.pregnancySafety)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.pregnancyNote}
                    </p>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          該当する製品が見つかりません
        </p>
      )}
    </div>
  );
}
