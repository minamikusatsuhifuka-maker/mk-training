"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CLINIC_PHILOSOPHY,
  KNOWLEDGE_DOCS_KEY,
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_CATEGORY_COLORS,
  type KnowledgeDoc,
  type KnowledgeDocCategory,
} from "@/lib/clinic-philosophy";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

type MainTab = "philosophy" | "docs";
type InputMode = "text" | "file";

const CATEGORY_OPTIONS: KnowledgeDocCategory[] = [
  "rule",
  "drug_detail",
  "receipt",
  "counseling_detail",
  "faq",
  "philosophy",
  "other",
];

function newId(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)
  );
}

export default function AdminKnowledgePage() {
  const [mainTab, setMainTab] = useState<MainTab>("philosophy");
  const [inputMode, setInputMode] = useState<InputMode>("text");
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 入力フォーム
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<KnowledgeDocCategory>("rule");
  const [content, setContent] = useState("");
  const [isActive, setIsActive] = useState(true);

  // 編集モード
  const [editingId, setEditingId] = useState<string | null>(null);

  // ファイル D&D
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初期ロード
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("content_store")
          .select("data")
          .eq("id", KNOWLEDGE_DOCS_KEY)
          .single();
        const raw = (data?.data as { docs?: KnowledgeDoc[] } | undefined) || {};
        setDocs(raw.docs || []);
      } catch {
        setDocs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeCount = useMemo(() => docs.filter((d) => d.isActive).length, [docs]);
  const totalChars = useMemo(
    () => docs.reduce((sum, d) => sum + d.content.length, 0),
    [docs],
  );

  async function persist(next: KnowledgeDoc[]) {
    setSaving(true);
    try {
      const { error } = await supabase.from("content_store").upsert({
        id: KNOWLEDGE_DOCS_KEY,
        content_type: "knowledge",
        data: { docs: next } as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        toast.error("保存に失敗しました: " + error.message);
        return false;
      }
      return true;
    } catch (e) {
      toast.error("保存エラー: " + (e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setTitle("");
    setContent("");
    setCategory("rule");
    setIsActive(true);
    setEditingId(null);
    setInputMode("text");
  }

  async function handleSubmit() {
    if (!title.trim()) {
      toast.error("タイトルを入力してください");
      return;
    }
    if (!content.trim()) {
      toast.error("内容を入力してください");
      return;
    }

    let next: KnowledgeDoc[];
    if (editingId) {
      next = docs.map((d) =>
        d.id === editingId
          ? {
              ...d,
              title: title.trim(),
              category,
              content,
              isActive,
            }
          : d,
      );
    } else {
      const newDoc: KnowledgeDoc = {
        id: newId(),
        title: title.trim(),
        category,
        content,
        isActive,
        createdAt: new Date().toISOString(),
      };
      next = [newDoc, ...docs];
    }

    const ok = await persist(next);
    if (ok) {
      setDocs(next);
      toast.success(editingId ? "更新しました" : "追加しました");
      resetForm();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("このドキュメントを削除しますか？")) return;
    const next = docs.filter((d) => d.id !== id);
    const ok = await persist(next);
    if (ok) {
      setDocs(next);
      toast.success("削除しました");
      if (editingId === id) resetForm();
    }
  }

  async function handleToggleActive(id: string) {
    const next = docs.map((d) =>
      d.id === id ? { ...d, isActive: !d.isActive } : d,
    );
    const ok = await persist(next);
    if (ok) {
      setDocs(next);
    }
  }

  function handleEdit(doc: KnowledgeDoc) {
    setEditingId(doc.id);
    setTitle(doc.title);
    setCategory(doc.category);
    setContent(doc.content);
    setIsActive(doc.isActive);
    setInputMode("text");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ファイル読み込み
  function readFile(file: File) {
    const allowed = file.name.match(/\.(txt|md|markdown)$/i);
    if (!allowed) {
      toast.error(".txt または .md ファイルを選択してください");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || "");
      setContent(text);
      if (!title) {
        // ファイル名から拡張子を除いてタイトルに
        setTitle(file.name.replace(/\.(txt|md|markdown)$/i, ""));
      }
      toast.success(`${file.name} を読み込みました（${text.length}文字）`);
    };
    reader.onerror = () => toast.error("ファイル読み込みに失敗しました");
    reader.readAsText(file, "utf-8");
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) readFile(file);
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">📚 知識ベース・理念管理</h1>
        <p className="text-sm text-slate-500 mt-1">
          AIアシスタント・症例学習・ロールプレイで参照される情報を管理します。クリニックの理念はデフォルトで組み込まれています。
        </p>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardHeader className="py-3">
            <CardDescription>🏛️ 理念・基本情報</CardDescription>
            <CardTitle className="text-base text-emerald-700">常時有効</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardDescription>📄 追加ドキュメント</CardDescription>
            <CardTitle className="text-base">
              {docs.length}件{" "}
              <span className="text-xs text-muted-foreground">
                （有効: {activeCount}件）
              </span>
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="py-3">
            <CardDescription>📊 追加ドキュメント合計</CardDescription>
            <CardTitle className="text-base">{totalChars.toLocaleString()}文字</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* メインタブ */}
      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setMainTab("philosophy")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mainTab === "philosophy"
              ? "border-emerald-500 text-emerald-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          🏛️ 理念・基本情報
        </button>
        <button
          type="button"
          onClick={() => setMainTab("docs")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            mainTab === "docs"
              ? "border-emerald-500 text-emerald-700"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          📄 追加ドキュメント
        </button>
      </div>

      {/* タブ: 理念 */}
      {mainTab === "philosophy" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300">
              ✅ 全AI機能に読み込み済み
            </Badge>
            <span className="text-xs text-slate-500">
              追加・修正は管理者にお問い合わせください
            </span>
          </div>
          <Card>
            <div className="p-4 bg-slate-50 rounded-lg whitespace-pre-wrap text-sm leading-relaxed text-slate-700 max-h-[600px] overflow-y-auto">
              {CLINIC_PHILOSOPHY}
            </div>
          </Card>
        </div>
      )}

      {/* タブ: 追加ドキュメント */}
      {mainTab === "docs" && (
        <div className="space-y-6">
          {/* 入力フォーム */}
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {editingId ? "✏️ ドキュメント編集" : "➕ 新規ドキュメント追加"}
              </h2>
              {editingId && (
                <Button variant="outline" size="sm" onClick={resetForm}>
                  キャンセル
                </Button>
              )}
            </div>

            {/* 入力方式タブ */}
            <div className="flex gap-1 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setInputMode("text")}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                  inputMode === "text"
                    ? "border-slate-700 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                ✏️ テキスト入力
              </button>
              <button
                type="button"
                onClick={() => setInputMode("file")}
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                  inputMode === "file"
                    ? "border-slate-700 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                📁 ファイル読み込み（.txt/.md）
              </button>
            </div>

            {/* タイトル */}
            <div className="space-y-1.5">
              <Label htmlFor="title">タイトル</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: 院内マニュアル 2026年版"
              />
            </div>

            {/* カテゴリ */}
            <div className="space-y-1.5">
              <Label htmlFor="category">カテゴリ</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as KnowledgeDocCategory)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {KNOWLEDGE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>

            {/* 入力 */}
            {inputMode === "text" ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="content">内容（Markdown形式推奨）</Label>
                  <span className="text-xs text-slate-500">
                    {content.length.toLocaleString()}文字
                  </span>
                </div>
                <Textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={"# 見出し\n\n本文をここに入力..."}
                  className="min-h-[240px] font-mono text-xs"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>ファイルを選択またはドラッグ&ドロップ</Label>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                    isDragging
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-300 bg-slate-50 hover:border-slate-400"
                  }`}
                >
                  <p className="text-sm text-slate-600">
                    📁 .txt または .md ファイルをドロップ
                  </p>
                  <p className="text-xs text-slate-400 mt-1">クリックして選択も可能</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.markdown"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) readFile(file);
                    }}
                  />
                </div>
                {content && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label>プレビュー</Label>
                      <span className="text-xs text-slate-500">
                        {content.length.toLocaleString()}文字
                      </span>
                    </div>
                    <div className="max-h-[240px] overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-3 whitespace-pre-wrap text-xs font-mono text-slate-700">
                      {content.slice(0, 2000)}
                      {content.length > 2000 && "\n\n...（以下省略）"}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 有効/無効 */}
            <div className="flex items-center gap-2">
              <input
                id="active"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              <Label htmlFor="active" className="text-sm cursor-pointer">
                有効（AI機能で参照する）
              </Label>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleSubmit}
                disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? "保存中..." : editingId ? "更新" : "追加"}
              </Button>
            </div>
          </Card>

          {/* 一覧 */}
          <div className="space-y-3">
            <h2 className="text-base font-semibold text-slate-800">
              登録済みドキュメント（{docs.length}件）
            </h2>
            {loading ? (
              <p className="text-sm text-slate-500">読み込み中...</p>
            ) : docs.length === 0 ? (
              <Card className="p-8 text-center text-sm text-slate-500">
                まだドキュメントが登録されていません。上のフォームから追加してください。
              </Card>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <Card key={doc.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <Badge
                            className={`text-xs border ${KNOWLEDGE_CATEGORY_COLORS[doc.category]}`}
                          >
                            {KNOWLEDGE_CATEGORY_LABELS[doc.category]}
                          </Badge>
                          {!doc.isActive && (
                            <Badge className="bg-slate-200 text-slate-600 text-xs">
                              無効
                            </Badge>
                          )}
                          <span className="text-xs text-slate-500">
                            {doc.content.length.toLocaleString()}文字
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(doc.createdAt).toLocaleDateString("ja-JP")}
                          </span>
                        </div>
                        <h3 className="font-semibold text-sm text-slate-800 truncate">
                          {doc.title}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 whitespace-pre-wrap">
                          {doc.content.slice(0, 150)}
                          {doc.content.length > 150 && "..."}
                        </p>
                      </div>
                      <div className="shrink-0 flex flex-col items-end gap-1.5">
                        <label className="flex items-center gap-1 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={doc.isActive}
                            onChange={() => handleToggleActive(doc.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300"
                          />
                          <span>有効</span>
                        </label>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(doc)}
                          >
                            編集
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(doc.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            削除
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
