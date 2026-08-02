"use client";

// 評価制度ページ（指示書116・[PAGE:evaluation] の転記のみ）

import { PageHeader } from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  HrSectionView,
  HrPortalFooter,
  HrBackLink,
  useScrollToHash,
} from "@/components/HrPortalParts";
import { HR_EVALUATION_SECTIONS } from "@/data/hr-portal";

function EvaluationBody() {
  useScrollToHash();
  return (
    <div className="space-y-4">
      <HrBackLink />
      {HR_EVALUATION_SECTIONS.map((s) => (
        <HrSectionView key={s.id} section={s} />
      ))}
      <HrPortalFooter />
    </div>
  );
}

export default function HrEvaluationPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="🌱 評価制度"
        description="S/A/B/C・7つの実・三面鏡"
      />
      <FeatureGate feature="hr_portal">
        <EvaluationBody />
      </FeatureGate>
    </div>
  );
}
