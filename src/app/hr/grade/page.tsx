"use client";

// 等級制度ページ（指示書116・[PAGE:grade] の転記のみ）
// 209: 「等級とは何か」の下に、同心円の図（GradeCirclesFigure）を差し込む。

import { Fragment } from "react";
import { PageHeader } from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  HrSectionView,
  HrPortalFooter,
  HrBackLink,
  useScrollToHash,
} from "@/components/HrPortalParts";
import { HR_GRADE_SECTIONS } from "@/data/hr-portal";
import { GradeCirclesFigure } from "@/components/GradeCirclesFigure";

function GradeBody() {
  useScrollToHash();
  return (
    <div className="space-y-4">
      <HrBackLink />
      {HR_GRADE_SECTIONS.map((s) => (
        <Fragment key={s.id}>
          <HrSectionView section={s} />
          {/* 209: 「等級とは何か」のすぐ下（「成長の5段階と2つの壁」の上）に図を置く。
              並び順はデータ（HR_GRADE_SECTIONS）側を変えずに、ここで差し込む */}
          {s.id === "what-is-grade" && <GradeCirclesFigure />}
        </Fragment>
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
