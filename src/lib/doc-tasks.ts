// 書類進捗ボード（指示書154 / 154-2）— 型・工程定義・正規化・滞留判定の純関数
//
// 【患者情報の最小化（院長決定・絶対条件）】
//   保存してよいのは カルテ番号／主治医／種別／工程の状態／日付／担当スタッフ／院内メモ のみ。
//   - **患者氏名は保存しない**（型にフィールド自体を作らない＝入力欄も作れない）
//   - **実物PDF・スキャン画像の添付は作らない**（Storage 経路をこの機能に一切持たせない）
//   - カルテ番号は院内で個人を特定しうるため、閲覧は指定アカウント限定
//     （149/132 と同型: RLS全拒否テーブル＋サーバー側権限強制＋非対象者に404秘匿）
//
// 【工程は種別ごとに固有（154-2）】
//   単一ステータスの段階ではなく、現行の運用シートそのままのチェックリストを持つ。
//   全工程が満たされたら「完了」。文言は現行シートのまま（勝手に言い換えない）。
//
// 【工程IDは絶対に振り直さない】（151の教訓）
//   保存されるのは id であって文言ではない。文言を直しても過去の記録が外れないようにするため、
//   廃止する場合も欠番のままにして再利用しない。

export const DOC_TASKS_CONFIG_ID = "__config__";

export const DOC_TYPE_IDS = ["referral", "reply", "detail"] as const;
export type DocTypeId = (typeof DOC_TYPE_IDS)[number];

export type DocStepKind = "check" | "date";

export type DocStep = {
  /** 保存キー。振り直し禁止 */
  id: string;
  /** 表示名（現行シートの文言のまま） */
  label: string;
  kind: DocStepKind;
  /**
   * 最終工程（お渡し済み・郵送済み・ORCA送信済み）。
   * 154-2: ここが落ちやすい＝一覧で強調し、滞留時は優先度を上げる。
   */
  final?: true;
};

export type DocTypeDef = {
  id: DocTypeId;
  /** 種別名（現行シートのまま） */
  label: string;
  /** 一覧の絞り込みチップ等で使う短い名前 */
  short: string;
  emoji: string;
  steps: DocStep[];
  /** 最終工程が未完のときに添える注意書き（154-2の赤字の意図） */
  finalNote: string;
};

// 種別と工程（154-2「現行シートのまま・文言もこのまま」）
export const DOC_TYPES: DocTypeDef[] = [
  {
    id: "referral",
    label: "紹介状作成",
    short: "紹介状",
    emoji: "📝",
    finalNote: "お渡しが済んでいません",
    steps: [
      { id: "ref_doctor_done", label: "先生作成済み", kind: "check" },
      { id: "ref_content_date", label: "紹介状内容記載日", kind: "date" },
      { id: "ref_reserved", label: "紹介先予約済み", kind: "check" },
      { id: "ref_patient_contacted", label: "患者様連絡済み", kind: "check" },
      { id: "ref_handed", label: "お渡し済み", kind: "check", final: true },
    ],
  },
  {
    id: "reply",
    label: "紹介状お返事",
    short: "お返事",
    emoji: "✉️",
    finalNote: "郵送が済んでいません（最も落ちやすい工程です）",
    steps: [
      { id: "rep_doctor_done", label: "先生作成済み", kind: "check" },
      {
        id: "rep_saved_date",
        label: "紹介状電カルの書類欄に保存した日",
        kind: "date",
      },
      { id: "rep_doc_saved", label: "書類作成＆保存済み", kind: "check" },
      { id: "rep_mailed", label: "郵送済み", kind: "check", final: true },
    ],
  },
  {
    id: "detail",
    label: "症状詳記記載",
    short: "症状詳記",
    emoji: "🧾",
    finalNote: "ORCA送信が済んでいません（未完だと請求に影響します）",
    steps: [
      { id: "det_doctor_done", label: "先生記入済み", kind: "check" },
      { id: "det_written_date", label: "詳記記載日", kind: "date" },
      { id: "det_orca_sent", label: "ORCA送信済み", kind: "check", final: true },
    ],
  },
];

