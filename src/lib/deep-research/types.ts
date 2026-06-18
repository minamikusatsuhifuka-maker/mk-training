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

// ─────────────────────────────────────────────────────────────
// STEP 3: 生成した学習資料（6タイプ）の保存
// ─────────────────────────────────────────────────────────────

/** 保存できる学習資料の種類（LearningMaterials の GenType と一致） */
export type DerivedMaterialType =
  | "training"
  | "knowledge_basic"
  | "knowledge_expert"
  | "quiz"
  | "summary"
  | "essentials";

/** 学習資料タイプの表示メタ（ラベル・アイコン・表示形式） */
export const DERIVED_MATERIAL_META: Record<
  DerivedMaterialType,
  { label: string; icon: string; render: "markdown" | "plain" }
> = {
  training: { label: "研修資料", icon: "📋", render: "markdown" },
  knowledge_basic: { label: "知識シート（初心者）", icon: "🌱", render: "markdown" },
  knowledge_expert: { label: "知識シート（エキスパート）", icon: "🏆", render: "markdown" },
  quiz: { label: "クイズ（4択）", icon: "❓", render: "plain" },
  summary: { label: "要約", icon: "📌", render: "markdown" },
  essentials: { label: "必須のまとめ", icon: "✨", render: "plain" },
};

/** 学習資料の本体（全文） */
export type DerivedMaterial = {
  id: string;
  title: string;
  type: DerivedMaterialType;
  content: string;
  sourceTopic: string;
  sourceResearchId?: string | null;
  createdAt: string;
};

/** 学習資料一覧用の軽量メタ（全文を含まない） */
export type DerivedMaterialIndexItem = {
  id: string;
  title: string;
  type: DerivedMaterialType;
  sourceResearchId?: string | null;
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
