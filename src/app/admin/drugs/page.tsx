"use client";

import { useState, useEffect, useRef } from "react";
import { drugs as initialDrugs, drugCategories, type Drug, type DrugCategory } from "@/data/drugs";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
import { AdminBanner } from "@/components/AdminBanner";
import { AIGeneratePanel, type GeneratedResult } from "@/components/admin/AIGeneratePanel";
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
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const selectAll = () => setSelectedIds(new Set(data.map((d) => d.id)));
  const clearSelection = () => setSelectedIds(new Set());

  useEffect(() => {
    getContent<Drug>(CONTENT_KEYS.drugs, initialDrugs).then((result) => {
      setData(sortDrugsByCategory(result));
      setConnected(true);
    }).catch(() => {}).finally(() => { loaded.current = true; });
  }, []);

  const persistData = async (items: Drug[]) => {
    setSaving(true);
    const ok = await saveContent(CONTENT_KEYS.drugs, items);
    setConnected(ok);
    setSaveMsg(ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
  };

  const filtered = data.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q) || (d.genericName?.toLowerCase().includes(q) ?? false);
  });

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
        <Button onClick={openNew}>新規追加</Button>
      </div>

      <AIGeneratePanel
        type="drug"
        placeholderExamples={["ネイリン", "デュピクセント", "ラミシール", "オルミエント", "タリクスタ"]}
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

      <input
        type="text"
        placeholder="薬品名・一般名・カテゴリで検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
      />

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
                    {d.genericName && (
                      <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{d.genericName}</div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 border-b align-top w-[120px]">
                    <span className="text-xs">{d.spec}</span>
                  </td>
                  <td className="px-2 py-1.5 border-b align-top w-[130px] hidden sm:table-cell">
                    <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{d.category}</span>
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
      <GeminiBatchVerify contentType="drug" selectedItems={data.filter((d) => selectedIds.has(d.id)).map((d) => ({ id: d.id, name: d.name, data: d }))} onClear={clearSelection} />
    </div>
  );
}
