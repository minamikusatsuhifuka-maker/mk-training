"use client";

import { useState, useEffect, useCallback } from "react";
import { drugs as initialDrugs, type Drug, type DrugCategory } from "@/data/drugs";
import { AdminBanner } from "@/components/AdminBanner";
import { AIGeneratePanel, type GeneratedResult } from "@/components/admin/AIGeneratePanel";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/components/AuthProvider";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STORAGE_KEY = "admin_drugs";

const drugCategories: DrugCategory[] = [
  "保湿剤", "ステロイド外用", "タクロリムス外用", "JAK阻害薬外用",
  "抗真菌外用", "抗真菌内服", "抗ウイルス外用", "抗ウイルス内服",
  "抗ヒスタミン薬", "抗菌薬", "外用レチノイド", "BPO外用",
  "ざ瘡配合薬", "レチノイド内服", "生物学的製剤", "JAK阻害薬内服",
  "免疫抑制薬", "ステロイド内服", "神経障害性疼痛薬", "NSAIDs", "美容内服",
];

function emptyDrug(): Drug {
  return { id: `new_${Date.now()}`, name: "", spec: "", category: "保湿剤", indication: "" };
}

export default function AdminDrugsPage() {
  const { user } = useAuthContext();
  const [data, setData] = useState<Drug[]>(initialDrugs);
  const [editItem, setEditItem] = useState<Drug | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data: rows } = await supabase.from("content_drugs").select("id, data");
        if (rows && rows.length > 0) {
          setData(rows.map((r) => r.data as Drug));
          setConnected(true);
          return;
        }
      } catch {}
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setData(JSON.parse(saved));
    }
    load();
  }, []);

  const saveToSupabase = useCallback(async (items: Drug[]) => {
    if (!user) return;
    try {
      const rows = items.map((d) => ({ id: d.id, data: d, updated_at: new Date().toISOString(), updated_by: user.id }));
      await supabase.from("content_drugs").upsert(rows);
      setConnected(true);
    } catch {}
  }, [user]);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const filtered = data.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.category.toLowerCase().includes(q);
  });

  const openNew = () => { setEditItem(emptyDrug()); setDialogOpen(true); };
  const openEdit = (d: Drug) => { setEditItem({ ...d }); setDialogOpen(true); };

  const handleSave = () => {
    if (!editItem) return;
    setData((prev) => {
      const idx = prev.findIndex((d) => d.id === editItem.id);
      let next: Drug[];
      if (idx >= 0) { next = [...prev]; next[idx] = editItem; }
      else { next = [...prev, editItem]; }
      saveToSupabase(next);
      return next;
    });
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    supabase.from("content_drugs").delete().eq("id", deleteId).then(() => {});
    setData((prev) => prev.filter((d) => d.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <div className="max-w-5xl space-y-4">
      <AdminBanner connected={connected} />
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
          setData((prev) => {
            const next = [...prev, ...newDrugs];
            saveToSupabase(next);
            return next;
          });
        }}
      />

      <input
        type="text"
        placeholder="薬品名・カテゴリで検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>薬品名</TableHead>
            <TableHead className="w-[120px]">規格</TableHead>
            <TableHead className="hidden sm:table-cell w-[140px]">カテゴリ</TableHead>
            <TableHead className="hidden md:table-cell">適応</TableHead>
            <TableHead className="w-[120px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{d.spec}</TableCell>
              <TableCell className="hidden sm:table-cell text-xs">{d.category}</TableCell>
              <TableCell className="hidden md:table-cell text-xs text-muted-foreground truncate max-w-[200px]">{d.indication}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(d)}>編集</Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteId(d.id)}>削除</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
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
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave}>保存</Button>
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
    </div>
  );
}
