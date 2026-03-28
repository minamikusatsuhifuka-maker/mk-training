"use client";

import { useState, useEffect } from "react";
import { quizQuestions as initialQuiz, type QuizQuestion, type QuizCategory } from "@/data/quiz";
import { AdminBanner } from "@/components/AdminBanner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const STORAGE_KEY = "admin_quiz";

const categories: { key: QuizCategory | "all"; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "disease", label: "疾患" },
  { key: "drug", label: "薬剤" },
  { key: "cosmetic", label: "美容" },
  { key: "ops", label: "業務" },
];

const categoryOptions: QuizCategory[] = ["disease", "drug", "cosmetic", "ops"];
const answerLabels = ["A", "B", "C", "D"];

function emptyQuiz(): QuizQuestion {
  return {
    id: `new_${Date.now()}`,
    category: "disease",
    question: "",
    options: ["", "", "", ""],
    answerIndex: 0,
    explanation: "",
  };
}

export default function AdminQuizPage() {
  const [data, setData] = useState<QuizQuestion[]>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    }
    return initialQuiz;
  });
  const [tab, setTab] = useState<string>("all");
  const [editItem, setEditItem] = useState<QuizQuestion | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  const countByCategory = (cat: QuizCategory) => data.filter((q) => q.category === cat).length;

  const filtered = tab === "all" ? data : data.filter((q) => q.category === tab);

  const openNew = () => { setEditItem(emptyQuiz()); setDialogOpen(true); };
  const openEdit = (q: QuizQuestion) => { setEditItem({ ...q, options: [...q.options] }); setDialogOpen(true); };

  const handleSave = () => {
    if (!editItem) return;
    setData((prev) => {
      const idx = prev.findIndex((q) => q.id === editItem.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = editItem; return next; }
      return [...prev, editItem];
    });
    setDialogOpen(false);
    setEditItem(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    setData((prev) => prev.filter((q) => q.id !== deleteId));
    setDeleteId(null);
  };

  const updateOption = (idx: number, val: string) => {
    if (!editItem) return;
    const opts = [...editItem.options];
    opts[idx] = val;
    setEditItem({ ...editItem, options: opts });
  };

  return (
    <div className="max-w-5xl space-y-4">
      <AdminBanner />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-slate-800">クイズ管理（{data.length}問）</h1>
        <Button onClick={openNew}>新規追加</Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
          {categories.map((c) => (
            <TabsTrigger key={c.key} value={c.key} className="text-xs">
              {c.label}
              {c.key !== "all" && `(${countByCategory(c.key as QuizCategory)})`}
              {c.key === "all" && `(${data.length})`}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">ID</TableHead>
            <TableHead className="w-[70px]">区分</TableHead>
            <TableHead>問題文</TableHead>
            <TableHead className="w-[60px]">正解</TableHead>
            <TableHead className="w-[120px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((q) => (
            <TableRow key={q.id}>
              <TableCell className="font-mono text-xs">{q.id}</TableCell>
              <TableCell className="text-xs">{q.category}</TableCell>
              <TableCell className="text-sm truncate max-w-[300px]">{q.question.slice(0, 30)}…</TableCell>
              <TableCell className="text-center font-medium">{answerLabels[q.answerIndex]}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => openEdit(q)}>編集</Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteId(q.id)}>削除</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem && data.some((q) => q.id === editItem.id) ? "クイズを編集" : "新規クイズを追加"}</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <label className="space-y-1 block">
                <span className="text-xs font-medium">カテゴリ</span>
                <Select value={editItem.category} onValueChange={(v) => setEditItem({ ...editItem, category: v as QuizCategory })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">問題文</span>
                <Textarea value={editItem.question} onChange={(e) => setEditItem({ ...editItem, question: e.target.value })} rows={3} />
              </label>
              {editItem.options.map((opt, idx) => (
                <label key={idx} className="space-y-1 block">
                  <span className="text-xs font-medium">選択肢{answerLabels[idx]}</span>
                  <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={opt} onChange={(e) => updateOption(idx, e.target.value)} />
                </label>
              ))}
              <label className="space-y-1 block">
                <span className="text-xs font-medium">正解</span>
                <Select value={String(editItem.answerIndex)} onValueChange={(v) => setEditItem({ ...editItem, answerIndex: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {answerLabels.map((l, i) => (
                      <SelectItem key={i} value={String(i)}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">解説</span>
                <Textarea value={editItem.explanation} onChange={(e) => setEditItem({ ...editItem, explanation: e.target.value })} rows={3} />
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
            <AlertDialogTitle>クイズを削除しますか？</AlertDialogTitle>
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
