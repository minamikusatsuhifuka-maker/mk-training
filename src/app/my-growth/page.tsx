"use client";

// 本人ページ「マイ成長記録」（指示書179 C）
// 機能フラグ growth_record（既定OFF）。OFFの間はメニューに出ず、直URLは「準備中」。
// API側（authorizeGrowth）も非管理者にはフラグONのときだけ応答する＝画面だけの制御ではない。

import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { MyGrowthRecord } from "@/components/MyGrowthRecord";

export default function MyGrowthPage() {
  return (
    <FeatureGate feature="growth_record">
      <div className="max-w-3xl mx-auto">
        <NavPageHeader
          navKey="/my-growth"
          title="🌱 マイ成長記録"
          description="自分の学びの記録・目標・1on1の約束"
        />
        <MyGrowthRecord />
      </div>
    </FeatureGate>
  );
}
