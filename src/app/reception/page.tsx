"use client";

import { useState, useEffect } from "react";
import { receptionSections as initialData, type CheckSection } from "@/data/operations";
import { getContent, CONTENT_KEYS } from "@/lib/content-store";
import { ChecklistSection } from "@/components/ChecklistSection";
import { PageHeader } from "@/components/PageHeader";

export default function ReceptionPage() {
  const [sections, setSections] = useState<CheckSection[]>(initialData);

  useEffect(() => {
    getContent<CheckSection>(CONTENT_KEYS.operationsReception, initialData).then(setSections).catch(() => {});
  }, []);

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="受付対応"
        description="来院から会計までの流れと注意点"
        badge={`${totalItems}項目`}
      />
      <ChecklistSection sections={sections} storageKey="reception" />
    </div>
  );
}
