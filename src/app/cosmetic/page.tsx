"use client";

import { useState, useEffect } from "react";
import { cosmeticItems as initialData, cosmeticCategories, type CosmeticItem, type CosmeticCategory } from "@/data/cosmetic";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";

export default function CosmeticPage() {
  const [items, setItems] = useState<CosmeticItem[]>(initialData);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CosmeticCategory | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CosmeticItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    getContent<CosmeticItem>(CONTENT_KEYS.cosmetic, initialData).then(setItems).catch(() => {});
  }, []);

  const filtered = items.filter((item) => {
    const matchesCat = !selectedCategory || item.category === selectedCategory;
    if (!matchesCat) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.name.toLowerCase().includes(q) ||
      item.concern.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  });

  const startEdit = (item: CosmeticItem) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleSave = async (id: string) => {
    if (!editForm) return;
    setSaving(true);
    const newItems = items.map((it) => (it.id === id ? editForm : it));
    setItems(newItems);
    const ok = await saveContent(CONTENT_KEYS.cosmetic, newItems);
    setSaveMsg(ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
    setEditingId(null);
    setEditForm(null);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="当院の美容施術・機器"
        description="美容皮膚科で提供している施術・機器の一覧です"
        badge={`${items.length}メニュー`}
      />

      {saveMsg && (
        <div className={`rounded-md px-4 py-2 text-sm ${saveMsg.startsWith("保存しました") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          {saveMsg}
        </div>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="施術名・対象悩みで検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal/40 placeholder:text-muted-foreground"
      />

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedCategory(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selectedCategory === null
              ? "bg-teal text-teal-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          すべて
        </button>
        {cosmeticCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedCategory === cat
                ? "bg-teal text-teal-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        {filtered.length}件表示中
      </p>

      {/* Cards */}
      <div className="space-y-4">
        {filtered.map((item) => {
          const isEditing = editingId === item.id && editForm;
          if (isEditing) {
            return (
              <div key={item.id} className="border-2 border-teal-400 rounded-xl p-4 bg-teal-50">
                <div className="grid gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">施術名・機器名</label>
                    <input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-600">タイプ</label>
                      <select
                        value={editForm.type}
                        onChange={(e) => setEditForm({ ...editForm, type: e.target.value as CosmeticItem["type"] })}
                        className="w-full border rounded px-2 py-1 text-sm mt-1 bg-white"
                      >
                        <option value="機器">機器</option>
                        <option value="施術">施術</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">カテゴリ</label>
                      <select
                        value={editForm.category}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value as CosmeticCategory })}
                        className="w-full border rounded px-2 py-1 text-sm mt-1 bg-white"
                      >
                        {cosmeticCategories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">説明</label>
                    <textarea
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      rows={3}
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">対象・適応</label>
                    <input
                      value={editForm.concern}
                      onChange={(e) => setEditForm({ ...editForm, concern: e.target.value })}
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">ダウンタイム</label>
                    <input
                      value={editForm.downtime}
                      onChange={(e) => setEditForm({ ...editForm, downtime: e.target.value })}
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">注意事項</label>
                    <textarea
                      value={editForm.caution}
                      onChange={(e) => setEditForm({ ...editForm, caution: e.target.value })}
                      rows={2}
                      className="w-full border rounded px-2 py-1 text-sm mt-1"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => handleSave(item.id)}
                    disabled={saving}
                    className="px-3 py-1.5 bg-teal-600 text-white text-sm rounded hover:bg-teal-700 disabled:opacity-50"
                  >
                    💾 保存
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-3 py-1.5 border text-sm rounded hover:bg-gray-50"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            );
          }

          return (
            <Card key={item.id} className="overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge
                      variant="outline"
                      className={
                        item.type === "機器"
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-purple-50 text-purple-700 border-purple-200"
                      }
                    >
                      {item.type}
                    </Badge>
                    <Badge variant="outline" className="bg-teal-light text-teal border-teal/20">
                      {item.category}
                    </Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    className="text-xs px-2 py-1 border rounded hover:bg-gray-50 text-gray-700 shrink-0"
                  >
                    ✏️ 編集
                  </button>
                </div>
                <CardTitle className="text-base">{item.name}</CardTitle>
                <CardDescription className="text-sm mt-1">
                  {item.description}
                </CardDescription>

                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="outline" className="bg-teal-light text-teal border-teal/20 text-xs">
                    対象: {item.concern}
                  </Badge>
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                    DT: {item.downtime}
                  </Badge>
                </div>

                <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
                  <span className="mr-1">⚠</span>
                  {item.caution}
                </div>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-muted-foreground py-12">
          該当する施術・機器が見つかりません
        </p>
      )}
    </div>
  );
}
