// 📣 お知らせ・イベント：出欠の締切前の知らせ（指示書228 §5・Vercel Cron から呼ばれる）
//
// スケジュールは vercel.json の crons（毎日 23:00 UTC ＝ 翌日 08:00 JST＝「朝8時」）。
// 締切の3日前と前日に、まだ答えていない人へメールを送る（題名とリンクだけ）。
// アプリ内の知らせは本人の画面が締切から計算して出すので、ここではメールだけ。
//
// 【認証】CRON_SECRET を必須にする（155・204と同じ）。未設定なら401（fail-closed）。
// 【記録】実行のたびに結果を1行だけ残す（219・管理画面トップの「毎朝8時の定時処理 前回の結果」に出る）。
// 【266】年間計画の知らせ（期限の3日前・当日／今週のひとことがまだの人）も、この定期実行の中で出す（新しい定期実行は作らない）。
//   アプリ内だけ（メールは送らない）。年間計画の分が失敗しても、お知らせの分は止めない（逆も同じ）。
//   確かめのために手で動かすとき：?only=gantt&testOnly=1（検証用の計画・タスクだけ。お知らせの分は動かさない）、
//   &forceWeekly=1 で曜日に関係なく今週のひとことの知らせも見る（testOnly のときだけ効く）。

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { dispatchNoticeReminders } from "@/lib/notices-server";
import { jstToday } from "@/lib/notices";
import { recordCronRun } from "@/lib/cron-status-server";
import { failedRunRecord, noticesRunRecord } from "@/lib/cron-status";
import { runGanttDaily } from "@/lib/gantt-server";

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
  const url = new URL(req.url);
  const testOnly = url.searchParams.get("testOnly") === "1";
  let admin: ReturnType<typeof createSupabaseAdminClient> | null = null;
  try {
    admin = createSupabaseAdminClient();
    // 266: 年間計画の知らせ（失敗してもお知らせの分は続ける）
    let gantt: unknown;
    try {
      gantt = await runGanttDaily(admin, jstToday(), { testOnly, forceWeekly: testOnly && url.searchParams.get("forceWeekly") === "1" });
    } catch (e) {
      gantt = { status: "failed", error: e instanceof Error ? e.message : String(e) };
      console.error(`[cron] 年間計画の知らせに失敗: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (url.searchParams.get("only") === "gantt" && testOnly) return NextResponse.json({ gantt });
    const outcome = await dispatchNoticeReminders(admin, jstToday());
    await recordCronRun(admin, noticesRunRecord(outcome, at));
    return NextResponse.json({ ...outcome, gantt });
  } catch (e) {
    if (admin) await recordCronRun(admin, failedRunRecord("notices-alert", at, e));
    return NextResponse.json(
      { status: "failed", error: e instanceof Error ? e.message : "処理に失敗しました" },
      { status: 200 }
    );
  }
}
