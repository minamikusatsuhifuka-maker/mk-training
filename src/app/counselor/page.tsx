"use client";

import { counselorSections } from "@/data/operations";
import { ChecklistSection } from "@/components/ChecklistSection";
import { Badge } from "@/components/ui/badge";

export default function CounselorPage() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">カウンセラー基礎スキル</h1>
          <p className="text-muted-foreground text-sm mt-1">
            美容施術カウンセリングの基本と接遇
          </p>
        </div>
        <Badge className="bg-teal text-teal-foreground text-sm px-3 py-1">
          14項目
        </Badge>
      </div>
      <ChecklistSection sections={counselorSections} storageKey="counselor" />
    </div>
  );
}