export const DOC_TYPE_BY_ID = new Map(DOC_TYPES.map((t) => [t.id, t]));

export function docTypeDef(id: DocTypeId): DocTypeDef {
  return DOC_TYPE_BY_ID.get(id) ?? DOC_TYPES[0];
}

export function isDocTypeId(v: unknown): v is DocTypeId {
  return (
    typeof v === "string" && (DOC_TYPE_IDS as readonly string[]).includes(v)
  );
}

// ─── レコード ───

export type DocTaskHistoryEntry = {
  at: string; // ISO
  by: string; // 操作者（メール or userId・サーバーが確定させる）
  action: string; // 「郵送済み を ✓」など短文
};

export type DocTask = {
  id: string;
  docType: DocTypeId;
  /** カルテ番号（＝ID列）。**患者氏名は持たない** */
  chartNo: string;
  /** 主治医 */
  doctor: string;
  /** 記入日（起票日）YYYY-MM-DD。滞留日数の起点 */
  enteredOn: string;
  /** 工程の状態。check工程は "1"/""、date工程は "YYYY-MM-DD"/"" */
  steps: Record<string, string>;
  /** 担当スタッフ（任意・userId） */
  assigneeUserId: string;
  /** 院内メモ（経過記録・複数行可） */
  memo: string;
  /** 状態変更の履歴（誰がいつ・新しい順） */
  history: DocTaskHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  /** 全工程が満たされた時刻（未完は空） */
  completedAt: string;
};

export const CHART_NO_MAX = 32;
export const DOCTOR_MAX = 40;
export const MEMO_MAX = 4000;
export const HISTORY_MAX = 50;

const YMD_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function ymd(v: unknown): string {
  const s = str(v).trim();
  return YMD_RE.test(s) ? s : "";
}

function text(v: unknown, max: number): string {
  return str(v).slice(0, max);
}

/**
 * 工程の値を種別定義に照らして正規化する。
 * - 定義に無いキーは捨てる（クライアントが勝手なキーを送っても保存されない）
 * - check は "1" か ""、date は YYYY-MM-DD か ""
 */
export function normalizeSteps(
  docType: DocTypeId,
  raw: unknown
): Record<string, string> {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const out: Record<string, string> = {};
  for (const step of docTypeDef(docType).steps) {
    const v = src[step.id];
    if (step.kind === "check") {
      out[step.id] = v === true || v === "1" ? "1" : "";
    } else {
      out[step.id] = ymd(v);
    }
  }
  return out;
}

export function normalizeHistory(raw: unknown): DocTaskHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: DocTaskHistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const g = item as Record<string, unknown>;
    const at = text(g.at, 40);
    if (!at) continue;
    out.push({ at, by: text(g.by, 200), action: text(g.action, 200) });
  }
  return out.slice(0, HISTORY_MAX);
}

/** 1件の正規化。種別・カルテ番号・記入日が欠けるものは破棄 */
export function normalizeDocTask(id: string, raw: unknown): DocTask | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (!isDocTypeId(g.docType)) return null;
  const chartNo = text(g.chartNo, CHART_NO_MAX).trim();
  const enteredOn = ymd(g.enteredOn);
  if (!chartNo || !enteredOn) return null;
  const createdAt = text(g.createdAt, 40) || new Date(0).toISOString();
  return {
    id,
    docType: g.docType,
    chartNo,
    doctor: text(g.doctor, DOCTOR_MAX).trim(),
    enteredOn,
    steps: normalizeSteps(g.docType, g.steps),
    assigneeUserId: text(g.assigneeUserId, 100),
    memo: text(g.memo, MEMO_MAX),
    history: normalizeHistory(g.history),
    createdAt,
    updatedAt: text(g.updatedAt, 40) || createdAt,
    completedAt: text(g.completedAt, 40),
  };
}

// ─── 完了・滞留の判定 ───

export function isStepDone(task: DocTask, step: DocStep): boolean {
  const v = task.steps[step.id] ?? "";
  return step.kind === "check" ? v === "1" : ymd(v) !== "";
}

/** 全工程（チェック・日付とも）が埋まっていれば完了 */
export function isDocTaskCompleted(task: DocTask): boolean {
  return docTypeDef(task.docType).steps.every((s) => isStepDone(task, s));
}

