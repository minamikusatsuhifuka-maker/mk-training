"use client";

import { counselorSections } from "@/data/operations";
import { ChecklistSection } from "@/components/ChecklistSection";
import { PageHeader } from "@/components/PageHeader";

export default function CounselorPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="カウンセラー基礎スキル"
        description="美容施術カウンセリングの基本と接遇"
        badge="14項目"
      />
      <ChecklistSection sections={counselorSections} storageKey="counselor" />
    </div>
  );
}
