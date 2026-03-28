"use client";

import { useState, useEffect, useCallback } from "react";
import { diseases as initialDiseases, type Disease } from "@/data/diseases";
import { AdminBanner } from "@/components/AdminBanner";
import { AIGeneratePanel, type GeneratedResult } from "@/components/admin/AIGeneratePanel";
import { supabase } from "@/lib/supabase";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STORAGE_KEY = "admin_diseases";

const badgeColors: Disease["badgeColor"][] = ["blue", "teal", "amber", "red", "purple"];

function emptyDisease(): Disease {
  return {
    id: `new_${Date.now()}`,
    name: "",
    nameEn: "",
    badge: "",
    badgeColor: "teal",
    description: "",
    cause: "",
    treatment: "",
    patientExplanation: "",
    keyPoints: [],
    relatedTreatments: [],
  };
}

export default function AdminDiseasesPage() {
  const [data, setData] = useState<Disease[]>(initialDiseases);
  const [editItem, setEditItem] = useState<Disease | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const { data: rows } = await supabase.from("content_diseases").select("id, data");
        if (rows && rows.length > 0) {
          setData(rows.map((r) => r.data as Disease));
          setConnected(true);
          return;
        }
      } catch {}
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setData(JSON.parse(saved));
    }
    load();
  }, []);

  const saveToSupabase = useCallback(async (items: Disease[]) => {
    try {
      const rows = items.map((d) => ({ id: d.id, data: d, updated_at: new Date().toISOString() }));
      await supabase.from("content_diseases").upsert(rows);
      setConnected(true);
    } catch {}
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const filtered = data.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return d.name.toLowerCase().includes(q) || d.nameEn.toLowerCase().includes(q) || d.badge.toLowerCase().includes(q);
  });

  const openNew = () => {
    setEditItem(emptyDisease());
    setDialogOpen(true);
  };

  const openEdit = (d: Disease) => {
    setEditItem({ ...d });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!editItem) return;
    setData((prev) => {
      const idx = prev.findIndex((d) => d.id === editItem.id);
      let next: Disease[];
      if (idx >= 0) {
        next = [...prev];
        next[idx] = editItem;
      } else {
        next = [...prev, editItem];
      }
      saveToSupabase(next);
      return next;
    });
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    supabase.from("content_diseases").delete().eq("id", deleteId).then(() => {});
    setData((prev) => {
      const next = prev.filter((d) => d.id !== deleteId);
      return next;
    });
    setDeleteId(null);
  };

  return (
    <div className="max-w-5xl space-y-4">
      <AdminBanner connected={connected} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-800">疾患管理（{data.length}件）</h1>
        <Button onClick={openNew}>新規追加</Button>
      </div>

      <AIGeneratePanel
        type="disease"
        placeholderExamples={["酒さ性ざ瘡", "類天疱瘡", "多形性紅斑", "結節性痒疹", "皮膚筋炎"]}
        onGenerated={(results: GeneratedResult[]) => {
          const newItems: Disease[] = results
            .filter((r) => r.data)
            .map((r) => {
              const d = r.data as Record<string, unknown>;
              return {
                id: r.id,
                name: (d.name as string) ?? r.keyword,
                nameEn: (d.nameEn as string) ?? "",
                badge: (d.badge as string) ?? "",
                badgeColor: ((d.badgeColor as string) ?? "teal") as Disease["badgeColor"],
                description: (d.description as string) ?? "",
                cause: (d.cause as string) ?? "",
                treatment: (d.treatment as string) ?? "",
                patientExplanation: (d.patientExplanation as string) ?? "",
                keyPoints: (d.keyPoints as string[]) ?? [],
                relatedTreatments: (d.relatedTreatments as string[]) ?? [],
              };
            });
          setData((prev) => {
            const next = [...prev, ...newItems];
            saveToSupabase(next);
            return next;
          });
        }}
      />

      <input
        type="text"
        placeholder="疾患名・英語名・バッジで検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">ID</TableHead>
            <TableHead>名前</TableHead>
            <TableHead className="hidden sm:table-cell">英語名</TableHead>
            <TableHead className="w-[100px]">バッジ</TableHead>
            <TableHead className="w-[120px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-mono text-xs">{d.id}</TableCell>
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{d.nameEn}</TableCell>
              <TableCell className="text-xs">{d.badge}</TableCell>
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

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem && data.some((d) => d.id === editItem.id) ? "疾患を編集" : "新規疾患を追加"}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium">疾患名</span>
                  <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.name} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium">英語名</span>
                  <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.nameEn} onChange={(e) => setEditItem({ ...editItem, nameEn: e.target.value })} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-xs font-medium">バッジ</span>
                  <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.badge} onChange={(e) => setEditItem({ ...editItem, badge: e.target.value })} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-medium">バッジカラー</span>
                  <Select value={editItem.badgeColor} onValueChange={(v) => setEditItem({ ...editItem, badgeColor: v as Disease["badgeColor"] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {badgeColors.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">疾患概要</span>
                <Textarea value={editItem.description} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} rows={2} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">原因・誘因</span>
                <Textarea value={editItem.cause} onChange={(e) => setEditItem({ ...editItem, cause: e.target.value })} rows={2} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">主な治療法</span>
                <Textarea value={editItem.treatment} onChange={(e) => setEditItem({ ...editItem, treatment: e.target.value })} rows={2} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">患者説明例</span>
                <Textarea value={editItem.patientExplanation} onChange={(e) => setEditItem({ ...editItem, patientExplanation: e.target.value })} rows={2} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">重要ポイント（改行区切り）</span>
                <Textarea
                  value={editItem.keyPoints.join("\n")}
                  onChange={(e) => setEditItem({ ...editItem, keyPoints: e.target.value.split("\n").filter(Boolean) })}
                  rows={4}
                />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">関連施術（改行区切り）</span>
                <Textarea
                  value={editItem.relatedTreatments.join("\n")}
                  onChange={(e) => setEditItem({ ...editItem, relatedTreatments: e.target.value.split("\n").filter(Boolean) })}
                  rows={3}
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>疾患を削除しますか？</AlertDialogTitle>
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
