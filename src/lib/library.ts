// 資料庫（説明資料・同意書のAI分類つき検索）— 型・定数・正規化・純粋ロジック（指示書86＋87）
// - メタデータは content_store 単一キー portal_library（{ docs, updatedAt }）。
// - 変更履歴は content_store 単一キー portal_library_log（{ entries, updatedAt }・最新200件）。
// - 87で承認フローは撤廃。status は持たない（旧データにあっても無視）。登録＝即公開。
// - ファイル本体は Supabase Storage（staff-photos バケットの library/ 配下）。この lib は純粋ロジックのみ。
// - カテゴリはコード固定（value-keywords と同じ流儀。将来追加は別指示書）。
// - 権限は「ログインユーザー全員が登録・編集・削除」。実際の書き込みはサーバー(Service Role)経由。
//   ※ content_store は anon 読み取り可（gantt 等と同じ構造）。閲覧は全員可なので構造的な制約なし。

export const LIBRARY_KEY = "portal_library";
export const LIBRARY_LOG_KEY = "portal_library_log";
export const LIBRARY_LOG_MAX = 200;

// staff-photos バケット内のパス接頭辞（バケット自体は既存の public バケットを再利用）
export const LIBRARY_PATH_PREFIX = "library";

// カテゴリ（コード固定・順序固定）
export const LIBRARY_CATEGORIES = [
  "同意書",
  "施術説明",
  "検査・処置",
  "院内運用",
  "その他",
] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];
export const DEFAULT_CATEGORY: LibraryCategory = "その他";

export const KEYWORDS_MAX = 10;
export const TREATMENTS_MAX = 5; // 1docあたりの施術・機器タグ上限（指示書90）
export const VERSIONS_MAX = 20; // 1docあたりの版履歴上限（指示書95・超過は古い順に破棄）

// 版（差し替え前のファイル世代・指示書95）。ファイル実体はStorageに残る前提でメタのみ蓄積。
export type DocVersion = {
  versionId: string;
  fileName: string;
  filePath: string;
  fileUrl: string;
  mimeType: string;
  replacedAt: string;
  replacedBy: string; // 差し替えた人の表示名
};

export type LibraryDoc = {
  id: string;
  title: string;
  category: LibraryCategory;
  keywords: string[];
  treatments: string[]; // 施術・機器タグ（0〜5個・AI検知＋手修正・指示書90）
  summary: string;
  fileName: string;
  filePath: string; // Storage パス（library/xxx.pdf）
  fileUrl: string; // 公開URL（開く・ダウンロード用）
  mimeType: string;
  searchText: string; // 抽出テキスト先頭2000字程度（検索用）
  uploadedBy: string; // userId
  uploadedByName: string; // 表示名（プロフィール名 or email）
  uploadedAt: string;
  updatedAt: string;
  versions: DocVersion[]; // 差し替え世代（新しいものほど末尾・指示書95）
};

export type LibraryStore = { docs: LibraryDoc[]; updatedAt: string };

export type LibraryAction =
  | "create"
  | "edit"
  | "delete"
  | "replace"
  | "restore"
  | "rollback";

export type LibraryLogEntry = {
  id: string;
  at: string;
  userId: string;
  userName: string;
  action: LibraryAction;
  docId: string;
  docTitle: string;
  note?: string; // 変更内容の補足（例「施術タグ付与: メソナJ」・指示書90）
  snapshot?: LibraryDoc; // delete/replace 時に元 doc を保持（復元・旧版表示用）
};

export type LibraryLog = { entries: LibraryLogEntry[]; updatedAt: string };

// AI提案の下書き型（parse API の返却）
export type LibrarySuggestion = {
  title: string;
  category: LibraryCategory;
  keywords: string[];
  treatments: string[]; // 施術・機器タグ提案（指示書90）
  summary: string;
  searchText: string;
  // 抽出できず手入力にフォールバックする場合 true（AI提案なし）
  fallback: boolean;
};

// ─── 正規化（読み書き両境界で通す） ───

export function normalizeCategory(v: unknown): LibraryCategory {
  return (LIBRARY_CATEGORIES as readonly string[]).includes(v as string)
    ? (v as LibraryCategory)
    : DEFAULT_CATEGORY;
}

export function normalizeKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return Array.from(new Set(cleaned)).slice(0, KEYWORDS_MAX);
}

