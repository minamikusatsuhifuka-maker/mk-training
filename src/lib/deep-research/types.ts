// ディープリサーチ機能の型定義（ai-incho から移植）

/** リサーチの分量モード */
export type ResearchMode = "quick" | "standard" | "deep";

/** リサーチの視点（医療・研修向け調整） */
export type ResearchPerspective = "general" | "medical" | "training" | "patient";

/** リサーチ視点の選択肢（UI表示用） */
export const RESEARCH_PERSPECTIVES: {
  id: ResearchPerspective;
  label: string;
  desc: string;
}[] = [
  { id: "general", label: "一般", desc: "幅広く一般的な情報を調査" },
  { id: "medical", label: "医療・エビデンス重視", desc: "PMDA添付文書・ガイドライン・論文に基づく正確な医療情報" },
  { id: "training", label: "スタッフ研修向け", desc: "医療事務・看護師・カウンセラーが現場で使える実践的な内容" },
  { id: "patient", label: "患者説明向け", desc: "患者にわかりやすく説明するための平易な情報" },
];

/** リサーチ実行リクエスト */
export type ResearchRequest = {
  topic: string;
  mode: ResearchMode;
  perspective?: ResearchPerspective;
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
