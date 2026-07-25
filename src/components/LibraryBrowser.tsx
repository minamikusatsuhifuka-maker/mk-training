"use client";

// 資料庫の本体UI（指示書86＋87＋88＋89）
// - タブ: 「資料一覧」「変更履歴」。
// - 一覧: 検索窓＋カテゴリチップ（複数選択）＋件数。カード（開く/DL・編集・削除）。
// - 登録: 単発（＋資料を登録・確認フォーム）と、一括（ドラッグ&ドロップ/複数選択・89）。
//   一括はAI提案をそのまま自動確定で登録（wiki方式＝後から編集・履歴で担保）。
// - 88: 変更履歴の差し替えエントリから「旧版を開く/DL」できる（snapshot利用）。
// - 89 Part B: マウント時にまず auth.getUser() でセッションを確立してから取得（Cookie同期のレース対策）。
//   これをしないと初回ロードでサーバーがCookieを認識できず 401→「ログインが必要です」になる（profileページと同じ流儀）。

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Label } from "@/components/ui/label";
import {
  LIBRARY_CATEGORIES,
  LIBRARY_MAX_BYTES,
  isSupportedLibraryFile,
  filterDocs,
  fileKind,
  opensInBrowser,
  FILE_KIND_META,
  ACTION_META,
  genLibraryId,
  type LibraryDoc,
  type LibraryCategory,
  type LibraryLogEntry,
  type LibrarySuggestion,
} from "@/lib/library";

// キーワード文字列 → 配列（読点・カンマ・空白区切り）
function parseKeywords(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[,、\s]+/)
        .map((s) => s.trim())
        .filter((s) => s !== "")
    )
  ).slice(0, 10);
}

function formatDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 開く/ダウンロードのリンク先。PDFはそのまま新規タブ、それ以外は ?download で保存を促す。
function fileHref(d: {
  fileUrl: string;
  fileName: string;
  mimeType: string;
}): string {
  if (opensInBrowser(d.mimeType, d.fileName)) return d.fileUrl;
  const sep = d.fileUrl.includes("?") ? "&" : "?";
  return `${d.fileUrl}${sep}download=${encodeURIComponent(d.fileName || "download")}`;
}

const stripExt = (name: string) => name.replace(/\.[^.]+$/, "");

// ドロップされた DataTransfer からファイル一覧を取得（フォルダは webkitGetAsEntry で再帰走査・89）
async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const items = dt.items;
  // items API が使えない場合は通常の files（複数ファイル）にフォールバック
  const supportsEntry =
    items && items.length > 0 && typeof items[0].webkitGetAsEntry === "function";
  if (!supportsEntry) return Array.from(dt.files);

  // entry は同期的に取り出す必要がある（後で await すると items が失効するため）
  const entries: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const e = (items[i] as any).webkitGetAsEntry?.();
    if (e) entries.push(e);
  }
  const files: File[] = [];
  const walk = async (entry: any): Promise<void> => {
    if (entry.isFile) {
      const f: File = await new Promise((res, rej) => entry.file(res, rej));
      files.push(f);
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = (): Promise<any[]> =>
        new Promise((res, rej) => reader.readEntries(res, rej));
      let batch = await readBatch();
      while (batch.length > 0) {
        for (const en of batch) await walk(en);
        batch = await readBatch();
      }
    }
  };
  for (const e of entries) await walk(e);
  return files.length > 0 ? files : Array.from(dt.files);
}

// 限定並列でタスクを回す（AI解析の同時実行を2〜3に制限・89）
async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let i = 0;
  const n = Math.min(concurrency, items.length);
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        await worker(items[idx]);
      }
    })
  );
}

type FormState = {
  mode: "create" | "edit";
  id: string;
  file: File | null;
  fileName: string;
  mimeType: string;
  title: string;
  category: LibraryCategory;
  keywordsText: string;
  summary: string;
  searchText: string;
};

const EMPTY_FORM: FormState = {
  mode: "create",
  id: "",
  file: null,
  fileName: "",
  mimeType: "",
  title: "",
  category: "その他",
  keywordsText: "",
  summary: "",
  searchText: "",
};

type BulkStatus =
  | "待機中"
  | "AI解析中"
  | "登録中"
  | "登録済み"
  | "失敗"
  | "スキップ";

type BulkItem = {
  id: string;
  file: File;
  name: string;
  status: BulkStatus;
  reason?: string;
  title?: string;
  category?: string;
  dup?: boolean;
};

