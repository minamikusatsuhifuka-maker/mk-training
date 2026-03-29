import { diseases } from "@/data/diseases";

export default function PrintDiseasesPage() {
  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div>
      <div className="print-header text-center mb-6">
        <h1 className="text-xl font-bold">南草津皮フ科 皮膚疾患早見表</h1>
        <p className="text-sm text-gray-500">研修用資料 - {today}</p>
      </div>
      <h1 className="text-xl font-bold mb-1 no-print">南草津皮フ科 皮膚疾患早見表</h1>
      <p className="text-sm text-muted-foreground mb-4 no-print">{diseases.length}疾患 - {today}</p>

      <div className="grid grid-cols-2 gap-3 print:grid-cols-2">
        {diseases.map((d) => (
          <div key={d.id} className="border rounded p-2 no-page-break text-[9pt]">
            <div className="font-bold text-[10pt]">{d.name}</div>
            <div className="text-gray-500 text-[8pt]">{d.nameEn} [{d.badge}]</div>
            <p className="mt-1 line-clamp-2">{d.description}</p>
            <p className="mt-0.5 text-gray-600"><span className="font-medium">治療:</span> {d.treatment.slice(0, 80)}...</p>
          </div>
        ))}
      </div>

      <div className="print-header mt-8 pt-4 border-t text-center text-xs text-gray-400">
        南草津皮フ科 スタッフ研修資料 - 印刷日: {today}
      </div>
    </div>
  );
}
