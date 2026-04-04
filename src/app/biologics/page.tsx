"use client";

import { useState, useEffect } from "react";
import {
  biologicDrugs as initialData,
  biologicsDiseaseCategories,
  biologicsLastUpdated,
  biologicsNextUpdate,
  type BiologicDrug,
  type BiologicsDiseaseCategory,
} from "@/data/biologics";
import { getContent, CONTENT_KEYS } from "@/lib/content-store";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/* レセプトテンプレート生成 */
function buildReceiptTemplate(drug: BiologicDrug, note: BiologicDrug["receiptNotes"][number]): string {
  const lines = [
    `【${drug.name}・${note.disease}】`,
    ...note.required.map((r) => {
      const label = r.replace(/^[①-⑩]/, "").trim();
      return `${r.charAt(0)}${label}：○○`;
    }),
    `記載タイミング：${note.timing}`,
  ];
  return lines.join("\n");
}

/* 疾患カテゴリに基づくフィルタ */
function matchesCategory(drug: BiologicDrug, category: BiologicsDiseaseCategory): boolean {
  if (category === "すべて") return true;
  const map: Record<string, string[]> = {
    "アトピー性皮膚炎": ["アトピー性皮膚炎", "アトピー性皮膚炎（そう痒）"],
    "乾癬": ["尋常性乾癬", "関節症性乾癬", "膿疱性乾癬", "乾癬性紅皮症", "掌蹠膿疱症"],
    "慢性蕁麻疹": ["慢性特発性蕁麻疹（CSU）", "慢性特発性蕁麻疹"],
    "結節性痒疹": ["結節性痒疹"],
    "化膿性汗腺炎": ["化膿性汗腺炎"],
  };
  const targets = map[category] ?? [category];
  return drug.diseases.some((d) => targets.some((t) => d.includes(t)));
}

/* 維持間隔の短い表記 */
function shortMaintenance(drug: BiologicDrug): string {
  const m = drug.schedule.maintenance;
  const match = m.match(/(\d+)週ごと/);
  if (match) return `${match[1]}週ごと`;
  if (m.includes("4週ごと")) return "4週ごと";
  return "個別設定";
}

