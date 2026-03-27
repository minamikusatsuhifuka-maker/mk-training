"use client";

import { clerkSections } from "@/data/operations";
import { ChecklistSection } from "@/components/ChecklistSection";
import { PageHeader } from "@/components/PageHeader";

export default function ClerkPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="診療クラーク（シュライバー）"
        description="記録業務・必須事項・求められる働き方"
        badge="14項目"
      />
      <ChecklistSection sections={clerkSections} storageKey="clerk" />
    </div>
  );
}
