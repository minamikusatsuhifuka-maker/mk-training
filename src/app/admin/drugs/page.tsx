"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { drugs as initialDrugs, drugCategories, type Drug, type DrugCategory } from "@/data/drugs";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
import { AdminBanner } from "@/components/AdminBanner";
import { type GeneratedResult } from "@/components/admin/AIGeneratePanel";
import { DrugCandidatePanel } from "@/components/admin/DrugCandidatePanel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { GeminiVerifyButton } from "@/components/admin/GeminiVerifyButton";
import { GeminiBatchVerify } from "@/components/admin/GeminiBatchVerify";

// カテゴリ設定（色・アイコン・ソート順）
const CATEGORY_CONFIG: Record<string, { icon: string; color: string; bgColor: string; order: number }> = {
  "ステロイド外用":    { icon: "🔴", color: "text-red-700",     bgColor: "bg-red-50 border-red-200",     order: 1 },
  "保湿剤":           { icon: "💧", color: "text-blue-700",    bgColor: "bg-blue-50 border-blue-200",    order: 2 },
  "抗菌薬外用":       { icon: "🛡️", color: "text-yellow-700",  bgColor: "bg-yellow-50 border-yellow-200", order: 3 },
  "抗真菌薬外用":     { icon: "🍄", color: "text-green-700",   bgColor: "bg-green-50 border-green-200",   order: 4 },
  "免疫抑制外用":     { icon: "🧬", color: "text-orange-700",  bgColor: "bg-orange-50 border-orange-200", order: 5 },
  "ビタミンD3外用":   { icon: "☀️", color: "text-amber-700",   bgColor: "bg-amber-50 border-amber-200",   order: 6 },
  "抗ウイルス薬外用": { icon: "🦠", color: "text-purple-700",  bgColor: "bg-purple-50 border-purple-200", order: 7 },
  "その他外用":       { icon: "🧴", color: "text-gray-700",    bgColor: "bg-gray-50 border-gray-200",    order: 8 },
  "抗ヒスタミン薬":   { icon: "💊", color: "text-sky-700",     bgColor: "bg-sky-50 border-sky-200",      order: 9 },
  "抗菌薬内服":       { icon: "💊", color: "text-yellow-700",  bgColor: "bg-yellow-50 border-yellow-200", order: 10 },
  "抗真菌薬内服":     { icon: "💊", color: "text-emerald-700", bgColor: "bg-emerald-50 border-emerald-200", order: 11 },
  "抗ウイルス薬内服": { icon: "💊", color: "text-violet-700",  bgColor: "bg-violet-50 border-violet-200", order: 12 },
  "生物学的製剤":     { icon: "✨", color: "text-teal-700",    bgColor: "bg-teal-50 border-teal-200",    order: 13 },
  "JAK阻害薬":        { icon: "✨", color: "text-teal-800",    bgColor: "bg-teal-100 border-teal-300",   order: 14 },
  "免疫抑制内服":     { icon: "🧬", color: "text-orange-800",  bgColor: "bg-orange-100 border-orange-300", order: 15 },
  "ステロイド内服":   { icon: "🔴", color: "text-red-800",     bgColor: "bg-red-100 border-red-300",     order: 16 },
  "その他内服":       { icon: "💊", color: "text-gray-700",    bgColor: "bg-gray-50 border-gray-200",    order: 17 },
};

const getConfig = (category: string) =>
  CATEGORY_CONFIG[category] || { icon: "💊", color: "text-gray-600", bgColor: "bg-gray-50 border-gray-200", order: 99 };

