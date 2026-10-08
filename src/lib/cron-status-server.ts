// 定時処理の「前回の結果」の読み書き（指示書219）— サーバー専用
//
// 【置き場所】新しい表もSQLも足さない（219 §1）。育成カルテの表 clinic_staff_growth に
//   record_type = "cron_run" で**処理ごとに1行だけ**（固定のidで上書き）。
//   育成カルテ系のAPIはすべて record_type で絞って読むので、この種類の行は
//   **どの既存APIからも出てこない**。読めるのは院長だけの /api/admin/cron-status だけ。
//   （content_store は「ログイン済みなら全キー読める」決まりなので使わない・219 §1）
//
// 【止めない】記録に失敗しても定時処理そのものは続ける（219 §1）。
//   ここでは例外を投げず、サーバーのログに残すだけにする。
//
// 【残さないもの】メールアドレス・氏名・回答の中身。入れる前に必ず lib/cron-status.ts の
//   maskPersonal() を通した文字列にしておくこと（この層でももう一度通す）。

import { GROWTH_TABLE } from "./staff-growth-server";
import type { createSupabaseAdminClient } from "./supabase-admin";
import {
  CRON_JOBS,
  CRON_RUN_TYPE,
  cronLogLine,
  maskPersonal,
  normalizeCronRecord,
  type CronJobKey,
  type CronRunRecord,
} from "./cron-status";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** 行のid（処理ごとに固定＝upsertで上書き＝1行だけ残る） */
export function cronRunRowId(job: CronJobKey): string {
  return `cron-${job}`;
}

/**
 * 実行の結果を1行残す（上書き）。**例外を投げない**。
 * あわせて、サーバーのログにも結果と件数を1行出す（219 §1）。
 */
export async function recordCronRun(admin: Admin, rec: CronRunRecord): Promise<void> {
  // 保存するものを明示的に組み直す（渡された余分な項目を持ち込まない＝個人情報の混入を防ぐ）
  const data = {
    job: rec.job,
    at: rec.at,
    result: rec.result,
    reason: maskPersonal(rec.reason, 400),
    sent: rec.sent,
    failed: rec.failed,
    parts: rec.parts.map((p) => ({
      label: p.label,
      result: p.result,
      reason: maskPersonal(p.reason, 200),
      sent: p.sent,
      failed: p.failed,
    })),
    error: maskPersonal(rec.error, 300),
  };
  console.log(cronLogLine(rec));
  try {
    const { error } = await admin.from(GROWTH_TABLE).upsert({
      id: cronRunRowId(rec.job),
      record_type: CRON_RUN_TYPE,
      data,
      updated_by: "cron",
      updated_at: new Date().toISOString(),
    });
    if (error) console.error(`[cron] 結果の記録に失敗: ${error.message}`);
  } catch (e) {
    console.error(`[cron] 結果の記録に失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 院長の画面に出すための読み出し（処理の並びは CRON_JOBS の順。記録が無ければ null） */
export async function loadCronRuns(
  admin: Admin
): Promise<{ job: CronJobKey; record: CronRunRecord | null }[]> {
  const byJob = new Map<string, CronRunRecord>();
  try {
    const { data, error } = await admin
      .from(GROWTH_TABLE)
      .select("id, data")
      .eq("record_type", CRON_RUN_TYPE);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as { data: unknown }[]) {
      const rec = normalizeCronRecord(row.data);
      if (rec) byJob.set(rec.job, rec);
    }
  } catch (e) {
    // 表が無い・読めないときも画面は出す（「記録なし」として赤い帯になる）
    console.error(`[cron] 結果の読み出しに失敗: ${e instanceof Error ? e.message : String(e)}`);
  }
  return CRON_JOBS.map((j) => ({ job: j.key, record: byJob.get(j.key) ?? null }));
}
