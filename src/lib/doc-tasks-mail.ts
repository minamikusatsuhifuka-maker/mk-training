// 滞留アラートのメール送信（指示書155・サーバー専用）
//
// 【設計の要点】
// - 送信は Resend の REST を fetch で直接叩く（SDK依存を増やさない）。
// - **環境変数が未設定なら送信を試みない**（skipped を返すだけ）。設定前でもアプリは壊れない＝fail-safe。
// - 本文にカルテ番号・患者情報は載せない（154の絶対条件）。本文生成は lib/doc-tasks.ts の
//   buildAlertMail（＝buildAlertLines 経由）に一本化してあり、この層は文面を組み立てない。
// - 送信の成否は必ず記録する（黙って失敗しない）。記録は clinic_doc_tasks の専用行。
//
// 【必要な環境変数（院長がVercelに設定）】
//   RESEND_API_KEY          … Resend のAPIキー。**未設定＝メール送信は行わない**
//   DOC_TASKS_MAIL_FROM     … 差出人（例: "南草津皮フ科 <onboarding@resend.dev>"）。未設定時は下の既定値
//   CRON_SECRET             … 任意。設定するとVercel Cronの呼び出しに Bearer 認証がかかる
//
// 【再送制御】1日1回まで。かつ前回と同じ内容（滞留している件と工程の状態が同一）なら
//   MIN_RESEND_DAYS 日あけるまで送らない ＝「同じ件で毎日届き続ける」ことがない。
//   状態が変わった（＝指紋が変わった）ときは翌日の便で送る。

import {
  buildAlertMail,
  staleDigest,
  summarizeStale,
  todayYmdJst,
  daysBetweenYmd,
  type DocTask,
  type DocTasksConfig,
} from "./doc-tasks";
import { DOC_TASKS_TABLE, type DocTasksAdminClient } from "./doc-tasks-server";

/** 送信記録を持つ行のID（タスクでも設定でもない専用行） */
export const DOC_TASKS_MAIL_ROW_ID = "__mail__";

/** 内容が変わらないまま再送するまでの間隔（日） */
export const MIN_RESEND_DAYS = 3;

/** 記録として残す件数 */
const LOG_MAX = 30;

const DEFAULT_FROM = "南草津皮フ科ポータル <onboarding@resend.dev>";

export type MailLogEntry = {
  at: string;
  /** 宛先の件数だけ残す（アドレス本体は設定にあるので二重に持たない） */
  toCount: number;
  ok: boolean;
  /** 送った時点の滞留件数 */
  staleCount: number;
  /** 失敗理由（成功時は空） */
  error: string;
  /** cron（日次）か test（管理画面からの手動）か */
  kind: "cron" | "test";
};

export type MailState = {
  /** 最後に日次送信した日（YYYY-MM-DD・JST） */
  lastSentOn: string;
  /** 最後に送った内容の指紋 */
  lastDigest: string;
  entries: MailLogEntry[];
};

export function emptyMailState(): MailState {
  return { lastSentOn: "", lastDigest: "", entries: [] };
}

function normalizeMailState(raw: unknown): MailState {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const entries = Array.isArray(g.entries)
    ? g.entries
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .map((e) => ({
          at: typeof e.at === "string" ? e.at : "",
          toCount: typeof e.toCount === "number" ? e.toCount : 0,
          ok: e.ok === true,
          staleCount: typeof e.staleCount === "number" ? e.staleCount : 0,
          error: typeof e.error === "string" ? e.error.slice(0, 300) : "",
          kind: e.kind === "test" ? ("test" as const) : ("cron" as const),
        }))
        .filter((e) => e.at)
        .slice(0, LOG_MAX)
    : [];
  return {
    lastSentOn: typeof g.lastSentOn === "string" ? g.lastSentOn : "",
    lastDigest: typeof g.lastDigest === "string" ? g.lastDigest : "",
    entries,
  };
}

export async function loadMailState(
  admin: DocTasksAdminClient
): Promise<MailState> {
  try {
    const { data, error } = await admin
      .from(DOC_TASKS_TABLE)
      .select("data")
      .eq("id", DOC_TASKS_MAIL_ROW_ID)
      .maybeSingle();
    if (error) return emptyMailState();
    return normalizeMailState(data?.data ?? null);
  } catch {
    return emptyMailState();
  }
}

async function saveMailState(
  admin: DocTasksAdminClient,
  state: MailState
): Promise<void> {
  await admin.from(DOC_TASKS_TABLE).upsert({
    id: DOC_TASKS_MAIL_ROW_ID,
    record_type: "mail",
    data: state,
    updated_by: "system",
    updated_at: new Date().toISOString(),
  });
}

/** メール送信が使える状態か（APIキーの有無だけ・キー自体は返さない） */
export function isMailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function mailFrom(): string {
  return process.env.DOC_TASKS_MAIL_FROM || DEFAULT_FROM;
}

/** 本文に載せるポータルのURL（Vercelが自動で入れる本番ドメインを使う） */
export function portalUrl(): string {
  const host =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || "mk-training.vercel.app";
  return `https://${host}/doc-tasks`;
}

