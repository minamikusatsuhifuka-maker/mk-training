// 事前アンケートの提出の知らせ（指示書204 §6・Vercel Cron から呼ばれる）
//
// スケジュールは vercel.json の crons（毎日 23:00 UTC ＝ 翌日 08:00 JST＝204 §6-1の「朝8時」）。
//
// 【認証】ログインセッションを持たない呼び出しなので **CRON_SECRET を必須** にする（155と同じ）。
//   Vercel Cron はこの環境変数があると Authorization: Bearer <CRON_SECRET> を自動で付ける。
//   x-vercel-cron ヘッダだけで通す作りにしない（外部からでも付けられる）。
//   **未設定なら401**（fail-closed）＝誰も実行できない。未設定の間もアプリは壊れない
//   （メールが送られないだけ。アプリ内の知らせは画面側が出す）。
//
// 送る・送らないの判断と「送った記録」は lib/presurvey-alert-server.ts に閉じている。

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { GrowthTableMissingError } from "@/lib/staff-growth-server";
import { dispatchPresurveyAlerts } from "@/lib/presurvey-alert-server";
import { jstTodayYmd } from "@/lib/library";
// 219: 実行のたびに結果を1行だけ残す（事前アンケートと1on1の予定は内訳を分ける）
import { recordCronRun } from "@/lib/cron-status-server";
import { failedRunRecord, presurveyRunRecord } from "@/lib/cron-status";

export const runtime = "nodejs";
export const maxDuration = 60;
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
    const outcome = await dispatchPresurveyAlerts(admin, jstTodayYmd());
    // 219 §1: 記録に失敗しても定時処理は止めない（recordCronRun は例外を投げない）
    await recordCronRun(admin, presurveyRunRecord(outcome, at));
    return NextResponse.json(outcome);
  } catch (e) {
    if (e instanceof GrowthTableMissingError) {
      const outcome = { status: "skipped" as const, reason: "table_missing" };
      if (admin) await recordCronRun(admin, presurveyRunRecord(outcome, at));
      return NextResponse.json(outcome);
    }
    // cron自体は落とさず、理由を返す（Vercelのログに残る）
    if (admin) await recordCronRun(admin, failedRunRecord("presurvey-alert", at, e));
    return NextResponse.json(
      { status: "failed", error: e instanceof Error ? e.message : "処理に失敗しました" },
      { status: 200 }
    );
  }
}
