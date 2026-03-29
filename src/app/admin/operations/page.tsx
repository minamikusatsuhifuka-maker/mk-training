"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  receptionSections as initialReception,
  clerkSections as initialClerk,
  counselorSections as initialCounselor,
  type CheckSection,
  type CheckItem,
} from "@/data/operations";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STORAGE_KEY = "mk_operations";

type RoleKey = "reception" | "clerk" | "counselor";

type OperationsData = {
  reception: CheckSection[];
  clerk: CheckSection[];
  counselor: CheckSection[];
};

const roleLabels: Record<RoleKey, string> = {
  reception: "受付",
  clerk: "クラーク",
  counselor: "カウンセラー",
};

const initialDataMap: OperationsData = {
  reception: initialReception,
  clerk: initialClerk,
  counselor: initialCounselor,
};

function deepCloneSections(sections: CheckSection[]): CheckSection[] {
  return sections.map((s) => ({
    title: s.title,
    items: s.items.map((item) => ({ ...item })),
  }));
}

function deepCloneData(data: OperationsData): OperationsData {
  return {
    reception: deepCloneSections(data.reception),
    clerk: deepCloneSections(data.clerk),
    counselor: deepCloneSections(data.counselor),
  };
}

export default function AdminOperationsPage() {
  const [data, setData] = useState<OperationsData>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    }
    return deepCloneData(initialDataMap);
  });
  const [activeRole, setActiveRole] = useState<RoleKey>("reception");

  // Edit section dialog
  const [editSectionIndex, setEditSectionIndex] = useState<number | null>(null);
  const [editSection, setEditSection] = useState<CheckSection | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Delete section
  const [deleteSectionIndex, setDeleteSectionIndex] = useState<number | null>(null);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const sections = data[activeRole];

  const openEditSection = (index: number) => {
    const section = sections[index];
    setEditSectionIndex(index);
    setEditSection({
      title: section.title,
      items: section.items.map((item) => ({ ...item })),
    });
    setDialogOpen(true);
  };

  const openNewSection = () => {
    setEditSectionIndex(null);
    setEditSection({ title: "", items: [] });
    setDialogOpen(true);
  };

  const handleSaveSection = () => {
    if (!editSection) return;
    setData((prev) => {
      const next = deepCloneData(prev);
      const roleSections = next[activeRole];
      if (editSectionIndex !== null && editSectionIndex < roleSections.length) {
        roleSections[editSectionIndex] = editSection;
      } else {
        roleSections.push(editSection);
      }
      return next;
    });
    setDialogOpen(false);
    setEditSection(null);
    setEditSectionIndex(null);
  };

  const handleDeleteSection = () => {
    if (deleteSectionIndex === null) return;
    setData((prev) => {
      const next = deepCloneData(prev);
      next[activeRole].splice(deleteSectionIndex, 1);
      return next;
    });
    setDeleteSectionIndex(null);
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    setData((prev) => {
      const next = deepCloneData(prev);
      const arr = next[activeRole];
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return next;
    });
  };

  // --- Item helpers inside edit dialog ---
  const updateItem = (index: number, patch: Partial<CheckItem>) => {
    if (!editSection) return;
    const items = [...editSection.items];
    items[index] = { ...items[index], ...patch };
    setEditSection({ ...editSection, items });
  };

  const addItem = () => {
    if (!editSection) return;
    setEditSection({
      ...editSection,
      items: [
        ...editSection.items,
        { id: `item_${Date.now()}`, text: "", note: "" },
      ],
    });
  };

  const removeItem = (index: number) => {
    if (!editSection) return;
    setEditSection({
      ...editSection,
      items: editSection.items.filter((_, i) => i !== index),
    });
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    if (!editSection) return;
    const target = index + direction;
    if (target < 0 || target >= editSection.items.length) return;
    const items = [...editSection.items];
    [items[index], items[target]] = [items[target], items[index]];
    setEditSection({ ...editSection, items });
  };

  const handleReset = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setData(deepCloneData(initialDataMap));
  };

  const totalItems = (role: RoleKey) =>
    data[role].reduce((sum, s) => sum + s.items.length, 0);

  return (
    <div className="max-w-5xl space-y-4">
      <AdminBanner connected={false} />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-800">業務チェック管理</h1>
        <div className="flex gap-2">
          <Link href="/reception">
            <Button variant="outline" size="sm">スタッフ画面を見る</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleReset}>リセット</Button>
        </div>
      </div>

      <Tabs value={activeRole} onValueChange={(v) => setActiveRole(v as RoleKey)}>
        <TabsList className="w-full justify-start">
          {(Object.keys(roleLabels) as RoleKey[]).map((key) => (
            <TabsTrigger key={key} value={key} className="text-xs">
              {roleLabels[key]}（{data[key].length}セクション / {totalItems(key)}項目）
            </TabsTrigger>
          ))}
        </TabsList>

        {(Object.keys(roleLabels) as RoleKey[]).map((role) => (
          <TabsContent key={role} value={role} className="space-y-4 mt-3">
            {data[role].map((section, sIdx) => (
              <div key={sIdx} className="rounded-lg border bg-white p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">{section.title}</h3>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveSection(sIdx, -1)}
                      disabled={sIdx === 0}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => moveSection(sIdx, 1)}
                      disabled={sIdx === data[role].length - 1}
                    >
                      ↓
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openEditSection(sIdx)}>編集</Button>
                    <Button variant="destructive" size="sm" onClick={() => setDeleteSectionIndex(sIdx)}>削除</Button>
                  </div>
                </div>
                <ul className="space-y-1">
                  {section.items.map((item, iIdx) => (
                    <li key={item.id || iIdx} className="text-sm text-slate-700 flex items-start gap-2">
                      <span className="text-muted-foreground shrink-0">{iIdx + 1}.</span>
                      <div>
                        <span>{item.text}</span>
                        {item.note && (
                          <span className="ml-2 text-xs text-muted-foreground">({item.note})</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <Button variant="outline" onClick={openNewSection}>+ セクションを追加</Button>
          </TabsContent>
        ))}
      </Tabs>

      {/* Edit Section Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editSectionIndex !== null ? "セクションを編集" : "新規セクションを追加"}
            </DialogTitle>
          </DialogHeader>
          {editSection && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">セクションタイトル</Label>
                <Input
                  value={editSection.title}
                  onChange={(e) => setEditSection({ ...editSection, title: e.target.value })}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">チェック項目（{editSection.items.length}）</span>
                  <Button variant="outline" size="sm" onClick={addItem}>+ 項目を追加</Button>
                </div>
                {editSection.items.map((item, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">項目 {i + 1}</span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => moveItem(i, -1)}
                          disabled={i === 0}
                        >
                          ↑
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => moveItem(i, 1)}
                          disabled={i === editSection.items.length - 1}
                        >
                          ↓
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => removeItem(i)}>削除</Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">テキスト</Label>
                      <Input
                        value={item.text}
                        onChange={(e) => updateItem(i, { text: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">備考</Label>
                      <Textarea
                        value={item.note}
                        onChange={(e) => updateItem(i, { note: e.target.value })}
                        rows={2}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSaveSection}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Section Confirm */}
      <AlertDialog open={deleteSectionIndex !== null} onOpenChange={(open) => !open && setDeleteSectionIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>セクションを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>このセクション内の全項目も削除されます。この操作は元に戻せません。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSection}>削除する</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
