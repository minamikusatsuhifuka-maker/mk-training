"use client";

import { receptionSections } from "@/data/operations";
import { ChecklistSection } from "@/components/ChecklistSection";
import { PageHeader } from "@/components/PageHeader";

export default function ReceptionPage() {
  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <PageHeader
        title="受付対応"
        description="来院から会計までの流れと注意点"
        badge="18項目"
      />
      <ChecklistSection sections={receptionSections} storageKey="reception" />
    </div>
  );
}
