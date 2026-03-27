import { Badge } from "@/components/ui/badge";

export default function DrugsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Badge variant="outline" className="text-teal border-teal">医療知識</Badge>
      <h1 className="text-xl font-bold">薬剤一覧</h1>
      <p className="text-muted-foreground text-sm">現在準備中です</p>
    </div>
  );
}