/** 残っている工程（表示・アラート文言に使う） */
export function pendingSteps(task: DocTask): DocStep[] {
  return docTypeDef(task.docType).steps.filter((s) => !isStepDone(task, s));
}

/** 最終工程（お渡し／郵送／ORCA送信）が未完か＝一覧で特に目立たせる対象 */
export function hasFinalPending(task: DocTask): boolean {
  return pendingSteps(task).some((s) => s.final);
}

/** 今日（Asia/Tokyo）の YYYY-MM-DD。サーバー(UTC)でも院内の日付で判定する */
export function todayYmdJst(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

/** from → to の経過日数（どちらも YYYY-MM-DD・不正時は0） */
export function daysBetweenYmd(from: string, to: string): number {
  if (!ymd(from) || !ymd(to)) return 0;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/** 記入日からの経過日数（滞留日数） */
export function elapsedDays(task: DocTask, today: string): number {
  return Math.max(0, daysBetweenYmd(task.enteredOn, today));
}

// ─── 設定（config行） ───

export const DEFAULT_THRESHOLD_DAYS = 2;
export const THRESHOLD_MIN = 1;
export const THRESHOLD_MAX = 60;

export type DocTasksConfig = {
  /** このボードを開ける人（未設定＝管理者のみ＝fail-close） */
  viewerUserIds: string[];
  /** アプリ内でアラートのバッジを出す人（未設定＝閲覧できる人ぜんいん） */
  notifyUserIds: string[];
  /**
   * まとめ通知メールの宛先（155・複数可・空なら送信しない）。
   * **本文にカルテ番号は載せない**ので、宛先はスタッフ個人でも共有アドレスでもよい。
   */
  notifyEmails: string[];
  /** 滞留とみなす日数（種別ごと・既定2日） */
  thresholdDays: Record<DocTypeId, number>;
  /** 主治医の選択肢（空なら自由入力のみ） */
  doctors: string[];
};

export function defaultDocTasksConfig(): DocTasksConfig {
  return {
    viewerUserIds: [],
    notifyUserIds: [],
    notifyEmails: [],
    thresholdDays: {
      referral: DEFAULT_THRESHOLD_DAYS,
      reply: DEFAULT_THRESHOLD_DAYS,
      detail: DEFAULT_THRESHOLD_DAYS,
    },
    doctors: [],
  };
}

/** ざっくりした形式チェック（送信前にResend側でも弾かれる。ここは事故防止の一次フィルタ） */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeNotifyEmails(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().slice(0, 200))
        .filter((v) => EMAIL_RE.test(v))
    )
  ).slice(0, 10);
}

function ids(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    )
  ).slice(0, max);
}

export function normalizeDocTasksConfig(raw: unknown): DocTasksConfig {
  const base = defaultDocTasksConfig();
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const th = (g.thresholdDays && typeof g.thresholdDays === "object"
    ? g.thresholdDays
    : {}) as Record<string, unknown>;
  for (const id of DOC_TYPE_IDS) {
    const v = th[id];
    if (typeof v === "number" && Number.isFinite(v)) {
      base.thresholdDays[id] = Math.min(
        THRESHOLD_MAX,
        Math.max(THRESHOLD_MIN, Math.round(v))
      );
    }
  }
  return {
    viewerUserIds: ids(g.viewerUserIds, 100),
    notifyUserIds: ids(g.notifyUserIds, 100),
    notifyEmails: normalizeNotifyEmails(g.notifyEmails),
    thresholdDays: base.thresholdDays,
    doctors: Array.from(
      new Set(
        (Array.isArray(g.doctors) ? g.doctors : [])
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim().slice(0, DOCTOR_MAX))
          .filter((v) => v !== "")
      )
    ).slice(0, 50),
  };
}

/** 滞留（記入日から閾値日数以上経過して未完了）か */
export function isStale(
  task: DocTask,
  cfg: DocTasksConfig,
  today: string
): boolean {
  if (isDocTaskCompleted(task)) return false;
  return elapsedDays(task, today) >= cfg.thresholdDays[task.docType];
}

