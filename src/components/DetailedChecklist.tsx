"use client";

import { useState, useEffect, useMemo } from "react";
import type { DetailedCheckItem } from "@/data/operations";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  items: DetailedCheckItem[];
  storageKey: string;
};

const priorityStyles: Record<DetailedCheckItem["priority"], string> = {
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-gray-100 text-gray-600 border-gray-200",
};

const priorityLabel: Record<DetailedCheckItem["priority"], string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export function DetailedChecklist({ items, storageKey }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setChecked(JSON.parse(saved));
    } catch {}
    setLoaded(true);
  }, [storageKey]);

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(storageKey, JSON.stringify(checked));
    }
  }, [checked, storageKey, loaded]);

  // カテゴリでグループ化
  const grouped = useMemo(() => {
    const map = new Map<string, DetailedCheckItem[]>();
    for (const item of items) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)!.push(item);
    }
    return Array.from(map.entries()).map(([category, list]) => ({ category, items: list }));
  }, [items]);

  const total = items.length;
  const done = items.filter((i) => checked[i.id]).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const toggle = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const resetAll = () => setChecked({});

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      {/* 進捗バー */}
      <div className="flex items-center gap-4">
        <Progress value={pct} className="flex-1 h-3" />
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          全{total}項目中{done}項目完了
        </span>
        <button
          type="button"
          onClick={resetAll}
          className="rounded-md border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors whitespace-nowrap"
        >
          すべてリセット
        </button>
      </div>

      {/* カテゴリ別グループ */}
      {grouped.map((group) => {
        const groupDone = group.items.filter((i) => checked[i.id]).length;
        return (
          <Card key={group.category}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{group.category}</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {groupDone} / {group.items.length}完了
                </span>
              </div>
            </CardHeader>
            <div className="px-6 pb-5 space-y-3">
              {group.items.map((item) => {
                const isChecked = !!checked[item.id];
                return (
                  <div key={item.id} className="flex gap-3 items-start border-b border-border/40 pb-3 last:border-0 last:pb-0">
                    <Checkbox
                      id={item.id}
                      checked={isChecked}
                      onCheckedChange={() => toggle(item.id)}
                      className="mt-1 shrink-0"
                    />
                    <label htmlFor={item.id} className="cursor-pointer flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${priorityStyles[item.priority]}`}
                        >
                          優先度: {priorityLabel[item.priority]}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-slate-50 text-slate-600 border-slate-200">
                          🕒 {item.timing}
                        </span>
                      </div>
                      <p className={`text-sm font-medium ${isChecked ? "line-through text-muted-foreground" : "text-foreground"}`}>
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {item.detail}
                      </p>
                    </label>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
