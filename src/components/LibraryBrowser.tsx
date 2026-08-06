"use client";

// 資料庫の本体UI（指示書86＋87＋88＋89＋100）
// - タブ: 「資料一覧」「変更履歴」。
// - 一覧: 検索窓＋カテゴリチップ（複数選択）＋件数。カード（開く/DL・編集・削除）。
// - 登録: 単発（＋資料を登録・確認フォーム）と、一括（ドラッグ&ドロップ/複数選択・89）。
//   一括はAI提案をそのまま自動確定で登録（wiki方式＝後から編集・履歴で担保）。
// - 88: 変更履歴の差し替えエントリから「旧版を開く/DL」できる（snapshot利用）。
// - 89 Part B: マウント時にまず auth.getUser() でセッションを確立してから取得（Cookie同期のレース対策）。
//   これをしないと初回ロードでサーバーがCookieを認識できず 401→「ログインが必要です」になる（profileページと同じ流儀）。
// - 100: カード本体クリックでブラウザ内プレビュー（LibraryPreviewModal）。★/編集/削除/DL/印刷/
//   タグチップ/更新待ちバナーは stopPropagation でプレビューを開かない。

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
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
import LibraryPreviewModal from "@/components/LibraryPreviewModal";
import { isAdminUser } from "@/lib/admin-role";
import { LibraryCleanupPanel } from "@/components/LibraryCleanupPanel";
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
  collectTreatmentCounts,
  allKnownTreatments,
  UNTAGGED_CHIP,
  docVersionNumber,
  findUpdateCandidates,
  findFilenameMatch,
  reviewStatus,
  isReviewDue,
  oneYearFromTodayYmd,
  findTagMergeSuggestions,
  normalizeLinkUrl,
  detectLinkProvider,
  docDisplayMeta,
  type DocKind,
  type LibraryDoc,
  type LibraryCategory,
  type LibraryLogEntry,
  type LibrarySuggestion,
  type DocVersion,
  type UpdateCandidate,
} from "@/lib/library";

// ログイン中の管理者判定（GanttChart と同じ流儀・一括タグ付けボタンの表示制御）
function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setIsAdmin(isAdminUser(data.user)))
      .catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAdmin(isAdminUser(session?.user ?? null));
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return isAdmin;
}

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

// 開く/ダウンロードのリンク先。リンク型は linkUrl、PDFはそのまま新規タブ、
// それ以外のファイルは ?download で保存を促す（101でリンク型対応）。
function fileHref(d: {
  fileUrl: string;
  fileName: string;
  mimeType: string;
  kind?: DocKind;
  linkUrl?: string;
}): string {
  if (d.kind === "link" && d.linkUrl) return d.linkUrl;
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
  kind: DocKind; // 📎ファイル / 🔗リンク（指示書101）
  linkUrl: string;
  file: File | null;
  fileName: string;
  mimeType: string;
  title: string;
  category: LibraryCategory;
  keywordsText: string;
  treatmentsText: string;
  summary: string;
  searchText: string;
  reviewDueAt: string;
};

const EMPTY_FORM: FormState = {
  mode: "create",
  id: "",
  kind: "file",
  linkUrl: "",
  file: null,
  fileName: "",
  mimeType: "",
  title: "",
  category: "その他",
  keywordsText: "",
  treatmentsText: "",
  summary: "",
  searchText: "",
  reviewDueAt: "",
};

// 施術タグ一括付与のキュー項目
type TagStatus =
  | "待機中"
  | "AI解析中"
  | "保存中"
  | "付与済み"
  | "タグなし"
  | "失敗";
type TagItem = {
  id: string;
  docId: string;
  name: string;
  status: TagStatus;
  tags?: string[];
  reason?: string;
};
const TAG_STATUS_STYLE: Record<TagStatus, string> = {
  待機中: "bg-muted text-muted-foreground",
  AI解析中: "bg-blue-100 text-blue-700",
  保存中: "bg-amber-100 text-amber-700",
  付与済み: "bg-emerald-100 text-emerald-700",
  タグなし: "bg-stone-200 text-stone-600",
  失敗: "bg-red-100 text-red-700",
};

const TREATMENT_CHIPS_INITIAL = 12; // 「もっと見る」前の初期表示数