// 施術・機器タグの正規化（trim・重複除去・空破棄・上限5・指示書90）
export function normalizeTreatments(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return Array.from(new Set(cleaned)).slice(0, TREATMENTS_MAX);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

// 版の正規化（不正要素破棄・上限20・古い順に破棄＝末尾20を残す・指示書95）
export function normalizeVersions(input: unknown): DocVersion[] {
  if (!Array.isArray(input)) return [];
  const out: DocVersion[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const g = raw as Record<string, unknown>;
    const fileUrl = str(g.fileUrl);
    if (!fileUrl) continue; // 開けない版は破棄
    out.push({
      versionId: str(g.versionId) || `ver-${out.length}`,
      fileName: str(g.fileName),
      filePath: str(g.filePath),
      fileUrl,
      mimeType: str(g.mimeType),
      replacedAt: str(g.replacedAt) || new Date(0).toISOString(),
      replacedBy: str(g.replacedBy),
    });
  }
  return out.slice(-VERSIONS_MAX);
}

// 1件の資料メタを正規化（必須項目が欠けるものは null＝破棄）。status は無視（87で撤廃）。
export function normalizeDoc(raw: unknown): LibraryDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const id = str(g.id);
  const title = str(g.title);
  const fileUrl = str(g.fileUrl);
  // id・タイトル・ファイルURL のいずれかが欠ける行は壊れているとみなし破棄
  if (!id || !title || !fileUrl) return null;
  const uploadedAt = str(g.uploadedAt) || new Date(0).toISOString();
  return {
    id,
    title,
    category: normalizeCategory(g.category),
    keywords: normalizeKeywords(g.keywords),
    treatments: normalizeTreatments(g.treatments),
    summary: str(g.summary),
    fileName: str(g.fileName),
    filePath: str(g.filePath),
    fileUrl,
    mimeType: str(g.mimeType),
    searchText: str(g.searchText),
    uploadedBy: str(g.uploadedBy),
    uploadedByName: str(g.uploadedByName),
    uploadedAt,
    updatedAt: str(g.updatedAt) || uploadedAt,
    versions: normalizeVersions(g.versions),
  };
}

export function normalizeStore(raw: unknown): LibraryStore {
  const data = raw as { docs?: unknown } | null;
  const list = Array.isArray(data?.docs) ? data!.docs : [];
  const docs = list
    .map(normalizeDoc)
    .filter((d): d is LibraryDoc => d !== null);
  return { docs, updatedAt: str((data as { updatedAt?: unknown })?.updatedAt) };
}

const LOG_ACTIONS: LibraryAction[] = [
  "create",
  "edit",
  "delete",
  "replace",
  "restore",
];

export function normalizeLogEntry(raw: unknown): LibraryLogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const id = str(g.id);
  const action = g.action as LibraryAction;
  if (!id || !LOG_ACTIONS.includes(action)) return null;
  const snap = normalizeDoc(g.snapshot);
  return {
    id,
    at: str(g.at) || new Date(0).toISOString(),
    userId: str(g.userId),
    userName: str(g.userName),
    action,
    docId: str(g.docId),
    docTitle: str(g.docTitle),
    ...(str(g.note) ? { note: str(g.note) } : {}),
    ...(snap ? { snapshot: snap } : {}),
  };
}

export function normalizeLog(raw: unknown): LibraryLog {
  const data = raw as { entries?: unknown } | null;
  const list = Array.isArray(data?.entries) ? data!.entries : [];
  const entries = list
    .map(normalizeLogEntry)
    .filter((e): e is LibraryLogEntry => e !== null);
  return {
    entries,
    updatedAt: str((data as { updatedAt?: unknown })?.updatedAt),
  };
}

// ─── ファイル種別 ───

export type FileKind = "pdf" | "word" | "ppt" | "excel" | "other";

export function fileKind(mimeType: string, fileName = ""): FileKind {
  const m = (mimeType || "").toLowerCase();
  const n = (fileName || "").toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) return "pdf";
  if (
    m.includes("wordprocessingml") ||
    m === "application/msword" ||
    n.endsWith(".docx") ||
    n.endsWith(".doc")
  )
    return "word";
  if (
    m.includes("presentationml") ||
    m === "application/vnd.ms-powerpoint" ||
    n.endsWith(".pptx") ||
    n.endsWith(".ppt")
  )
    return "ppt";
  if (
    m.includes("spreadsheetml") ||
    m === "application/vnd.ms-excel" ||
    n.endsWith(".xlsx") ||
    n.endsWith(".xls")
  )
    return "excel";
  return "other";
}

