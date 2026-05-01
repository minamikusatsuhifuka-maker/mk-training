"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CLINIC_PHILOSOPHY,
  KNOWLEDGE_DOCS_KEY,
  KNOWLEDGE_CATEGORY_LABELS,
  KNOWLEDGE_CATEGORY_COLORS,
  type KnowledgeDoc,
  type KnowledgeDocCategory,
} from "@/lib/clinic-philosophy";
import { supabase } from "@/lib/supabase";

// このページで利用するカテゴリ（管理UI上の主要カテゴリ）
const PRIMARY_CATEGORIES: KnowledgeDocCategory[] = [
  "philosophy",
  "manual",
  "drug_detail",
  "receipt",
  "counseling",
  "education",
  "faq",
  "other",
];

// 一括アップロード用のファイル単位の状態
type BatchFileItem = {
  id: string;
  fileName: string;
  title: string;
  category: KnowledgeDocCategory;
  content: string;
  fileType: string;
  charCount: number;
  status: "ready" | "saving" | "done" | "error";
  error?: string;
};

// 1度にアップロードできる最大ファイル数
const MAX_BATCH_FILES = 20;

// ファイルからテキストを抽出
async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";

  // テキスト・Markdown・CSV
  if (["txt", "md", "markdown", "csv"].includes(ext)) {
    return await file.text();
  }

  // Word (.docx)
  if (ext === "docx") {
    try {
      const mammoth = await import("mammoth");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch {
      throw new Error("Word文書の読み込みに失敗しました。テキストとして貼り付けてください。");
    }
  }

  // PDF
  if (ext === "pdf") {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const response = await fetch("/api/extract-pdf", {
        method: "POST",
        body: arrayBuffer,
        headers: { "Content-Type": "application/pdf" },
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(err || "PDF抽出APIエラー");
      }
      const data = await response.json();
      return (data.text as string) || "";
    } catch (e) {
      throw new Error(
        "PDFのテキスト抽出に失敗しました。テキストをコピーして貼り付けてください。" +
          (e instanceof Error ? `（${e.message}）` : ""),
      );
    }
  }

  // 画像
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(((e.target?.result as string) || "").split(",")[1] || "");
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const mimeType = file.type || "image/jpeg";
      const response = await fetch("/api/extract-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimeType, fileName: file.name }),
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(err || "画像OCRエラー");
      }
      const data = await response.json();
      return (data.text as string) || "";
    } catch (e) {
      throw new Error(
        "画像からのテキスト抽出に失敗しました。" +
          (e instanceof Error ? `（${e.message}）` : ""),
      );
    }
  }

  throw new Error(`未対応のファイル形式です: .${ext}`);
}

