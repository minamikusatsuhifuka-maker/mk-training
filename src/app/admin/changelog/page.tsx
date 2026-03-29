"use client";

import { useState } from "react";
import { changelog as initialChangelog, type ChangelogEntry } from "@/data/changelog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const categoryColors: Record<string, string> = {
  疾患: "bg-blue-100 text-blue-700 border-blue-200",
  薬剤: "bg-teal-light text-teal border-teal/20",
  クイズ: "bg-purple-100 text-purple-700 border-purple-200",
  禁忌: "bg-red-100 text-red-700 border-red-200",
  美容施術: "bg-amber-100 text-amber-700 border-amber-200",
  システム: "bg-slate-100 text-slate-700 border-slate-200",
};

const categories: ChangelogEntry["category"][] = ["疾患", "薬剤", "クイズ", "禁忌", "美容施術", "システム"];

export default function ChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("admin_changelog");
      if (saved) return JSON.parse(saved);
    }
    return initialChangelog;
  });

  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [category, setCategory] = useState<ChangelogEntry["category"]>("システム");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [addedCount, setAddedCount] = useState("");

  const handleAdd = () => {
    if (!title.trim()) return;
    const entry: ChangelogEntry = {
      id: `cl_${Date.now()}`,
      date,
      category,
      title: title.trim(),
      description: description.trim(),
      ...(addedCount ? { addedCount: Number(addedCount) } : {}),
    };
    const next = [entry, ...entries];
    setEntries(next);
    sessionStorage.setItem("admin_changelog", JSON.stringify(next));
    setTitle("");
    setDescription("");
    setAddedCount("");
  };

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-bold text-slate-800">更新履歴</h1>

      {/* Add form */}
      <Card className="p-4 space-y-3">
        <p className="text-sm font-medium">新しい更新を記録</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs font-medium">日付</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-md border px-3 py-1.5 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">カテゴリ</span>
            <Select value={category} onValueChange={(v) => setCategory(v as ChangelogEntry["category"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
              </SelectContent>
            </Select>
          </label>
        </div>
        <label className="space-y-1 block">
          <span className="text-xs font-medium">タイトル</span>
          <input className="w-full rounded-md border px-3 py-1.5 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 疾患データ5件追加" />
        </label>
        <label className="space-y-1 block">
          <span className="text-xs font-medium">説明</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="変更内容の詳細" />
        </label>
        <div className="flex items-end gap-3">
          <label className="space-y-1">
            <span className="text-xs font-medium">追加件数（任意）</span>
            <input type="number" className="w-24 rounded-md border px-3 py-1.5 text-sm" value={addedCount} onChange={(e) => setAddedCount(e.target.value)} />
          </label>
          <Button onClick={handleAdd} disabled={!title.trim()}>記録する</Button>
        </div>
      </Card>

      {/* Entries */}
      <div className="space-y-3">
        {sorted.map((e) => (
          <Card key={e.id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-xs text-muted-foreground whitespace-nowrap pt-0.5">{e.date}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant="outline" className={categoryColors[e.category]}>{e.category}</Badge>
                  <span className="font-medium text-sm">{e.title}</span>
                  {e.addedCount && <span className="text-xs text-teal">+{e.addedCount}件</span>}
                </div>
                <p className="text-xs text-muted-foreground">{e.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
