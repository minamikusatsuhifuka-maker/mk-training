"use client";

// 等級制度ページ（指示書116・[PAGE:grade] の転記のみ）

import { PageHeader } from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  HrSectionView,
  HrPortalFooter,
  HrBackLink,
  useScrollToHash,
} from "@/components/HrPortalParts";
import { HR_GRADE_SECTIONS } from "@/data/hr-portal";

function GradeBody() {
  useScrollToHash();
  return (
    <div className="space-y-4">
      <HrBackLink />
      {HR_GRADE_SECTIONS.map((s) => (
        <HrSectionView key={s.id} section={s} />
      ))}
      <HrPortalFooter />
    </div>
  );
}

export default function HrGradePage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader title="🎯 等級制度" description="G1〜G5・同心円の考え方" />
      <FeatureGate feature="hr_portal">
        <GradeBody />
      </FeatureGate>
    </div>
  );
}
