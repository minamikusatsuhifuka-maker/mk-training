"use client";

import { clerkSections } from "@/data/operations";
import { ChecklistSection } from "@/components/ChecklistSection";
import { Badge } from "@/components/ui/badge";

export default function ClerkPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">診療クラーク（シュライバー）</h1>
          <p className="text-muted-foreground text-sm mt-1">
            記録業務・必須事項・求められる働き方
          </p>
        </div>
        <Badge className="bg-teal text-teal-foreground text-sm px-3 py-1">
          14項目
        </Badge>
      </div>
      <ChecklistSection sections={clerkSections} storageKey="clerk" />
    </div>
  );
}
