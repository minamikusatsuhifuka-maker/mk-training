"use client";

// 251: 四象限の編集欄で使う、ガントチャートの分類の一覧（院長があとから足したものも含む）
// /api/gantt を1回だけ読み、30秒は使い回す（行を開くたびに読みに行かない）。読めなければ既定の4つ。

import { useEffect, useState } from "react";
import { DEFAULT_CATEGORIES, normalizeCategories, type GanttCategory } from "./gantt";

const TTL = 30_000;
let cache: { at: number; p: Promise<GanttCategory[]> } | null = null;

function loadCategories(): Promise<GanttCategory[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.p;
  const p = fetch("/api/gantt", { credentials: "same-origin", cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j: { categories?: unknown }) => normalizeCategories(j.categories))
    .catch(() => {
      cache = null;
      return DEFAULT_CATEGORIES.map((c) => ({ ...c }));
    });
  cache = { at: Date.now(), p };
  return p;
}

/** enabled の間だけ読む（「📊 ガントチャートに出す」にチェックがあるときだけ） */
export function useGanttCategories(enabled: boolean): GanttCategory[] | null {
  const [cats, setCats] = useState<GanttCategory[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void loadCategories().then((c) => {
      if (alive) setCats(c);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return cats;
}
