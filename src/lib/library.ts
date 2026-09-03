// 資料庫（説明資料・同意書のAI分類つき検索）— 型・定数・正規化・純粋ロジック（指示書86＋87）
// - メタデータは content_store 単一キー portal_library（{ docs, updatedAt }）。
// - 変更履歴は content_store 単一キー portal_library_log（{ entries, updatedAt }・最新200件）。
// - 87で承認フローは撤廃。status は持たない（旧データにあっても無視）。登録＝即公開。
// - ファイル本体は Supabase Storage（staff-photos バケットの library/ 配下）。この lib は純粋ロジックのみ。
// - カテゴリはコード固定（将来追加は別指示書。value-keywords は172で管理画面編集に対応済み）。
// - 権限は「ログインユーザー全員が登録・編集・削除」。実際の書き込みはサーバー(Service Role)経由。
//   ※ content_store は anon 読み取り可（gantt 等と同じ構造）。閲覧は全員可なので構造的な制約なし。

export const LIBRARY_KEY = "portal_library";
export const LIBRARY_LOG_KEY = "portal_library_log";
export const LIBRARY_LOG_MAX = 200;

// staff-photos バケット内のパス接頭辞（バケット自体は既存の public バケットを再利用）
export const LIBRARY_PATH_PREFIX = "library";

