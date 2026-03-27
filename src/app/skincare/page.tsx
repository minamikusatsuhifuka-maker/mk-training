import { skincareItems } from "@/data/skincare";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function SkincarePage() {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">スキンケア・美容内服製品</h1>
          <p className="text-muted-foreground text-sm mt-1">
            当院で取り扱うスキンケア製品・美容内服の一覧です
          </p>
        </div>
        <Badge className="bg-teal text-teal-foreground text-sm px-3 py-1">
          {skincareItems.length}製品
        </Badge>
      </div>

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
