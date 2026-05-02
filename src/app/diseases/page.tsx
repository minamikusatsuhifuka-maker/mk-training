"use client";

import { useState, useEffect, useMemo } from "react";
import { diseases as initialData, type Disease } from "@/data/diseases";
import { getContent, CONTENT_KEYS } from "@/lib/content-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/PageHeader";

// カテゴリ色マップ
const badgeColorMap: Record<Disease["badgeColor"], string> = {
  blue: "bg-blue-100 text-blue-700 border-blue-200",
  teal: "bg-teal-light text-teal border-teal/20",
  amber: "bg-amber-100 text-amber-700 border-amber-200",
  red: "bg-red-100 text-red-700 border-red-200",
  purple: "bg-purple-100 text-purple-700 border-purple-200",
};

// 優先度の設定
const priorityConfig: Record<number, { label: string; color: string; groupLabel: string }> = {
  1: { label: "★必須", color: "bg-red-100 text-red-700 border-red-200", groupLabel: "★ 必須" },
  2: { label: "★重要", color: "bg-orange-100 text-orange-700 border-orange-200", groupLabel: "★ 重要" },
  3: { label: "標準", color: "bg-blue-100 text-blue-600 border-blue-200", groupLabel: "標準" },
  4: { label: "参考", color: "bg-gray-100 text-gray-500 border-gray-200", groupLabel: "参考" },
};

// カテゴリフィルター定義
const categories = ["すべて", "アレルギー", "炎症", "感染症", "腫瘍", "自己免疫", "遺伝性", "美容"] as const;
type Category = (typeof categories)[number];

// 並び替えオプション
type SortOption = "priority" | "category" | "name";

// 表示モード
type ViewMode = "list" | "card";