// PDF はブラウザで開く（新規タブ）、それ以外はダウンロード
export function opensInBrowser(mimeType: string, fileName = ""): boolean {
  return fileKind(mimeType, fileName) === "pdf";
}

export const FILE_KIND_META: Record<
  FileKind,
  { icon: string; label: string }
> = {
  pdf: { icon: "📄", label: "PDF" },
  word: { icon: "📝", label: "Word" },
  ppt: { icon: "📊", label: "PowerPoint" },
  excel: { icon: "📗", label: "Excel" },
  other: { icon: "📎", label: "ファイル" },
};

// 拡張子推定（保存パス用）
export function extForFile(mimeType: string, fileName = ""): string {
  const n = (fileName || "").toLowerCase();
  const dot = n.lastIndexOf(".");
  if (dot >= 0 && dot < n.length - 1) {
    const ext = n.slice(dot + 1);
    if (/^[a-z0-9]{1,5}$/.test(ext)) return ext;
  }
  switch (fileKind(mimeType, fileName)) {
    case "pdf":
      return "pdf";
    case "word":
      return "docx";
    case "ppt":
      return "pptx";
    case "excel":
      return "xlsx";
    default:
      return "bin";
  }
}

// ─── 一括登録・バリデーション用（指示書89） ───

export const LIBRARY_MAX_BYTES = 20 * 1024 * 1024; // 20MB（parse/登録APIと共通）

// 資料として受け付ける拡張子（これ以外は一括登録でスキップ）
export const SUPPORTED_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
] as const;

function extOf(fileName: string): string {
  const n = (fileName || "").toLowerCase();
  const dot = n.lastIndexOf(".");
  return dot >= 0 ? n.slice(dot + 1) : "";
}

// 一括登録で受け付けられる形式か（対応外はスキップ）
export function isSupportedLibraryFile(fileName: string, mimeType = ""): boolean {
  const ext = extOf(fileName);
  if ((SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) return true;
  // 拡張子が無い/不明でも MIME が既知ドキュメントなら許可
  return fileKind(mimeType, fileName) !== "other";
}

// ─── クライアント側検索フィルタ ───

export const UNTAGGED_CHIP = "__untagged__"; // 「タグなし」チップの内部値

export function filterDocs(
  docs: LibraryDoc[],
  query: string,
  selectedCategories: string[],
  selectedTreatments: string[] = [],
  untaggedSelected = false
): LibraryDoc[] {
  const q = query.trim().toLowerCase();
  const cats = new Set(selectedCategories);
  const treats = selectedTreatments;
  const treatActive = treats.length > 0 || untaggedSelected;
  return docs.filter((d) => {
    if (cats.size > 0 && !cats.has(d.category)) return false;
    // 施術・機器タグ絞り込み: 実タグは AND、「タグなし」は OR 併用
    if (treatActive) {
      const matchUntagged = untaggedSelected && d.treatments.length === 0;
      const matchTags =
        treats.length > 0 && treats.every((t) => d.treatments.includes(t));
      if (!(matchUntagged || matchTags)) return false;
    }
    if (!q) return true;
    const hay = [
      d.title,
      d.summary,
      d.searchText,
      d.keywords.join(" "),
      d.treatments.join(" "),
      d.category,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

// 登録資料から施術・機器タグの一覧を件数つきで集計（多い順・指示書90）
export function collectTreatmentCounts(
  docs: LibraryDoc[]
): { tag: string; count: number }[] {
  const map = new Map<string, number>();
  for (const d of docs) {
    for (const t of d.treatments) map.set(t, (map.get(t) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "ja"));
}

// 既知タグの一覧（parse プロンプトへ渡す・重複除去）
export function allKnownTreatments(docs: LibraryDoc[]): string[] {
  return collectTreatmentCounts(docs).map((x) => x.tag);
}

// ─── ID 採番（モジュール読込時に new Date() しない・関数内でのみ） ───

export function genLibraryId(prefix = "lib"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// アクションのバッジ表示メタ
export const ACTION_META: Record<
  LibraryAction,
  { label: string; className: string }
> = {
  create: { label: "登録", className: "bg-emerald-100 text-emerald-700" },
  edit: { label: "編集", className: "bg-blue-100 text-blue-700" },
  delete: { label: "削除", className: "bg-red-100 text-red-700" },
  replace: { label: "差し替え", className: "bg-amber-100 text-amber-700" },
  restore: { label: "復元", className: "bg-violet-100 text-violet-700" },
  rollback: { label: "版を戻す", className: "bg-cyan-100 text-cyan-700" },
};
