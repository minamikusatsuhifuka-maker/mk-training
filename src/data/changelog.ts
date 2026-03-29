export type ChangelogEntry = {
  id: string;
  date: string;
  category: "疾患" | "薬剤" | "クイズ" | "禁忌" | "美容施術" | "システム";
  title: string;
  description: string;
  addedCount?: number;
  updatedCount?: number;
};

export const changelog: ChangelogEntry[] = [
  { id: "cl001", date: "2026-03-29", category: "システム", title: "研修アプリ初回リリース", description: "南草津皮フ科スタッフ研修アプリをリリースしました。" },
  { id: "cl002", date: "2026-03-29", category: "疾患", title: "疾患データ50件収録", description: "皮膚科主要疾患50件を収録。各疾患に概要・原因・治療法・患者説明例・スタッフが覚えるべきポイント・当院関連施術を記載。", addedCount: 50 },
  { id: "cl003", date: "2026-03-29", category: "薬剤", title: "薬剤規格リスト135品目収録", description: "一般名・規格・用法・適応を含む135品目を収録。生物学的製剤の詳細情報も追加。", addedCount: 135 },
  { id: "cl004", date: "2026-03-29", category: "クイズ", title: "確認クイズ200問収録", description: "疾患・薬剤・当院の美容・業務の4カテゴリで200問を収録。解説付きシャッフル出題。", addedCount: 200 },
  { id: "cl005", date: "2026-03-29", category: "禁忌", title: "禁忌事項30件収録", description: "絶対禁忌・要注意・参考の3段階で30件の禁忌事項を収録。", addedCount: 30 },
  { id: "cl006", date: "2026-03-29", category: "美容施術", title: "AI自動生成機能追加", description: "管理画面に疾患・薬剤・クイズ・禁忌のAI自動生成機能を追加。複数キーワードの一括生成・プレビュー確認・一括登録が可能。" },
];
