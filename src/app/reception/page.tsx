"use client";

import { receptionSections } from "@/data/operations";
import { ChecklistSection } from "@/components/ChecklistSection";
import { Badge } from "@/components/ui/badge";

export default function ReceptionPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">受付対応</h1>
          <p className="text-muted-foreground text-sm mt-1">
            来院から会計までの流れと注意点
          </p>
        </div>
        <Badge className="bg-teal text-teal-foreground text-sm px-3 py-1">
          18項目
        </Badge>
      </div>
      <ChecklistSection sections={receptionSections} storageKey="reception" />
    </div>
  );
}
