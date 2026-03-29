import { pregnancyDrugs, type SafetyLevel } from "@/data/pregnancy";

const symbols: Record<SafetyLevel, string> = {
  safe: "✅使用可",
  caution: "⚠️要相談",
  avoid: "⚠️⚠️避ける",
  contraindicated: "✕禁忌",
};

export default function PrintPregnancyPage() {
  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div>
      <div className="print-header text-center mb-6">
        <h1 className="text-xl font-bold">南草津皮フ科 妊娠・授乳中の薬剤安全性ガイド</h1>
        <p className="text-sm text-gray-500">研修用資料 - {today}</p>
      </div>
      <h1 className="text-xl font-bold mb-1 no-print">妊娠・授乳中の薬剤安全性ガイド</h1>
      <p className="text-sm text-muted-foreground mb-4 no-print">{pregnancyDrugs.length}品目 - {today}</p>

      <table className="w-full text-[8pt]">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left px-1 py-0.5">薬品名</th>
            <th className="text-left px-1 py-0.5">一般名</th>
            <th className="text-left px-1 py-0.5 w-[60px]">妊娠中</th>
            <th className="text-left px-1 py-0.5">妊娠中注意点</th>
            <th className="text-left px-1 py-0.5 w-[60px]">授乳中</th>
            <th className="text-left px-1 py-0.5">授乳中注意点</th>
          </tr>
        </thead>
        <tbody>
          {pregnancyDrugs.map((d) => (
            <tr key={d.id} className="no-page-break">
              <td className="px-1 py-0.5 font-medium">{d.name}</td>
              <td className="px-1 py-0.5 text-gray-600">{d.genericName}</td>
              <td className="px-1 py-0.5 text-center">{symbols[d.pregnancy]}</td>
              <td className="px-1 py-0.5 text-gray-600">{d.pregnancyNote}</td>
              <td className="px-1 py-0.5 text-center">{symbols[d.lactation]}</td>
              <td className="px-1 py-0.5 text-gray-600">{d.lactationNote}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="print-header mt-8 pt-4 border-t text-center text-xs text-gray-400">
        南草津皮フ科 スタッフ研修資料 - 印刷日: {today}
      </div>
    </div>
  );
}
