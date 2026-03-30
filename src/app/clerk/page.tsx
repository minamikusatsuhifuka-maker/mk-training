"use client";

import { useState, useEffect } from "react";
import { clerkSections as initialData, type CheckSection } from "@/data/operations";
import { getContent, CONTENT_KEYS } from "@/lib/content-store";
import { ChecklistSection } from "@/components/ChecklistSection";
import { PageHeader } from "@/components/PageHeader";

export default function ClerkPage() {
  const [sections, setSections] = useState<CheckSection[]>(initialData);

  useEffect(() => {
    getContent<CheckSection>(CONTENT_KEYS.operationsClerk, initialData).then(setSections).catch(() => {});
  }, []);

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="診療クラーク（シュライバー）"
        description="記録業務・必須事項・求められる働き方"
        badge={`${totalItems}項目`}
      />
      <ChecklistSection sections={sections} storageKey="clerk" />
    </div>
  );
}