// ─── アラートのまとめ ───

export type StaleSummaryRow = {
  docType: DocTypeId;
  count: number;
  /** そのうち最終工程が未完の件数（優先度が高い） */
  finalPendingCount: number;
  /** いちばん長い滞留日数 */
  maxDays: number;
  thresholdDays: number;
};

export type StaleSummary = {
  total: number;
  finalPendingTotal: number;
  rows: StaleSummaryRow[];
};

export function summarizeStale(
  tasks: DocTask[],
  cfg: DocTasksConfig,
  today: string
): StaleSummary {
  const rows: StaleSummaryRow[] = [];
  let total = 0;
  let finalPendingTotal = 0;
  for (const t of DOC_TYPES) {
    const stale = tasks.filter(
      (task) => task.docType === t.id && isStale(task, cfg, today)
    );
    if (stale.length === 0) continue;
    const finalPendingCount = stale.filter(hasFinalPending).length;
    total += stale.length;
    finalPendingTotal += finalPendingCount;
    rows.push({
      docType: t.id,
      count: stale.length,
      finalPendingCount,
      maxDays: stale.reduce((m, s) => Math.max(m, elapsedDays(s, today)), 0),
      thresholdDays: cfg.thresholdDays[t.id],
    });
  }
  return { total, finalPendingTotal, rows };
}

/**
 * 通知本文の行（**カルテ番号を含めない粒度**・154の絶対条件）。
 * 院内で開けば詳細が分かる形にするため、ここでは種別・件数・日数しか出さない。
 * 将来メール通知を接続する場合もこの関数を通す（本文生成をここ1箇所に閉じる）。
 */
export function buildAlertLines(summary: StaleSummary): string[] {
  return summary.rows.map((r) => {
    const def = docTypeDef(r.docType);
    const tail =
      r.finalPendingCount > 0
        ? `（うち${r.finalPendingCount}件は最終工程が未完）`
        : "";
    return `${def.label} ${r.count}件が${r.maxDays}日以上未完了${tail}`;
  });
}

/**
 * まとめ通知メールの件名・本文（155）。
 * **カルテ番号・患者情報は載せない**（載せられるのは種別・件数・日数だけ＝buildAlertLines）。
 * 詳細は院内でポータルを開いて確認する形にするため、本文にはリンクだけを置く。
 */
export type AlertMailContent = { subject: string; text: string };

export function buildAlertMail(
  summary: StaleSummary,
  portalUrl: string,
  today: string
): AlertMailContent {
  const lines = buildAlertLines(summary);
  const subject =
    summary.finalPendingTotal > 0
      ? `【書類進捗】未完了 ${summary.total}件（うち最終工程 ${summary.finalPendingTotal}件）${today}`
      : `【書類進捗】未完了 ${summary.total}件 ${today}`;
  const text = [
    "書類の進捗で、日数が経っているものがあります。",
    "",
    ...lines.map((l) => `・${l}`),
    "",
    "詳しくは院内のポータルでご確認ください:",
    portalUrl,
    "",
    "※このメールには患者様のお名前・カルテ番号は記載していません。",
    "（南草津皮フ科 スタッフ研修ポータル／自動送信）",
  ].join("\n");
  return { subject, text };
}

/** 「同じ内容か」を判定するための指紋。滞留している件と、その工程の状態だけで作る */
export function staleDigest(
  tasks: DocTask[],
  cfg: DocTasksConfig,
  today: string
): string {
  return tasks
    .filter((t) => isStale(t, cfg, today))
    .map((t) => {
      const steps = docTypeDef(t.docType)
        .steps.map((s) => (isStepDone(t, s) ? "1" : "0"))
        .join("");
      return `${t.id}:${steps}`;
    })
    .sort()
    .join("|");
}

// ─── 並び替え・絞り込み ───

export type DocTaskSort = "stale" | "entered" | "chart";

