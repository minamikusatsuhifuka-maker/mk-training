// 書類進捗ボードのメール通知 状態確認・テスト送信（指示書155）— **管理者のみ**
//   GET  → { configured, from, portalUrl, lastSentOn, entries }（APIキー自体は返さない）
//   POST → いま滞留している内容でテスト送信を1通（1日1回の制限は通さない）
// 非許可・未ログイン・非管理者にはすべて 404（154と同じ存在秘匿）。

import { NextResponse } from "next/server";
import {
  authorizeDocTasks,
  fetchAllDocTasks,
  ServiceRoleMissingError,
} from "@/lib/doc-tasks-server";
import {
  isMailConfigured,
  loadMailState,
  mailFrom,
  portalUrl,
  sendTestAlertMail,
  MIN_RESEND_DAYS,
} from "@/lib/doc-tasks-mail";

export const runtime = "nodejs";
export const maxDuration = 60;

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

export async function GET() {
  const auth = await authorizeDocTasks();
  if (!auth.ok || !auth.isAdmin) return hidden();

  try {
    const state = await loadMailState(auth.admin);
    return NextResponse.json({
      configured: isMailConfigured(),
      from: isMailConfigured() ? mailFrom() : "",
      portalUrl: portalUrl(),
      minResendDays: MIN_RESEND_DAYS,
      lastSentOn: state.lastSentOn,
      entries: state.entries.slice(0, 5),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST() {
  const auth = await authorizeDocTasks();
  if (!auth.ok || !auth.isAdmin) return hidden();

  try {
    const { tasks } = await fetchAllDocTasks(auth.admin);
    const result = await sendTestAlertMail(auth.admin, auth.config, tasks);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      staleCount: result.staleCount,
      toCount: auth.config.notifyEmails.length,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
