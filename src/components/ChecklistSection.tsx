"use client";

import { useState, useEffect, useCallback } from "react";
import type { CheckSection } from "@/data/operations";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/components/AuthProvider";

type Props = {
  sections: CheckSection[];
  storageKey: string;
};

export function ChecklistSection({ sections, storageKey }: Props) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const { user } = useAuthContext();

  useEffect(() => {
    async function load() {
      if (user) {
        try {
          const { data } = await supabase
            .from("checklist_progress")
            .select("checked_items")
            .eq("user_id", user.id)
            .eq("checklist_key", storageKey)
            .single();
          if (data?.checked_items) {
            setChecked(data.checked_items as Record<string, boolean>);
            setLoaded(true);
            return;
          }
        } catch {
          // Supabase取得失敗時はlocalStorageにフォールバック
        }
      }
      try {
        const saved = localStorage.getItem(`checklist-${storageKey}`);
        if (saved) setChecked(JSON.parse(saved));
      } catch {}
      setLoaded(true);
    }
    load();
  }, [storageKey, user]);

  const saveToSupabase = useCallback(
    async (newChecked: Record<string, boolean>) => {
      if (!user) return;
      try {
        await supabase.from("checklist_progress").upsert(
          {
            user_id: user.id,
            checklist_key: storageKey,
            checked_items: newChecked,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,checklist_key" }
        );
      } catch {
        // 保存失敗時は静かに無視
      }
    },
    [user, storageKey]
  );

  useEffect(() => {
    if (loaded) {
      localStorage.setItem(`checklist-${storageKey}`, JSON.stringify(checked));
      saveToSupabase(checked);
    }
  }, [checked, storageKey, loaded, saveToSupabase]);

  const allItems = sections.flatMap((s) => s.items);
  const total = allItems.length;
  const done = allItems.filter((item) => checked[item.id]).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const toggle = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const resetAll = () => {
    setChecked({});
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      {/* Progress bar */}
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

      {/* Sections */}
      {sections.map((section) => {
        const sectionDone = section.items.filter((i) => checked[i.id]).length;
        return (
          <Card key={section.title}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">{section.title}</CardTitle>
                <Badge
                  variant="outline"
                  className="bg-teal-light text-teal border-teal/20 text-xs"
                >
                  {sectionDone} / {section.items.length}完了
                </Badge>
              </div>
            </CardHeader>
            <div className="px-6 pb-5 space-y-3">
              {section.items.map((item) => {
                const isChecked = !!checked[item.id];
                return (
                  <div key={item.id} className="flex gap-3 items-start">
                    <Checkbox
                      id={item.id}
                      checked={isChecked}
                      onCheckedChange={() => toggle(item.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <label htmlFor={item.id} className="cursor-pointer flex-1 min-w-0">
                      <p
                        className={`text-sm ${
                          isChecked
                            ? "line-through text-muted-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {item.text}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {item.note}
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
