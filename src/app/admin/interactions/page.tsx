"use client";

import { useState, useEffect } from "react";
import {
  drugInteractions as initialData,
  type DrugInteraction,
  type InteractionSeverity,
} from "@/data/interactions";
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

const STORAGE_KEY = "mk_interactions";

const severities: InteractionSeverity[] = ["contraindicated", "major", "moderate", "minor"];

const severityColors: Record<InteractionSeverity, string> = {
  contraindicated: "bg-red-100 text-red-800",
  major: "bg-orange-100 text-orange-800",
  moderate: "bg-yellow-100 text-yellow-800",
  minor: "bg-blue-100 text-blue-800",
};

const severityLabels: Record<InteractionSeverity, string> = {
  contraindicated: "禁忌",
  major: "重大",
  moderate: "中等度",
  minor: "軽度",
};

function emptyItem(): DrugInteraction {
  return {
    id: `int_${Date.now()}`,
    drug1: "",
    drug2: "",
    severity: "moderate",
    mechanism: "",
    effect: "",
    management: "",
  };
}

export default function AdminInteractionsPage() {
  const [data, setData] = useState<DrugInteraction[]>(initialData);
  const [editItem, setEditItem] = useState<DrugInteraction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) setData(JSON.parse(saved));
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const filtered = data.filter((d) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      d.drug1.toLowerCase().includes(q) ||
      d.drug2.toLowerCase().includes(q) ||
      severityLabels[d.severity].includes(q)
    );
  });

  const openNew = () => {
    setEditItem(emptyItem());
    setDialogOpen(true);
  };

  const openEdit = (d: DrugInteraction) => {
    setEditItem({ ...d });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!editItem) return;
    setData((prev) => {
      const idx = prev.findIndex((d) => d.id === editItem.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = editItem;
        return next;
      }
      return [...prev, editItem];
    });
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setData((prev) => prev.filter((d) => d.id !== deleteId));
    setDeleteId(null);
  };

  const handleReset = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setData(initialData);
  };

  return (
    <div className="max-w-5xl space-y-4">
      <AdminBanner connected={false} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-800">
          相互作用管理（{data.length}件）
        </h1>
        <div className="flex gap-2">
          <Link href="/interactions">
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
        placeholder="薬剤名・重大度で検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>薬剤1</TableHead>
            <TableHead>薬剤2</TableHead>
            <TableHead className="w-[100px]">重大度</TableHead>
            <TableHead className="w-[120px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium text-sm">{d.drug1}</TableCell>
              <TableCell className="text-sm">{d.drug2}</TableCell>
              <TableCell>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityColors[d.severity]}`}
                >
                  {severityLabels[d.severity]}
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
                ? "相互作用を編集"
                : "新規相互作用を追加"}
            </DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">薬剤1</Label>
                <Input
                  value={editItem.drug1}
                  onChange={(e) => setEditItem({ ...editItem, drug1: e.target.value })}
                />
              </label>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">薬剤2</Label>
                <Input
                  value={editItem.drug2}
                  onChange={(e) => setEditItem({ ...editItem, drug2: e.target.value })}
                />
              </label>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">重大度</Label>
                <Select
                  value={editItem.severity}
                  onValueChange={(v) =>
                    setEditItem({ ...editItem, severity: v as InteractionSeverity })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {severities.map((s) => (
                      <SelectItem key={s} value={s}>
                        {severityLabels[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">メカニズム</Label>
                <Textarea
                  value={editItem.mechanism}
                  onChange={(e) => setEditItem({ ...editItem, mechanism: e.target.value })}
                  rows={2}
                />
              </label>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">起こりうる副作用</Label>
                <Textarea
                  value={editItem.effect}
                  onChange={(e) => setEditItem({ ...editItem, effect: e.target.value })}
                  rows={2}
                />
              </label>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">対処法</Label>
                <Textarea
                  value={editItem.management}
                  onChange={(e) => setEditItem({ ...editItem, management: e.target.value })}
                  rows={2}
                />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              キャンセル
            </Button>
            <Button onClick={handleSave}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>相互作用を削除しますか？</AlertDialogTitle>
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
