"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  counselingGuides as initialData,
  type CounselingGuide,
  type ClearCheckItem,
  type TalkScript,
} from "@/data/counseling";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const categoryOptions: ClearCheckItem["category"][] = [
  "contraindication",
  "history",
  "consent",
  "preparation",
];

const categoryLabels: Record<ClearCheckItem["category"], string> = {
  contraindication: "禁忌",
  history: "既往",
  consent: "同意",
  preparation: "準備",
};

function emptyGuide(): CounselingGuide {
  return {
    id: `new_${Date.now()}`,
    treatment: "",
    clearChecks: [],
    talkScripts: [],
    commonQuestions: [],
  };
}

function emptyCheck(): ClearCheckItem {
  return {
    id: `chk_${Date.now()}`,
    text: "",
    category: "contraindication",
    required: false,
  };
}

function emptyScript(): TalkScript {
  return { phase: "", script: "" };
}

function emptyQA(): { question: string; answer: string } {
  return { question: "", answer: "" };
}

export default function AdminCounselingPage() {
  const [data, setData] = useState<CounselingGuide[]>(initialData);
  const [editItem, setEditItem] = useState<CounselingGuide | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dialogTab, setDialogTab] = useState("checks");
  const [connected, setConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    getContent<CounselingGuide>(CONTENT_KEYS.counseling, initialData).then((result) => {
      setData(result);
      setConnected(true);
    }).catch(() => {}).finally(() => { loaded.current = true; });
  }, []);

  const persistData = async (items: CounselingGuide[]) => {
    setSaving(true);
    const ok = await saveContent(CONTENT_KEYS.counseling, items);
    setConnected(ok);
    setSaveMsg(ok ? "保存しました（全スタッフに反映されます）" : "ローカルに保存しました（Supabase接続エラー）");
    setTimeout(() => setSaveMsg(null), 3000);
    setSaving(false);
  };

  const openNew = () => {
    setEditItem(emptyGuide());
    setDialogTab("checks");
    setDialogOpen(true);
  };

  const openEdit = (guide: CounselingGuide) => {
    setEditItem({
      ...guide,
      clearChecks: guide.clearChecks.map((c) => ({ ...c })),
      talkScripts: guide.talkScripts.map((s) => ({ ...s })),
      commonQuestions: guide.commonQuestions.map((q) => ({ ...q })),
    });
    setDialogTab("checks");
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!editItem) return;
    const idx = data.findIndex((d) => d.id === editItem.id);
    let newData: CounselingGuide[];
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

  // --- Check items helpers ---
  const updateCheck = (index: number, patch: Partial<ClearCheckItem>) => {
    if (!editItem) return;
    const checks = [...editItem.clearChecks];
    checks[index] = { ...checks[index], ...patch };
    setEditItem({ ...editItem, clearChecks: checks });
  };
  const addCheck = () => {
    if (!editItem) return;
    setEditItem({ ...editItem, clearChecks: [...editItem.clearChecks, emptyCheck()] });
  };
  const removeCheck = (index: number) => {
    if (!editItem) return;
    setEditItem({ ...editItem, clearChecks: editItem.clearChecks.filter((_, i) => i !== index) });
  };

  // --- Talk scripts helpers ---
  const updateScript = (index: number, patch: Partial<TalkScript>) => {
    if (!editItem) return;
    const scripts = [...editItem.talkScripts];
    scripts[index] = { ...scripts[index], ...patch };
    setEditItem({ ...editItem, talkScripts: scripts });
  };
  const addScript = () => {
    if (!editItem) return;
    setEditItem({ ...editItem, talkScripts: [...editItem.talkScripts, emptyScript()] });
  };
  const removeScript = (index: number) => {
    if (!editItem) return;
    setEditItem({ ...editItem, talkScripts: editItem.talkScripts.filter((_, i) => i !== index) });
  };

  // --- Q&A helpers ---
  const updateQA = (index: number, patch: Partial<{ question: string; answer: string }>) => {
    if (!editItem) return;
    const qas = [...editItem.commonQuestions];
    qas[index] = { ...qas[index], ...patch };
    setEditItem({ ...editItem, commonQuestions: qas });
  };
  const addQA = () => {
    if (!editItem) return;
    setEditItem({ ...editItem, commonQuestions: [...editItem.commonQuestions, emptyQA()] });
  };
  const removeQA = (index: number) => {
    if (!editItem) return;
    setEditItem({ ...editItem, commonQuestions: editItem.commonQuestions.filter((_, i) => i !== index) });
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
        <h1 className="text-xl font-bold text-slate-800">カウンセリング管理（{data.length}件）</h1>
        <div className="flex gap-2">
          <Link href="/counseling">
            <Button variant="outline" size="sm">スタッフ画面を見る</Button>
          </Link>
          <Button variant="outline" size="sm" onClick={handleReset}>リセット</Button>
          <Button onClick={openNew}>新規追加</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>施術名</TableHead>
            <TableHead className="w-[120px]">チェック項目数</TableHead>
            <TableHead className="w-[120px]">スクリプト数</TableHead>
            <TableHead className="w-[100px]">Q&A数</TableHead>
            <TableHead className="w-[120px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((guide) => (
            <TableRow key={guide.id}>
              <TableCell className="font-medium">{guide.treatment}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{guide.clearChecks.length}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{guide.talkScripts.length}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{guide.commonQuestions.length}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(guide)}>編集</Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteId(guide.id)}>削除</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Edit / New Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editItem && data.some((d) => d.id === editItem.id) ? "カウンセリングガイドを編集" : "新規カウンセリングガイドを追加"}
            </DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs">施術名</Label>
                <Input
                  value={editItem.treatment}
                  onChange={(e) => setEditItem({ ...editItem, treatment: e.target.value })}
                />
              </div>

              <Tabs value={dialogTab} onValueChange={setDialogTab}>
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="checks" className="text-xs">
                    チェック項目（{editItem.clearChecks.length}）
                  </TabsTrigger>
                  <TabsTrigger value="scripts" className="text-xs">
                    トークスクリプト（{editItem.talkScripts.length}）
                  </TabsTrigger>
                  <TabsTrigger value="qa" className="text-xs">
                    Q&A（{editItem.commonQuestions.length}）
                  </TabsTrigger>
                </TabsList>

                {/* Check items tab */}
                <TabsContent value="checks" className="space-y-3 mt-3">
                  {editItem.clearChecks.map((check, i) => (
                    <div key={i} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">項目 {i + 1}</span>
                        <Button variant="destructive" size="sm" onClick={() => removeCheck(i)}>削除</Button>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">テキスト</Label>
                        <Input
                          value={check.text}
                          onChange={(e) => updateCheck(i, { text: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs">カテゴリ</Label>
                          <Select
                            value={check.category}
                            onValueChange={(v) => updateCheck(i, { category: v as ClearCheckItem["category"] })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {categoryOptions.map((c) => (
                                <SelectItem key={c} value={c}>{categoryLabels[c]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-end gap-2 pb-1">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={check.required}
                              onChange={(e) => updateCheck(i, { required: e.target.checked })}
                              className="rounded"
                            />
                            必須
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addCheck}>+ チェック項目を追加</Button>
                </TabsContent>

                {/* Talk scripts tab */}
                <TabsContent value="scripts" className="space-y-3 mt-3">
                  {editItem.talkScripts.map((script, i) => (
                    <div key={i} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">スクリプト {i + 1}</span>
                        <Button variant="destructive" size="sm" onClick={() => removeScript(i)}>削除</Button>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">フェーズ</Label>
                        <Input
                          value={script.phase}
                          onChange={(e) => updateScript(i, { phase: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">スクリプト</Label>
                        <Textarea
                          value={script.script}
                          onChange={(e) => updateScript(i, { script: e.target.value })}
                          rows={3}
                        />
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addScript}>+ スクリプトを追加</Button>
                </TabsContent>

                {/* Q&A tab */}
                <TabsContent value="qa" className="space-y-3 mt-3">
                  {editItem.commonQuestions.map((qa, i) => (
                    <div key={i} className="rounded-md border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Q&A {i + 1}</span>
                        <Button variant="destructive" size="sm" onClick={() => removeQA(i)}>削除</Button>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">質問</Label>
                        <Input
                          value={qa.question}
                          onChange={(e) => updateQA(i, { question: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">回答</Label>
                        <Textarea
                          value={qa.answer}
                          onChange={(e) => updateQA(i, { answer: e.target.value })}
                          rows={3}
                        />
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addQA}>+ Q&Aを追加</Button>
                </TabsContent>
              </Tabs>
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
            <AlertDialogTitle>カウンセリングガイドを削除しますか？</AlertDialogTitle>
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