// カテゴリ（コード固定・順序固定。「マニュアル」は指示書101、「院内採用製品」「カウンセリング」は
// 指示書115、「理念・制度」は指示書131で追加=CDB・就業規則・人事制度資料などの置き場）
export const LIBRARY_CATEGORIES = [
  "同意書",
  "施術説明",
  "検査・処置",
  "院内運用",
  "マニュアル",
  "院内採用製品",
  "カウンセリング",
  "理念・制度",
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

// 資料の実体種別（指示書101）。既存doc（kind未定義）は "file" として扱う。
export type DocKind = "file" | "link";
export type LinkProvider = "youtube" | "dropbox" | "other";

export type LibraryDoc = {
  id: string;
  title: string;
  category: LibraryCategory;
  keywords: string[];
  treatments: string[]; // 施術・機器タグ（0〜5個・AI検知＋手修正・指示書90）
  summary: string;
  kind: DocKind; // "file"=Storageのファイル / "link"=外部URL（指示書101）
  linkUrl: string; // kind="link" のみ（httpsのみ許可・それ以外は ""）
  linkProvider: LinkProvider; // linkUrl から自動判定
  fileName: string;
  filePath: string; // Storage パス（library/xxx.pdf）。link型は ""
  fileUrl: string; // 公開URL（開く・ダウンロード用）。link型は ""
  mimeType: string;
  searchText: string; // 抽出テキスト先頭2000字程度（検索用）。link型は ""
  uploadedBy: string; // userId
  uploadedByName: string; // 表示名（プロフィール名 or email）
  uploadedAt: string;
  updatedAt: string;
  versions: DocVersion[]; // 差し替え世代（新しいものほど末尾・指示書95。版管理はfile型のみ）
  pendingUpdate: PendingUpdate | null; // 承認待ちの新版（指示書96・同時1件・file型のみ）
  reviewDueAt: string; // 次の見直し日 "YYYY-MM-DD"（任意・未設定は ""・指示書98）
};

// 更新待ち（承認前の新版・指示書96）。この時点で公開版(doc本体)は不変。
export type PendingUpdate = {
  fileName: string;
  filePath: string;
  fileUrl: string;
  mimeType: string;
  searchText: string;
  aiMeta: {
    title: string;
    keywords: string[];
    summary: string;
    treatments: string[];
  };
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
};

export type LibraryStore = { docs: LibraryDoc[]; updatedAt: string };

export type LibraryAction =
  | "create"
  | "edit"
  | "delete"
  | "replace"
  | "restore"
  | "rollback"
  | "approveUpdate"
  | "withdrawUpdate"
  | "mergeTag";

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

// 更新待ちの正規化（不正・fileUrl欠落は null・指示書96）
export function normalizePendingUpdate(input: unknown): PendingUpdate | null {
  if (!input || typeof input !== "object") return null;
  const g = input as Record<string, unknown>;
  const fileUrl = str(g.fileUrl);
  if (!fileUrl) return null;
  const meta = (g.aiMeta && typeof g.aiMeta === "object" ? g.aiMeta : {}) as Record<
    string,
    unknown
  >;
  return {
    fileName: str(g.fileName),
    filePath: str(g.filePath),
    fileUrl,
    mimeType: str(g.mimeType),
    searchText: str(g.searchText),
    aiMeta: {
      title: str(meta.title),
      keywords: normalizeKeywords(meta.keywords),
      summary: str(meta.summary),
      treatments: normalizeTreatments(meta.treatments),
    },
    uploadedBy: str(g.uploadedBy),
    uploadedByName: str(g.uploadedByName),
    uploadedAt: str(g.uploadedAt) || new Date(0).toISOString(),
  };
}

// 1件の資料メタを正規化（必須項目が欠けるものは null＝破棄）。status は無視（87で撤廃）。
// 101: kind="link"+有効な linkUrl はリンク型（fileUrl不要）。kind未定義の既存docはファイル型。
export function normalizeDoc(raw: unknown): LibraryDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const id = str(g.id);
  const title = str(g.title);
  const fileUrl = str(g.fileUrl);
  const linkUrl = normalizeLinkUrl(g.linkUrl);
  const kind: DocKind = g.kind === "link" && linkUrl ? "link" : "file";
  // id・タイトル、および実体（ファイル型=fileUrl / リンク型=linkUrl）が欠ける行は破棄
  if (!id || !title) return null;
  if (kind === "file" && !fileUrl) return null;
  const uploadedAt = str(g.uploadedAt) || new Date(0).toISOString();
  return {
    id,
    title,
    category: normalizeCategory(g.category),
    keywords: normalizeKeywords(g.keywords),
    treatments: normalizeTreatments(g.treatments),
    summary: str(g.summary),
    kind,
    linkUrl: kind === "link" ? linkUrl : "",
    linkProvider: kind === "link" ? detectLinkProvider(linkUrl) : "other",
    fileName: kind === "link" ? "" : str(g.fileName),
    filePath: kind === "link" ? "" : str(g.filePath),
    fileUrl: kind === "link" ? "" : fileUrl,
    mimeType: kind === "link" ? "" : str(g.mimeType),
    searchText: kind === "link" ? "" : str(g.searchText),
    uploadedBy: str(g.uploadedBy),
    uploadedByName: str(g.uploadedByName),
    uploadedAt,
    updatedAt: str(g.updatedAt) || uploadedAt,
    // 版管理・更新待ちはファイル型のみ（リンク型のURL変更は通常の編集・指示書101）
    versions: kind === "link" ? [] : normalizeVersions(g.versions),
    pendingUpdate: kind === "link" ? null : normalizePendingUpdate(g.pendingUpdate),
    reviewDueAt: normalizeReviewDueAt(g.reviewDueAt),
  };
}

// 見直し日の正規化（"YYYY-MM-DD" のみ許可・不正は ""・指示書98）
export function normalizeReviewDueAt(v: unknown): string {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

// ─── リンク型資料（指示書101・読み書き両境界で通す） ───

// リンクURLの正規化（https のみ許可・URLとして不正は ""）
export function normalizeLinkUrl(v: unknown): string {
  const s = str(v).trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return "";
    return u.toString();
  } catch {
    return "";
  }
}

// URLからプロバイダを自動判定
export function detectLinkProvider(url: string): LinkProvider {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host === "youtu.be" ||
      host === "youtube.com" ||
      host.endsWith(".youtube.com")
    ) {
      return "youtube";
    }
    if (host === "dropbox.com" || host.endsWith(".dropbox.com")) {
      return "dropbox";
    }
  } catch {
    /* 不正URLは other */
  }
  return "other";
}

