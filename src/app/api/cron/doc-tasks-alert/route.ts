// 書類進捗ボード: 滞留アラートの日次まとめ送信（指示書155・Vercel Cron から呼ばれる）
//
// スケジュールは vercel.json の crons（毎日 23:00 UTC ＝ 翌日 08:00 JST）。
//
// 【認証】ログインセッションを持たない呼び出しなので **CRON_SECRET を必須** にする。
//   Vercel Cron はこの環境変数があると Authorization: Bearer <CRON_SECRET> を自動で付ける。
//   x-vercel-cron ヘッダだけで通す作りにしない: そのヘッダは外部からでも付けられるため、
//   誰でもメール送信を発火できてしまう。**未設定なら401**（fail-closed）。
//   なお CRON_SECRET 未設定の間もアプリは壊れない（メール自体がまだ送られない状態のため）。
//
// 送るべきか（1日1回・内容が変わっていないときの抑制）の判断と記録は
// lib/doc-tasks-mail.ts に閉じている。ここは呼び出しと結果の受け渡しだけ。

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchAllDocTasks, loadDocTasksConfig } from "@/lib/doc-tasks-server";
import { dispatchDailyAlertMail } from "@/lib/doc-tasks-mail";
// 219: 実行のたびに結果を1行だけ残す（院長が管理画面でいつでも確かめられるように）
import { recordCronRun } from "@/lib/cron-status-server";
import { docTasksRunRecord, failedRunRecord } from "@/lib/cron-status";

export const runtime = "nodejs";
export const maxDuration = 60;
// 常に実行時に走らせる（ビルド時に評価させない）
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // 未設定＝誰も実行できない（fail-closed）
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const at = new Date().toISOString();
  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
    admin = createSupabaseAdminClient();
    const { config, tableMissing } = await loadDocTasksConfig(admin);
    if (tableMissing) {
      // テーブル未作成（SQL未実行）でもcronを失敗にしない
      const outcome = { status: "skipped" as const, reason: "table_missing" };
      await recordCronRun(admin, docTasksRunRecord(outcome, at));
      return NextResponse.json(outcome);
    }
    const { tasks } = await fetchAllDocTasks(admin);
    const outcome = await dispatchDailyAlertMail(admin, config, tasks);
    // 219 §1: 記録に失敗しても定時処理は止めない（recordCronRun は例外を投げない）
    await recordCronRun(admin, docTasksRunRecord(outcome, at));
    return NextResponse.json(outcome);
  } catch (e) {
    // cron自体は落とさず、理由を返す（Vercelのログに残る）
    if (admin) await recordCronRun(admin, failedRunRecord("doc-tasks-alert", at, e));
    return NextResponse.json(
      {
        status: "failed",
        error: e instanceof Error ? e.message : "処理に失敗しました",
      },
      { status: 200 }
    );
  }
}
