"use client";

// 成長マトリクスページ（指示書190 A・確定版 v1.0 第1〜6節をそのまま掲載。機能ID hr_portal）

import { PageHeader } from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import { HrPortalFooter, HrBackLink } from "@/components/HrPortalParts";
import { GrowthMatrixDoc } from "@/components/GrowthMatrixDoc";

function MatrixBody() {
  return (
    <div className="space-y-4">
      <HrBackLink />
      <GrowthMatrixDoc />
      <HrPortalFooter />
    </div>
  );
}

export default function HrMatrixPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader title="🧭 成長マトリクス" description="縦軸マインド × 横軸スキル・ナレッジ（確定版 v1.0）" />
      <FeatureGate feature="hr_portal">
        <MatrixBody />
      </FeatureGate>
    </div>
  );
}
