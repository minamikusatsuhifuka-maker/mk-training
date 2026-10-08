// 毎朝8時の定時処理の「前回の結果」（指示書219）— 純関数
//
// 【なぜ要るか】2本の定時処理（書類進捗の滞留アラート＝155／1on1の知らせ＝204・205）は
//   どんな結果でもHTTP 200を返す作りで（cron自体を失敗させないため）、
//   Vercelのログを見ても「送ったのか・送る対象が無かったのか」が分からない。
//   実行のたびに**結果を1行だけ**残し、院長が管理画面でいつでも確かめられるようにする。
//
// 【記録に入れないもの（219 §1）】メールアドレス・氏名・回答の中身。
//   残すのは「いつ・どの処理・どうなった・何件送って何件失敗したか」だけ。
//   失敗の理由は maskPersonal() を通し、メールアドレスを伏せてから残す。
//
// 依存なし（"@/" を使わない）＝ node --experimental-strip-types で直接確かめられる。
// 書き込み・読み出しは lib/cron-status-server.ts（service-role）。

/** 記録の置き場所（育成カルテの表の中・この種類は他のどのAPIも読まない） */
export const CRON_RUN_TYPE = "cron_run";

/** この時間を超えて実行の記録が無ければ「呼ばれていない」とみなす（219 §2） */
export const CRON_STALE_HOURS = 26;

export type CronJobKey = "doc-tasks-alert" | "presurvey-alert";

export const CRON_JOBS: {
  key: CronJobKey;
  label: string;
  /** 詳しい履歴へ移れる画面（無ければ空） */
  href: string;
  hrefLabel: string;
}[] = [
  {
    key: "doc-tasks-alert",
    label: "📄 書類進捗の滞留アラート",
    href: "/doc-tasks/settings",
    hrefLabel: "送信の履歴を見る",
  },
  {
    key: "presurvey-alert",
    label: "📝 1on1の知らせ（事前アンケート・予定）",
    href: "",
    hrefLabel: "",
  },
];

export function cronJobLabel(job: string): string {
  return CRON_JOBS.find((j) => j.key === job)?.label ?? job;
}

/** 結果の種類（画面にはこの言い方で出す） */
export type CronRunResult = "sent" | "nothing" | "already" | "mail_off" | "failed";

export const CRON_RESULT_LABEL: Record<CronRunResult, string> = {
  sent: "送った",
  nothing: "送る対象なし",
  already: "今日は送信済み",
  mail_off: "メール送信：OFF（アプリ内の知らせのみ）",
  failed: "失敗",
};

/** 内訳の1行（1on1の知らせは「事前アンケート」と「予定」に分ける・219 §1） */
export type CronRunPart = {
  label: string;
  result: CronRunResult;
  reason: string;
  sent: number;
  failed: number;
};

export type CronRunRecord = {
  job: CronJobKey;
  /** 実行日時（ISO） */
  at: string;
  result: CronRunResult;
  /** 画面に出す短い理由 */
  reason: string;
  sent: number;
  failed: number;
  parts: CronRunPart[];
  /** 失敗したときのエラーの要約（メールアドレスは伏せる） */
  error: string;
};

// ─── 個人が分かるものを残さない ───

/** メールアドレスらしき文字列 */
const EMAIL_RE = /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/g;

/**
 * 記録に残す前の下ごしらえ（219 §1）。
 * メールアドレスを「（宛先）」に伏せ、改行を詰めて長さを切る。
 * 送信基盤のエラーには宛先がそのまま入ることがあるため、**必ずここを通す**。
 */
