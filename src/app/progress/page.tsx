import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

export default function ProgressPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader title="学習進捗" description="学習の進捗状況を確認できます" />
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">学習進捗機能は準備中です</p>
      </Card>
    </div>
  );
}