const BULK_STATUS_STYLE: Record<BulkStatus, string> = {
  待機中: "bg-muted text-muted-foreground",
  AI解析中: "bg-blue-100 text-blue-700",
  登録中: "bg-amber-100 text-amber-700",
  登録済み: "bg-emerald-100 text-emerald-700",
  失敗: "bg-red-100 text-red-700",
  スキップ: "bg-stone-200 text-stone-600",
};

export default function LibraryBrowser() {
  const [docs, setDocs] = useState<LibraryDoc[]>([]);
  const [log, setLog] = useState<LibraryLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [query, setQuery] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);

  // 登録/編集ダイアログ（単発）
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [fallbackNote, setFallbackNote] = useState(false);

  // 削除確認
  const [deleteTarget, setDeleteTarget] = useState<LibraryDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 一括登録（89）
  const [bulkItems, setBulkItems] = useState<BulkItem[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);
  const docsRef = useRef<LibraryDoc[]>([]);
  docsRef.current = docs;

  const refresh = useCallback(async () => {
    // 89 Part B: まずセッションを確立（Cookie同期）。未実施だと初回401になる。
    try {
      await getSupabaseBrowserClient().auth.getUser();
    } catch {
      /* noop */
    }
    try {
      let res = await fetch("/api/library", { cache: "no-store" });
      if (res.status === 401) {
        // レース対策: 少し待ってセッション再確認 → 1回だけ再試行
        await new Promise((r) => setTimeout(r, 800));
        try {
          await getSupabaseBrowserClient().auth.getUser();
        } catch {
          /* noop */
        }
        res = await fetch("/api/library", { cache: "no-store" });
      }
      if (res.status === 401) {
        setLoadError("ログインが必要です。ページを再読み込みしてください。");
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `読み込みに失敗しました (${res.status})`);
      }
      const data = await res.json();
      setDocs(Array.isArray(data.docs) ? data.docs : []);
      setLog(Array.isArray(data.log) ? data.log : []);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(
    () => filterDocs(docs, query, selectedCats),
    [docs, query, selectedCats]
  );

  const toggleCat = (cat: string) => {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // ─── 単発 登録/編集 ───
  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError("");
    setFallbackNote(false);
    setFormOpen(true);
  };

  const openEdit = (doc: LibraryDoc) => {
    setForm({
      mode: "edit",
      id: doc.id,
      file: null,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      title: doc.title,
      category: doc.category,
      keywordsText: doc.keywords.join("、"),
      summary: doc.summary,
      searchText: doc.searchText,
    });
    setFormError("");
    setFallbackNote(false);
    setFormOpen(true);
  };

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setForm((f) => ({ ...f, file, fileName: file.name, mimeType: file.type }));
    setFormError("");
    setFallbackNote(false);
    if (form.mode !== "create") return;

    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("fileName", file.name);
      const res = await fetch("/api/library/parse", { method: "POST", body: fd });
      const data = (await res.json()) as LibrarySuggestion & { error?: string };
      if (!res.ok) throw new Error(data.error || "AI提案に失敗しました");
      if (data.fallback) {
        setFallbackNote(true);
        setForm((f) => ({
          ...f,
          searchText: data.searchText || "",
          title: f.title || stripExt(file.name),
        }));
      } else {
        setForm((f) => ({
          ...f,
          title: data.title || stripExt(file.name),
          category: data.category,
          keywordsText: data.keywords.join("、"),
          summary: data.summary,
          searchText: data.searchText || "",
        }));
      }
    } catch {
      setFallbackNote(true);
      setForm((f) => ({ ...f, title: f.title || stripExt(file.name) }));
    } finally {
      setParsing(false);
    }
  };

  const submitForm = async () => {
    setFormError("");
    if (!form.title.trim()) {
      setFormError("タイトルを入力してください");
      return;
    }
    if (form.mode === "create" && !form.file) {
      setFormError("ファイルを選択してください");
      return;
    }
    setSubmitting(true);
    try {
      const keywords = parseKeywords(form.keywordsText);
      if (form.mode === "create") {
        const fd = new FormData();
        fd.append("file", form.file!);
        fd.append("fileName", form.fileName);
        fd.append("title", form.title.trim());
        fd.append("category", form.category);
        fd.append("keywords", JSON.stringify(keywords));
        fd.append("summary", form.summary.trim());
        fd.append("searchText", form.searchText);
        const res = await fetch("/api/library", { method: "POST", body: fd });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "登録に失敗しました");
        }
      } else {
        const res = await fetch("/api/library/manage", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "edit",
            id: form.id,
            title: form.title.trim(),
            category: form.category,
            keywords,
            summary: form.summary.trim(),
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "編集に失敗しました");
        }
        if (form.file) {
          const fd = new FormData();
          fd.append("id", form.id);
          fd.append("file", form.file);
          fd.append("fileName", form.fileName);
          const res2 = await fetch("/api/library/manage", {
            method: "POST",
            body: fd,
          });
          if (!res2.ok) {
            const j = await res2.json().catch(() => ({}));
            throw new Error(j.error || "ファイル差し替えに失敗しました");
          }
        }
      }
      setFormOpen(false);
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/library/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "削除に失敗しました");
      }
      setDeleteTarget(null);
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  const restore = async (docId: string) => {
    try {
      const res = await fetch("/api/library/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", id: docId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "復元に失敗しました");
      }
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "復元に失敗しました");
    }
  };

  const existingIds = useMemo(() => new Set(docs.map((d) => d.id)), [docs]);

  // ─── 一括登録（89） ───
  const patchBulk = (id: string, patch: Partial<BulkItem>) =>
    setBulkItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );

  // 1ファイル分: AI解析 → （直列化して）登録
  const processOne = useCallback(
    async (
      item: BulkItem,
      serializeRegister: (task: () => Promise<void>) => Promise<void>
    ) => {
      try {
        patchBulk(item.id, { status: "AI解析中" });
        let suggestion: (LibrarySuggestion & { error?: string }) | null = null;
        try {
          const fd = new FormData();
          fd.append("file", item.file);
          fd.append("fileName", item.name);
          const res = await fetch("/api/library/parse", {
            method: "POST",
            body: fd,
          });
          if (res.ok) suggestion = await res.json();
        } catch {
          /* AI失敗はファイル名で登録に落とす */
        }
        const usable = suggestion && !suggestion.fallback;
        const title = usable && suggestion!.title ? suggestion!.title : stripExt(item.name);
        const category = usable ? suggestion!.category : "その他";
        const keywords = usable ? suggestion!.keywords : [];
        const summary = usable ? suggestion!.summary : "";
        const searchText = suggestion?.searchText || "";

        patchBulk(item.id, { status: "登録中", title, category });
        await serializeRegister(async () => {
          const fd = new FormData();
          fd.append("file", item.file);
          fd.append("fileName", item.name);
          fd.append("title", title);
          fd.append("category", category);
          fd.append("keywords", JSON.stringify(keywords));
          fd.append("summary", summary);
          fd.append("searchText", searchText);
          const res = await fetch("/api/library", { method: "POST", body: fd });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || "登録に失敗しました");
          }
        });
        patchBulk(item.id, { status: "登録済み", title, category });
      } catch (e) {
        patchBulk(item.id, {
          status: "失敗",
          reason: e instanceof Error ? e.message : "失敗しました",
        });
      }
    },
    []
  );

  const startBulk = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const existingNames = new Set(docsRef.current.map((d) => d.fileName));
      const items: BulkItem[] = files.map((f) => {
        const base: BulkItem = {
          id: genLibraryId("bulk"),
          file: f,
          name: f.name,
          status: "待機中",
          dup: existingNames.has(f.name),
        };
        if (f.size === 0 || f.size > LIBRARY_MAX_BYTES) {
          return { ...base, status: "スキップ", reason: "サイズ超過（20MBまで）" };
        }
        if (!isSupportedLibraryFile(f.name, f.type)) {
          return { ...base, status: "スキップ", reason: "対応外の形式" };
        }
        return base;
      });
      setBulkItems(items);
      setBulkRunning(true);

      // portal_library への追記は上書き事故を避けるため直列化（89）
      let regChain: Promise<void> = Promise.resolve();
      const serializeRegister = (task: () => Promise<void>): Promise<void> => {
        const run = regChain.then(task);
        regChain = run.then(
          () => {},
          () => {}
        );
        return run;
      };

      const toProcess = items.filter((i) => i.status === "待機中");
      await runPool(toProcess, 3, (item) => processOne(item, serializeRegister));

      setBulkRunning(false);
      await refresh();
    },
    [processOne, refresh]
  );

  const retryOne = useCallback(
    async (item: BulkItem) => {
      // 単発リトライ（直列化不要＝そのまま実行）
      await processOne(item, (task) => task());
    },
    [processOne]
  );

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (bulkRunning) return;
    const files = await filesFromDataTransfer(e.dataTransfer);
    startBulk(files);
  };

  const bulkSummary = useMemo(() => {
    let done = 0,
      skip = 0,
      fail = 0;
    for (const it of bulkItems) {
      if (it.status === "登録済み") done++;
      else if (it.status === "スキップ") skip++;
      else if (it.status === "失敗") fail++;
    }
    const settled = done + skip + fail;
    return { done, skip, fail, settled, total: bulkItems.length };
  }, [bulkItems]);

  return (
    <div className="space-y-4">
      <Tabs defaultValue="docs" className="w-full">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="docs">📚 資料一覧</TabsTrigger>
            <TabsTrigger value="history">🕘 変更履歴</TabsTrigger>
          </TabsList>
          <Button onClick={openCreate} className="bg-teal text-teal-foreground">
            ＋資料を登録
          </Button>
        </div>

        {/* ─── 資料一覧 ─── */}
        <TabsContent value="docs" className="space-y-4 mt-4">
          {/* 一括ドロップゾーン（89） */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!bulkRunning) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !bulkRunning && bulkInputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
              dragOver
                ? "border-teal bg-teal/5"
                : "border-input hover:bg-muted/50"
            }`}
          >
            <p className="text-sm">
              📥 ここにファイルやフォルダをドラッグ&ドロップ、またはクリックして複数選択
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF / Word / PowerPoint / Excel（20MBまで）。AIが自動で分類して登録します。
            </p>
            <input
              ref={bulkInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,application/pdf"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) startBulk(files);
                e.target.value = "";
              }}
            />
          </div>

          {/* 一括キュー */}
          {bulkItems.length > 0 && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium">
                  一括登録: {bulkSummary.settled}/{bulkSummary.total}
                  {bulkRunning && (
                    <span className="text-red-600 ml-2">
                      登録中はページを閉じないでください
                    </span>
                  )}
                </p>
                {!bulkRunning && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setBulkItems([])}
                  >
                    クリア
                  </Button>
                )}
              </div>
              <div className="h-2 w-full bg-muted rounded overflow-hidden">
                <div
                  className="h-full bg-teal transition-all"
                  style={{
                    width: `${
                      bulkSummary.total
                        ? (bulkSummary.settled / bulkSummary.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              {!bulkRunning && bulkSummary.total > 0 && (
                <p className="text-sm text-muted-foreground">
                  ✅ {bulkSummary.done}件登録 ・ ⏭ {bulkSummary.skip}件スキップ ・ ✗{" "}
                  {bulkSummary.fail}件失敗
                </p>
              )}
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {bulkItems.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 text-sm border rounded px-2 py-1.5 flex-wrap"
                  >
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${BULK_STATUS_STYLE[it.status]}`}
                    >
                      {it.status}
                    </span>
                    <span className="truncate flex-1 min-w-0" title={it.name}>
                      {it.title || it.name}
                      {it.dup && (
                        <span className="text-amber-600 ml-1">⚠同名あり</span>
                      )}
                    </span>
                    {it.category && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {it.category}
                      </span>
                    )}
                    {it.reason && (
                      <span className="text-xs text-red-600 shrink-0">
                        {it.reason}
                      </span>
                    )}
                    {it.status === "失敗" && !bulkRunning && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryOne(it)}
                      >
                        再試行
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Input
              placeholder="キーワードで検索（タイトル・キーワード・要約・本文）"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {LIBRARY_CATEGORIES.map((cat) => {
                const active = selectedCats.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCat(cat)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      active
                        ? "bg-teal text-teal-foreground border-teal"
                        : "bg-background text-muted-foreground border-input hover:bg-muted"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
              {selectedCats.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCats([])}
                  className="px-3 py-1 rounded-full text-sm text-muted-foreground underline"
                >
                  クリア
                </button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {loading ? "読み込み中…" : `${filtered.length} 件`}
            </p>
          </div>

          {loadError && (
            <p className="text-sm text-red-600 bg-red-50 rounded p-3">
              {loadError}
            </p>
          )}

          {!loading && filtered.length === 0 && !loadError && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {docs.length === 0
                ? "まだ資料がありません。上のエリアにドラッグ&ドロップして登録してください。"
                : "条件に合う資料がありません。"}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((doc) => {
              const meta = FILE_KIND_META[fileKind(doc.mimeType, doc.fileName)];
              const isPdf = opensInBrowser(doc.mimeType, doc.fileName);
              return (
                <Card key={doc.id} className="flex flex-col">
                  <CardContent className="p-4 flex flex-col gap-3 flex-1">
                    <div className="flex items-start gap-2">
                      <span className="text-xl leading-none">{meta.icon}</span>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm leading-snug break-words">
                          {doc.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <Badge variant="secondary" className="text-xs">
                            {doc.category}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {meta.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    {doc.summary && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {doc.summary}
                      </p>
                    )}

                    {doc.keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {doc.keywords.slice(0, 6).map((k) => (
                          <span
                            key={k}
                            className="text-[11px] bg-muted text-muted-foreground rounded px-1.5 py-0.5"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted-foreground truncate">
                        {formatDateTime(doc.updatedAt)}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={fileHref(doc)}
                          target={isPdf ? "_blank" : undefined}
                          rel="noreferrer"
                        >
                          <Button size="sm" variant="outline">
                            {isPdf ? "開く" : "ダウンロード"}
                          </Button>
                        </a>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEdit(doc)}
                          aria-label="編集"
                        >
                          ✏️
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(doc)}
                          aria-label="削除"
                        >
                          🗑️
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ─── 変更履歴 ─── */}
        <TabsContent value="history" className="mt-4">
          {log.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              変更履歴はまだありません。
            </p>
          ) : (
            <div className="space-y-2">
              {log.map((e) => {
                const am = ACTION_META[e.action];
                const canRestore =
                  e.action === "delete" &&
                  e.snapshot &&
                  !existingIds.has(e.docId);
                // 88: 差し替えは snapshot（旧版）を開く/DL できる
                const prev =
                  e.action === "replace" && e.snapshot ? e.snapshot : null;
                const prevIsPdf = prev
                  ? opensInBrowser(prev.mimeType, prev.fileName)
                  : false;
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-3 border rounded-lg p-3 text-sm flex-wrap"
                  >
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${am.className}`}
                    >
                      {am.label}
                    </span>
                    <span className="font-medium break-words flex-1 min-w-0">
                      {e.docTitle || "（無題）"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {e.userName || "不明"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(e.at)}
                    </span>
                    {prev && (
                      <a
                        href={fileHref(prev)}
                        target={prevIsPdf ? "_blank" : undefined}
                        rel="noreferrer"
                      >
                        <Button size="sm" variant="outline">
                          {prevIsPdf ? "旧版を開く" : "旧版をDL"}
                        </Button>
                      </a>
                    )}
                    {canRestore && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => restore(e.docId)}
                      >
                        復元
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── 登録/編集ダイアログ（単発） ─── */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {form.mode === "create" ? "資料を登録" : "資料を編集"}
            </DialogTitle>
            <DialogDescription>
              {form.mode === "create"
                ? "登録するとすぐに全員に共有されます。ファイルを選ぶとAIが内容を読んで下書きを提案します。"
                : "内容を修正できます。ファイルを選び直すと差し替えられます。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>
                ファイル
                {form.mode === "edit" && (
                  <span className="text-xs text-muted-foreground ml-2">
                    （変更する場合のみ選択）
                  </span>
                )}
              </Label>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,application/pdf"
                onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-input file:bg-background file:text-sm hover:file:bg-muted"
              />
              {form.fileName && (
                <p className="text-xs text-muted-foreground truncate">
                  {form.fileName}
                </p>
              )}
              {parsing && (
                <p className="text-xs text-teal">AIが内容を読み取っています…</p>
              )}
              {fallbackNote && (
                <p className="text-xs text-amber-600">
                  このファイルは自動読み取りできませんでした。手入力で登録できます。
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lib-title">タイトル</Label>
              <Input
                id="lib-title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="例: ほくろ切除 同意書"
              />
            </div>

            <div className="space-y-1.5">
              <Label>カテゴリ</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, category: v as LibraryCategory }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LIBRARY_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lib-keywords">
                キーワード
                <span className="text-xs text-muted-foreground ml-2">
                  （読点・カンマ・スペース区切り）
                </span>
              </Label>
              <Input
                id="lib-keywords"
                value={form.keywordsText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, keywordsText: e.target.value }))
                }
                placeholder="ほくろ、切除、局所麻酔"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lib-summary">1行要約</Label>
              <Textarea
                id="lib-summary"
                value={form.summary}
                onChange={(e) =>
                  setForm((f) => ({ ...f, summary: e.target.value }))
                }
                rows={2}
                placeholder="資料の内容を1行で"
              />
            </div>

            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button
              onClick={submitForm}
              disabled={submitting || parsing}
              className="bg-teal text-teal-foreground"
            >
              {submitting
                ? "保存中…"
                : form.mode === "create"
                  ? "登録して全員に共有"
                  : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 削除確認 ─── */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この資料を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{deleteTarget?.title}」を削除します。削除後も変更履歴から復元できます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? "削除中…" : "削除する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
