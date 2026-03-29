"use client";

import { useState, useEffect } from "react";
import {
  pregnancyDrugs as initialData,
  type PregnancyDrug,
  type SafetyLevel,
} from "@/data/pregnancy";
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

const STORAGE_KEY = "mk_pregnancy_drugs";

const safetyLevels: SafetyLevel[] = ["safe", "caution", "avoid", "contraindicated"];

const safetyColors: Record<SafetyLevel, string> = {
  safe: "bg-green-100 text-green-800",
  caution: "bg-amber-100 text-amber-800",
  avoid: "bg-red-100 text-red-800",
  contraindicated: "bg-red-200 text-red-900",
};

const safetyLabels: Record<SafetyLevel, string> = {
  safe: "安全",
  caution: "注意",
  avoid: "回避",
  contraindicated: "禁忌",
};

function emptyItem(): PregnancyDrug {
  return {
    id: `preg_${Date.now()}`,
    name: "",
    genericName: "",
    category: "",
    pregnancy: "caution",
    pregnancyNote: "",
    lactation: "caution",
    lactationNote: "",
    evidence: "",
  };
}

export default function AdminPregnancyPage() {
  const [data, setData] = useState<PregnancyDrug[]>(initialData);
  const [editItem, setEditItem] = useState<PregnancyDrug | null>(null);
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
      d.name.toLowerCase().includes(q) ||
      d.genericName.toLowerCase().includes(q) ||
      d.category.toLowerCase().includes(q)
    );
  });

  const openNew = () => {
    setEditItem(emptyItem());
    setDialogOpen(true);
  };

  const openEdit = (d: PregnancyDrug) => {
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
          妊娠・授乳薬剤管理（{data.length}件）
        </h1>
        <div className="flex gap-2">
          <Link href="/pregnancy">
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
        placeholder="薬品名・一般名・カテゴリで検索..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-400"
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>薬品名</TableHead>
            <TableHead className="hidden sm:table-cell">一般名</TableHead>
            <TableHead className="w-[120px] hidden md:table-cell">カテゴリ</TableHead>
            <TableHead className="w-[80px]">妊娠中</TableHead>
            <TableHead className="w-[80px]">授乳中</TableHead>
            <TableHead className="w-[120px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium text-sm">{d.name}</TableCell>
              <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                {d.genericName}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <span className="text-xs bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                  {d.category}
                </span>
              </TableCell>
              <TableCell>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${safetyColors[d.pregnancy]}`}
                >
                  {safetyLabels[d.pregnancy]}
                </span>
              </TableCell>
              <TableCell>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${safetyColors[d.lactation]}`}
                >
                  {safetyLabels[d.lactation]}
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
                ? "薬剤を編集"
                : "新規薬剤を追加"}
            </DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <Label className="text-xs font-medium">薬品名</Label>
                  <Input
                    value={editItem.name}
                    onChange={(e) => setEditItem({ ...editItem, name: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <Label className="text-xs font-medium">一般名</Label>
                  <Input
                    value={editItem.genericName}
                    onChange={(e) =>
                      setEditItem({ ...editItem, genericName: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">カテゴリ</Label>
                <Input
                  value={editItem.category}
                  onChange={(e) => setEditItem({ ...editItem, category: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <Label className="text-xs font-medium">妊娠中</Label>
                  <Select
                    value={editItem.pregnancy}
                    onValueChange={(v) =>
                      setEditItem({ ...editItem, pregnancy: v as SafetyLevel })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {safetyLevels.map((s) => (
                        <SelectItem key={s} value={s}>
                          {safetyLabels[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1">
                  <Label className="text-xs font-medium">授乳中</Label>
                  <Select
                    value={editItem.lactation}
                    onValueChange={(v) =>
                      setEditItem({ ...editItem, lactation: v as SafetyLevel })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {safetyLevels.map((s) => (
                        <SelectItem key={s} value={s}>
                          {safetyLabels[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">妊娠中の注意点</Label>
                <Textarea
                  value={editItem.pregnancyNote}
                  onChange={(e) =>
                    setEditItem({ ...editItem, pregnancyNote: e.target.value })
                  }
                  rows={2}
                />
              </label>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">授乳中の注意点</Label>
                <Textarea
                  value={editItem.lactationNote}
                  onChange={(e) =>
                    setEditItem({ ...editItem, lactationNote: e.target.value })
                  }
                  rows={2}
                />
              </label>
              <label className="space-y-1 block">
                <Label className="text-xs font-medium">エビデンス</Label>
                <Input
                  value={editItem.evidence ?? ""}
                  onChange={(e) => setEditItem({ ...editItem, evidence: e.target.value })}
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