type SendResult = { ok: boolean; error: string };

/** Resend の REST を直接叩く（SDK不要） */
async function sendViaResend(
  to: string[],
  subject: string,
  text: string
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "RESEND_API_KEY が未設定です" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: mailFrom(), to, subject, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Resend ${res.status}: ${body.slice(0, 200)}`,
      };
    }
    return { ok: true, error: "" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "送信に失敗しました",
    };
  }
}

function pushEntry(state: MailState, entry: MailLogEntry): MailState {
  return { ...state, entries: [entry, ...state.entries].slice(0, LOG_MAX) };
}

export type DispatchOutcome =
  | { status: "sent"; staleCount: number; toCount: number }
  | { status: "failed"; error: string }
  | {
      status: "skipped";
      reason:
        | "not_configured" // APIキー未設定
        | "no_recipients" // 宛先が未設定
        | "no_stale" // 滞留ゼロ
        | "already_sent_today" // 今日はもう送った
        | "unchanged"; // 内容が変わっていない（一定間隔まで待つ）
    };

/**
 * 日次のまとめ送信。送るべきか判断し、送ったら記録を残す。
 * どのケースでも例外を投げない（cronが落ちないようにする）。
 */
export async function dispatchDailyAlertMail(
  admin: DocTasksAdminClient,
  config: DocTasksConfig,
  tasks: DocTask[]
): Promise<DispatchOutcome> {
  const today = todayYmdJst();

  if (!isMailConfigured()) return { status: "skipped", reason: "not_configured" };
  if (config.notifyEmails.length === 0) {
    return { status: "skipped", reason: "no_recipients" };
  }

  const summary = summarizeStale(tasks, config, today);
  if (summary.total === 0) return { status: "skipped", reason: "no_stale" };

  const state = await loadMailState(admin);
  if (state.lastSentOn === today) {
    return { status: "skipped", reason: "already_sent_today" };
  }

  // 同じ内容のまま毎日届かないようにする（状態が変われば翌日の便で送る）
  const digest = staleDigest(tasks, config, today);
  if (
    digest === state.lastDigest &&
    state.lastSentOn &&
    daysBetweenYmd(state.lastSentOn, today) < MIN_RESEND_DAYS
  ) {
    return { status: "skipped", reason: "unchanged" };
  }

  const { subject, text } = buildAlertMail(summary, portalUrl(), today);
  const result = await sendViaResend(config.notifyEmails, subject, text);
  const entry: MailLogEntry = {
    at: new Date().toISOString(),
    toCount: config.notifyEmails.length,
    ok: result.ok,
    staleCount: summary.total,
    error: result.error,
    kind: "cron",
  };

  if (!result.ok) {
    // 失敗は記録だけして lastSentOn は進めない（次の便で再挑戦する）
    await saveMailState(admin, pushEntry(state, entry));
    return { status: "failed", error: result.error };
  }

  await saveMailState(admin, {
    ...pushEntry(state, entry),
    lastSentOn: today,
    lastDigest: digest,
  });
  return {
    status: "sent",
    staleCount: summary.total,
    toCount: config.notifyEmails.length,
  };
}

/**
 * 管理画面からのテスト送信。今の滞留状況をそのまま1通送る。
 * 1日1回の制限・再送制御は**通さない**（確認のための手動操作なので）。
 * lastSentOn も更新しない（日次の判断に影響させない）。
 */
export async function sendTestAlertMail(
  admin: DocTasksAdminClient,
  config: DocTasksConfig,
  tasks: DocTask[]
): Promise<SendResult & { staleCount: number }> {
  const today = todayYmdJst();
  const summary = summarizeStale(tasks, config, today);

  if (!isMailConfigured()) {
    return {
      ok: false,
      error:
        "RESEND_API_KEY がVercelに設定されていません（手順書: 155_Resendセットアップ手順_院長用.md）",
      staleCount: summary.total,
    };
  }
  if (config.notifyEmails.length === 0) {
    return {
      ok: false,
      error: "通知先メールアドレスが未設定です",
      staleCount: summary.total,
    };
  }

  const { subject, text } =
    summary.total > 0
      ? buildAlertMail(summary, portalUrl(), today)
      : {
          subject: `【書類進捗】テスト送信 ${today}`,
          text: [
            "書類進捗ボードからのテスト送信です。",
            "",
            "現在、滞留している書類はありません。",
            "",
            "詳しくは院内のポータルでご確認ください:",
            portalUrl(),
            "",
            "※このメールには患者様のお名前・カルテ番号は記載していません。",
            "（南草津皮フ科 スタッフ研修ポータル／自動送信）",
          ].join("\n"),
        };

  const result = await sendViaResend(config.notifyEmails, subject, text);
  const state = await loadMailState(admin);
  await saveMailState(
    admin,
    pushEntry(state, {
      at: new Date().toISOString(),
      toCount: config.notifyEmails.length,
      ok: result.ok,
      staleCount: summary.total,
      error: result.error,
      kind: "test",
    })
  );
  return { ...result, staleCount: summary.total };
}
