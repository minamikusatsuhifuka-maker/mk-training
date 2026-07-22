// クリニック目標のガントチャート（指示書77。task-matrix の personal/calendar から移植）
// content_store 単一キー `portal_gantt` に { goals, updatedAt } を保存する（専用テーブルなし）。
// データモデルは task-matrix の GanttGoal を尊重（category・milestones の概念を保持。
// task-matrix に無い概念＝order/memo 等は新設しない）。
// 保存は管理者のみ（指示書77・76と同じ流儀）。UIの AdminOnly と同じ isAdminUser 判定を
// lib 境界でも行い、非管理者なら保存せず false を返す。
// ※ anonキー直書き設計のためサーバー側での完全な強制は構造上不可（指示書70）。
//    lib を通る経路での防止までがこの関数のスコープ。

import { loadPortalObject, savePortalObject } from "./portal-store";
import { getSupabaseBrowserClient } from "./supabase-browser";
import { isAdminUser } from "./admin-role";

export const PORTAL_GANTT_KEY = "portal_gantt";

// startMonth/endMonth は 0=1月 … 11=12月（task-matrix と同一）
export type Milestone = { year: number; month: number; label: string };

export type GanttGoal = {
  id: string;
  title: string;
  category: string;
  startYear: number;
  startMonth: number;
  endYear: number;
  endMonth: number;
  progress: number; // 0〜100
  color: string; // GANTT_COLOR_OPTIONS の value
  milestones: Milestone[];
};

export type GanttData = { goals: GanttGoal[]; updatedAt: string };

// ─── 定数（task-matrix より移植） ───

export const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

// カテゴリの「概念」は task-matrix から保持。既定値はクリニック目標向けに自然な語へ。
export const GANTT_CATEGORIES = [
  "診療",
  "業務改善",
  "教育・研修",
  "設備・環境",
  "採用",
  "広報・集患",
  "経営",
];

export const GANTT_COLOR_OPTIONS = [
  { value: "gantt-pink", label: "ピンク" },
  { value: "gantt-purple", label: "パープル" },
  { value: "gantt-blue", label: "ブルー" },
  { value: "gantt-green", label: "グリーン" },
  { value: "gantt-orange", label: "オレンジ" },
  { value: "gantt-red", label: "レッド" },
  { value: "gantt-teal", label: "ティール" },
  { value: "gantt-indigo", label: "インディゴ" },
];

export const GANTT_GRADIENT: Record<
  string,
  { from: string; to: string; ring: string; dot: string }
> = {
  "gantt-pink":   { from: "from-pink-400",    to: "to-rose-500",   ring: "ring-pink-300",    dot: "bg-stone-600" },
  "gantt-purple": { from: "from-purple-400",  to: "to-violet-600", ring: "ring-purple-300",  dot: "bg-gray-500" },
  "gantt-blue":   { from: "from-blue-400",    to: "to-cyan-500",   ring: "ring-blue-300",    dot: "bg-blue-500" },
  "gantt-green":  { from: "from-emerald-400", to: "to-green-600",  ring: "ring-emerald-300", dot: "bg-emerald-500" },
  "gantt-orange": { from: "from-orange-400",  to: "to-amber-500",  ring: "ring-orange-300",  dot: "bg-orange-500" },
  "gantt-red":    { from: "from-red-400",     to: "to-rose-600",   ring: "ring-red-300",     dot: "bg-red-500" },
  "gantt-teal":   { from: "from-teal-400",    to: "to-cyan-600",   ring: "ring-teal-300",    dot: "bg-teal-500" },
  "gantt-indigo": { from: "from-indigo-400",  to: "to-violet-500", ring: "ring-indigo-300",  dot: "bg-indigo-500" },
};

export function getGanttGradient(color: string) {
  return GANTT_GRADIENT[color] ?? GANTT_GRADIENT["gantt-blue"];
}

// 表示する年度タブ（今年から5年）。module 読込時に new Date() しないよう関数化。
export function ganttYears(now: Date = new Date()): number[] {
  const y = now.getFullYear();
  return Array.from({ length: 5 }, (_, i) => y + i);
}

// 選択年内での位置（0〜1）。今日の縦線・マイルストーンに使う。
export function monthPosInYear(
  year: number,
  month: number,
  dayOfMonth: number = 1
): number {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return (month + (dayOfMonth - 1) / daysInMonth) / 12;
}

export function genGanttId(): string {
  return `gantt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 「今日が期間内」の判定（ホーム要約・進行中の目標に使う）
export function isGoalActive(goal: GanttGoal, now: Date = new Date()): boolean {
  const today = now.getFullYear() * 12 + now.getMonth();
  const start = goal.startYear * 12 + goal.startMonth;
  const end = goal.endYear * 12 + goal.endMonth;
  return start <= today && today <= end;
}

// 期間ラベル "2026/1〜2026/9"
export function formatGoalRange(goal: GanttGoal): string {
  return `${goal.startYear}/${goal.startMonth + 1}〜${goal.endYear}/${goal.endMonth + 1}`;
}

// ─── 読込・保存 ───

function normalizeGoals(raw: unknown): GanttGoal[] {
  const data = raw as { goals?: unknown } | null;
  const list = Array.isArray(data?.goals) ? data!.goals : [];
  const out: GanttGoal[] = [];
  for (const g of list as Record<string, unknown>[]) {
    if (!g || typeof g !== "object") continue;
    if (typeof g.id !== "string" || typeof g.title !== "string") continue;
    const ms = Array.isArray(g.milestones)
      ? (g.milestones as Record<string, unknown>[])
          .filter(
            (m) =>
              m &&
              typeof m.year === "number" &&
              typeof m.month === "number" &&
              typeof m.label === "string"
          )
          .map((m) => ({
            year: m.year as number,
            month: m.month as number,
            label: m.label as string,
          }))
      : [];
    out.push({
      id: g.id,
      title: g.title,
      category: typeof g.category === "string" ? g.category : GANTT_CATEGORIES[0],
      startYear: Number(g.startYear) || new Date().getFullYear(),
      startMonth: Number(g.startMonth) || 0,
      endYear: Number(g.endYear) || new Date().getFullYear(),
      endMonth: Number(g.endMonth) || 0,
      progress:
        typeof g.progress === "number"
          ? Math.max(0, Math.min(100, g.progress))
          : 0,
      color: typeof g.color === "string" ? g.color : "gantt-blue",
      milestones: ms,
    });
  }
  return out;
}

export async function loadGanttGoals(): Promise<GanttGoal[]> {
  const raw = await loadPortalObject<unknown>(PORTAL_GANTT_KEY, null);
  return normalizeGoals(raw);
}

// 管理者のみ保存（lib 境界チェック）。非管理者・未ログインは false。
export async function saveGanttGoals(goals: GanttGoal[]): Promise<boolean> {
  try {
    const { data } = await getSupabaseBrowserClient().auth.getUser();
    if (!isAdminUser(data.user)) return false;
  } catch {
    return false;
  }
  const payload: GanttData = { goals, updatedAt: new Date().toISOString() };
  return savePortalObject(PORTAL_GANTT_KEY, payload);
}
