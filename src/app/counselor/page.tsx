"use client";

import { useState, useEffect } from "react";
import { counselorSections as initialData, type CheckSection } from "@/data/operations";
import { getContent, CONTENT_KEYS } from "@/lib/content-store";
import { ChecklistSection } from "@/components/ChecklistSection";
import { PageHeader } from "@/components/PageHeader";

export default function CounselorPage() {
  const [sections, setSections] = useState<CheckSection[]>(initialData);

  useEffect(() => {
    getContent<CheckSection>(CONTENT_KEYS.operationsCounselor, initialData).then(setSections).catch(() => {});
  }, []);

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="カウンセラー基礎スキル"
        description="美容施術カウンセリングの基本と接遇"
        badge={`${totalItems}項目`}
      />
      <ChecklistSection sections={sections} storageKey="counselor" />
    </div>
  );
}
