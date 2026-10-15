"use client";

// 📊 ガントチャート（指示書250・機能ID gantt）
// - いろいろな計画を、月・四半期・年でスタッフ全員と共有する。見た目は250-補「さくらミルク（グラデーション）」
// - 見る：ログインしたスタッフ全員／書く：院長と任された幹部／分類を直す：院長だけ（判定はすべて /api/gantt）
// - スイッチOFFの間は FeatureGate が「準備中」（院長と検証用アカウントはプレビューで開ける）
// - 見出しは「🧭 サイドバー構成」の表示名に合わせる（GanttBoard の中で usePageTitle）

import FeatureGate from "@/components/FeatureGate";
import { GanttBoard } from "@/components/gantt/GanttBoard";

export default function GanttPage() {
  return (
    <div className="p-4 md:p-8 min-h-full">
      <FeatureGate feature="gantt">
        <GanttBoard />
      </FeatureGate>
    </div>
  );
}