// YouTube の動画ID抽出（watch?v= / youtu.be/ / /shorts/ / /embed/ / /live/ に対応）
export function youtubeVideoId(url: string): string {
  const isId = (s: string) => /^[\w-]{6,20}$/.test(s);
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
    if (host === "youtu.be") {
      const id = u.pathname.split("/")[1] || "";
      return isId(id) ? id : "";
    }
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && isId(v)) return v;
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,20})/);
      if (m) return m[1];
    }
  } catch {
    /* 不正URLは "" */
  }
  return "";
}

// 埋め込み再生URL（プライバシー強化の nocookie ドメインを使用・指示書101）
export function youtubeEmbedUrl(url: string): string {
  const id = youtubeVideoId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : "";
}

// リンク型のカード/一覧表示メタ
export const LINK_PROVIDER_META: Record<
  LinkProvider,
  { icon: string; label: string }
> = {
  youtube: { icon: "▶️", label: "YouTube" },
  dropbox: { icon: "🔗", label: "Dropbox" },
  other: { icon: "🔗", label: "リンク" },
};

// docの表示アイコン/種別ラベル（file/link 共通の入り口。カード・チップ・ホーム新着で共用）
export function docDisplayMeta(
  doc: Pick<LibraryDoc, "kind" | "linkProvider" | "mimeType" | "fileName">
): { icon: string; label: string } {
  return doc.kind === "link"
    ? LINK_PROVIDER_META[doc.linkProvider]
    : FILE_KIND_META[fileKind(doc.mimeType, doc.fileName)];
}

// 版番号（N = 旧版数 + 1・v1は表示省略可・指示書96）
export function docVersionNumber(doc: { versions?: DocVersion[] }): number {
  return (doc.versions?.length ?? 0) + 1;
}

export function normalizeStore(raw: unknown): LibraryStore {
  const data = raw as { docs?: unknown } | null;
  const list = Array.isArray(data?.docs) ? data!.docs : [];
  const docs = list
    .map(normalizeDoc)
    .filter((d): d is LibraryDoc => d !== null);
  return { docs, updatedAt: str((data as { updatedAt?: unknown })?.updatedAt) };
}

// 全アクションを列挙（漏れると normalizeLogEntry がそのログを破棄し履歴に出なくなる。
// 95/96/98追加分が漏れていた既存バグを101で修正）
const LOG_ACTIONS: LibraryAction[] = [
  "create",
  "edit",
  "delete",
  "replace",
  "restore",
  "rollback",
  "approveUpdate",
  "withdrawUpdate",
  "mergeTag",
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

// ─── 更新の自動検知（指示書96・純粋関数・クライアント/サーバ共用） ───

// ファイル名の正規化: NFKC(全半角)・小文字・拡張子除去・空白除去
export function normalizeForMatch(name: string): string {
  return (name || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/\s+/g, "")
    .trim();
}

function bigrams(s: string): string[] {
  const g: string[] = [];
  for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2));
  return g;
}