// 疾患の詳細展開コンポーネント（閲覧専用）
function DiseaseDetail({ d }: { d: Disease }) {
  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-sm font-semibold mb-1">疾患概要</h3>
        <p className="text-sm text-muted-foreground">{d.description}</p>
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-1">原因・誘因</h3>
        <p className="text-sm text-muted-foreground">{d.cause}</p>
      </section>
      <section>
        <h3 className="text-sm font-semibold mb-1">主な治療法</h3>
        <p className="text-sm text-muted-foreground">{d.treatment}</p>
      </section>
      <section className="rounded-md bg-teal-light p-4">
        <h3 className="text-sm font-semibold text-teal mb-1">患者さんへの説明例</h3>
        <p className="text-sm text-teal/80">{d.patientExplanation}</p>
      </section>
      {d.keyPoints.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">スタッフが覚えるべきポイント</h3>
          <ul className="space-y-1">
            {d.keyPoints.map((kp, i) => (
              <li key={i} className="text-sm text-muted-foreground">・{kp}</li>
            ))}
          </ul>
        </section>
      )}
      {d.relatedTreatments.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold mb-2">当院での関連施術・検査</h3>
          <div className="flex flex-wrap gap-2">
            {d.relatedTreatments.map((rt, i) => (
              <Badge key={i} variant="outline" className="bg-teal-light text-teal border-teal/20">{rt}</Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function DiseasesPage() {
  const [items, setItems] = useState<Disease[]>(initialData);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [sortOption, setSortOption] = useState<SortOption>("priority");
  const [categoryFilter, setCategoryFilter] = useState<Category>("すべて");

  useEffect(() => {
    getContent<Disease>(CONTENT_KEYS.diseases, initialData).then(setItems).catch(() => {});
  }, []);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // フィルター・検索
  const filtered = useMemo(() => {
    return items.filter((d) => {
      if (categoryFilter !== "すべて" && d.badge !== categoryFilter) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        d.name.toLowerCase().includes(q) ||
        d.nameEn.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        d.cause.toLowerCase().includes(q) ||
        d.badge.toLowerCase().includes(q) ||
        d.keyPoints.some((kp) => kp.toLowerCase().includes(q)) ||
        d.relatedTreatments.some((rt) => rt.toLowerCase().includes(q))
      );
    });
  }, [items, search, categoryFilter]);

  // ソート
  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sortOption) {
      case "priority":
        list.sort((a, b) => (a.priority ?? 3) - (b.priority ?? 3) || a.name.localeCompare(b.name, "ja"));
        break;
      case "category":
        list.sort((a, b) => a.badge.localeCompare(b.badge, "ja") || (a.priority ?? 3) - (b.priority ?? 3));
        break;
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name, "ja"));
        break;
    }
    return list;
  }, [filtered, sortOption]);

  // サマリー統計
  const stats = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
    items.forEach((d) => {
      const p = d.priority ?? 3;
      if (p in counts) counts[p as keyof typeof counts]++;
    });
    return counts;
  }, [items]);

  // グループ化
  const groups = useMemo(() => {
    if (sortOption === "priority") {
      const map = new Map<number, Disease[]>();
      for (const d of sorted) {
        const p = d.priority ?? 3;
        if (!map.has(p)) map.set(p, []);
        map.get(p)!.push(d);
      }
      return Array.from(map.entries()).map(([p, diseases]) => ({
        key: String(p),
        label: `${priorityConfig[p]?.groupLabel ?? "その他"}(${diseases.length}件)`,
        diseases,
      }));
    }
    if (sortOption === "category") {
      const map = new Map<string, Disease[]>();
      for (const d of sorted) {
        if (!map.has(d.badge)) map.set(d.badge, []);
        map.get(d.badge)!.push(d);
      }
      return Array.from(map.entries()).map(([badge, diseases]) => ({
        key: badge,
        label: `${badge}(${diseases.length}件)`,
        diseases,
      }));
    }
    return [{ key: "all", label: "", diseases: sorted }];
  }, [sorted, sortOption]);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-5">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="疾患一覧"
          description="当院で扱う主要な皮膚疾患の知識を確認できます"
          badge={`疾患数: ${items.length}`}
        />
        <a href="/print/diseases" target="_blank" className="shrink-0 rounded-md border px-3 py-1.5 text-xs hover:bg-accent transition-colors">印刷用</a>
      </div>

      {/* サマリー統計 */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
        <span className="font-medium text-foreground">全{items.length}疾患</span>
        <span className="text-border">|</span>
        <span className="text-red-600 font-medium">必須 {stats[1]}件</span>
        <span className="text-border">|</span>
        <span className="text-orange-600 font-medium">重要 {stats[2]}件</span>
        <span className="text-border">|</span>
        <span className="text-blue-600 font-medium">標準 {stats[3]}件</span>
        <span className="text-border">|</span>
        <span className="text-gray-500 font-medium">参考 {stats[4]}件</span>
      </div>

      {/* コントロールバー */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="疾患名・英語名・症状・原因で検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-muted-foreground"
        />
        <select
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value as SortOption)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal/40"
        >
          <option value="priority">優先度順</option>
          <option value="category">カテゴリ順</option>
          <option value="name">五十音順</option>
        </select>
        <div className="flex rounded-md border border-border overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`px-3 py-2 text-sm transition-colors ${viewMode === "list" ? "bg-teal text-teal-foreground" : "bg-background hover:bg-accent"}`}
          >
            📋 リスト
          </button>
          <button
            type="button"
            onClick={() => setViewMode("card")}
            className={`px-3 py-2 text-sm transition-colors ${viewMode === "card" ? "bg-teal text-teal-foreground" : "bg-background hover:bg-accent"}`}
          >
            🃏 カード
          </button>
        </div>
      </div>

      {/* カテゴリフィルター */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
              categoryFilter === cat
                ? "bg-teal text-teal-foreground border-teal"
                : "bg-background text-muted-foreground border-border hover:bg-accent"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {search && (
        <p className="text-sm text-muted-foreground">
          {filtered.length} 件の疾患が見つかりました
        </p>
      )}

      {/* リスト表示 */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key}>
              {group.label && (
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-3 py-2 mb-1">
                  <h2 className="text-sm font-bold text-foreground">{group.label}</h2>
                </div>
              )}
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-muted/50 text-xs text-muted-foreground">
                      <th className="px-3 py-2 w-16">優先度</th>
                      <th className="px-3 py-2">疾患名</th>
                      <th className="px-3 py-2 hidden sm:table-cell">英語名</th>
                      <th className="px-3 py-2 hidden md:table-cell w-20">カテゴリ</th>
                      <th className="px-3 py-2 hidden lg:table-cell">概要</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.diseases.map((d) => {
                      const isExpanded = expanded.has(d.id);
                      const pConfig = priorityConfig[d.priority ?? 3] ?? priorityConfig[3];
                      return (
                        <ListRow
                          key={d.id}
                          d={d}
                          isExpanded={isExpanded}
                          pConfig={pConfig}
                          onToggle={() => toggleExpand(d.id)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* カード表示 */}
      {viewMode === "card" && (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.key}>
              {group.label && (
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-3 py-2 mb-2">
                  <h2 className="text-sm font-bold text-foreground">{group.label}</h2>
                </div>
              )}
              <div className="space-y-3">
                {group.diseases.map((d) => {
                  const isOpen = expanded.has(d.id);
                  const pConfig = priorityConfig[d.priority ?? 3] ?? priorityConfig[3];
                  return (
                    <Card key={d.id} className="overflow-hidden">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => toggleExpand(d.id)}
                      >
                        <CardHeader className="flex-row items-start gap-3 py-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium border ${pConfig.color}`}>
                                {pConfig.label}
                              </span>
                              <Badge
                                variant="outline"
                                className={badgeColorMap[d.badgeColor]}
                              >
                                {d.badge}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {d.nameEn}
                              </span>
                            </div>
                            <CardTitle className="text-base">{d.name}</CardTitle>
                            <CardDescription className="text-xs mt-1 line-clamp-2">
                              {d.description}
                            </CardDescription>
                          </div>
                          <span className="text-muted-foreground text-lg shrink-0 mt-1">
                            {isOpen ? "▲" : "▼"}
                          </span>
                        </CardHeader>
                      </button>

                      {isOpen && (
                        <div className="px-6 pb-5 space-y-4">
                          <Separator />
                          <DiseaseDetail d={d} />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-12">該当する疾患が見つかりません</p>
      )}
    </div>
  );
}

// リスト表示の行コンポーネント（閲覧専用）
function ListRow({
  d,
  isExpanded,
  pConfig,
  onToggle,
}: {
  d: Disease;
  isExpanded: boolean;
  pConfig: { label: string; color: string };
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-accent/50 border-b last:border-b-0 transition-colors"
      >
        <td className="px-3 py-2.5">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium border whitespace-nowrap ${pConfig.color}`}>
            {pConfig.label}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <p className="font-medium text-sm">{d.name}</p>
        </td>
        <td className="px-3 py-2.5 hidden sm:table-cell">
          <p className="text-xs text-muted-foreground">{d.nameEn}</p>
        </td>
        <td className="px-3 py-2.5 hidden md:table-cell">
          <Badge variant="outline" className={`text-xs ${badgeColorMap[d.badgeColor]}`}>
            {d.badge}
          </Badge>
        </td>
        <td className="px-3 py-2.5 hidden lg:table-cell">
          <p className="text-xs text-muted-foreground line-clamp-1 max-w-xs">{d.description}</p>
        </td>
        <td className="px-3 py-2.5 text-center">
          <span className="text-muted-foreground text-xs">{isExpanded ? "▲" : "▼"}</span>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={6} className="px-4 py-4 bg-muted/30 border-b last:border-b-0">
            <DiseaseDetail d={d} />
          </td>
        </tr>
      )}
    </>
  );
}
