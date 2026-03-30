"use client";

import { useState, useEffect } from "react";
import { pregnancyDrugs as initialData, type PregnancyDrug, type SafetyLevel } from "@/data/pregnancy";
import { getContent, CONTENT_KEYS } from "@/lib/content-store";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";

const safetyConfig: Record<SafetyLevel, { label: string; color: string }> = {
  safe: { label: "✅ 使用可", color: "bg-green-100 text-green-700 border-green-200" },
  caution: { label: "⚠️ 要相談", color: "bg-amber-100 text-amber-700 border-amber-200" },
  avoid: { label: "🔶 避ける", color: "bg-orange-100 text-orange-700 border-orange-200" },
  contraindicated: { label: "🚫 禁忌", color: "bg-red-100 text-red-700 border-red-200" },
};

const tabs = [
  { key: "allergy", label: "抗アレルギー薬", filter: (c: string) => c.includes("抗ヒスタミン") || c.includes("ロイコトリエン") },
  { key: "topical", label: "外用薬", filter: (c: string) => c.includes("外用") || c.includes("保湿") || c.includes("タクロリムス") },
  { key: "oral", label: "内服薬・その他", filter: (c: string) => c.includes("内服") || c.includes("NSAIDs") || c.includes("鎮痛") || c.includes("多汗症") || c.includes("美容") },
  { key: "contraindicated", label: "絶対禁忌薬", filter: (_c: string, d: { pregnancy: SafetyLevel }) => d.pregnancy === "contraindicated" },
  { key: "biologics", label: "生物学的製剤", filter: (c: string) => c.includes("生物学的") },
];

export default function PregnancyPage() {
  const [items, setItems] = useState<PregnancyDrug[]>(initialData);
  const [tab, setTab] = useState("allergy");
  const [search, setSearch] = useState("");

  useEffect(() => {
    getContent<PregnancyDrug>(CONTENT_KEYS.pregnancy, initialData).then(setItems).catch(() => {});
  }, []);

  const currentTab = tabs.find((t) => t.key === tab)!;
  const filtered = items.filter((d) => {
    const matchesTab = currentTab.filter(d.category, d);
    if (!matchesTab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.genericName.toLowerCase().includes(q);
  });

  const isContraindicated = tab === "contraindicated";

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="妊娠・授乳中の薬剤安全性"
          description="スタッフ研修用の参考情報です"
          badge={`${items.length}品目`}
        />
        <a href="/print/pregnancy" target="_blank" className="shrink-0 rounded-md border px-3 py-1.5 text-xs hover:bg-accent transition-colors">印刷用</a>
      </div>

      {/* Warning banner */}
      <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
        ※本情報はスタッフ研修用の参考情報です。個々の患者さんへの最終判断は必ず医師が行います。妊娠・授乳の可能性がある患者さんの薬剤変更は医師に報告・相談してください。
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(safetyConfig).map(([key, { label, color }]) => (
          <Badge key={key} variant="outline" className={`${color} text-xs`}>{label}</Badge>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="薬品名・一般名で検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-muted-foreground"
      />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="text-xs">{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Contraindicated alert */}
      {isContraindicated && (
        <div className="rounded-md bg-red-50 border-2 border-red-300 px-4 py-3 text-sm text-red-800 font-medium">
          妊娠が判明した場合は即座に医師に報告し、以下の薬剤の服薬中止の確認を行ってください。
        </div>
      )}

      {/* Results count */}
      <p className="text-sm text-muted-foreground">{filtered.length}件表示中</p>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {filtered.map((d) => (
          <Card key={d.id} className={`p-3 space-y-2 ${isContraindicated ? "border-red-300 bg-red-50/30" : ""}`}>
            <div>
              <div className="font-medium text-sm">{d.name}</div>
              <div className="text-xs text-muted-foreground">{d.genericName}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">妊娠中</p>
                <Badge variant="outline" className={`${safetyConfig[d.pregnancy].color} text-[10px]`}>{safetyConfig[d.pregnancy].label}</Badge>
                <p className="text-xs text-muted-foreground mt-1">{d.pregnancyNote}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">授乳中</p>
                <Badge variant="outline" className={`${safetyConfig[d.lactation].color} text-[10px]`}>{safetyConfig[d.lactation].label}</Badge>
                <p className="text-xs text-muted-foreground mt-1">{d.lactationNote}</p>
              </div>
            </div>
            {d.evidence && <p className="text-[10px] text-muted-foreground">根拠: {d.evidence}</p>}
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[180px]">薬品名</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[130px]">一般名</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[80px]">妊娠中</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b">妊娠中の注意点</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[80px]">授乳中</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b">授乳中の注意点</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className={`hover:bg-muted/50 ${isContraindicated ? "bg-red-50/30" : ""}`}>
                  <td className="px-2 py-1.5 border-b align-top">
                    <div className="font-medium text-sm leading-snug">{d.name}</div>
                  </td>
                  <td className="px-2 py-1.5 border-b align-top text-xs text-muted-foreground">{d.genericName}</td>
                  <td className="px-2 py-1.5 border-b align-top">
                    <Badge variant="outline" className={`${safetyConfig[d.pregnancy].color} text-[10px]`}>{safetyConfig[d.pregnancy].label}</Badge>
                  </td>
                  <td className="px-2 py-1.5 border-b align-top text-xs text-muted-foreground">{d.pregnancyNote}</td>
                  <td className="px-2 py-1.5 border-b align-top">
                    <Badge variant="outline" className={`${safetyConfig[d.lactation].color} text-[10px]`}>{safetyConfig[d.lactation].label}</Badge>
                  </td>
                  <td className="px-2 py-1.5 border-b align-top text-xs text-muted-foreground">{d.lactationNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-8">該当する薬剤が見つかりません</p>
      )}

      {/* References */}
      <Card className="p-4 space-y-2">
        <p className="text-xs font-medium">参考情報</p>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>・国立成育医療研究センター 妊娠と薬情報センター</li>
          <li>・妊娠と授乳（改訂3版）</li>
          <li>・EULAR 2024 Recommendations for the management of rheumatic diseases during pregnancy</li>
          <li>・アトピー性皮膚炎診療ガイドライン2024</li>
        </ul>
        <p className="text-xs text-amber-700 font-medium mt-2">
          妊娠中・授乳中の疑問は必ず医師・薬剤師に相談してください。
        </p>
      </Card>
    </div>
  );
}
