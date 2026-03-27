import { Badge } from "@/components/ui/badge";

export default function CounselorPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Badge variant="outline" className="text-teal border-teal">業務・接遇</Badge>
      <h1 className="text-xl font-bold">カウンセラー業務</h1>
      <p className="text-muted-foreground text-sm">現在準備中です</p>
    </div>
  );
}
