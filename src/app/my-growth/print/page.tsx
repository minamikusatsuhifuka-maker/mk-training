"use client";

// わたしの可能性ノートの印刷用表示（指示書195）— 本人。フラグ growth_record（API 側 selfAllowed）で守られる

import FeatureGate from "@/components/FeatureGate";
import { KartePrintView } from "@/components/KartePrintView";

export default function MyGrowthPrintPage() {
  return (
    <FeatureGate feature="growth_record">
      <KartePrintView backHref="/my-growth" />
    </FeatureGate>
  );
}