export function maskPersonal(text: string, max = 200): string {
  return (text || "")
    .replace(EMAIL_RE, "（宛先）")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// ─── 書類進捗の滞留アラート（155）の結果を記録の形にする ───

export type DocTasksOutcomeLike = {
  status: string;
  reason?: string;
  error?: string;
  sentCount?: number;
  failedCount?: number;
  staleCount?: number;
  toCount?: number;
};

const DOC_SKIP: Record<string, { result: CronRunResult; reason: string }> = {
  not_configured: { result: "mail_off", reason: "メールの送信設定がまだです" },
  no_recipients: { result: "mail_off", reason: "宛先が未設定です" },
  no_stale: { result: "nothing", reason: "滞留している書類がありません" },
  already_sent_today: { result: "already", reason: "今日はもう送りました" },
  unchanged: { result: "nothing", reason: "前回と同じ内容なので送りません" },
  table_missing: { result: "nothing", reason: "書類進捗の表がまだありません" },
};

export function docTasksRunRecord(outcome: DocTasksOutcomeLike, at: string): CronRunRecord {
  const base = { job: "doc-tasks-alert" as const, at, parts: [] as CronRunPart[] };
  if (outcome.status === "sent") {
    const failed = outcome.failedCount ?? 0;
    return {
      ...base,
      result: "sent",
      reason: `滞留${outcome.staleCount ?? 0}件を知らせました`,
      sent: outcome.sentCount ?? 0,
      failed,
      error: failed > 0 ? maskPersonal(outcome.error ?? "") : "",
    };
  }
  if (outcome.status === "failed") {
    return {
      ...base,
      result: "failed",
      reason: "送信に失敗しました",
      sent: 0,
      failed: outcome.failedCount ?? 0,
      error: maskPersonal(outcome.error ?? "送信に失敗しました"),
    };
  }
  const skip = DOC_SKIP[outcome.reason ?? ""] ?? {
    result: "nothing" as CronRunResult,
    reason: outcome.reason ? `送りませんでした（${outcome.reason}）` : "送りませんでした",
  };
  return { ...base, result: skip.result, reason: skip.reason, sent: 0, failed: 0, error: "" };
}

// ─── 1on1の知らせ（204の事前アンケート＋205の予定）の結果を記録の形にする ───

export type PresurveyPartLike = {
  status?: string;
  reason?: string;
  due?: number;
  sent?: number;
  alreadySent?: number;
  skippedTestSeed?: number;
  noEmail?: number;
  failures?: string[];
};

export type PresurveyOutcomeLike = PresurveyPartLike & { reminder?: PresurveyPartLike };

const READY_SKIP: Record<string, { result: CronRunResult; reason: string }> = {
  feature_off: { result: "mail_off", reason: "この機能が公開されていません" },
  flag_off: { result: "mail_off", reason: "メールで送る設定がOFFです" },
  smtp_not_configured: { result: "mail_off", reason: "メールの送信設定がまだです" },
  table_missing: { result: "nothing", reason: "1on1の予定の表がまだありません" },
};

function presurveyPart(label: string, p: PresurveyPartLike | undefined): CronRunPart {
  const part = p ?? {};
  const failures = part.failures ?? [];
  const sent = part.sent ?? 0;
  const due = part.due ?? 0;
  const already = part.alreadySent ?? 0;
  if (failures.length > 0) {
    return {
      label,
      result: "failed",
      reason: `${failures.length}件の送信に失敗しました`,
      sent,
      failed: failures.length,
    };
  }
  if (sent > 0) {
    return { label, result: "sent", reason: `${sent}件に知らせました`, sent, failed: 0 };
  }
  const skip = READY_SKIP[part.reason ?? ""];
  if (skip) return { label, result: skip.result, reason: skip.reason, sent: 0, failed: 0 };
  if (due > 0 && already >= due) {
    return { label, result: "already", reason: "今日の分はもう送りました", sent: 0, failed: 0 };
  }
  if (due === 0) {
    return { label, result: "nothing", reason: "今日知らせる予定はありません", sent: 0, failed: 0 };
  }
  return { label, result: "nothing", reason: "送る相手がいませんでした", sent: 0, failed: 0 };
}

/** 全体の結果（失敗がいちばん強い → 送った → 今日は送信済み → メールOFF → 対象なし） */
function mergeResults(parts: CronRunPart[]): CronRunResult {
  if (parts.some((p) => p.result === "failed")) return "failed";
  if (parts.some((p) => p.result === "sent")) return "sent";
  if (parts.some((p) => p.result === "already")) return "already";
  if (parts.length > 0 && parts.every((p) => p.result === "mail_off")) return "mail_off";
  return "nothing";
}

export function presurveyRunRecord(outcome: PresurveyOutcomeLike, at: string): CronRunRecord {
  const parts = [
    presurveyPart("事前アンケートの知らせ", outcome),
    presurveyPart("1on1の予定の知らせ", outcome.reminder),
  ];
  const failures = [...(outcome.failures ?? []), ...(outcome.reminder?.failures ?? [])];
  const result = mergeResults(parts);
  return {
    job: "presurvey-alert",
    at,
    result,
    reason: parts.map((p) => `${p.label}: ${p.reason}`).join(" ／ "),
    sent: parts.reduce((n, p) => n + p.sent, 0),
    failed: parts.reduce((n, p) => n + p.failed, 0),
    parts,
    error: failures.length > 0 ? maskPersonal(failures.join(" ／ ")) : "",
  };
}

/** 処理そのものが落ちたとき（catch から使う） */
export function failedRunRecord(job: CronJobKey, at: string, error: unknown): CronRunRecord {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return {
    job,
    at,
    result: "failed",
    reason: "処理が最後まで進みませんでした",
    sent: 0,
    failed: 0,
    parts: [],
    error: maskPersonal(message || "処理に失敗しました"),
  };
}

// ─── 読み出し・表示 ───

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}
function str(v: unknown, max = 400): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function result(v: unknown): CronRunResult {
  return v === "sent" || v === "nothing" || v === "already" || v === "mail_off" || v === "failed"
    ? v
    : "nothing";
}

