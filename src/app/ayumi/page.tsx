"use client";

// 📜 当院の歩み（指示書253・機能ID ayumi）
// - ガントチャートから残した出来事と、開業などの過去の出来事の年表。入口に「創業の歴史・精神」
// - 見る：ログインしたスタッフ全員／書く：院長と任された幹部／入口の文：院長だけ／声：関わった人の本人（判定はすべて /api/ayumi）
// - スイッチOFFの間は FeatureGate が「準備中」（院長と検証用アカウントはプレビューで開ける）
// - 管理画面の売上の「📈 クリニックの歩み」とは別のもの

import FeatureGate from "@/components/FeatureGate";
import { AyumiBoard } from "@/components/ayumi/AyumiBoard";

export default function AyumiPage() {
  return (
    <div className="p-4 md:p-8 min-h-full">
      <FeatureGate feature="ayumi">
        <AyumiBoard />
      </FeatureGate>
    </div>
  );
}
