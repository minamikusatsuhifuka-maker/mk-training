"use client";

import { useState, useEffect, useRef } from "react";
import { contraindications as initialData, type Contraindication, type Severity } from "@/data/contraindications";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
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
import { GeminiVerifyButton } from "@/components/admin/GeminiVerifyButton";
import { GeminiBatchVerify } from "@/components/admin/GeminiBatchVerify";

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
  const [data, setData] = useState<Contraindication[]>(initialData);
  const [editItem, setEditItem] = useState<Contraindication | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const loaded = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const selectAll = () => setSelectedIds(new Set(data.map((c) => c.id)));
  const clearSelection = () => setSelectedIds(new Set());

  useEffect(() => {
    getContent<Contraindication>(CONTENT_KEYS.contraindications, initialData).then((result) => {
      setData(result);
      setConnected(true);
    }).catch(() => {}).finally(() => { loaded.current = true; });
  }, []);

  const persistData = async (items: Contraindication[]) => {
    setSaving(true);
    const ok = await saveContent(CONTENT_KEYS.contraindications, items);
    setConnected(ok);
    setSaveMsg(ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
  };

  const openNew = () => { setEditItem(emptyItem()); setDialogOpen(true); };
  const openEdit = (c: Contraindication) => { setEditItem({ ...c }); setDialogOpen(true); };

  const handleSave = () => {
    if (!editItem) return;
    const idx = data.findIndex((c) => c.id === editItem.id);
    let newData: Contraindication[];
    if (idx >= 0) {
      newData = [...data];
      newData[idx] = editItem;
    } else {
      newData = [...data, editItem];
    }
    setData(newData);
    persistData(newData);
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const newData = data.filter((c) => c.id !== deleteId);
    setData(newData);
    persistData(newData);
    setDeleteId(null);
  };

  return (
    <div className="max-w-4xl space-y-4">
      <AdminBanner connected={connected} />
      {saveMsg && (
        <div className={`rounded-md px-4 py-2 text-sm ${saveMsg.startsWith("保存しました") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          {saveMsg}
        </div>
      )}
      {saving && <div className="text-sm text-muted-foreground animate-pulse">保存中...</div>}
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
          const newData = [...data, ...newItems];
          setData(newData);
          persistData(newData);
        }}
      />

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={selectedIds.size === data.length && data.length > 0} onChange={(e) => e.target.checked ? selectAll() : clearSelection()} className="rounded" />
        <span>全選択</span>
      </div>
      <div className="space-y-3">
        {data.map((c) => (
          <Card key={c.id} className="p-4">
            <div className="flex items-start gap-3">
              <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleSelect(c.id)} onClick={(e) => e.stopPropagation()} className="rounded mt-1" />
              <div className="flex items-start justify-between gap-3 flex-1">
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
                  <GeminiVerifyButton contentType="contraindication" itemName={c.drug} currentData={c} />
                  <Button variant="destructive" size="sm" onClick={() => setDeleteId(c.id)}>削除</Button>
                </div>
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
            <Button onClick={handleSave} disabled={saving}>保存</Button>
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
      <GeminiBatchVerify contentType="contraindication" selectedItems={data.filter((c) => selectedIds.has(c.id)).map((c) => ({ id: c.id, name: c.drug, data: c }))} onClear={clearSelection} />
    </div>
  );
}
