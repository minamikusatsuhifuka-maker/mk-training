"use client";

// 268: クリニック目標の画面・ホームの要約から、つながった計画と自動の進み具合を読む（/api/gantt/goals）
// 読めないとき（未ログイン・失敗）は「つながった計画なし」＝今までどおり手で入れた値を出す。

import { useCallback, useEffect, useState } from "react";
import type { GoalProgress, LinkedPlanRow } from "./plan-goals";

export type GoalLinks = {
  progress: Record<string, GoalProgress>;
  /** 年間計画を見られる人だけ true（false の人には計画の一覧を出さない） */
  canSeePlans: boolean;
  plans: LinkedPlanRow[];
};

const EMPTY: GoalLinks = { progress: {}, canSeePlans: false, plans: [] };

export async function fetchGoalLinks(): Promise<GoalLinks> {
  try {
    const res = await fetch("/api/gantt/goals", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return EMPTY;
    const j = (await res.json()) as Partial<GoalLinks>;
    return {
      progress: j.progress && typeof j.progress === "object" ? j.progress : {},
      canSeePlans: !!j.canSeePlans,
      plans: Array.isArray(j.plans) ? j.plans : [],
    };
  } catch {
    return EMPTY;
  }
}

export function useGoalLinks(): { links: GoalLinks; loaded: boolean; reload: () => void } {
  const [links, setLinks] = useState<GoalLinks>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => {
    void fetchGoalLinks().then((l) => {
      setLinks(l);
      setLoaded(true);
    });
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { links, loaded, reload };
}