export function normalizeCronRecord(raw: unknown): CronRunRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const job = o.job === "doc-tasks-alert" || o.job === "presurvey-alert" ? o.job : null;
  if (!job) return null;
  const parts = Array.isArray(o.parts)
    ? o.parts.slice(0, 5).map((p) => {
        const x = (p ?? {}) as Record<string, unknown>;
        return {
          label: str(x.label, 60),
          result: result(x.result),
          reason: str(x.reason, 200),
          sent: num(x.sent),
          failed: num(x.failed),
        };
      })
    : [];
  return {
    job,
    at: str(o.at, 40),
    result: result(o.result),
    reason: str(o.reason, 400),
    sent: num(o.sent),
    failed: num(o.failed),
    parts,
    error: str(o.error, 300),
  };
}

/** 前回の実行から CRON_STALE_HOURS 以上たっている（＝呼ばれていないかもしれない） */
export function isCronStale(at: string, now: number, hours = CRON_STALE_HOURS): boolean {
  const t = Date.parse(at || "");
  if (Number.isNaN(t)) return true; // 記録が無い・壊れている
  return now - t >= hours * 60 * 60 * 1000;
}

/** 赤い帯を出すか（219 §2: 失敗した／26時間以上たっている） */
export function needsAttention(rec: CronRunRecord | null, now: number): boolean {
  if (!rec) return true;
  return rec.result === "failed" || isCronStale(rec.at, now);
}

/** サーバーのログに出す1行（219 §1） */
export function cronLogLine(rec: CronRunRecord): string {
  const parts = rec.parts.map((p) => `${p.label}=${p.result}(${p.sent}/${p.failed})`).join(" ");
  return `[cron] ${rec.job} result=${rec.result} sent=${rec.sent} failed=${rec.failed}${
    parts ? ` ${parts}` : ""
  }${rec.error ? ` error=${rec.error}` : ""}`;
}

/** 日時の表示（"2026-10-08T23:00:07.000Z" → "2026/10/09 08:00"・日本時間） */
export function formatRunAt(at: string): string {
  const t = Date.parse(at || "");
  if (Number.isNaN(t)) return "記録なし";
  const d = new Date(t + 9 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(
    d.getUTCMinutes()
  )}`;
}
