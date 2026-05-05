// 組織知識ベース型定義
// Layer 1: 仕事マニュアル / Layer 2: スキル・知識マップ / Layer 3: 組織発展ナレッジ

export type KnowledgeRole = "multi-office" | "nurse" | "all" | "custom";

// ─── Layer 1: 仕事マニュアル ───
export type ManualStep = {
  id: string;
  order: number;
  title: string;
  description: string;
  checkpoints: string[];
  tips?: string;
};

export type Manual = {
  id: string;
  title: string;
  role: KnowledgeRole;
  customRole?: string;
  category: string;
  purpose: string;
  steps: ManualStep[];
  cautions: string[];
  faq: { q: string; a: string }[];
  relatedManuals: string[];
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
};

// ─── Layer 2: スキル・知識マップ ───
export type SkillItem = {
  id: string;
  title: string;
  description: string;
  howToLearn: string;
  checkCriteria: string;
  isRequired: boolean;
};

export type SkillGrade = "G1" | "G2" | "G3" | "G4" | "G5";

export type SkillLevel = {
  id: string;
  name: string;
  grade: SkillGrade;
  purpose: string;
  skills: SkillItem[];
  knowledge: SkillItem[];
  mindset: SkillItem[];
  milestone: string;
};

export type SkillMap = {
  id: string;
  title: string;
  role: KnowledgeRole;
  customRole?: string;
  description: string;
  levels: SkillLevel[];
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
};

// ─── Layer 3: 組織発展ナレッジ ───
export type OrgKnowledgeType =
  | "improvement"
  | "success"
  | "learning"
  | "bestpractice";

export type OrgKnowledge = {
  id: string;
  type: OrgKnowledgeType;
  title: string;
  situation: string;
  content: string;
  impact: string;
  actionItems: string[];
  tags: string[];
  author: string;
  isAnonymous: boolean;
  isApproved: boolean;
  approvedAt?: string;
  createdAt: string;
};

export const KNOWLEDGE_KEYS = {
  manuals: "org_manuals",
  skillmaps: "org_skillmaps",
  knowledges: "org_knowledges",
} as const;

export const MANUAL_CATEGORIES = [
  "受付・会計",
  "生物学的製剤",
  "カウンセリング",
  "レセプト・算定",
  "緊急対応",
  "その他",
] as const;

export const ROLE_LABEL: Record<KnowledgeRole, string> = {
  "multi-office": "マルチタスク医療事務",
  nurse: "看護師",
  all: "全スタッフ共通",
  custom: "カスタム",
};

export const KNOWLEDGE_TYPE_LABEL: Record<OrgKnowledgeType, string> = {
  improvement: "💡 改善提案",
  success: "✅ 成功事例",
  learning: "📚 失敗から学ぶ",
  bestpractice: "⭐ ベストプラクティス",
};

export const KNOWLEDGE_TYPE_STYLE: Record<OrgKnowledgeType, string> = {
  improvement: "bg-blue-50 text-blue-700",
  success: "bg-green-50 text-green-700",
  learning: "bg-amber-50 text-amber-800",
  bestpractice: "bg-purple-50 text-purple-700",
};
