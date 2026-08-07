// 格言のテーマ定義（クライアントでも使う軽量メタ・本文は含まない）
// 本文200件は lib/quotes-data.ts（サーバー専用）にあり、/api/quotes 経由でのみ配信する。

import type { QuoteTheme } from "./quotes-data";

export type { Quote, QuoteTheme } from "./quotes-data";

export const THEME_LABELS: Record<
  QuoteTheme,
  { label: string; icon: string; chip: string }
> = {
  goal: { label: "目標達成", icon: "🎯", chip: "bg-blue-50 border-blue-200 text-blue-800" },
  thinking: { label: "思考と行動", icon: "💡", chip: "bg-purple-50 border-purple-200 text-purple-800" },
  relationship: { label: "人間関係", icon: "🤝", chip: "bg-pink-50 border-pink-200 text-pink-800" },
  management: { label: "経営理念", icon: "🏢", chip: "bg-indigo-50 border-indigo-200 text-indigo-800" },
  growth: { label: "成長", icon: "🌱", chip: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  confidence: { label: "自信", icon: "🔥", chip: "bg-amber-50 border-amber-200 text-amber-800" },
  gratitude: { label: "感謝", icon: "🙏", chip: "bg-rose-50 border-rose-200 text-rose-800" },
  classic: { label: "偉人の言葉", icon: "📜", chip: "bg-slate-100 border-slate-300 text-slate-800" },
};

export const THEME_ORDER: QuoteTheme[] = [
  "goal",
  "thinking",
  "relationship",
  "management",
  "growth",
  "confidence",
  "gratitude",
  "classic",
];