export default function AdminKnowledgePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // フォーム状態
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<KnowledgeDocCategory>("manual");
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState("text");
  const [inputMode, setInputMode] = useState<"text" | "file">("text");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 一括アップロード状態
  const [batchFiles, setBatchFiles] = useState<BatchFileItem[]>([]);
  const [batchProgress, setBatchProgress] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);

  // Supabaseから読み込み（初回は LUMINA 哲学を初期データとして投入）
  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("content_store")
        .select("data")
        .eq("id", KNOWLEDGE_DOCS_KEY)
        .single();
      const raw = (data?.data as { docs?: KnowledgeDoc[] } | undefined) || {};
      const loaded = raw.docs || [];

      // 初回のみ LUMINA 哲学ドキュメントを初期データとしてSupabaseに保存
      if (loaded.length === 0) {
        const initialDoc: KnowledgeDoc = {
          id: "lumina-philosophy-001",
          title: "LUMINA クリニック理念・哲学・判断軸",
          category: "philosophy",
          content: CLINIC_PHILOSOPHY,
          fileType: "markdown",
          fileName: "LUMINA_背景情報_移植用.md",
          charCount: CLINIC_PHILOSOPHY.length,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        try {
          const { error: upsertErr } = await supabase
            .from("content_store")
            .upsert({
              id: KNOWLEDGE_DOCS_KEY,
              content_type: "knowledge_docs",
              data: { docs: [initialDoc] } as unknown as Record<
                string,
                unknown
              >,
              updated_at: new Date().toISOString(),
            });
          if (!upsertErr) {
            setDocs([initialDoc]);
            return;
          }
        } catch {
          // 保存失敗時は空のまま継続
        }
      }
      setDocs(loaded);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  // メッセージ自動消去
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 4000);
    return () => clearTimeout(t);
  }, [success]);

  // Supabaseに保存
  const saveDocs = async (newDocs: KnowledgeDoc[]) => {
    const { error: err } = await supabase.from("content_store").upsert({
      id: KNOWLEDGE_DOCS_KEY,
      content_type: "knowledge_docs",
      data: { docs: newDocs } as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    });
    if (err) throw err;
    setDocs(newDocs);
  };

  // ファイル処理（複数ファイルを一括でテキスト抽出してバッチに積む）
  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    if (files.length > MAX_BATCH_FILES) {
      setError(`一度にアップロードできるのは${MAX_BATCH_FILES}ファイルまでです`);
      return;
    }

    setExtracting(true);
    setError("");
    setSuccess("");
    setBatchFiles([]);

    const results: BatchFileItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setBatchProgress(`${i + 1}/${files.length} 処理中: ${file.name}`);

      const ext = file.name.split(".").pop()?.toLowerCase() || "text";
      try {
        const text = await extractTextFromFile(file);
        results.push({
          id: `batch-${Date.now()}-${i}`,
          fileName: file.name,
          title: file.name.replace(/\.[^.]+$/, ""),
          category: "other",
          content: text,
          fileType: ext,
          charCount: text.length,
          status: "ready",
        });
      } catch (e) {
        results.push({
          id: `batch-${Date.now()}-${i}`,
          fileName: file.name,
          title: file.name.replace(/\.[^.]+$/, ""),
          category: "other",
          content: "",
          fileType: ext,
          charCount: 0,
          status: "error",
          error: e instanceof Error ? e.message : "不明なエラー",
        });
      }
    }

    setBatchFiles(results);
    setExtracting(false);
    setBatchProgress("");
    const okCount = results.filter((r) => r.status === "ready").length;
    if (okCount > 0) {
      setSuccess(
        `✅ ${okCount}件のファイルを読み込みました。タイトル・カテゴリを確認して一括保存してください`,
      );
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) handleFiles(files);
    },
    [handleFiles],
  );

  // 重複判定（既存docsとの照合：ファイル名またはタイトルが一致）
  const isDuplicateFile = useCallback(
    (file: BatchFileItem) =>
      docs.some(
        (d) =>
          (file.fileName && d.fileName === file.fileName) ||
          d.title === file.title,
      ),
    [docs],
  );

  // 登録済みdocs内の重複グループを検知
  const findDuplicates = useCallback((targetDocs: KnowledgeDoc[]) => {
    const duplicateGroups: KnowledgeDoc[][] = [];
    const checked = new Set<string>();

    targetDocs.forEach((doc, i) => {
      if (checked.has(doc.id)) return;

      const matches = targetDocs.filter((other, j) => {
        if (i === j) return false;
        // タイトル一致 または ファイル名一致（両方が存在するとき）
        const titleMatch = doc.title.trim() === other.title.trim();
        const fileMatch =
          !!doc.fileName &&
          !!other.fileName &&
          doc.fileName === other.fileName;
        return titleMatch || fileMatch;
      });

      if (matches.length > 0) {
        const group = [doc, ...matches];
        group.forEach((d) => checked.add(d.id));
        duplicateGroups.push(group);
      }
    });

    return duplicateGroups;
  }, []);

  // 一括保存
  const handleBatchSave = async () => {
    const readyFiles = batchFiles.filter((f) => f.status === "ready");
    if (readyFiles.length === 0) return;

    setBatchSaving(true);
    setError("");
    setSuccess("");

    // 既存docsに追加していく
    const newDocs: KnowledgeDoc[] = [...docs];
    let savedCount = 0;

    for (let i = 0; i < readyFiles.length; i++) {
      const file = readyFiles[i];

      // 重複チェック（ファイル名またはタイトルが一致）
      const isDuplicate = newDocs.some(
        (existing) =>
          (file.fileName && existing.fileName === file.fileName) ||
          existing.title === file.title,
      );

      if (isDuplicate) {
        setBatchFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? {
                  ...f,
                  status: "error",
                  error:
                    "同じタイトルまたはファイル名が既に登録されています（スキップ）",
                }
              : f,
          ),
        );
        continue;
      }

      setBatchFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, status: "saving" } : f)),
      );

      try {
        const newDoc: KnowledgeDoc = {
          id:
            Date.now().toString(36) +
            "-" +
            Math.random().toString(36).slice(2, 8) +
            "-" +
            i,
          title: file.title.trim() || file.fileName,
          category: file.category,
          content: file.content,
          fileType: file.fileType || undefined,
          fileName: file.fileName,
          charCount: file.charCount,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        newDocs.push(newDoc);
        savedCount++;

        setBatchFiles((prev) =>
          prev.map((f) => (f.id === file.id ? { ...f, status: "done" } : f)),
        );
      } catch (e) {
        setBatchFiles((prev) =>
          prev.map((f) =>
            f.id === file.id
              ? {
                  ...f,
                  status: "error",
                  error: e instanceof Error ? e.message : "不明なエラー",
                }
              : f,
          ),
        );
      }
    }

    // まとめてSupabaseに保存
    try {
      await saveDocs(newDocs);
      setSuccess(`✅ ${savedCount}件の資料を一括保存しました`);
    } catch (e) {
      setError(
        "一括保存に失敗しました: " +
          (e instanceof Error ? e.message : "不明なエラー"),
      );
      // 失敗時はステータスをerrorに戻す
      setBatchFiles((prev) =>
        prev.map((f) =>
          f.status === "done"
            ? { ...f, status: "error", error: "Supabase保存に失敗" }
            : f,
        ),
      );
    } finally {
      setBatchSaving(false);
    }
  };

  // 保存
  const handleSave = async () => {
    if (!title.trim() || !content.trim()) {
      setError("タイトルと内容を入力してください");
      return;
    }
    setSaving(true);
    setError("");
    try {
      let newDocs: KnowledgeDoc[];
      if (editingId) {
        newDocs = docs.map((d) =>
          d.id === editingId
            ? {
                ...d,
                title: title.trim(),
                category,
                content,
                fileName: fileName || undefined,
                fileType: fileType || undefined,
                charCount: content.length,
                updatedAt: new Date().toISOString(),
              }
            : d,
        );
      } else {
        const newDoc: KnowledgeDoc = {
          id: Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8),
          title: title.trim(),
          category,
          content,
          fileName: fileName || undefined,
          fileType: fileType || undefined,
          charCount: content.length,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        newDocs = [newDoc, ...docs];
      }
      await saveDocs(newDocs);
      resetForm();
      setSuccess(editingId ? "✅ 更新しました" : "✅ 追加しました");
    } catch (e) {
      setError("保存に失敗しました: " + (e instanceof Error ? e.message : "不明なエラー"));
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setCategory("manual");
    setContent("");
    setFileName("");
    setFileType("text");
    setEditingId(null);
    setInputMode("text");
  };

  const toggleActive = async (id: string) => {
    const newDocs = docs.map((d) => (d.id === id ? { ...d, isActive: !d.isActive } : d));
    try {
      await saveDocs(newDocs);
    } catch (e) {
      setError("更新に失敗しました: " + (e instanceof Error ? e.message : "不明なエラー"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("削除しますか？")) return;
    const newDocs = docs.filter((d) => d.id !== id);
    try {
      await saveDocs(newDocs);
      setSuccess("✅ 削除しました");
    } catch (e) {
      setError("削除に失敗しました: " + (e instanceof Error ? e.message : "不明なエラー"));
    }
  };

  const startEdit = (doc: KnowledgeDoc) => {
    setEditingId(doc.id);
    setTitle(doc.title);
    setCategory(doc.category);
    setContent(doc.content);
    setFileName(doc.fileName || "");
    setFileType(doc.fileType || "text");
    setInputMode("text");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const activeDocs = useMemo(() => docs.filter((d) => d.isActive), [docs]);
  const totalChars = useMemo(
    () => activeDocs.reduce((sum, d) => sum + (d.charCount ?? d.content.length), 0),
    [activeDocs],
  );

  // 登録済みdocs内の重複グループ
  const duplicateGroups = useMemo(
    () => findDuplicates(docs),
    [docs, findDuplicates],
  );

  // 各グループの最新1件を残し、それ以外（古い方）を一括削除
  const handleDeleteAllDuplicates = async () => {
    const count = duplicateGroups.reduce((sum, g) => sum + g.length - 1, 0);
    if (count === 0) return;
    if (
      !confirm(
        `重複している${count}件を削除しますか？（各グループの最新1件を残します）`,
      )
    ) {
      return;
    }

    const idsToDelete = new Set<string>();
    duplicateGroups.forEach((group) => {
      // createdAt が新しい順に並べ替えて、先頭（最新）を残す
      const sorted = [...group].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      sorted.slice(1).forEach((d) => idsToDelete.add(d.id));
    });

    const newDocs = docs.filter((d) => !idsToDelete.has(d.id));
    try {
      await saveDocs(newDocs);
      setSuccess(`✅ ${idsToDelete.size}件の重複を削除しました`);
    } catch (e) {
      setError(
        "重複削除に失敗しました: " +
          (e instanceof Error ? e.message : "不明なエラー"),
      );
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">📚 知識ベース・資料管理</h1>
        <p className="text-sm text-gray-500 mt-1">
          AIアシスタント・症例学習・ロールプレイで参照される資料を管理します。管理者のみが閲覧・編集できます。
        </p>
      </div>

      {/* サマリー */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-teal-700">{docs.length}</p>
          <p className="text-xs text-teal-600">登録済み資料</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-blue-700">{activeDocs.length}</p>
          <p className="text-xs text-blue-600">AI参照中（有効）</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-purple-700">{(totalChars / 1000).toFixed(1)}K</p>
          <p className="text-xs text-purple-600">合計文字数</p>
        </div>
      </div>

      {totalChars > 80000 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          ⚠️ 合計文字数が多くなっています。応答が遅くなる場合は不要な資料を無効にしてください。
        </div>
      )}

      {/* 追加フォーム */}
      <div className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-gray-800">
          {editingId ? "✏️ 資料を編集" : "➕ 資料を追加"}
        </h2>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">タイトル *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: デュピクセント投与マニュアル"
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">カテゴリ *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as KnowledgeDocCategory)}
              className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
            >
              {PRIMARY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {KNOWLEDGE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 入力方式切り替え */}
        <div className="flex gap-1 border rounded-lg overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => setInputMode("text")}
            className={`text-sm px-3 py-1.5 ${inputMode === "text" ? "bg-teal-600 text-white" : "hover:bg-gray-50"}`}
          >
            ✏️ テキスト入力
          </button>
          <button
            type="button"
            onClick={() => setInputMode("file")}
            className={`text-sm px-3 py-1.5 ${inputMode === "file" ? "bg-teal-600 text-white" : "hover:bg-gray-50"}`}
          >
            📁 ファイルアップロード
          </button>
        </div>

        {inputMode === "file" && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragging ? "border-teal-400 bg-teal-50" : "border-gray-300 hover:border-teal-300 hover:bg-gray-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.docx,.pdf,.jpg,.jpeg,.png,.webp,.gif"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length > 0) handleFiles(files);
                // 同じファイル群を再選択できるように value をリセット
                e.target.value = "";
              }}
            />
            {extracting ? (
              <div className="text-teal-600">
                <p className="text-lg">⏳ テキストを抽出中...</p>
                <p className="text-sm mt-1">しばらくお待ちください</p>
              </div>
            ) : (
              <div className="text-gray-500">
                <p className="text-3xl mb-2">📂</p>
                <p className="font-medium">
                  ファイルをドラッグ&ドロップ（最大{MAX_BATCH_FILES}件）
                </p>
                <p className="text-sm mt-1">または クリックして選択（複数選択可）</p>
                <p className="text-xs mt-3 text-gray-400">
                  対応形式: PDF・Word(.docx)・テキスト(.txt/.md)・画像(.jpg/.png/.webp)
                </p>
              </div>
            )}
          </div>
        )}

        {/* 進行状況表示 */}
        {batchProgress && (
          <div className="mt-2 text-sm text-teal-600 flex items-center gap-2">
            <span className="animate-spin">⏳</span>
            <span>{batchProgress}</span>
          </div>
        )}

        {/* バッチファイルリスト */}
        {inputMode === "file" && batchFiles.length > 0 && (
          <div className="space-y-3 mt-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-medium text-gray-700">
                📂 {batchFiles.length}件のファイルを読み込みました
              </h3>
              <div className="flex gap-2 flex-wrap">
                {/* 全カテゴリ一括設定 */}
                <select
                  onChange={(e) => {
                    const cat = e.target.value as KnowledgeDocCategory | "";
                    if (cat) {
                      setBatchFiles((prev) =>
                        prev.map((f) => ({ ...f, category: cat })),
                      );
                    }
                    e.target.value = "";
                  }}
                  className="text-xs border rounded px-2 py-1 bg-white"
                  defaultValue=""
                  disabled={batchSaving}
                >
                  <option value="">カテゴリを一括設定...</option>
                  {PRIMARY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {KNOWLEDGE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                {/* 一括クリア */}
                <button
                  type="button"
                  onClick={() => {
                    setBatchFiles([]);
                    setError("");
                  }}
                  disabled={batchSaving}
                  className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  クリア
                </button>
                {/* 一括保存ボタン（重複ファイルを除いた件数） */}
                {(() => {
                  const saveableCount = batchFiles.filter(
                    (f) => f.status === "ready" && !isDuplicateFile(f),
                  ).length;
                  return (
                    <button
                      type="button"
                      onClick={handleBatchSave}
                      disabled={batchSaving || saveableCount === 0}
                      className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                    >
                      {batchSaving
                        ? "保存中..."
                        : `💾 ${saveableCount}件を一括保存`}
                    </button>
                  );
                })()}
              </div>
            </div>

            {/* ファイル一覧 */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {batchFiles.map((file, index) => (
                <div
                  key={file.id}
                  className={`border rounded-lg p-3 ${
                    file.status === "done"
                      ? "bg-green-50 border-green-200"
                      : file.status === "error"
                        ? "bg-red-50 border-red-200"
                        : "bg-white border-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* ステータスアイコン */}
                    <span className="text-lg shrink-0">
                      {file.status === "done"
                        ? "✅"
                        : file.status === "error"
                          ? "❌"
                          : file.status === "saving"
                            ? "⏳"
                            : "📄"}
                    </span>

                    {/* タイトル編集 */}
                    <input
                      value={file.title}
                      onChange={(e) =>
                        setBatchFiles((prev) =>
                          prev.map((f, i) =>
                            i === index ? { ...f, title: e.target.value } : f,
                          ),
                        )
                      }
                      className="flex-1 min-w-0 text-sm border-0 border-b border-gray-200 focus:border-teal-400 outline-none bg-transparent"
                      placeholder="タイトル"
                      disabled={
                        batchSaving ||
                        file.status === "done" ||
                        file.status === "error"
                      }
                    />

                    {/* 重複バッジ */}
                    {isDuplicateFile(file) && file.status === "ready" && (
                      <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full shrink-0">
                        ⚠️ 重複
                      </span>
                    )}

                    {/* カテゴリ選択 */}
                    <select
                      value={file.category}
                      onChange={(e) =>
                        setBatchFiles((prev) =>
                          prev.map((f, i) =>
                            i === index
                              ? {
                                  ...f,
                                  category: e.target.value as KnowledgeDocCategory,
                                }
                              : f,
                          ),
                        )
                      }
                      className="text-xs border rounded px-1.5 py-1 shrink-0 bg-white"
                      disabled={
                        batchSaving ||
                        file.status === "done" ||
                        file.status === "error"
                      }
                    >
                      {PRIMARY_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {KNOWLEDGE_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>

                    {/* 文字数 */}
                    <span className="text-xs text-gray-400 shrink-0">
                      {file.charCount.toLocaleString()}文字
                    </span>

                    {/* 削除 */}
                    <button
                      type="button"
                      onClick={() =>
                        setBatchFiles((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                      disabled={batchSaving}
                      className="text-xs text-red-400 hover:text-red-600 shrink-0 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>

                  {/* エラー表示 */}
                  {file.status === "error" && file.error && (
                    <p className="text-xs text-red-600 mt-1 ml-8">{file.error}</p>
                  )}

                  {/* 完了表示 */}
                  {file.status === "done" && (
                    <p className="text-xs text-green-600 mt-1 ml-8">保存完了</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {fileName && (
          <div className="bg-gray-50 border rounded-lg px-3 py-2 text-sm text-gray-600">
            📎 {fileName}
          </div>
        )}

        <div>
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-medium text-gray-600">内容（Markdown形式推奨）*</label>
            <span className="text-xs text-gray-400">{content.length.toLocaleString()}文字</span>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            placeholder="資料の内容を貼り付けるか、ファイルをアップロードしてください..."
            className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || extracting}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : editingId ? "💾 更新" : "➕ 追加"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              キャンセル
            </button>
          )}
        </div>
      </div>

      {/* 登録済み一覧 */}
      <div className="space-y-3">
        <h2 className="font-semibold text-gray-800">登録済み資料 ({docs.length}件)</h2>

        {/* 重複検知バナー */}
        {duplicateGroups.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-amber-700 font-medium text-sm">
                  ⚠️ 重複が {duplicateGroups.length}グループ 見つかりました
                </span>
                <span className="text-xs text-amber-600">
                  ({duplicateGroups.reduce((sum, g) => sum + g.length - 1, 0)}件が重複)
                </span>
              </div>
              <button
                type="button"
                onClick={handleDeleteAllDuplicates}
                className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
              >
                🗑️ 重複を一括削除（古い方を削除）
              </button>
            </div>

            {/* 重複グループ一覧 */}
            <div className="space-y-2">
              {duplicateGroups.map((group, gi) => {
                // createdAt が新しい順に並べ替え（最新を残す）
                const sortedGroup = [...group].sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime(),
                );
                return (
                  <div
                    key={gi}
                    className="bg-white border border-amber-100 rounded-lg p-3"
                  >
                    <p className="text-xs font-medium text-amber-800 mb-2">
                      グループ {gi + 1}: 「{sortedGroup[0].title}」(
                      {sortedGroup.length}件)
                    </p>
                    <div className="space-y-1">
                      {sortedGroup.map((doc, di) => (
                        <div
                          key={doc.id}
                          className="flex items-center justify-between text-xs gap-2 flex-wrap"
                        >
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            {di === 0 ? (
                              <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs shrink-0">
                                残す
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs shrink-0">
                                削除対象
                              </span>
                            )}
                            <span className="text-gray-600 truncate">
                              {doc.title}
                            </span>
                            <span className="text-gray-400 shrink-0">
                              {(doc.charCount ?? doc.content.length).toLocaleString()}文字
                            </span>
                            <span className="text-gray-400 shrink-0">
                              {doc.createdAt.slice(0, 10)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDelete(doc.id)}
                            className="text-red-500 hover:text-red-700 px-2 py-0.5 border border-red-200 rounded hover:bg-red-50 shrink-0"
                          >
                            削除
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 理念（常時有効） */}
        <details className="bg-amber-50 border border-amber-200 rounded-xl p-4 group">
          <summary className="cursor-pointer flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-amber-800">🏛️ クリニックの理念・院長の教え</span>
              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200">
                常時有効
              </span>
            </div>
            <span className="text-xs text-amber-600">全AI機能に組み込み済み</span>
          </summary>
          <pre className="mt-3 text-xs text-amber-900 bg-white/60 rounded-lg p-3 overflow-auto max-h-80 whitespace-pre-wrap font-sans">
            {CLINIC_PHILOSOPHY}
          </pre>
        </details>

        {loading ? (
          <div className="text-center py-8 text-gray-400">読み込み中...</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-xl">
            <p>まだ資料がありません</p>
            <p className="text-sm mt-1">上のフォームから追加してください</p>
          </div>
        ) : (
          docs.map((doc) => {
            const catColor = KNOWLEDGE_CATEGORY_COLORS[doc.category] || KNOWLEDGE_CATEGORY_COLORS.other;
            const catLabel = KNOWLEDGE_CATEGORY_LABELS[doc.category] || doc.category;
            const charCount = doc.charCount ?? doc.content.length;
            return (
              <div
                key={doc.id}
                className={`border rounded-xl p-4 ${doc.isActive ? "bg-white" : "bg-gray-50 opacity-70"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${catColor}`}>{catLabel}</span>
                      {doc.fileName && (
                        <span className="text-xs text-gray-400">📎 {doc.fileName}</span>
                      )}
                      <span className="text-xs text-gray-400">{charCount.toLocaleString()}文字</span>
                    </div>
                    <p className="font-medium text-gray-800 mt-1">{doc.title}</p>
                    {expandedId !== doc.id && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {doc.content.slice(0, 120)}
                        {doc.content.length > 120 && "..."}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={doc.isActive}
                        onChange={() => toggleActive(doc.id)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-gray-200 peer-checked:bg-teal-600 rounded-full peer peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
                    </label>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                    >
                      {expandedId === doc.id ? "▲" : "▼"}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(doc)}
                      className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id)}
                      className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                    >
                      削除
                    </button>
                  </div>
                </div>
                {expandedId === doc.id && (
                  <pre className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap font-sans">
                    {doc.content}
                  </pre>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
