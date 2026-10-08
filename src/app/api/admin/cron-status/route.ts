// 毎朝8時の定時処理の「前回の結果」（指示書219 §2）— **院長のみ**
//
//   GET → { runs: [{ job, record | null }], now }
//
// 【見られる人】requireAdmin（app_metadata.role＝院長）だけ。**委任の対象にしない**ので
//   lib/admin-items.ts の API_ITEM_MAP には入れない＝ proxy が幹部には
//   「存在しないAPIと同じ応答」を返す（159-D）。このルート自身でも院長判定をやり直す。
//
// 【返すもの】実行日時・結果・件数だけ。メールアドレス・氏名・回答の中身は
//   そもそも記録していない（219 §1・lib/cron-status.ts の maskPersonal）。

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdminClient, ServiceRoleMissingError } from "@/lib/supabase-admin";
import { loadCronRuns } from "@/lib/cron-status-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  try {
    const admin = createSupabaseAdminClient();
    const runs = await loadCronRuns(admin);
    // 「前回からどれだけたったか」は画面で判定する（端末の時計に左右されないよう今の時刻も返す）
    return NextResponse.json({ runs, now: new Date().toISOString() });
  } catch (e) {
    if (e instanceof ServiceRoleMissingError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "読み込みに失敗しました" },
      { status: 500 }
    );
  }
}
