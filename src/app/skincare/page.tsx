import { skincareItems } from "@/data/skincare";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

export default function SkincarePage() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="スキンケア・美容内服製品"
        description="当院で取り扱うスキンケア製品・美容内服の一覧です"
        badge={`${skincareItems.length}製品`}
      />

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {skincareItems.map((item) => (
          <Card key={item.id} className="h-full">
            <CardHeader>
              <Badge
                variant="outline"
                className="bg-purple-50 text-purple-700 border-purple-200 w-fit text-xs mb-1"
              >
                {item.type}
              </Badge>
              <CardTitle className="text-base">{item.name}</CardTitle>
              <CardDescription className="text-sm mt-1">
                {item.description}
              </CardDescription>
              <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-700">
                {item.caution}
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