type BulkStatus =
  | "待機中"
  | "AI解析中"
  | "登録中"
  | "登録済み"
  | "更新待ち"
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
  更新待ち: "bg-cyan-100 text-cyan-700",
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

  // 101: サイドバー「📖 マニュアル」等からの ?category= で初期カテゴリを設定
  // （パラメータなしは従来どおり全件。同一ページ内でのクエリ変化にも追随する）
  const searchParams = useSearchParams();
  const categoryParam = searchParams.get("category");
  // 107: ?doc=<id> で該当資料のプレビューを直接開く（マニュアル下書きの libraryRef リンク先）
  const docParam = searchParams.get("doc");
  useEffect(() => {
    if (
      categoryParam &&
      (LIBRARY_CATEGORIES as readonly string[]).includes(categoryParam)
    ) {
      setSelectedCats([categoryParam]);
    }
  }, [categoryParam]);

  // A お気に入り（指示書97/99）: staff_profile.favoriteDocIds。★保存は { favoriteDocIds } のみ部分更新
  // （PUTは "favoriteDocIds" in body のときだけ更新・未送信は既存保持なので、全体PUTは不要＝上書き事故を防ぐ）
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const profileLoadedRef = useRef(false); // 自分のプロフィールを取得できたか（未ログイン判定用）
  // B 最近開いた（指示書97）: localStorage・id配列・最大5
  const [recentIds, setRecentIds] = useState<string[]>([]);
  // 100: 「最近開いた資料」の折りたたみ（既定=閉・localStorageに開閉を記憶）
  const [recentOpen, setRecentOpen] = useState(false);
  // 102: 「🧹 整えるとよい資料」の折りたたみ（既定=閉・件数バッジは常時表示）
  const [cleanupOpen, setCleanupOpen] = useState(false);
  // 100: ブラウザ内プレビュー対象
  const [previewDoc, setPreviewDoc] = useState<LibraryDoc | null>(null);
  const [selectedTreatments, setSelectedTreatments] = useState<string[]>([]);
  const [showAllTags, setShowAllTags] = useState(false);
  const isAdmin = useIsAdmin();

  // 施術タグ一括付与
  const [tagItems, setTagItems] = useState<TagItem[]>([]);
  const [tagRunning, setTagRunning] = useState(false);

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

  // 版のロールバック確認（指示書95）
  const [rollbackTarget, setRollbackTarget] = useState<{
    docId: string;
    version: DocVersion;
  } | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  // 更新検知の候補ダイアログ（指示書96・単発登録時）
  const [candidatePrompt, setCandidatePrompt] = useState<{
    candidates: UpdateCandidate[];
    keywords: string[];
    treatments: string[];
  } | null>(null);
  // 更新承認ダイアログ（タイトル保持/採用の選択）
  const [approveTarget, setApproveTarget] = useState<LibraryDoc | null>(null);
  const [keepTitle, setKeepTitle] = useState(true);
  const [resetReview, setResetReview] = useState(true); // 承認時に見直し日を1年後（既定ON・指示書98）
  const [approving, setApproving] = useState(false);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  // E: 「⏰見直し時期」チップ選択（指示書98）
  const [reviewFilterOn, setReviewFilterOn] = useState(false);
  // F: タグ統合の確認（どちらに寄せるか確定後の対象）
  const [mergeTarget, setMergeTarget] = useState<{
    from: string;
    to: string;
    count: number;
  } | null>(null);
  const [merging, setMerging] = useState(false);

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

  // A: 自分のプロフィールから現在の★一覧(favoriteDocIds)だけを取得（指示書99: 全体保持はしない）
  useEffect(() => {
    (async () => {
      try {
        await getSupabaseBrowserClient().auth.getUser();
      } catch {
        /* noop */
      }
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const p = data?.profile;
        if (p && typeof p === "object") {
          profileLoadedRef.current = true;
          setFavoriteIds(
            Array.isArray(p.favoriteDocIds)
              ? (p.favoriteDocIds as string[])
              : []
          );
        }
      } catch {
        /* 未ログイン等は★非表示のまま */
      }
    })();
  }, []);

  // B: 最近開いた（localStorage）
  useEffect(() => {
    try {
      const raw = localStorage.getItem("mk_library_recent");
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) setRecentIds(arr.filter((v) => typeof v === "string").slice(0, 5));
    } catch {
      /* noop */
    }
    // 100/102: 折りたたみ状態の復元（既定は閉）
    try {
      setRecentOpen(localStorage.getItem("mk_library_recent_open") === "1");
      setCleanupOpen(localStorage.getItem("mk_library_cleanup_open") === "1");
    } catch {
      /* noop */
    }
  }, []);

  const toggleRecentOpen = () => {
    setRecentOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem("mk_library_recent_open", next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const toggleCleanupOpen = () => {
    setCleanupOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem("mk_library_cleanup_open", next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const recordRecent = useCallback((docId: string) => {
    setRecentIds((prev) => {
      const next = [docId, ...prev.filter((id) => id !== docId)].slice(0, 5);
      try {
        localStorage.setItem("mk_library_recent", JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const isFavorite = (id: string) => favoriteIds.includes(id);

  // 100: プレビューを開く（開いた時点で「最近開いた」に記録）
  const openPreview = useCallback(
    (doc: LibraryDoc) => {
      recordRecent(doc.id);
      setPreviewDoc(doc);
    },
    [recordRecent]
  );

  // 107: ?doc=<id> のディープリンク解決（docs ロード後に1回だけプレビューを開く）。
  // 削除済み資料は store.docs に存在しない（物理削除・ゴミ箱=log snapshot のみ）ため、
  // find で見つからない＝「見つからない」扱いになり、通常の一覧をそのまま表示する。
  const openedDocParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!docParam || loading) return;
    if (openedDocParamRef.current === docParam) return; // 同一IDは再度開かない
    const doc = docs.find((d) => d.id === docParam);
    if (doc) {
      openedDocParamRef.current = docParam;
      openPreview(doc);
    }
  }, [docParam, loading, docs, openPreview]);

  // A: ★トグル（楽観更新＋失敗ロールバック）。指示書99: { favoriteDocIds } だけを部分更新PUT
  // （プロフィール全体は送らない＝別画面で編集した自己紹介・価値観・サーベイ等を古い値で上書きしない）
  const toggleFavorite = useCallback(
    async (docId: string) => {
      const prev = favoriteIds;
      const next = prev.includes(docId)
        ? prev.filter((id) => id !== docId)
        : [...prev, docId];
      setFavoriteIds(next); // 楽観更新
      if (!profileLoadedRef.current) {
        // プロフィール未取得（未ログイン等）は保存できないのでロールバック
        setFavoriteIds(prev);
        setLoadError("お気に入りの保存にはログインが必要です。");
        return;
      }
      try {
        const res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ favoriteDocIds: next }),
        });
        if (!res.ok) throw new Error("保存失敗");
      } catch {
        setFavoriteIds(prev); // ロールバック
        setLoadError("お気に入りの保存に失敗しました。");
      }
    },
    [favoriteIds]
  );

  const untaggedSelected = selectedTreatments.includes(UNTAGGED_CHIP);
  const realTreatments = useMemo(
    () => selectedTreatments.filter((t) => t !== UNTAGGED_CHIP),
    [selectedTreatments]
  );
  const filtered = useMemo(() => {
    const base = filterDocs(
      docs,
      query,
      selectedCats,
      realTreatments,
      untaggedSelected
    );
    return reviewFilterOn ? base.filter((d) => isReviewDue(d.reviewDueAt)) : base;
  }, [docs, query, selectedCats, realTreatments, untaggedSelected, reviewFilterOn]);

  // 施術・機器タグの集計（件数つき・多い順）
  const treatmentCounts = useMemo(
    () => collectTreatmentCounts(docs),
    [docs]
  );
  const untaggedCount = useMemo(
    () => docs.filter((d) => d.treatments.length === 0).length,
    [docs]
  );
  // E: 見直し時期（超過＋30日以内）の件数
  const reviewDueCount = useMemo(
    () => docs.filter((d) => isReviewDue(d.reviewDueAt)).length,
    [docs]
  );
  // F: 整理アシストの検出（0件なら非表示に使う）
  const cleanup = useMemo(() => {
    const noTags = docs.filter((d) => d.treatments.length === 0);
    const noSummary = docs.filter((d) => !d.summary.trim());
    const noReview = docs.filter((d) => !d.reviewDueAt);
    const mergePairs = findTagMergeSuggestions(docs);
    return { noTags, noSummary, noReview, mergePairs };
  }, [docs]);
  // 102: 検出総件数（タグなし＋要約空＋期限未設定＋表記ゆれ組数）。閉じていても気づけるバッジ用
  const cleanupCount =
    cleanup.noTags.length +
    cleanup.noSummary.length +
    cleanup.noReview.length +
    cleanup.mergePairs.length;

  const toggleCat = (cat: string) => {
    setSelectedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleTreatment = (tag: string) => {
    setSelectedTreatments((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
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
      kind: doc.kind,
      linkUrl: doc.linkUrl,
      file: null,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      title: doc.title,
      category: doc.category,
      keywordsText: doc.keywords.join("、"),
      treatmentsText: doc.treatments.join("、"),
      summary: doc.summary,
      searchText: doc.searchText,
      reviewDueAt: doc.reviewDueAt || "",
    });
    setFormError("");
    setFallbackNote(false);
    setFormOpen(true);
  };

  // 101: YouTube URL なら oEmbed でタイトルを自動取得して下書きに入れる
  // （YouTube自身への問い合わせのみ・失敗しても手入力で継続できる）
  const fetchLinkTitle = async (url: string) => {
    if (detectLinkProvider(url) !== "youtube") return;
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      );
      if (!res.ok) return;
      const data = await res.json();
      const t = typeof data?.title === "string" ? data.title.trim() : "";
      if (t) setForm((f) => (f.title ? f : { ...f, title: t }));
    } catch {
      /* 取得失敗は無視（手入力で継続） */
    }
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
      fd.append("knownTags", JSON.stringify(allKnownTreatments(docsRef.current)));
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
          treatmentsText: (data.treatments || []).join("、"),
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

  // 新規として登録
  const doCreateNew = async (keywords: string[], treatments: string[]) => {
    const fd = new FormData();
    fd.append("file", form.file!);
    fd.append("fileName", form.fileName);
    fd.append("title", form.title.trim());
    fd.append("category", form.category);
    fd.append("keywords", JSON.stringify(keywords));
    fd.append("treatments", JSON.stringify(treatments));
    fd.append("summary", form.summary.trim());
    fd.append("searchText", form.searchText);
    fd.append("reviewDueAt", form.reviewDueAt);
    const res = await fetch("/api/library", { method: "POST", body: fd });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "登録に失敗しました");
    }
  };

  // 既存docの「更新待ち」を作成（承認は別途）
  const createPendingForDoc = async (
    docId: string,
    keywords: string[],
    treatments: string[]
  ) => {
    const fd = new FormData();
    fd.append("id", docId);
    fd.append("file", form.file!);
    fd.append("fileName", form.fileName);
    fd.append("title", form.title.trim());
    fd.append("keywords", JSON.stringify(keywords));
    fd.append("treatments", JSON.stringify(treatments));
    fd.append("summary", form.summary.trim());
    fd.append("searchText", form.searchText);
    const res = await fetch("/api/library/manage", { method: "POST", body: fd });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || "更新待ちの作成に失敗しました");
    }
  };

  const submitForm = async () => {
    setFormError("");
    if (!form.title.trim()) {
      setFormError("タイトルを入力してください");
      return;
    }
    const keywords = parseKeywords(form.keywordsText);
    const treatments = parseKeywords(form.treatmentsText).slice(0, 5);

    // ─── 101: リンク型（URL検証は登録/編集共通・httpsのみ） ───
    if (form.kind === "link") {
      const linkUrl = normalizeLinkUrl(form.linkUrl);
      if (!linkUrl) {
        setFormError("https:// で始まる正しいURLを入力してください");
        return;
      }
      setSubmitting(true);
      try {
        if (form.mode === "create") {
          const fd = new FormData();
          fd.append("kind", "link");
          fd.append("linkUrl", linkUrl);
          fd.append("title", form.title.trim());
          fd.append("category", form.category);
          fd.append("keywords", JSON.stringify(keywords));
          fd.append("treatments", JSON.stringify(treatments));
          fd.append("summary", form.summary.trim());
          fd.append("reviewDueAt", form.reviewDueAt);
          const res = await fetch("/api/library", { method: "POST", body: fd });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || "登録に失敗しました");
          }
        } else {
          // URL変更は通常の編集（版は作らない・変更履歴に残る）
          const res = await fetch("/api/library/manage", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "edit",
              id: form.id,
              linkUrl,
              title: form.title.trim(),
              category: form.category,
              keywords,
              treatments,
              summary: form.summary.trim(),
              reviewDueAt: form.reviewDueAt,
            }),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || "編集に失敗しました");
          }
        }
        setFormOpen(false);
        await refresh();
      } catch (e) {
        setFormError(e instanceof Error ? e.message : "処理に失敗しました");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ─── ファイル型（従来どおり） ───
    if (form.mode === "create" && !form.file) {
      setFormError("ファイルを選択してください");
      return;
    }

    // 指示書96: 単発登録は既存資料の更新候補を検知してダイアログで確認
    if (form.mode === "create") {
      const cands = findUpdateCandidates(docsRef.current, form.fileName, form.title);
      if (cands.length > 0) {
        setCandidatePrompt({ candidates: cands, keywords, treatments });
        return; // ユーザーの選択待ち
      }
    }

    setSubmitting(true);
    try {
      if (form.mode === "create") {
        await doCreateNew(keywords, treatments);
      } else {
        // メタ編集は即時、ファイル差し替えは「更新待ち」として承認経路へ（指示書96）
        const res = await fetch("/api/library/manage", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "edit",
            id: form.id,
            title: form.title.trim(),
            category: form.category,
            keywords,
            treatments,
            summary: form.summary.trim(),
            reviewDueAt: form.reviewDueAt,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "編集に失敗しました");
        }
        if (form.file) {
          await createPendingForDoc(form.id, [], []); // 差し替えファイルは更新待ちに（メタは編集済み）
          setFormError("");
          alert("ファイルは更新待ちになりました。カードの「✅承認して差し替え」で公開されます。");
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

  // 候補ダイアログ: 「更新として登録」（更新待ちを作る）
  const chooseUpdateCandidate = async (docId: string) => {
    if (!candidatePrompt) return;
    setSubmitting(true);
    try {
      await createPendingForDoc(
        docId,
        candidatePrompt.keywords,
        candidatePrompt.treatments
      );
      setCandidatePrompt(null);
      setFormOpen(false);
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "更新待ちの作成に失敗しました");
      setCandidatePrompt(null);
    } finally {
      setSubmitting(false);
    }
  };

  // 候補ダイアログ: 「別資料として登録」（新規）
  const chooseNewInstead = async () => {
    if (!candidatePrompt) return;
    setSubmitting(true);
    try {
      await doCreateNew(candidatePrompt.keywords, candidatePrompt.treatments);
      setCandidatePrompt(null);
      setFormOpen(false);
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "登録に失敗しました");
      setCandidatePrompt(null);
    } finally {
      setSubmitting(false);
    }
  };

  // 更新待ちの承認（誰でも・タイトル保持/採用を選択）
  const approveUpdate = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      const res = await fetch("/api/library/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approveUpdate",
          id: approveTarget.id,
          keepTitle,
          resetReview,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "承認に失敗しました");
      }
      setApproveTarget(null);
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "承認に失敗しました");
    } finally {
      setApproving(false);
    }
  };

  // 更新待ちの取り下げ
  const withdrawUpdate = async (docId: string) => {
    setBusyDocId(docId);
    try {
      const res = await fetch("/api/library/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "withdrawUpdate", id: docId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "取り下げに失敗しました");
      }
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "取り下げに失敗しました");
    } finally {
      setBusyDocId(null);
    }
  };

  // F: タグ統合の実行（全docのtreatmentsを from→to 置換）
  const doMergeTag = async () => {
    if (!mergeTarget) return;
    setMerging(true);
    try {
      const res = await fetch("/api/library/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mergeTag",
          from: mergeTarget.from,
          to: mergeTarget.to,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "タグ統合に失敗しました");
      }
      setMergeTarget(null);
      await refresh();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "タグ統合に失敗しました");
    } finally {
      setMerging(false);
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

  const doRollback = async () => {
    if (!rollbackTarget) return;
    setRollingBack(true);
    try {
      const res = await fetch("/api/library/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rollback",
          id: rollbackTarget.docId,
          versionId: rollbackTarget.version.versionId,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "版の復元に失敗しました");
      }
      setRollbackTarget(null);
      await refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "版の復元に失敗しました");
    } finally {
      setRollingBack(false);
    }
  };

  const existingIds = useMemo(() => new Set(docs.map((d) => d.id)), [docs]);

  // 更新待ちのdoc（指示書96・版の更新タブ上部）
  const pendingDocs = useMemo(
    () => docs.filter((d) => d.pendingUpdate),
    [docs]
  );
  // 承認済み更新の時系列（全docのversions[]を新しい順・下部リスト）
  const versionTimeline = useMemo(() => {
    const rows = docs.flatMap((d) =>
      d.versions.map((v) => ({ doc: d, version: v }))
    );
    return rows.sort((a, b) =>
      (b.version.replacedAt || "").localeCompare(a.version.replacedAt || "")
    );
  }, [docs]);

  // 編集中docの最新状態（版履歴はrefresh後のdocsから引き、rollback直後も更新される）
  const editingDoc =
    form.mode === "edit" ? docs.find((d) => d.id === form.id) ?? null : null;

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
          fd.append(
            "knownTags",
            JSON.stringify(allKnownTreatments(docsRef.current))
          );
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
        const treatments = usable ? suggestion!.treatments || [] : [];
        const summary = usable ? suggestion!.summary : "";
        const searchText = suggestion?.searchText || "";

        // 指示書96: ファイル名一致は既存資料の「更新待ち」にする（新規即公開しない）
        const match = findFilenameMatch(docsRef.current, item.name);
        patchBulk(item.id, { status: "登録中", title, category });
        await serializeRegister(async () => {
          const fd = new FormData();
          fd.append("file", item.file);
          fd.append("fileName", item.name);
          if (match) {
            fd.append("id", match.id);
            fd.append("title", title);
            fd.append("keywords", JSON.stringify(keywords));
            fd.append("treatments", JSON.stringify(treatments));
            fd.append("summary", summary);
            fd.append("searchText", searchText);
            const res = await fetch("/api/library/manage", { method: "POST", body: fd });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              throw new Error(j.error || "更新待ちの作成に失敗しました");
            }
          } else {
            fd.append("title", title);
            fd.append("category", category);
            fd.append("keywords", JSON.stringify(keywords));
            fd.append("treatments", JSON.stringify(treatments));
            fd.append("summary", summary);
            fd.append("searchText", searchText);
            const res = await fetch("/api/library", { method: "POST", body: fd });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              throw new Error(j.error || "登録に失敗しました");
            }
          }
        });
        patchBulk(item.id, {
          status: match ? "更新待ち" : "登録済み",
          title: match ? `🔄 更新待ち: ${match.title}` : title,
          category,
        });
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

  // ─── 既存資料への施術タグ一括付与（管理者のみ・89の仕組みを流用・指示書90） ───
  const patchTag = (id: string, patch: Partial<TagItem>) =>
    setTagItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );

  const knownTagsRef = useRef<string[]>([]);

  const processTag = useCallback(
    async (
      item: TagItem,
      serializeSave: (task: () => Promise<void>) => Promise<void>
    ) => {
      const doc = docsRef.current.find((d) => d.id === item.docId);
      if (!doc) {
        patchTag(item.id, { status: "失敗", reason: "資料が見つかりません" });
        return;
      }
      try {
        patchTag(item.id, { status: "AI解析中" });
        let treatments: string[] = [];
        const fd = new FormData();
        fd.append("fileName", doc.fileName);
        fd.append("searchText", doc.searchText);
        fd.append("knownTags", JSON.stringify(knownTagsRef.current));
        const res = await fetch("/api/library/parse", {
          method: "POST",
          body: fd,
        });
        if (res.ok) {
          const s = (await res.json()) as LibrarySuggestion;
          treatments = (s.treatments || []).slice(0, 5);
        }
        if (treatments.length === 0) {
          patchTag(item.id, { status: "タグなし" });
          return;
        }
        patchTag(item.id, { status: "保存中", tags: treatments });
        await serializeSave(async () => {
          const r = await fetch("/api/library/manage", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "edit",
              id: doc.id,
              treatments,
              note: `施術タグ付与: ${treatments.join("、")}`,
            }),
          });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j.error || "保存に失敗しました");
          }
        });
        // 以降のファイルが既存タグを優先できるよう共有一覧を更新
        knownTagsRef.current = Array.from(
          new Set([...knownTagsRef.current, ...treatments])
        );
        patchTag(item.id, { status: "付与済み", tags: treatments });
      } catch (e) {
        patchTag(item.id, {
          status: "失敗",
          reason: e instanceof Error ? e.message : "失敗しました",
        });
      }
    },
    []
  );

  const startTagging = useCallback(async () => {
    if (tagRunning) return;
    knownTagsRef.current = allKnownTreatments(docsRef.current);
    // 対象: treatments 未設定（空）のdocのみ。searchText 空はスキップ（タグなし）
    const candidates = docsRef.current.filter(
      (d) => d.treatments.length === 0
    );
    if (candidates.length === 0) {
      setTagItems([]);
      setLoadError("施術タグ未設定の資料はありません。");
      return;
    }
    const items: TagItem[] = candidates.map((d) => {
      const base: TagItem = {
        id: genLibraryId("tag"),
        docId: d.id,
        name: d.title || d.fileName,
        status: "待機中",
      };
      if (!d.searchText || !d.searchText.trim()) {
        return { ...base, status: "タグなし", reason: "本文なし" };
      }
      return base;
    });
    setTagItems(items);
    setTagRunning(true);

    let saveChain: Promise<void> = Promise.resolve();
    const serializeSave = (task: () => Promise<void>): Promise<void> => {
      const run = saveChain.then(task);
      saveChain = run.then(
        () => {},
        () => {}
      );
      return run;
    };

    const toProcess = items.filter((i) => i.status === "待機中");
    await runPool(toProcess, 3, (item) => processTag(item, serializeSave));

    setTagRunning(false);
    await refresh();
  }, [tagRunning, processTag, refresh]);

  const retryTag = useCallback(
    async (item: TagItem) => {
      await processTag(item, (task) => task());
      await refresh();
    },
    [processTag, refresh]
  );

  const tagSummary = useMemo(() => {
    let assigned = 0,
      none = 0,
      fail = 0;
    for (const it of tagItems) {
      if (it.status === "付与済み") assigned++;
      else if (it.status === "タグなし") none++;
      else if (it.status === "失敗") fail++;
    }
    const settled = assigned + none + fail;
    return { assigned, none, fail, settled, total: tagItems.length };
  }, [tagItems]);

  // お気に入り資料（★セクション用・検索/絞り込みの影響を受けない）
  const favoriteDocs = useMemo(
    () => docs.filter((d) => favoriteIds.includes(d.id)),
    [docs, favoriteIds]
  );
  // 最近開いた資料（recentIds順・削除済みidはスキップ）
  const recentDocs = useMemo(() => {
    const byId = new Map(docs.map((d) => [d.id, d]));
    return recentIds
      .map((id) => byId.get(id))
      .filter((d): d is LibraryDoc => !!d)
      .slice(0, 5);
  }, [docs, recentIds]);

  // 1資料カードの描画（一覧・★よく使う資料 で共用）
  // 100: カード本体クリックでプレビュー。操作ボタン類は stopPropagation で開かない。
  // 101: リンク型は ▶️/🔗＋プロバイダ名、ボタンは「開く」（新規タブ）。
  const renderCard = (doc: LibraryDoc) => {
    const meta = docDisplayMeta(doc);
    const isLink = doc.kind === "link";
    const isPdf = !isLink && opensInBrowser(doc.mimeType, doc.fileName);
    const openInTab = isLink || isPdf;
    const fav = isFavorite(doc.id);
    return (
      <Card
        key={doc.id}
        className="flex flex-col cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => openPreview(doc)}
      >
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
                <span className="text-xs text-muted-foreground">{meta.label}</span>
                {docVersionNumber(doc) > 1 && (
                  <span className="text-[10px] font-medium bg-slate-100 text-slate-600 rounded px-1.5 py-0.5">
                    v{docVersionNumber(doc)}
                  </span>
                )}
                {reviewStatus(doc.reviewDueAt) === "overdue" && (
                  <span className="text-[10px] font-medium bg-red-100 text-red-700 rounded px-1.5 py-0.5">
                    ⏰ 見直し時期です
                  </span>
                )}
                {reviewStatus(doc.reviewDueAt) === "soon" && (
                  <span className="text-[10px] font-medium bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
                    ⏰ まもなく見直し
                  </span>
                )}
              </div>
            </div>
            {/* A: お気に入り★トグル */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(doc.id);
              }}
              aria-label={fav ? "お気に入り解除" : "お気に入りに追加"}
              title={fav ? "お気に入り解除" : "お気に入りに追加"}
              className={`shrink-0 text-lg leading-none ${fav ? "text-amber-500" : "text-gray-300 hover:text-amber-400"}`}
            >
              {fav ? "★" : "☆"}
            </button>
          </div>

          {/* 更新待ちバナー（指示書96）。100: バナー内の操作はプレビューを開かない */}
          {doc.pendingUpdate && (
            <div
              className="rounded-lg border border-cyan-300 bg-cyan-50 p-2 space-y-2"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs text-cyan-800">
                🔄 更新待ちあり（{doc.pendingUpdate.uploadedByName || "不明"}・
                {formatDateTime(doc.pendingUpdate.uploadedAt)}）
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <a
                  href={fileHref({
                    fileUrl: doc.pendingUpdate.fileUrl,
                    fileName: doc.pendingUpdate.fileName,
                    mimeType: doc.pendingUpdate.mimeType,
                  })}
                  target={opensInBrowser(doc.pendingUpdate.mimeType, doc.pendingUpdate.fileName) ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  <Button size="sm" variant="outline">新版を開く</Button>
                </a>
                <a href={fileHref(doc)} target={isPdf ? "_blank" : undefined} rel="noreferrer">
                  <Button size="sm" variant="outline">現行版を開く</Button>
                </a>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => {
                    setKeepTitle(true);
                    setApproveTarget(doc);
                  }}
                  disabled={busyDocId === doc.id}
                >
                  ✅ 承認して差し替え
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => withdrawUpdate(doc.id)}
                  disabled={busyDocId === doc.id}
                >
                  ↩ 取り下げ
                </Button>
              </div>
            </div>
          )}

          {doc.summary && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {doc.summary}
            </p>
          )}

          {doc.treatments.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {doc.treatments.map((t) => (
                <span
                  key={t}
                  onClick={(e) => e.stopPropagation()}
                  className="text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-full px-2 py-0.5"
                >
                  🏷 {t}
                </span>
              ))}
            </div>
          )}

          {doc.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {doc.keywords.slice(0, 6).map((k) => (
                <span
                  key={k}
                  onClick={(e) => e.stopPropagation()}
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
                target={openInTab ? "_blank" : undefined}
                rel="noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                  recordRecent(doc.id);
                }}
              >
                <Button size="sm" variant="outline">
                  {openInTab ? "開く" : "ダウンロード"}
                </Button>
              </a>
              {/* C: PDFのみ印刷（新規タブ表示） */}
              {isPdf && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    recordRecent(doc.id);
                    window.open(doc.fileUrl, "_blank", "noopener,noreferrer");
                  }}
                  title="新規タブで開いて印刷"
                >
                  🖨 印刷
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(doc);
                }}
                aria-label="編集"
              >
                ✏️
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(doc);
                }}
                aria-label="削除"
              >
                🗑️
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="docs" className="w-full">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <TabsList>
            <TabsTrigger value="docs">📚 資料一覧</TabsTrigger>
            <TabsTrigger value="updates">
              🔄 版の更新
              {pendingDocs.length > 0 && (
                <span className="ml-1 text-xs bg-cyan-600 text-white rounded-full px-1.5">
                  {pendingDocs.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">🕘 変更履歴</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <Button
                variant="outline"
                onClick={startTagging}
                disabled={tagRunning}
              >
                {tagRunning ? "付与中…" : "🏷 施術タグを一括付与"}
              </Button>
            )}
            <Button onClick={openCreate} className="bg-teal text-teal-foreground">
              ＋資料を登録
            </Button>
          </div>
        </div>

        {/* 147: 資料庫のお掃除（管理者のみ・既定は折りたたみ） */}
        {isAdmin && <LibraryCleanupPanel onChanged={refresh} />}

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

          {/* 施術タグ一括付与キュー */}
          {tagItems.length > 0 && (
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium">
                  🏷 施術タグ一括付与: {tagSummary.settled}/{tagSummary.total}
                  {tagRunning && (
                    <span className="text-red-600 ml-2">
                      付与中はページを閉じないでください
                    </span>
                  )}
                </p>
                {!tagRunning && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setTagItems([])}
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
                      tagSummary.total
                        ? (tagSummary.settled / tagSummary.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
              {!tagRunning && tagSummary.total > 0 && (
                <p className="text-sm text-muted-foreground">
                  🏷 {tagSummary.assigned}件付与 ・ ─ {tagSummary.none}件タグなし ・
                  ✗ {tagSummary.fail}件失敗
                </p>
              )}
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {tagItems.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 text-sm border rounded px-2 py-1.5 flex-wrap"
                  >
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${TAG_STATUS_STYLE[it.status]}`}
                    >
                      {it.status}
                    </span>
                    <span className="truncate flex-1 min-w-0" title={it.name}>
                      {it.name}
                    </span>
                    {it.tags && it.tags.length > 0 && (
                      <span className="text-xs text-teal shrink-0">
                        {it.tags.join("・")}
                      </span>
                    )}
                    {it.reason && (
                      <span className="text-xs text-red-600 shrink-0">
                        {it.reason}
                      </span>
                    )}
                    {it.status === "失敗" && !tagRunning && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => retryTag(it)}
                      >
                        再試行
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* A: ★よく使う資料（検索/絞り込みの影響を受けず常に上部・0件非表示） */}
          {favoriteDocs.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">★ よく使う資料</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {favoriteDocs.map((doc) => renderCard(doc))}
              </div>
            </div>
          )}

          {/* B: 最近開いた資料（localStorage・小さく・0件非表示）
              100: 折りたたみ式（既定=閉・開閉は mk_library_recent_open に記憶）。チップはプレビューを開く */}
          {recentDocs.length > 0 && (
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={toggleRecentOpen}
                aria-expanded={recentOpen}
                className="text-sm font-semibold flex items-center gap-1.5 hover:opacity-70"
              >
                <span
                  className={`text-xs transition-transform ${recentOpen ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
                🕒 最近開いた資料
                <span className="text-xs text-muted-foreground font-normal">
                  {recentDocs.length}件
                </span>
              </button>
              {recentOpen && (
                <div className="flex flex-wrap gap-2">
                  {recentDocs.map((doc) => {
                    const km = docDisplayMeta(doc);
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        onClick={() => openPreview(doc)}
                        className="text-xs border rounded-full px-3 py-1 hover:bg-muted flex items-center gap-1 max-w-[220px]"
                        title={doc.title}
                      >
                        <span>{km.icon}</span>
                        <span className="truncate">{doc.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* F: 整理アシスト（指示書98・該当0件なら非表示）
              102: 折りたたみ式（既定=閉・mk_library_cleanup_open に記憶・件数バッジは常時表示） */}
          {cleanupCount > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-3">
              <button
                type="button"
                onClick={toggleCleanupOpen}
                aria-expanded={cleanupOpen}
                className="text-sm font-semibold flex items-center gap-1.5 hover:opacity-70 w-full text-left"
              >
                <span
                  className={`text-xs transition-transform ${cleanupOpen ? "rotate-90" : ""}`}
                >
                  ▶
                </span>
                🧹 整えるとよい資料
                <span className="text-xs font-medium bg-amber-200 text-amber-900 rounded-full px-2 py-0.5">
                  {cleanupCount}件
                </span>
              </button>
              {cleanupOpen && (
                <>

              {/* ①②③: 各カテゴリを最大6件、編集で直行 */}
              {[
                { label: "施術タグなし", docs: cleanup.noTags },
                { label: "要約が空", docs: cleanup.noSummary },
                { label: "見直し日が未設定", docs: cleanup.noReview },
              ]
                .filter((g) => g.docs.length > 0)
                .map((g) => (
                  <div key={g.label} className="space-y-1">
                    <p className="text-xs font-medium text-amber-800">
                      {g.label}（{g.docs.length}件）
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.docs.slice(0, 6).map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => openEdit(d)}
                          className="text-xs border border-amber-300 bg-white rounded-full px-2.5 py-1 hover:bg-amber-100 max-w-[220px] truncate"
                          title={`${d.title}（編集で直す）`}
                        >
                          {d.title}
                        </button>
                      ))}
                      {g.docs.length > 6 && (
                        <span className="text-xs text-muted-foreground self-center">
                          ほか{g.docs.length - 6}件
                        </span>
                      )}
                    </div>
                  </div>
                ))}

              {/* ④: 表記ゆれの疑い → どちらに寄せるか2択 */}
              {cleanup.mergePairs.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-amber-800">
                    表記ゆれの疑い（{cleanup.mergePairs.length}組）
                  </p>
                  {cleanup.mergePairs.map((p, i) => (
                    <div
                      key={`${p.a}-${p.b}-${i}`}
                      className="flex items-center gap-2 text-xs bg-white border border-amber-200 rounded-lg px-2 py-1.5 flex-wrap"
                    >
                      <span className="text-muted-foreground">{p.reason}:</span>
                      <span className="font-medium">
                        「{p.a}」({p.countA}) ／「{p.b}」({p.countB})
                      </span>
                      <span className="text-muted-foreground">どちらに寄せる？</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setMergeTarget({ from: p.b, to: p.a, count: p.countB })
                        }
                      >
                        「{p.a}」に統合
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setMergeTarget({ from: p.a, to: p.b, count: p.countA })
                        }
                      >
                        「{p.b}」に統合
                      </Button>
                    </div>
                  ))}
                </div>
              )}
                </>
              )}
            </div>
          )}

          <div className="space-y-3">
            <Input
              placeholder="キーワードで検索（タイトル・キーワード・施術タグ・要約・本文）"
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
              {/* E: 見直し時期チップ（超過＋30日以内・件数バッジ・指示書98） */}
              {reviewDueCount > 0 && (
                <button
                  type="button"
                  onClick={() => setReviewFilterOn((v) => !v)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    reviewFilterOn
                      ? "bg-red-500 text-white border-red-500"
                      : "bg-background text-red-600 border-red-200 hover:bg-red-50"
                  }`}
                >
                  ⏰ 見直し時期
                  <span className="ml-1 opacity-70">{reviewDueCount}</span>
                </button>
              )}
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

            {/* 施術・機器タグのチップ列（自動生成・件数バッジ・多い順・複数選択AND） */}
            {(treatmentCounts.length > 0 || untaggedCount > 0) && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-muted-foreground mr-1">
                  施術・機器:
                </span>
                {(showAllTags
                  ? treatmentCounts
                  : treatmentCounts.slice(0, TREATMENT_CHIPS_INITIAL)
                ).map(({ tag, count }) => {
                  const active = selectedTreatments.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTreatment(tag)}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        active
                          ? "bg-indigo-600 text-white border-indigo-600"
                          : "bg-background text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                      }`}
                    >
                      {tag}
                      <span className="ml-1 opacity-70">{count}</span>
                    </button>
                  );
                })}
                {!showAllTags &&
                  treatmentCounts.length > TREATMENT_CHIPS_INITIAL && (
                    <button
                      type="button"
                      onClick={() => setShowAllTags(true)}
                      className="px-2.5 py-1 rounded-full text-xs text-muted-foreground underline"
                    >
                      もっと見る（+{treatmentCounts.length - TREATMENT_CHIPS_INITIAL}）
                    </button>
                  )}
                {untaggedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleTreatment(UNTAGGED_CHIP)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      untaggedSelected
                        ? "bg-stone-600 text-white border-stone-600"
                        : "bg-background text-muted-foreground border-input hover:bg-muted"
                    }`}
                  >
                    タグなし
                    <span className="ml-1 opacity-70">{untaggedCount}</span>
                  </button>
                )}
                {selectedTreatments.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTreatments([])}
                    className="px-2.5 py-1 rounded-full text-xs text-muted-foreground underline"
                  >
                    クリア
                  </button>
                )}
              </div>
            )}

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
            {filtered.map((doc) => renderCard(doc))}
          </div>
        </TabsContent>

        {/* ─── 変更履歴 ─── */}
        {/* ─── 版の更新（指示書96） ─── */}
        <TabsContent value="updates" className="mt-4 space-y-6">
          {/* 更新待ち一覧 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">🔄 更新待ち</h3>
            {pendingDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                承認待ちの更新はありません。
              </p>
            ) : (
              pendingDocs.map((d) => {
                const pu = d.pendingUpdate!;
                const newIsPdf = opensInBrowser(pu.mimeType, pu.fileName);
                const curIsPdf = opensInBrowser(d.mimeType, d.fileName);
                return (
                  <div
                    key={d.id}
                    className="border rounded-lg p-3 space-y-2 bg-cyan-50/40"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{d.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {pu.uploadedByName || "不明"}・{formatDateTime(pu.uploadedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <a href={fileHref({ fileUrl: pu.fileUrl, fileName: pu.fileName, mimeType: pu.mimeType })} target={newIsPdf ? "_blank" : undefined} rel="noreferrer">
                        <Button size="sm" variant="outline">新版を{newIsPdf ? "開く" : "DL"}</Button>
                      </a>
                      <a href={fileHref(d)} target={curIsPdf ? "_blank" : undefined} rel="noreferrer">
                        <Button size="sm" variant="outline">現行版を{curIsPdf ? "開く" : "DL"}</Button>
                      </a>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => {
                          setKeepTitle(true);
                          setApproveTarget(d);
                        }}
                        disabled={busyDocId === d.id}
                      >
                        ✅ 承認して差し替え
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => withdrawUpdate(d.id)}
                        disabled={busyDocId === d.id}
                      >
                        ↩ 取り下げ
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 承認済み更新の時系列 */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">🕘 更新の履歴（新しい順）</h3>
            {versionTimeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                まだ更新はありません。
              </p>
            ) : (
              versionTimeline.map(({ doc, version }) => {
                const newIsPdf = opensInBrowser(doc.mimeType, doc.fileName);
                const oldIsPdf = opensInBrowser(version.mimeType, version.fileName);
                return (
                  <div
                    key={version.versionId}
                    className="flex items-center gap-3 border rounded-lg p-3 text-sm flex-wrap"
                  >
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatDateTime(version.replacedAt)}
                    </span>
                    <span className="font-medium flex-1 min-w-0 break-words">
                      {doc.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {version.replacedBy || "不明"}
                    </span>
                    <a href={fileHref(doc)} target={newIsPdf ? "_blank" : undefined} rel="noreferrer">
                      <Button size="sm" variant="outline">新版(現行)</Button>
                    </a>
                    <a href={fileHref({ fileUrl: version.fileUrl, fileName: version.fileName, mimeType: version.mimeType })} target={oldIsPdf ? "_blank" : undefined} rel="noreferrer">
                      <Button size="sm" variant="ghost">旧版</Button>
                    </a>
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>

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
                      {e.note && (
                        <span className="block text-xs text-muted-foreground font-normal">
                          {e.note}
                        </span>
                      )}
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

      {/* ─── ブラウザ内プレビュー（指示書100・外部ビューアにURLを渡さない） ─── */}
      <LibraryPreviewModal
        doc={previewDoc}
        onClose={() => setPreviewDoc(null)}
        onEdit={(doc) => {
          setPreviewDoc(null);
          openEdit(doc);
        }}
      />

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
                : form.kind === "link"
                  ? "内容を修正できます。URLもここで変更できます。"
                  : "内容を修正できます。ファイルを選び直すと差し替えられます。"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* 101: 📎ファイル / 🔗リンク の切替（新規登録時のみ。編集は種別固定） */}
            {form.mode === "create" ? (
              <div className="flex gap-2">
                {(
                  [
                    { kind: "file", label: "📎 ファイル" },
                    { kind: "link", label: "🔗 リンク" },
                  ] as { kind: DocKind; label: string }[]
                ).map(({ kind, label }) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, kind }))}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      form.kind === kind
                        ? "bg-teal text-teal-foreground border-teal"
                        : "bg-background text-muted-foreground border-input hover:bg-muted"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              form.kind === "link" && (
                <p className="text-xs text-muted-foreground">
                  🔗 リンク型の資料です（URLの変更は変更履歴に記録されます）
                </p>
              )
            )}

            {form.kind === "link" ? (
              <div className="space-y-1.5">
                <Label htmlFor="lib-link-url">
                  URL
                  <span className="text-xs text-muted-foreground ml-2">
                    （YouTube限定公開・Dropbox共有リンクなど・https のみ）
                  </span>
                </Label>
                <Input
                  id="lib-link-url"
                  type="url"
                  value={form.linkUrl}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, linkUrl: e.target.value }))
                  }
                  onBlur={() => fetchLinkTitle(form.linkUrl.trim())}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
                <p className="text-xs text-muted-foreground">
                  動画はAIが内容を読めないため、タイトル・要約などは手入力してください
                  （YouTubeはタイトルを自動取得します）。
                </p>
              </div>
            ) : (
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
            )}

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
              <Label htmlFor="lib-treatments">
                施術・機器タグ
                <span className="text-xs text-muted-foreground ml-2">
                  （施術名/機器名・最大5個・読点/カンマ区切り）
                </span>
              </Label>
              <Input
                id="lib-treatments"
                value={form.treatmentsText}
                onChange={(e) =>
                  setForm((f) => ({ ...f, treatmentsText: e.target.value }))
                }
                placeholder="メソナJ、ダーマペン"
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

            {/* E: 次の見直し日（指示書98・1年後ボタン付き） */}
            <div className="space-y-1.5">
              <Label htmlFor="lib-review">
                次の見直し日
                <span className="text-xs text-muted-foreground ml-2">
                  （任意・機器更新や法改正で古くなる資料に）
                </span>
              </Label>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  id="lib-review"
                  type="date"
                  value={form.reviewDueAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reviewDueAt: e.target.value }))
                  }
                  className="w-auto"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setForm((f) => ({ ...f, reviewDueAt: oneYearFromTodayYmd() }))
                  }
                >
                  1年後
                </Button>
                {form.reviewDueAt && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setForm((f) => ({ ...f, reviewDueAt: "" }))}
                  >
                    クリア
                  </Button>
                )}
              </div>
            </div>

            {/* 版履歴（指示書95・編集時のみ・版があれば表示） */}
            {editingDoc && editingDoc.versions.length > 0 && (
              <div className="space-y-1.5 border-t pt-3">
                <Label>版履歴（新しい順）</Label>
                <div className="max-h-56 overflow-y-auto space-y-1.5">
                  {/* 現行版 */}
                  <div className="flex items-center gap-2 text-sm border rounded px-2 py-1.5 flex-wrap bg-muted/40">
                    <span className="shrink-0">
                      {FILE_KIND_META[fileKind(editingDoc.mimeType, editingDoc.fileName)].icon}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                      現在
                    </span>
                    <span className="truncate flex-1 min-w-0" title={editingDoc.fileName}>
                      {editingDoc.fileName}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {formatDateTime(editingDoc.updatedAt)}
                    </span>
                    <a
                      href={fileHref(editingDoc)}
                      target={opensInBrowser(editingDoc.mimeType, editingDoc.fileName) ? "_blank" : undefined}
                      rel="noreferrer"
                    >
                      <Button size="sm" variant="outline">
                        {opensInBrowser(editingDoc.mimeType, editingDoc.fileName) ? "開く" : "DL"}
                      </Button>
                    </a>
                  </div>
                  {/* 旧版（新しい順＝配列逆順） */}
                  {[...editingDoc.versions].reverse().map((v) => {
                    const isPdf = opensInBrowser(v.mimeType, v.fileName);
                    return (
                      <div
                        key={v.versionId}
                        className="flex items-center gap-2 text-sm border rounded px-2 py-1.5 flex-wrap"
                      >
                        <span className="shrink-0">
                          {FILE_KIND_META[fileKind(v.mimeType, v.fileName)].icon}
                        </span>
                        <span className="truncate flex-1 min-w-0" title={v.fileName}>
                          {v.fileName || "（旧版）"}
                        </span>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {formatDateTime(v.replacedAt)}
                          {v.replacedBy ? `・${v.replacedBy}` : ""}
                        </span>
                        <a
                          href={fileHref(v)}
                          target={isPdf ? "_blank" : undefined}
                          rel="noreferrer"
                        >
                          <Button size="sm" variant="outline">
                            {isPdf ? "開く" : "DL"}
                          </Button>
                        </a>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setRollbackTarget({ docId: editingDoc.id, version: v })
                          }
                        >
                          この版に戻す
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

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

      {/* ─── 版の復元確認（指示書95） ─── */}
      <AlertDialog
        open={!!rollbackTarget}
        onOpenChange={(o) => !o && setRollbackTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>この版に戻しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{rollbackTarget?.version.fileName}」を現在のファイルにします。
              いまの現行版は版履歴に残るので、あとで戻すこともできます。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rollingBack}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doRollback();
              }}
              disabled={rollingBack}
              className="bg-teal text-teal-foreground"
            >
              {rollingBack ? "復元中…" : "この版に戻す"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── 更新候補ダイアログ（指示書96・単発登録の更新検知） ─── */}
      <Dialog
        open={!!candidatePrompt}
        onOpenChange={(o) => !o && setCandidatePrompt(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>既存の資料の更新ですか？</DialogTitle>
            <DialogDescription>
              似た資料が見つかりました。どれかの更新として取り込むか、別資料として登録できます。
              （更新は承認するまで公開版は変わりません）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {candidatePrompt?.candidates.map((c) => (
              <div
                key={c.doc.id}
                className="flex items-center gap-2 border rounded-lg p-2 flex-wrap"
              >
                <span className="text-sm flex-1 min-w-0 break-words">
                  📄 {c.doc.title}
                  <span className="text-xs text-muted-foreground ml-2">
                    {c.reason === "filename" ? "ファイル名一致" : "タイトル類似"}
                  </span>
                </span>
                <Button
                  size="sm"
                  className="bg-teal text-teal-foreground"
                  onClick={() => chooseUpdateCandidate(c.doc.id)}
                  disabled={submitting}
                >
                  🔄 これの更新
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCandidatePrompt(null)}
              disabled={submitting}
            >
              キャンセル
            </Button>
            <Button
              onClick={chooseNewInstead}
              disabled={submitting}
            >
              ➕ 別資料として登録
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 更新承認ダイアログ（タイトル保持/採用の選択・指示書96） ─── */}
      <Dialog
        open={!!approveTarget}
        onOpenChange={(o) => !o && setApproveTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>更新を承認して差し替え</DialogTitle>
            <DialogDescription>
              新版を公開し、現在のファイルは版履歴に残ります。タイトルの扱いを選んでください。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="keepTitle"
                checked={keepTitle}
                onChange={() => setKeepTitle(true)}
                className="mt-1"
              />
              <span>
                既存のタイトルを保持（既定）
                <span className="block text-xs text-muted-foreground">
                  「{approveTarget?.title}」のまま
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="keepTitle"
                checked={!keepTitle}
                onChange={() => setKeepTitle(false)}
                className="mt-1"
                disabled={!approveTarget?.pendingUpdate?.aiMeta.title}
              />
              <span>
                新提案のタイトルを採用
                <span className="block text-xs text-muted-foreground">
                  {approveTarget?.pendingUpdate?.aiMeta.title
                    ? `「${approveTarget.pendingUpdate.aiMeta.title}」`
                    : "（新提案タイトルなし）"}
                </span>
              </span>
            </label>
            {/* E: 承認時に見直し日を1年後にリセット（既定ON・指示書98） */}
            <label className="flex items-center gap-2 cursor-pointer border-t pt-2 mt-1">
              <input
                type="checkbox"
                checked={resetReview}
                onChange={(e) => setResetReview(e.target.checked)}
              />
              <span>次の見直し日を1年後にする</span>
            </label>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setApproveTarget(null)}
              disabled={approving}
            >
              キャンセル
            </Button>
            <Button
              onClick={approveUpdate}
              disabled={approving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {approving ? "承認中…" : "✅ 承認して差し替え"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── タグ統合の確認（指示書98-F） ─── */}
      <AlertDialog
        open={!!mergeTarget}
        onOpenChange={(o) => !o && setMergeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>タグを統合しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              「{mergeTarget?.from}」を使っている {mergeTarget?.count} 件の資料を
              「{mergeTarget?.to}」に置き換えます。この操作は変更履歴に残ります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={merging}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doMergeTag();
              }}
              disabled={merging}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {merging ? "統合中…" : "統合する"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