// タイトル類似度（Dice係数・0〜1）。正規化後の bigram 重なりで測る。
export function titleSimilarity(a: string, b: string): number {
  const A = normalizeForMatch(a);
  const B = normalizeForMatch(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const ga = bigrams(A);
  const gb = bigrams(B);
  if (ga.length === 0 || gb.length === 0) return 0;
  const map = new Map<string, number>();
  for (const g of ga) map.set(g, (map.get(g) ?? 0) + 1);
  let inter = 0;
  for (const g of gb) {
    const c = map.get(g);
    if (c && c > 0) {
      inter++;
      map.set(g, c - 1);
    }
  }
  return (2 * inter) / (ga.length + gb.length);
}

export const TITLE_SIM_THRESHOLD = 0.8;

// ─── 見直し期限（指示書98・JSTで判定） ───

// JST の今日を "YYYY-MM-DD" で返す（実行環境のTZに依存しない）
export function jstTodayYmd(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  const y = jst.getFullYear();
  const m = String(jst.getMonth() + 1).padStart(2, "0");
  const d = String(jst.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// JST基準で「今日から1年後」を "YYYY-MM-DD"（見直し日の既定値）
export function oneYearFromTodayYmd(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  const next = new Date(jst.getFullYear() + 1, jst.getMonth(), jst.getDate());
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export const REVIEW_SOON_DAYS = 30;
export type ReviewStatus = "none" | "overdue" | "soon" | "ok";

// 見直し状態（YYYY-MM-DD は辞書順＝日付順で比較できる）
export function reviewStatus(
  reviewDueAt: string,
  now: Date = new Date()
): ReviewStatus {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reviewDueAt)) return "none";
  const today = jstTodayYmd(now);
  if (reviewDueAt < today) return "overdue";
  // 30日以内（今日〜today+30）
  const jst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  const soonLimit = new Date(
    jst.getFullYear(),
    jst.getMonth(),
    jst.getDate() + REVIEW_SOON_DAYS
  );
  const sy = soonLimit.getFullYear();
  const sm = String(soonLimit.getMonth() + 1).padStart(2, "0");
  const sd = String(soonLimit.getDate()).padStart(2, "0");
  const limit = `${sy}-${sm}-${sd}`;
  return reviewDueAt <= limit ? "soon" : "ok";
}

// 見直し時期（超過＋30日以内）に該当するか（チップ抽出用）
export function isReviewDue(reviewDueAt: string, now: Date = new Date()): boolean {
  const s = reviewStatus(reviewDueAt, now);
  return s === "overdue" || s === "soon";
}

// ─── 表記ゆれ検出・タグ統合（指示書98-F） ───

export const TAG_MERGE_THRESHOLD = 0.7; // Dice係数のしきい値

export type TagMergeSuggestion = {
  a: string;
  b: string;
  countA: number;
  countB: number;
  reason: "包含" | "類似";
};

// タグ同士の表記ゆれ候補（包含関係 or Dice≥0.7）。件数付き。
export function findTagMergeSuggestions(
  docs: LibraryDoc[]
): TagMergeSuggestion[] {
  const counts = collectTreatmentCounts(docs);
  const tags = counts.map((c) => c.tag);
  const countOf = new Map(counts.map((c) => [c.tag, c.count]));
  const out: TagMergeSuggestion[] = [];
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      const a = tags[i];
      const b = tags[j];
      const na = normalizeForMatch(a);
      const nb = normalizeForMatch(b);
      if (!na || !nb) continue;
      const contains = na.includes(nb) || nb.includes(na);
      const sim = titleSimilarity(a, b);
      if (contains || sim >= TAG_MERGE_THRESHOLD) {
        out.push({
          a,
          b,
          countA: countOf.get(a) ?? 0,
          countB: countOf.get(b) ?? 0,
          reason: contains ? "包含" : "類似",
        });
      }
    }
  }
  return out;
}

export type UpdateCandidate = {
  doc: LibraryDoc;
  reason: "filename" | "title";
  score: number;
};

// 単発登録用: ファイル名一致 or タイトル高類似の候補（スコア降順）
export function findUpdateCandidates(
  docs: LibraryDoc[],
  fileName: string,
  aiTitle = ""
): UpdateCandidate[] {
  const nf = normalizeForMatch(fileName);
  const out: UpdateCandidate[] = [];
  for (const d of docs) {
    const nameMatch = !!nf && normalizeForMatch(d.fileName) === nf;
    const sim = aiTitle ? titleSimilarity(aiTitle, d.title) : 0;
    if (nameMatch) out.push({ doc: d, reason: "filename", score: 1 });
    else if (sim >= TITLE_SIM_THRESHOLD)
      out.push({ doc: d, reason: "title", score: sim });
  }
  return out.sort((a, b) => b.score - a.score);
}

// 一括D&D用: ファイル名一致のみ（最初の一致doc）
export function findFilenameMatch(
  docs: LibraryDoc[],
  fileName: string
): LibraryDoc | null {
  const nf = normalizeForMatch(fileName);
  if (!nf) return null;
  return docs.find((d) => normalizeForMatch(d.fileName) === nf) ?? null;
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
  approveUpdate: { label: "更新を承認", className: "bg-emerald-100 text-emerald-700" },
  withdrawUpdate: { label: "更新取り下げ", className: "bg-stone-200 text-stone-600" },
  mergeTag: { label: "タグ統合", className: "bg-indigo-100 text-indigo-700" },
};
