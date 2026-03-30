"use client";

import { useState, useEffect, useRef } from "react";
import { medicalFees as initialData, type MedicalFee, type FeeCategory } from "@/data/medical_fees";
import { getContent, saveContent, CONTENT_KEYS } from "@/lib/content-store";
import { AdminBanner } from "@/components/AdminBanner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

const feeCategories: FeeCategory[] = [
  "初診・再診",
  "医学管理",
  "検査",
  "処置",
  "手術",
  "皮膚科処置",
  "注射",
  "投薬",
];

function emptyItem(): MedicalFee {
  return {
    id: `fee_${Date.now()}`,
    code: "",
    name: "",
    points: 0,
    category: "初診・再診",
    description: "",
    notes: "",
    frequency: "",
  };
}

export default function AdminMedicalFeesPage() {
  const [data, setData] = useState<MedicalFee[]>(initialData);
  const [editItem, setEditItem] = useState<MedicalFee | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    getContent<MedicalFee>(CONTENT_KEYS.medicalFees, initialData).then((result) => {
      setData(result);
      setConnected(true);
    }).catch(() => {}).finally(() => { loaded.current = true; });
  }, []);

  const persistData = async (items: MedicalFee[]) => {
    setSaving(true);
    const ok = await saveContent(CONTENT_KEYS.medicalFees, items);
    setConnected(ok);
    setSaveMsg(ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
  };

  const filtered = data.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.code.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q)
    );
  });

  const openNew = () => {
    setEditItem(emptyItem());
    setDialogOpen(true);
  };

  const openEdit = (d: MedicalFee) => {
    setEditItem({ ...d });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!editItem) return;
    const idx = data.findIndex((d) => d.id === editItem.id);
    let newData: MedicalFee[];
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
    const newData = data.filter((d) => d.id !== deleteId);
    setData(newData);
    persistData(newData);
    setDeleteId(null);
  };

  const handleReset = () => {
    setData(initialData);
    persistData(initialData);
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
        <h1 className="text-xl font-bold text-slate-800">
          算定点数管理（{data.length}件）
        </h1>
        <div className="flex gap-2">
          <Link href="/medical-fees">
            <Button variant="outline" size="sm">
              スタッフページ
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            リセット
          </Button>
          <Button onClick={openNew}>新規追加</Button>
        </div>
      </div>

      <input
        type="text"
        placeholder="名称・コード・カテゴリで検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">コード</TableHead>
            <TableHead>名称</TableHead>
            <TableHead className="w-[80px]">点数</TableHead>
            <TableHead className="w-[120px] hidden sm:table-cell">カテゴリ</TableHead>
            <TableHead className="w-[120px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-mono text-xs">{d.code}</TableCell>
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell className="text-sm">{d.points}</TableCell>
              <TableCell className="hidden sm:table-cell">
                <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                  {d.category}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(d)}>
                    編集
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteId(d.id)}>
                    削除
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editItem && data.some((d) => d.id === editItem.id)
                ? "算定項目を編集"
                : "新規算定項目を追加"}
            </DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <Label className="text-xs font-medium">コード</Label>
                  <Input
                    value={editItem.code}
                    onChange={(e) => setEditItem({ ...editItem, code: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <Label className="text-xs font-medium">名称</Label>
                  <Input
                    value={editItem.name}
                    onChange={(e) => setEditItem({ ...editItem, name: e.target.value })}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <Label className="text-xs font-medium">点数</Label>
                  <Input
                    type="number"
                    value={editItem.points}
                    onChange={(e) =>
                      setEditItem({ ...editItem, points: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="space-y-1">
                  <Label className="text-xs font-medium">カテゴリ</Label>
                  <Select
                    value={editItem.category}
                    onValueChange={(v) =>
                      setEditItem({ ...editItem, category: v as FeeCategory })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {feeCategories.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">説明</Label>
                <Textarea
                  value={editItem.description}
                  onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
                  rows={2}
                />
              </label>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">備考</Label>
                <Textarea
                  value={editItem.notes ?? ""}
                  onChange={(e) => setEditItem({ ...editItem, notes: e.target.value })}
                  rows={2}
                />
              </label>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">算定頻度</Label>
                <Input
                  value={editItem.frequency ?? ""}
                  onChange={(e) => setEditItem({ ...editItem, frequency: e.target.value })}
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave} disabled={saving}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>算定項目を削除しますか？</AlertDialogTitle>
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