export default function BiologicsPage() {
  const [items, setItems] = useState<BiologicDrug[]>(initialData);
  const [category, setCategory] = useState<BiologicsDiseaseCategory>("すべて");
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    getContent<BiologicDrug>(CONTENT_KEYS.biologics, initialData)
      .then(setItems)
      .catch(() => {});
  }, []);

  const filtered = items.filter((d) => matchesCategory(d, category));

  const handleCopy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      /* フォールバック */
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* ヘッダー */}
      <PageHeader
        title="生物学的製剤 投与スケジュール"
        description="投与スケジュール・レセプト摘要欄記載事項"
        badge={`最終更新: ${biologicsLastUpdated}`}
      />

      {/* 注意バナー */}
      <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        本情報は添付文書に基づくスタッフ研修用資料です。実際の投与量・間隔は必ず添付文書と医師の指示に従ってください。
      </div>

      {/* 疾患タブ */}
      <div className="flex gap-2 flex-wrap">
        {biologicsDiseaseCategories.map((cat) => {
          const count = items.filter((d) => matchesCategory(d, cat)).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                category === cat
                  ? "bg-teal text-teal-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length}件表示中</p>

      {/* 薬剤カード一覧 */}
      <div className="space-y-3">
        {filtered.map((drug) => {
          const isOpen = openId === drug.id;
          return (
            <Card key={drug.id} className="overflow-hidden">
              {/* 折りたたみヘッダー */}
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : drug.id)}
                className="w-full text-left px-4 py-3 md:px-6 md:py-4 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base md:text-lg font-bold">{drug.name}</span>
                      <span className="text-xs text-muted-foreground">{drug.genericName}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">
                        {drug.target}
                      </Badge>
                      {drug.schedule.selfInjection ? (
                        <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">自己注射可</Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 border-red-300 text-[10px]">院内投与のみ</Badge>
                      )}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {drug.diseases.map((d) => (
                        <span key={d} className="text-[10px] bg-teal-light text-teal px-1.5 py-0.5 rounded">
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-muted-foreground text-lg shrink-0">{isOpen ? "▼" : "▶"}</span>
                </div>
              </button>

              {/* 展開時の詳細 */}
              {isOpen && (
                <div className="border-t px-4 py-4 md:px-6 md:py-5 space-y-6">

                  {/* セクション① 投与スケジュール */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold flex items-center gap-1">
                      <span className="text-base">📅</span> 投与スケジュール
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm border">
                        <tbody>
                          <tr className="border-b">
                            <td className="px-3 py-2 bg-muted/50 font-medium w-[120px] align-top">導入投与</td>
                            <td className="px-3 py-2 whitespace-pre-line">{drug.schedule.induction}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="px-3 py-2 bg-muted/50 font-medium align-top">維持投与</td>
                            <td className="px-3 py-2 whitespace-pre-line">{drug.schedule.maintenance}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="px-3 py-2 bg-muted/50 font-medium align-top">剤形・規格</td>
                            <td className="px-3 py-2">
                              {drug.dosage.map((d, i) => (
                                <div key={i} className="text-xs">
                                  {d.form}: {d.strength}
                                </div>
                              ))}
                            </td>
                          </tr>
                          {drug.schedule.note && (
                            <tr>
                              <td className="px-3 py-2 bg-muted/50 font-medium align-top">備考</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground whitespace-pre-line">{drug.schedule.note}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* 簡易タイムライン */}
                    <div className="overflow-x-auto pb-2">
                      <div className="flex items-center gap-1 min-w-[400px] px-1">
                        <div className="flex items-center gap-1 bg-blue-50 border border-blue-200 rounded-md px-2 py-1.5">
                          <span className="text-xs font-bold text-blue-700">導入</span>
                          <span className="text-[10px] text-blue-600 max-w-[180px] truncate">{drug.schedule.induction.split("\n")[0]}</span>
                        </div>
                        <div className="flex items-center">
                          <div className="w-6 h-0.5 bg-slate-300" />
                          <div className="text-slate-400">→</div>
                          <div className="w-6 h-0.5 bg-slate-300" />
                        </div>
                        <div className="flex items-center gap-1 bg-green-50 border border-green-200 rounded-md px-2 py-1.5">
                          <span className="text-xs font-bold text-green-700">維持</span>
                          <span className="text-[10px] text-green-600 max-w-[180px] truncate">{drug.schedule.maintenance.split("\n")[0]}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* セクション② レセプト摘要欄記載事項 */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold flex items-center gap-1">
                      <span className="text-base">🧾</span> レセプト摘要欄記載事項
                    </h3>
                    <div className="space-y-3">
                      {drug.receiptNotes.map((note, ni) => {
                        const copyKey = `${drug.id}-${ni}`;
                        const template = buildReceiptTemplate(drug, note);
                        return (
                          <Card key={ni} className="p-3 md:p-4 space-y-2 bg-slate-50">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-xs">{note.disease}</Badge>
                              <button
                                type="button"
                                onClick={() => handleCopy(template, copyKey)}
                                className="text-xs rounded-md border px-2 py-1 hover:bg-white transition-colors"
                              >
                                {copiedKey === copyKey ? "コピー済み" : "テンプレートをコピー"}
                              </button>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">記載必須項目:</p>
                              <ol className="space-y-0.5">
                                {note.required.map((r, ri) => (
                                  <li key={ri} className="text-xs pl-1">{r}</li>
                                ))}
                              </ol>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">記載タイミング:</p>
                              <p className="text-xs">{note.timing}</p>
                            </div>
                          </Card>
                        );
                      })}
                    </div>
                  </div>

                  {/* セクション③ 薬剤情報 */}
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold flex items-center gap-1">
                      <span className="text-base">ℹ️</span> 薬剤情報
                    </h3>
                    <div className="text-xs space-y-1">
                      <p><span className="font-medium">作用機序：</span>{drug.target}</p>
                      <p><span className="font-medium">適応疾患：</span>{drug.diseases.join("、")}</p>
                      <p><span className="font-medium">自己注射：</span>{drug.schedule.selfInjection ? "可能" : "不可（院内投与のみ）"}</p>
                      <p><span className="font-medium">最終更新：</span>{drug.lastUpdated}</p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-12">該当する薬剤が見つかりませんでした</p>
      )}

      {/* 投与スケジュール比較表 */}
      <div className="space-y-3 pt-4">
        <h2 className="text-lg font-semibold">投与スケジュール比較表</h2>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-3 py-2 border-b text-xs font-medium">薬剤名</th>
                <th className="text-left px-3 py-2 border-b text-xs font-medium">主な適応</th>
                <th className="text-left px-3 py-2 border-b text-xs font-medium">導入</th>
                <th className="text-left px-3 py-2 border-b text-xs font-medium">維持間隔</th>
                <th className="text-center px-3 py-2 border-b text-xs font-medium">自己注射</th>
              </tr>
            </thead>
            <tbody>
              {items.map((drug) => (
                <tr key={drug.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 border-b">
                    <div className="font-medium text-sm">{drug.name}</div>
                    <div className="text-[10px] text-muted-foreground">{drug.target}</div>
                  </td>
                  <td className="px-3 py-2 border-b">
                    <div className="flex gap-1 flex-wrap">
                      {drug.diseases.slice(0, 3).map((d) => (
                        <span key={d} className="text-[10px] bg-teal-light text-teal px-1 py-0.5 rounded">{d}</span>
                      ))}
                      {drug.diseases.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{drug.diseases.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 border-b text-xs max-w-[200px]">
                    <span className="line-clamp-2">{drug.schedule.induction.split("\n")[0]}</span>
                  </td>
                  <td className="px-3 py-2 border-b">
                    <Badge variant="outline" className="text-[10px]">{shortMaintenance(drug)}</Badge>
                  </td>
                  <td className="px-3 py-2 border-b text-center">
                    {drug.schedule.selfInjection ? (
                      <span className="text-green-600 font-bold text-xs">○</span>
                    ) : (
                      <span className="text-red-500 font-bold text-xs">×</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* フッター情報 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 pb-4">
        <span>最終更新日: {biologicsLastUpdated}</span>
        <span>次回更新予定: {biologicsNextUpdate}</span>
      </div>
    </div>
  );
}
