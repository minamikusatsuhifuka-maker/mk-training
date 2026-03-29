"use client";

import { useState, useEffect } from "react";
import { contraindications as initialData, type Contraindication, type Severity } from "@/data/contraindications";
import { AdminBanner } from "@/components/AdminBanner";
import { AIGeneratePanel, type GeneratedResult } from "@/components/admin/AIGeneratePanel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

const STORAGE_KEY = "admin_contraindications";

const severityOptions: { value: Severity; label: string; color: string }[] = [
  { value: "critical", label: "禁忌（critical）", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "caution", label: "注意（caution）", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "note", label: "備考（note）", color: "bg-blue-100 text-blue-700 border-blue-200" },
];

const severityColor: Record<Severity, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  caution: "bg-amber-100 text-amber-700 border-amber-200",
  note: "bg-blue-100 text-blue-700 border-blue-200",
};

function emptyItem(): Contraindication {
  return { id: `new_${Date.now()}`, drug: "", disease: "", detail: "", severity: "caution" };
}

export default function AdminContraindicationsPage() {
  const [data, setData] = useState<Contraindication[]>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    }
    return initialData;
  });
  const [editItem, setEditItem] = useState<Contraindication | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const openNew = () => { setEditItem(emptyItem()); setDialogOpen(true); };
  const openEdit = (c: Contraindication) => { setEditItem({ ...c }); setDialogOpen(true); };

  const handleSave = () => {
    if (!editItem) return;
    setData((prev) => {
      const idx = prev.findIndex((c) => c.id === editItem.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = editItem; return next; }
      return [...prev, editItem];
    });
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setData((prev) => prev.filter((c) => c.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <div className="max-w-4xl space-y-4">
      <AdminBanner />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-800">禁忌管理（{data.length}件）</h1>
        <Button onClick={openNew}>新規追加</Button>
      </div>

      <AIGeneratePanel
        type="contraindication"
        placeholderExamples={["ネオーラル（シクロスポリン）", "デルモベート顔面長期使用", "ボトックス多汗症", "ベセルナクリーム"]}
        onGenerated={(results: GeneratedResult[]) => {
          const newItems: Contraindication[] = results
            .filter((r) => r.data)
            .map((r) => {
              const d = r.data as Record<string, string>;
              return {
                id: r.id,
                drug: d.drug ?? r.keyword,
                disease: d.disease ?? "",
                detail: d.detail ?? "",
                severity: (d.severity ?? "caution") as Severity,
              };
            });
          setData((prev) => [...prev, ...newItems]);
        }}
      />

      <div className="space-y-3">
        {data.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={severityColor[c.severity]}>
                    {c.severity}
                  </Badge>
                  <span className="font-medium text-sm">{c.drug}</span>
                </div>
                <p className="text-sm text-muted-foreground">対象: {c.disease}</p>
                <p className="text-xs text-muted-foreground">{c.detail}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button variant="outline" size="sm" onClick={() => openEdit(c)}>編集</Button>
                <Button variant="destructive" size="sm" onClick={() => setDeleteId(c.id)}>削除</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem && data.some((c) => c.id === editItem.id) ? "禁忌を編集" : "新規禁忌を追加"}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <label className="space-y-1 block">
                <span className="text-xs font-medium">薬剤・施術</span>
                <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.drug} onChange={(e) => setEditItem({ ...editItem, drug: e.target.value })} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">対象疾患・状態</span>
                <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={editItem.disease} onChange={(e) => setEditItem({ ...editItem, disease: e.target.value })} />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">重要度</span>
                <Select value={editItem.severity} onValueChange={(v) => setEditItem({ ...editItem, severity: v as Severity })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {severityOptions.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">詳細</span>
                <Textarea value={editItem.detail} onChange={(e) => setEditItem({ ...editItem, detail: e.target.value })} rows={4} />
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
            <AlertDialogTitle>禁忌を削除しますか？</AlertDialogTitle>
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
