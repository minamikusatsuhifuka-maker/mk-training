import { drugs, drugCategories } from "@/data/drugs";

export default function PrintDrugsPage() {
  const today = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  const grouped = drugCategories.reduce((acc, cat) => {
    const items = drugs.filter((d) => d.category === cat);
    if (items.length > 0) acc.push({ category: cat, items });
    return acc;
  }, [] as { category: string; items: typeof drugs }[]);

  return (
    <div>
      <div className="print-header text-center mb-6">
        <h1 className="text-xl font-bold">南草津皮フ科 薬剤規格リスト</h1>
        <p className="text-sm text-gray-500">研修用資料 - {today}</p>
      </div>
      <h1 className="text-xl font-bold mb-1 no-print">南草津皮フ科 薬剤規格リスト</h1>
      <p className="text-sm text-muted-foreground mb-4 no-print">{drugs.length}品目 - {today}</p>

      {grouped.map((g, gi) => (
        <div key={g.category} className={`no-page-break ${gi > 0 ? "mt-4" : ""}`}>
          <h2 className="text-sm font-bold bg-slate-100 px-2 py-1 mb-1">{g.category}（{g.items.length}件）</h2>
          <table className="w-full text-[9pt] mb-2">
            <thead>
              <tr className="bg-slate-50">
                <th className="text-left px-1 py-0.5 w-[30%]">薬品名</th>
                <th className="text-left px-1 py-0.5 w-[20%]">一般名</th>
                <th className="text-left px-1 py-0.5 w-[15%]">規格</th>
                <th className="text-left px-1 py-0.5 w-[35%]">主な適応</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((d) => (
                <tr key={d.id}>
                  <td className="px-1 py-0.5 font-medium">{d.name}</td>
                  <td className="px-1 py-0.5 text-gray-600">{d.genericName || "—"}</td>
                  <td className="px-1 py-0.5">{d.spec}</td>
                  <td className="px-1 py-0.5 text-gray-600">{d.indication}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="print-header mt-8 pt-4 border-t text-center text-xs text-gray-400">
        南草津皮フ科 スタッフ研修資料 - 印刷日: {today}
      </div>
    </div>
  );
}
