"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { skincareItems as initialData, type SkincareItem } from "@/data/skincare";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const pregnancyBadge: Record<
  SkincareItem["pregnancySafety"],
  { label: string; className: string }
> = {
  safe: { label: "安全", className: "bg-green-100 text-green-800" },
  caution: { label: "注意", className: "bg-amber-100 text-amber-800" },
  avoid: { label: "回避", className: "bg-red-100 text-red-800" },
};

function emptyItem(): SkincareItem {
  return {
    id: `new_${Date.now()}`,
    name: "",
    brand: "",
    type: "",
    tagline: "",
    description: "",
    keyIngredients: [],
    howToUse: "",
    targets: [],
    caution: "",
    pregnancySafety: "caution",
    pregnancyNote: "",
  };
}

export default function AdminSkincarePage() {
  const [data, setData] = useState<SkincareItem[]>(initialData);
  const [editItem, setEditItem] = useState<SkincareItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    getContent<SkincareItem>(CONTENT_KEYS.skincare, initialData).then((result) => {
      setData(result);
      setConnected(true);
    }).catch(() => {}).finally(() => { loaded.current = true; });
  }, []);

  const persistData = async (items: SkincareItem[]) => {
    setSaving(true);
    const ok = await saveContent(CONTENT_KEYS.skincare, items);
    setConnected(ok);
    setSaveMsg(ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
  };

  const openNew = () => {
    setEditItem(emptyItem());
    setDialogOpen(true);
  };
  const openEdit = (item: SkincareItem) => {
    setEditItem({ ...item, keyIngredients: item.keyIngredients.map((k) => ({ ...k })), targets: [...item.targets] });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!editItem) return;
    const idx = data.findIndex((d) => d.id === editItem.id);
    let newData: SkincareItem[];
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

  const ingredientsToText = (ingredients: { name: string; effect: string }[]) =>
    ingredients.map((i) => `${i.name}|${i.effect}`).join("\n");

  const textToIngredients = (text: string): { name: string; effect: string }[] =>
    text
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const [name, effect] = line.split("|");
        return { name: name?.trim() ?? "", effect: effect?.trim() ?? "" };
      });

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
        <h1 className="text-xl font-bold text-slate-800">スキンケア管理（{data.length}件）</h1>
        <div className="flex gap-2">
          <Link href="/skincare">
            <Button variant="outline" size="sm">スタッフ画面を見る</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleReset}>リセット</Button>
          <Button onClick={openNew}>新規追加</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>製品名</TableHead>
            <TableHead className="w-[120px]">ブランド</TableHead>
            <TableHead className="w-[120px]">タイプ</TableHead>
            <TableHead className="w-[80px]">妊娠安全性</TableHead>
            <TableHead className="w-[120px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{item.brand ?? "-"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{item.type}</TableCell>
              <TableCell>
                <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${pregnancyBadge[item.pregnancySafety].className}`}>
                  {pregnancyBadge[item.pregnancySafety].label}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(item)}>編集</Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteId(item.id)}>削除</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Edit / New Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editItem && data.some((d) => d.id === editItem.id) ? "スキンケア製品を編集" : "新規スキンケア製品を追加"}
            </DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">製品名</Label>
                  <Input value={editItem.name} onChange={(e) => setEditItem({ ...editItem, name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">ブランド</Label>
                  <Input value={editItem.brand ?? ""} onChange={(e) => setEditItem({ ...editItem, brand: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">タイプ</Label>
                  <Input value={editItem.type} onChange={(e) => setEditItem({ ...editItem, type: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">妊娠安全性</Label>
                  <Select
                    value={editItem.pregnancySafety}
                    onValueChange={(v) => setEditItem({ ...editItem, pregnancySafety: v as SkincareItem["pregnancySafety"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="safe">安全 (safe)</SelectItem>
                      <SelectItem value="caution">注意 (caution)</SelectItem>
                      <SelectItem value="avoid">回避 (avoid)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">タグライン</Label>
                <Input value={editItem.tagline} onChange={(e) => setEditItem({ ...editItem, tagline: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">説明</Label>
                <Textarea
                  value={editItem.description}
                  onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">主要成分（1行1成分、「成分名|効果」形式）</Label>
                <Textarea
                  value={ingredientsToText(editItem.keyIngredients)}
                  onChange={(e) => setEditItem({ ...editItem, keyIngredients: textToIngredients(e.target.value) })}
                  rows={4}
                  placeholder={"トレチノイン|表皮ターンオーバー促進\nハイドロキノン 4%|メラニン生成抑制"}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">使い方</Label>
                <Textarea
                  value={editItem.howToUse}
                  onChange={(e) => setEditItem({ ...editItem, howToUse: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">対象（カンマ区切り）</Label>
                <Input
                  value={editItem.targets.join(", ")}
                  onChange={(e) => setEditItem({ ...editItem, targets: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">注意事項</Label>
                <Textarea
                  value={editItem.caution}
                  onChange={(e) => setEditItem({ ...editItem, caution: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">妊娠時の注意事項</Label>
                <Textarea
                  value={editItem.pregnancyNote}
                  onChange={(e) => setEditItem({ ...editItem, pregnancyNote: e.target.value })}
                  rows={2}
                />
              </div>
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
            <AlertDialogTitle>スキンケア製品を削除しますか？</AlertDialogTitle>
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
