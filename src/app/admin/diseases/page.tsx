"use client";

import { useState, useEffect, useRef } from "react";
import { diseases as initialDiseases, type Disease } from "@/data/diseases";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const badgeColors: Disease["badgeColor"][] = ["blue", "teal", "amber", "red", "purple"];

const priorityColors: Record<number, string> = {
  1: "bg-red-100 text-red-700 border-red-200",
  2: "bg-orange-100 text-orange-700 border-orange-200",
  3: "bg-blue-100 text-blue-700 border-blue-200",
  4: "bg-gray-100 text-gray-600 border-gray-200",
};
const priorityLabels: Record<number, string> = { 1: "必須", 2: "重要", 3: "標準", 4: "参考" };

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
    priority: 3,
  };
}

export default function AdminDiseasesPage() {
  const [data, setData] = useState<Disease[]>(initialDiseases);
  const [editItem, setEditItem] = useState<Disease | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    getContent<Disease>(CONTENT_KEYS.diseases, initialDiseases).then((result) => {
      setData(result);
      setConnected(true);
    }).catch(() => {}).finally(() => { loaded.current = true; });
  }, []);

  const persistData = async (items: Disease[]) => {
    setSaving(true);
    const ok = await saveContent(CONTENT_KEYS.diseases, items);
    setConnected(ok);
    setSaveMsg(ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(data.map((d) => d.id)));
  const clearSelection = () => setSelectedIds(new Set());

  // 一括優先度変更
  const handleBulkPriorityChange = async (priority: number) => {
    const count = selectedIds.size;
    if (!confirm(`選択した${count}件の優先度を「${priorityLabels[priority]}」に変更しますか？`)) return;
    const updated = data.map((d) =>
      selectedIds.has(d.id) ? { ...d, priority } : d
    );
    setData(updated);
    await persistData(updated);
    clearSelection();
  };

  // Gemini修正案の一括適用
  const handleApplyGeminiChanges = async (changes: Record<string, Record<string, string>>) => {
    const updated = data.map((d) => {
      if (changes[d.id]) return { ...d, ...changes[d.id] };
      return d;
    });
    setData(updated);
    await persistData(updated);
  };

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
    const idx = data.findIndex((d) => d.id === editItem.id);
    let newData: Disease[];
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
        <h1 className="text-xl font-bold text-slate-800">疾患管理（{data.length}件）</h1>
        <Button onClick={openNew}>新規追加</Button>
      </div>

      <AIGeneratePanel
        type="disease"
        placeholderExamples={["類天疱瘡", "環状肉芽腫", "リベド血管炎", "皮膚サルコイドーシス", "壊疽性膿皮症"]}
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
                priority: (d.priority as number) ?? 3,
              };
            });
          const newData = [...data, ...newItems];
          setData(newData);
          persistData(newData);
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
            <TableHead className="w-8 px-2">
              <input type="checkbox" checked={selectedIds.size === data.length && data.length > 0} onChange={(e) => e.target.checked ? selectAll() : clearSelection()} className="rounded" />
            </TableHead>
            <TableHead className="w-[60px]">優先度</TableHead>
            <TableHead>名前</TableHead>
            <TableHead className="hidden sm:table-cell">英語名</TableHead>
            <TableHead className="w-[100px]">バッジ</TableHead>
            <TableHead className="w-[120px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="px-2">
                <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggleSelect(d.id)} onClick={(e) => e.stopPropagation()} className="rounded" />
              </TableCell>
              <TableCell>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium border ${priorityColors[d.priority ?? 3]}`}>
                  {priorityLabels[d.priority ?? 3]}
                </span>
              </TableCell>
              <TableCell className="font-medium">{d.name}</TableCell>
              <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{d.nameEn}</TableCell>
              <TableCell className="text-xs">{d.badge}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(d)}>編集</Button>
                  <GeminiVerifyButton contentType="disease" itemName={d.name} currentData={d} />
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
              <div>
                <span className="text-xs font-medium block mb-1">優先度</span>
                <select
                  className="w-full rounded-md border px-3 py-1.5 text-sm"
                  value={editItem.priority ?? 3}
                  onChange={(e) => setEditItem({ ...editItem, priority: Number(e.target.value) })}
                >
                  <option value={1}>1 - 必須（毎日遭遇・最重要）</option>
                  <option value={2}>2 - 重要（頻繁に遭遇）</option>
                  <option value={3}>3 - 標準（時々遭遇）</option>
                  <option value={4}>4 - 参考（知識として重要）</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">スタッフページでの表示順位・優先度バッジに反映されます</p>
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
            <Button onClick={handleSave} disabled={saving}>保存</Button>
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

      <GeminiBatchVerify
        contentType="disease"
        selectedItems={data.filter((d) => selectedIds.has(d.id)).map((d) => ({ id: d.id, name: d.name, data: d as unknown as Record<string, unknown> }))}
        onClear={clearSelection}
        onApplyChanges={handleApplyGeminiChanges}
        extraActions={
          <div className="flex items-center gap-2">
            <label className="text-xs text-white/70">優先度を一括変更:</label>
            <select
              className="text-sm px-2 py-1.5 rounded bg-white/10 border border-white/20 text-white"
              defaultValue=""
              onChange={(e) => {
                const p = Number(e.target.value);
                if (!p) return;
                handleBulkPriorityChange(p);
                e.target.value = "";
              }}
            >
              <option value="">選択...</option>
              <option value="1">1 - 必須（毎日遭遇）</option>
              <option value="2">2 - 重要（頻繁に遭遇）</option>
              <option value="3">3 - 標準（時々遭遇）</option>
              <option value="4">4 - 参考（知識として）</option>
            </select>
          </div>
        }
      />
    </div>
  );
}
