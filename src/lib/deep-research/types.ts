// ディープリサーチ機能の型定義（ai-incho から移植）

/** リサーチの分量モード */
export type ResearchMode = "quick" | "standard" | "deep";

/** リサーチ実行リクエスト */
export type ResearchRequest = {
  topic: string;
  mode: ResearchMode;
  additionalContext?: string;
};

/** 引用元（Google検索Grounding由来） */
export type ResearchSource = {
  title: string;
  url: string;
};

/** 保存済みリサーチ結果（本体・全文） */
export type ResearchResult = {
  id: string;
  topic: string;
  mode: string | null;
  content: string;
  sources: ResearchSource[];
  model: string | null;
  createdAt: string;
};

/** モード設定（UI表示用） */
export const RESEARCH_MODES: {
  mode: ResearchMode;
  icon: string;
  label: string;
  description: string;
}[] = [
  { mode: "quick", icon: "⚡", label: "クイック（約1500字）", description: "要点を素早く把握" },
  { mode: "standard", icon: "📊", label: "標準（約3000字）", description: "主要な内容を網羅" },
  { mode: "deep", icon: "🔭", label: "詳細（約5000字）", description: "詳細・専門的な調査" },
];
