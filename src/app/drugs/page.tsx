"use client";

import { useState, useEffect } from "react";
import { drugs as initialData, drugCategories, type Drug, type DrugCategory } from "@/data/drugs";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

export default function DrugsPage() {
  const [items, setItems] = useState<Drug[]>(initialData);
  const [searchText, setSearchText] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<DrugCategory | null>(null);
  const [view, setView] = useState<"table" | "accordion">("table");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Drug | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    getContent<Drug>(CONTENT_KEYS.drugs, initialData).then(setItems).catch(() => {});
  }, []);

  const groupedDrugs = drugCategories.reduce((acc, category) => {
    const catItems = items.filter((d) => d.category === category);
    if (catItems.length > 0) acc[category] = catItems;
    return acc;
  }, {} as Partial<Record<DrugCategory, Drug[]>>);

  const categoryCount = (cat: DrugCategory) => items.filter((d) => d.category === cat).length;

  const filtered = items.filter((d) => {
    const matchesCategory = !selectedCategory || d.category === selectedCategory;
    if (!matchesCategory) return false;
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.genericName?.toLowerCase().includes(q) ?? false) ||
      d.indication.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q)
    );
  });

  const startEdit = (drug: Drug) => {
    setEditingId(drug.id);
    setEditForm({ ...drug });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleSave = async () => {
    if (!editForm) return;
    setSaving(true);
    const newItems = items.map((it) => (it.id === editForm.id ? editForm : it));
    setItems(newItems);
    const ok = await saveContent(CONTENT_KEYS.drugs, newItems);
    setSaveMsg(ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
    setEditingId(null);
    setEditForm(null);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="薬剤規格リスト"
          description="当院で使用する主要薬剤の規格・適応を確認できます"
          badge={`収録数: ${items.length}件`}
        />
        <a href="/print/drugs" target="_blank" className="shrink-0 rounded-md border px-3 py-1.5 text-xs hover:bg-accent transition-colors">印刷用</a>
      </div>

      {saveMsg && (
        <div className={`rounded-md px-4 py-2 text-sm ${saveMsg.startsWith("保存しました") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          {saveMsg}
        </div>
      )}

      <input
        type="text"
        placeholder="薬品名・成分名・適応で検索..."
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-muted-foreground"
      />

      <div className="flex items-center gap-2 flex-wrap overflow-x-auto">
        <div className="flex gap-1 mr-2">
          <button type="button" onClick={() => setView("table")} className={`rounded-md px-2 py-1 text-xs ${view === "table" ? "bg-teal text-teal-foreground" : "bg-muted text-muted-foreground"}`}>一覧</button>
          <button type="button" onClick={() => setView("accordion")} className={`rounded-md px-2 py-1 text-xs ${view === "accordion" ? "bg-teal text-teal-foreground" : "bg-muted text-muted-foreground"}`}>カテゴリ別</button>
        </div>
        {view === "table" && (
          <>
            <button type="button" onClick={() => setSelectedCategory(null)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedCategory === null ? "bg-teal text-teal-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>すべて ({items.length})</button>
            {drugCategories.filter((cat) => categoryCount(cat) > 0).map((cat) => (
              <button key={cat} type="button" onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)} className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${selectedCategory === cat ? "bg-teal text-teal-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>{cat} ({categoryCount(cat)})</button>
            ))}
          </>
        )}
      </div>

      {view === "table" && <p className="text-sm text-muted-foreground">{filtered.length}件表示中</p>}

      {view === "table" && (
        filtered.length > 0 ? (
          <>
          <div className="md:hidden space-y-2">
            {filtered.map((d) => (
              <div key={d.id} className="border rounded-lg p-3 bg-white space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{d.name}</div>
                    {d.genericName && <div className="text-xs text-muted-foreground">{d.genericName}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(d)}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-500 shrink-0"
                  >
                    ✏️
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <span className="text-xs bg-teal-light text-teal px-1.5 py-0.5 rounded">{d.spec}</span>
                  <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{d.category}</span>
                </div>
                <p className="text-xs text-muted-foreground">{d.indication}</p>
              </div>
            ))}
          </div>
          <div className="hidden md:block border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[240px]">薬品名</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[120px]">規格</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[130px]">カテゴリ</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b min-w-[150px]">主な適応</th>
                    <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[60px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr key={d.id} className="hover:bg-muted/50">
                      <td className="px-2 py-1.5 border-b align-top w-[240px]">
                        <div className="font-medium text-sm leading-snug">{d.name}</div>
                        {d.genericName && <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{d.genericName}</div>}
                      </td>
                      <td className="px-2 py-1.5 border-b align-top w-[120px]"><span className="text-xs">{d.spec}</span></td>
                      <td className="px-2 py-1.5 border-b align-top w-[130px]"><span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{d.category}</span></td>
                      <td className="px-2 py-1.5 border-b align-top text-xs text-muted-foreground">{d.indication}</td>
                      <td className="px-2 py-1.5 border-b align-top w-[60px]">
                        <button
                          type="button"
                          onClick={() => startEdit(d)}
                          className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-500"
                        >
                          ✏️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        ) : (
          <p className="text-center text-muted-foreground py-12">該当する薬剤が見つかりませんでした</p>
        )
      )}

      {view === "accordion" && (
        <div className="space-y-4">
          {Object.entries(groupedDrugs).map(([category, catItems]) => {
            if (!catItems) return null;
            const filteredItems = searchText
              ? catItems.filter((d) => {
                  const q = searchText.toLowerCase();
                  return d.name.toLowerCase().includes(q) || (d.genericName?.toLowerCase().includes(q) ?? false) || d.indication.toLowerCase().includes(q);
                })
              : catItems;
            if (filteredItems.length === 0) return null;
            return (
              <Card key={category}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 mr-2">{category}</Badge>
                      {filteredItems.length}件
                    </CardTitle>
                  </div>
                </CardHeader>
                <div className="px-6 pb-4 space-y-2">
                  {filteredItems.map((d) => (
                    <div key={d.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm">{d.name}</div>
                          {d.genericName && <div className="text-xs text-muted-foreground">一般名: {d.genericName}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => startEdit(d)}
                          className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-500 shrink-0"
                        >
                          ✏️
                        </button>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="outline" className="bg-teal-light text-teal border-teal/20 text-[10px]">{d.spec}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{d.indication}</p>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 編集モーダル */}
      {editingId && editForm && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={cancelEdit}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto border-2 border-teal-400"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 bg-teal-50 border-b border-teal-200">
              <h2 className="text-base font-bold text-teal-800">薬剤を編集</h2>
            </div>
            <div className="p-5 grid gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">薬品名</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">一般名</label>
                <input
                  value={editForm.genericName ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, genericName: e.target.value })}
                  className="w-full border rounded px-2 py-1 text-sm mt-1"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600">規格</label>
                  <input
                    value={editForm.spec}
                    onChange={(e) => setEditForm({ ...editForm, spec: e.target.value })}
                    className="w-full border rounded px-2 py-1 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">カテゴリ</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value as DrugCategory })}
                    className="w-full border rounded px-2 py-1 text-sm mt-1 bg-white"
                  >
                    {drugCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">適応</label>
                <textarea
                  value={editForm.indication}
                  onChange={(e) => setEditForm({ ...editForm, indication: e.target.value })}
                  rows={2}
                  className="w-full border rounded px-2 py-1 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">用法用量</label>
                <textarea
                  value={editForm.usage ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, usage: e.target.value })}
                  rows={2}
                  className="w-full border rounded px-2 py-1 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">注意事項</label>
                <textarea
                  value={editForm.caution ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, caution: e.target.value })}
                  rows={2}
                  className="w-full border rounded px-2 py-1 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">禁忌</label>
                <textarea
                  value={editForm.contraindications ?? ""}
                  onChange={(e) => setEditForm({ ...editForm, contraindications: e.target.value })}
                  rows={2}
                  className="w-full border rounded px-2 py-1 text-sm mt-1"
                />
              </div>
            </div>
            <div className="p-4 border-t flex gap-2 justify-end bg-gray-50">
              <button
                type="button"
                onClick={cancelEdit}
                className="px-3 py-1.5 border text-sm rounded hover:bg-gray-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 bg-teal-600 text-white text-sm rounded hover:bg-teal-700 disabled:opacity-50"
              >
                💾 保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