function sortDrugsByCategory(items: Drug[]): Drug[] {
  return [...items].sort((a, b) => {
    const ai = drugCategories.indexOf(a.category);
    const bi = drugCategories.indexOf(b.category);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function emptyDrug(): Drug {
  return { id: `new_${Date.now()}`, name: "", genericName: "", spec: "", category: "保湿剤", indication: "", usage: "" };
}

export default function AdminDrugsPage() {
  const [data, setData] = useState<Drug[]>(sortDrugsByCategory(initialDrugs));
  const [editItem, setEditItem] = useState<Drug | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const loaded = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"category" | "list">("category");
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const selectAll = () => setSelectedIds(new Set(data.map((d) => d.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const toggleCategory = (cat: string) => {
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  };

  useEffect(() => {
    getContent<Drug>(CONTENT_KEYS.drugs, initialDrugs).then((result) => {
      setData(sortDrugsByCategory(result));
      setConnected(true);
    }).catch(() => {}).finally(() => { loaded.current = true; });
  }, []);

  // 検索時は全カテゴリを開く
  useEffect(() => {
    if (search) {
      const allCats = new Set(data.map((d) => d.category));
      setOpenCategories(allCats);
    }
  }, [search, data]);

  const persistData = async (items: Drug[]) => {
    setSaving(true);
    const ok = await saveContent(CONTENT_KEYS.drugs, items);
    setConnected(ok);
    setSaveMsg(ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
  };

  const handleApplyGeminiChanges = async (changes: Record<string, Record<string, string>>) => {
    const updated = data.map((d) => {
      if (changes[d.id]) return { ...d, ...changes[d.id] };
      return d;
    });
    setData(sortDrugsByCategory(updated));
    await persistData(sortDrugsByCategory(updated));
  };

  // カテゴリ別グループ化
  const groupedDrugs = useMemo(() => {
    const filtered = data.filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) || (d.genericName?.toLowerCase().includes(q) ?? false);
    });
    const groups: Record<string, Drug[]> = {};
    filtered.forEach((d) => {
      const cat = d.category || "その他";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(d);
    });
    return Object.entries(groups).sort(([a], [b]) => getConfig(a).order - getConfig(b).order);
  }, [data, search]);

  // フラットフィルター（一覧表示用）
  const filtered = useMemo(() => {
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter((d) =>
      d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) || (d.genericName?.toLowerCase().includes(q) ?? false)
    );
  }, [data, search]);

  const openNew = () => { setEditItem(emptyDrug()); setDialogOpen(true); };
  const openEdit = (d: Drug) => { setEditItem({ ...d }); setDialogOpen(true); };

  const handleSave = () => {
    if (!editItem) return;
    const idx = data.findIndex((d) => d.id === editItem.id);
    let newData: Drug[];
    if (idx >= 0) {
      newData = [...data];
      newData[idx] = editItem;
    } else {
      newData = [...data, editItem];
    }
    newData = sortDrugsByCategory(newData);
    setData(newData);
    persistData(newData);
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const newData = data.filter((d) => d.id !== deleteId);
    setData(newData);
    persistData(newData);
    setDeleteId(null);
  };

  return (
    <div className="max-w-5xl space-y-4">
      <AdminBanner connected={connected} />
      {saveMsg && (
        <div className={`rounded-md px-4 py-2 text-sm ${saveMsg.startsWith("保存しました") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          {saveMsg}
        </div>
      )}
      {saving && <div className="text-sm text-muted-foreground animate-pulse">保存中...</div>}

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-800">薬剤管理（{data.length}件）</h1>
        <div className="flex items-center gap-2">
          {/* 表示モード切替 */}
          <div className="flex gap-0 border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("category")}
              className={`text-sm px-3 py-1.5 transition-colors ${viewMode === "category" ? "bg-teal text-white" : "hover:bg-gray-50"}`}
            >
              📂 カテゴリ別
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`text-sm px-3 py-1.5 transition-colors ${viewMode === "list" ? "bg-teal text-white" : "hover:bg-gray-50"}`}
            >
              📋 一覧
            </button>
          </div>
          <Button onClick={openNew}>新規追加</Button>
        </div>
      </div>

      <DrugCandidatePanel
        placeholderExamples={[
          "アレルギー性結膜炎の点眼薬",
          "ニキビ治療の外用抗菌薬",
          "アトピーの生物学的製剤",
          "爪白癬の外用液",
          "帯状疱疹の内服薬",
        ]}
        onGenerated={(results: GeneratedResult[]) => {
          const newDrugs: Drug[] = results
            .filter((r) => r.data)
            .map((r) => ({
              id: r.id,
              name: (r.data as Record<string, string>).name ?? r.keyword,
              spec: (r.data as Record<string, string>).spec ?? "",
              category: ((r.data as Record<string, string>).category ?? "保湿剤") as DrugCategory,
              indication: (r.data as Record<string, string>).indication ?? "",
            }));
          const newData = sortDrugsByCategory([...data, ...newDrugs]);
          setData(newData);
          persistData(newData);
        }}
      />

      {/* カテゴリサマリーバッジ */}
      <div className="flex flex-wrap gap-1.5">
        {groupedDrugs.map(([cat, items]) => {
          const config = getConfig(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setViewMode("category");
                setOpenCategories(new Set([cat]));
              }}
              className={`text-xs px-2 py-1 rounded-full border ${config.bgColor} ${config.color} hover:opacity-80 transition-opacity`}
            >
              {config.icon} {cat} ({items.length})
            </button>
          );
        })}
      </div>

      <input
        type="text"
        placeholder="薬品名・一般名・カテゴリで検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
      />

      {/* ===== カテゴリ別表示 ===== */}
      {viewMode === "category" && (
        <div className="space-y-2">
          {/* 全て開く・閉じる */}
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpenCategories(new Set(groupedDrugs.map(([cat]) => cat)))} className="text-xs text-teal hover:underline">
              全て開く
            </button>
            <span className="text-gray-300">|</span>
            <button type="button" onClick={() => setOpenCategories(new Set())} className="text-xs text-gray-500 hover:underline">
              全て閉じる
            </button>
          </div>

          {groupedDrugs.map(([category, items]) => {
            const config = getConfig(category);
            const isOpen = openCategories.has(category);
            const catSelectedCount = items.filter((i) => selectedIds.has(i.id)).length;

            return (
              <div key={category}>
                {/* カテゴリヘッダー */}
                <div
                  className={`flex items-center justify-between px-4 py-2.5 border rounded-lg cursor-pointer ${config.bgColor} ${isOpen ? "rounded-b-none" : ""}`}
                  onClick={() => toggleCategory(category)}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={items.every((i) => selectedIds.has(i.id)) && items.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds((prev) => new Set([...prev, ...items.map((i) => i.id)]));
                        } else {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            items.forEach((i) => next.delete(i.id));
                            return next;
                          });
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded"
                    />
                    <span className="text-base">{config.icon}</span>
                    <span className={`font-semibold text-sm ${config.color}`}>{category}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${config.bgColor} ${config.color}`}>
                      {items.length}件
                    </span>
                    {catSelectedCount > 0 && (
                      <span className="text-xs text-teal">({catSelectedCount}件選択中)</span>
                    )}
                  </div>
                  <span className={`text-xs ${config.color}`}>{isOpen ? "▲" : "▼"}</span>
                </div>

                {/* カテゴリ内テーブル */}
                {isOpen && (
                  <div className="border border-t-0 rounded-b-lg overflow-hidden">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col style={{width: '2rem'}} />
                        <col style={{width: '35%'}} />
                        <col style={{width: '15%'}} />
                        <col style={{width: '35%'}} />
                        <col style={{width: '8rem'}} />
                      </colgroup>
                      <thead className="bg-white border-b">
                        <tr>
                          <th className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={items.every((i) => selectedIds.has(i.id)) && items.length > 0}
                              onChange={(e) => {
                                if (e.target.checked) setSelectedIds((prev) => new Set([...prev, ...items.map((i) => i.id)]));
                                else setSelectedIds((prev) => { const n = new Set(prev); items.forEach((i) => n.delete(i.id)); return n; });
                              }}
                              className="rounded"
                            />
                          </th>
                          <th className="text-left px-2 py-2 text-xs font-medium text-gray-500">薬品名</th>
                          <th className="text-left px-2 py-2 text-xs font-medium text-gray-500">規格</th>
                          <th className="text-left px-2 py-2 text-xs font-medium text-gray-500">適応</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((drug) => (
                          <tr key={drug.id} className={`border-b last:border-0 hover:bg-gray-50 ${selectedIds.has(drug.id) ? "bg-teal-light" : ""}`}>
                            <td className="px-2 py-1.5">
                              <input type="checkbox" checked={selectedIds.has(drug.id)} onChange={() => toggleSelect(drug.id)} className="rounded" />
                            </td>
                            <td className="px-2 py-1.5">
                              <p className="font-medium text-sm truncate">{drug.name}</p>
                              {drug.genericName && <p className="text-xs text-gray-500 truncate">{drug.genericName}</p>}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-gray-600 truncate">{drug.spec}</td>
                            <td className="px-2 py-1.5 text-xs text-gray-600 truncate">{drug.indication}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex gap-1">
                                <Button variant="outline" size="sm" onClick={() => openEdit(drug)}>編集</Button>
                                <GeminiVerifyButton contentType="drug" itemName={drug.name} currentData={drug} />
                                <Button variant="destructive" size="sm" onClick={() => setDeleteId(drug.id)}>削除</Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== 一覧表示 ===== */}
      {viewMode === "list" && (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="w-8 px-2"><input type="checkbox" checked={selectedIds.size === data.length && data.length > 0} onChange={(e) => e.target.checked ? selectAll() : clearSelection()} className="rounded" /></th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[240px]">薬品名</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[120px]">規格</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[130px] hidden sm:table-cell">カテゴリ</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b hidden md:table-cell min-w-[150px]">適応</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 border-b w-[100px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/50">
                    <td className="px-2"><input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleSelect(d.id)} onClick={(e) => e.stopPropagation()} className="rounded" /></td>
                    <td className="px-2 py-1.5 border-b align-top w-[240px]">
                      <div className="font-medium text-sm leading-snug">{d.name}</div>
                      {d.genericName && <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{d.genericName}</div>}
                    </td>
                    <td className="px-2 py-1.5 border-b align-top w-[120px]"><span className="text-xs">{d.spec}</span></td>
                    <td className="px-2 py-1.5 border-b align-top w-[130px] hidden sm:table-cell">
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${getConfig(d.category).bgColor} ${getConfig(d.category).color}`}>{d.category}</span>
                    </td>
                    <td className="px-2 py-1.5 border-b align-top text-xs text-muted-foreground hidden md:table-cell">{d.indication}</td>
                    <td className="px-2 py-1.5 border-b align-top w-[130px]">
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => openEdit(d)}>編集</Button>
                        <GeminiVerifyButton contentType="drug" itemName={d.name} currentData={d} />
                        <Button variant="destructive" size="sm" onClick={() => setDeleteId(d.id)}>削除</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem && data.some((d) => d.id === editItem.id) ? "薬剤を編集" : "新規薬剤を追加"}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <label className="space-y-1 block">
                <span className="text-xs font-medium">薬品名</span>
                <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.name} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">一般名（成分名）</span>
                <input className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="例: セチリジン塩酸塩" value={editItem.genericName ?? ""} onChange={(e) => setEditItem({ ...editItem, genericName: e.target.value })} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">規格</span>
                <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.spec} onChange={(e) => setEditItem({ ...editItem, spec: e.target.value })} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">カテゴリ</span>
                <Select value={editItem.category} onValueChange={(v) => setEditItem({ ...editItem, category: v as DrugCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {drugCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">適応</span>
                <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.indication} onChange={(e) => setEditItem({ ...editItem, indication: e.target.value })} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">用法・用量</span>
                <Textarea placeholder="例: 1日1回就寝前" value={editItem.usage ?? ""} onChange={(e) => setEditItem({ ...editItem, usage: e.target.value })} rows={2} />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>薬剤を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>この操作は元に戻せません。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>削除する</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GeminiBatchVerify
        contentType="drug"
        selectedItems={data.filter((d) => selectedIds.has(d.id)).map((d) => ({ id: d.id, name: d.name, data: d as unknown as Record<string, unknown> }))}
        onClear={clearSelection}
        onApplyChanges={handleApplyGeminiChanges}
      />
    </div>
  );
}