export function sortDocTasks(
  tasks: DocTask[],
  sort: DocTaskSort,
  today: string
): DocTask[] {
  const list = tasks.slice();
  if (sort === "chart") {
    return list.sort(
      (a, b) => a.chartNo.localeCompare(b.chartNo, "ja") || a.enteredOn.localeCompare(b.enteredOn)
    );
  }
  if (sort === "entered") {
    return list.sort(
      (a, b) => b.enteredOn.localeCompare(a.enteredOn) || b.createdAt.localeCompare(a.createdAt)
    );
  }
  // 既定: 滞留日数の長い順（未完了が先・同日数なら最終工程未完を先に）
  return list.sort((a, b) => {
    const ac = isDocTaskCompleted(a);
    const bc = isDocTaskCompleted(b);
    if (ac !== bc) return ac ? 1 : -1;
    const ad = elapsedDays(a, today);
    const bd = elapsedDays(b, today);
    if (ad !== bd) return bd - ad;
    const af = hasFinalPending(a) ? 0 : 1;
    const bf = hasFinalPending(b) ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.chartNo.localeCompare(b.chartNo, "ja");
  });
}

// ─── クライアント → /api/doc-tasks 呼び出しヘルパ ───

export type DocTasksListResponse = {
  tasks: DocTask[];
  config: DocTasksConfig;
  isAdmin: boolean;
  canNotify: boolean;
  today: string;
  tableMissing: boolean;
};

async function callDocTasksApi<T>(
  init: RequestInit & { path?: string; query?: string }
): Promise<T> {
  const { path = "", query = "", ...rest } = init;
  const res = await fetch(`/api/doc-tasks${path}${query}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: rest.body ? { "Content-Type": "application/json" } : undefined,
    ...rest,
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(j.error || `通信に失敗しました (${res.status})`);
  }
  return j;
}

export async function fetchDocTasks(): Promise<DocTasksListResponse> {
  return callDocTasksApi<DocTasksListResponse>({ method: "GET" });
}

export type NewDocTaskInput = {
  docType: DocTypeId;
  chartNo: string;
  doctor: string;
  enteredOn: string;
  assigneeUserId?: string;
  memo?: string;
};

export async function createDocTask(input: NewDocTaskInput): Promise<DocTask> {
  const j = await callDocTasksApi<{ task: DocTask }>({
    method: "POST",
    body: JSON.stringify(input),
  });
  return j.task;
}

export type DocTaskPatch = Partial<
  Pick<
    DocTask,
    "chartNo" | "doctor" | "enteredOn" | "steps" | "assigneeUserId" | "memo"
  >
>;

export async function patchDocTask(
  id: string,
  patch: DocTaskPatch
): Promise<DocTask> {
  const j = await callDocTasksApi<{ task: DocTask }>({
    method: "PATCH",
    body: JSON.stringify({ id, ...patch }),
  });
  return j.task;
}

export async function deleteDocTask(id: string): Promise<void> {
  await callDocTasksApi({
    method: "DELETE",
    query: `?id=${encodeURIComponent(id)}`,
  });
}

// ─── メール通知（155・管理者のみ） ───

export type DocTasksMailLogEntry = {
  at: string;
  toCount: number;
  ok: boolean;
  staleCount: number;
  error: string;
  kind: "cron" | "test";
};

export type DocTasksMailStatus = {
  /** Vercelに RESEND_API_KEY が入っているか（キー自体は取得しない） */
  configured: boolean;
  /** Vercelに CRON_SECRET が入っているか（無いと日次実行が401で空振りする） */
  cronReady: boolean;
  from: string;
  portalUrl: string;
  minResendDays: number;
  lastSentOn: string;
  entries: DocTasksMailLogEntry[];
};

export async function fetchDocTasksMailStatus(): Promise<DocTasksMailStatus> {
  return callDocTasksApi<DocTasksMailStatus>({ method: "GET", path: "/mail" });
}

export async function sendDocTasksTestMail(): Promise<{
  staleCount: number;
  toCount: number;
}> {
  return callDocTasksApi<{ staleCount: number; toCount: number }>({
    method: "POST",
    path: "/mail",
  });
}

export async function saveDocTasksConfig(
  patch: Partial<DocTasksConfig>
): Promise<DocTasksConfig> {
  const j = await callDocTasksApi<{ config: DocTasksConfig }>({
    method: "PUT",
    path: "/config",
    body: JSON.stringify(patch),
  });
  return j.config;
}
