import { medicalFees, billingTips } from "@/data/medical_fees";

export default function PrintMedicalFeesPage() {
  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div>
      <div className="print-header text-center mb-6">
        <h1 className="text-xl font-bold">南草津皮フ科 保険診療算定点数一覧</h1>
        <p className="text-sm text-gray-500">研修用資料 - {today} / 1点=10円 / 3割負担=1点あたり3円</p>
      </div>
      <h1 className="text-xl font-bold mb-1 no-print">保険診療算定点数一覧</h1>
      <p className="text-sm text-muted-foreground mb-4 no-print">{medicalFees.length}項目 - {today}</p>

      <table className="w-full text-[9pt]">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left px-1 py-0.5 w-[60px]">コード</th>
            <th className="text-left px-1 py-0.5">名称</th>
            <th className="text-right px-1 py-0.5 w-[50px]">点数</th>
            <th className="text-right px-1 py-0.5 w-[70px]">3割負担(円)</th>
            <th className="text-left px-1 py-0.5">注意点</th>
          </tr>
        </thead>
        <tbody>
          {medicalFees.map((f) => (
            <tr key={f.id} className="no-page-break">
              <td className="px-1 py-0.5 font-mono text-[8pt]">{f.code}</td>
              <td className="px-1 py-0.5 font-medium">{f.name}</td>
              <td className="px-1 py-0.5 text-right font-bold">{f.points}</td>
              <td className="px-1 py-0.5 text-right">{f.points * 3}</td>
              <td className="px-1 py-0.5 text-gray-600">{f.notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-6 border-2 border-gray-300 rounded p-3">
        <h3 className="font-bold text-sm mb-2">算定のポイント（注意事項）</h3>
        <ul className="text-[9pt] space-y-1">
          {billingTips.map((tip, i) => (
            <li key={i}><span className="font-medium">⚠ {tip.title}:</span> {tip.detail}</li>
          ))}
        </ul>
      </div>

      <div className="print-header mt-8 pt-4 border-t text-center text-xs text-gray-400">
        南草津皮フ科 スタッフ研修資料 - 印刷日: {today}
      </div>
    </div>
  );
}
