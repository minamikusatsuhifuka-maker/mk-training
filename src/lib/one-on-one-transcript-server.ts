// 1on1の書き起こしの取り込み（指示書221）— サーバー専用
//
// 【置き場所】新しい表もSQLも足さない。可能性ノートの表 clinic_staff_growth に
//   ・（同意の印 record_type = "transcript_consent" は247でなくした。すでにある行は消さずに残す＝どこからも読まない）
//   ・1日の回数  record_type = "transcript_quota"（id: tq-<userId>-<YYYYMMDD>・人ごと日ごとに1行）
//   どちらも可能性ノート系のAPIが record_type で絞って読むため、既存のどのAPIからも出てこない。
//
// 【使える人（221 §0-4・§4）】院長、または**担当スタッフの1on1で自分が記録者になる幹部**だけ。
//   247: 同意の印はなくした（院長が口頭で説明して同意をいただく）。取り込みに印は要らない。判定はここ（サーバー）で行う。
//
// 【原文を残さない（221 §5）】この層は書き起こしを受け取らない。扱うのは印・回数・判定だけ。

import { GROWTH_TABLE, isMissingTable } from "./staff-growth-server";
import type { createSupabaseAdminClient } from "./supabase-admin";
import { loadKarteAssignments } from "./admin-delegation-server";
import { serverFeatureEnabled } from "./staff-growth-server";
import { isTestSeedUser } from "./test-seed";
import { isAdminUser } from "./admin-role";
import type { User } from "@supabase/supabase-js";
import {
  TRANSCRIPT_DAILY_LIMIT,
  transcriptQuotaId,
} from "./one-on-one-transcript";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** 247: 画面からも取り込みの判定からも外した。すでにある行を一括削除の対象に残すための名前だけ */
export const TRANSCRIPT_CONSENT_TYPE = "transcript_consent";
export const TRANSCRIPT_QUOTA_TYPE = "transcript_quota";

/** 221 §6: 機能の切り替え。OFFのあいだは院長と検証用アカウントだけが使える（203と同じ考え方） */
export async function transcriptFeatureReady(user: User): Promise<boolean> {
  if (isAdminUser(user) || isTestSeedUser(user)) return true;
  const [note, transcript] = await Promise.all([
    serverFeatureEnabled("one_on_one"),
    serverFeatureEnabled("one_on_one_transcript"),
  ]);
  return note && transcript;
}

export type TranscriptPermission =
  | { ok: true; isAdmin: boolean }
  | { ok: false; reason: "not_allowed" | "feature_off" };

/**
 * 221 §0-4・§4: その人が、そのスタッフの1on1を取り込んでよいか（247: 同意の印は見ない）。
 * ・院長 … 可
 * ・幹部 … 担当に指定されたスタッフなら可（記録者は自分になる）
 * ・それ以外 … 不可
 */
export async function canImportTranscript(
  user: User,
  staffUserId: string
): Promise<TranscriptPermission> {
  if (!(await transcriptFeatureReady(user))) return { ok: false, reason: "feature_off" };
  const admin役 = isAdminUser(user);
  if (!staffUserId || staffUserId === user.id) {
    // 自分自身の1on1を自分で取り込むことはしない（記録者＝相手のため）
    if (!admin役) return { ok: false, reason: "not_allowed" };
  }
  if (!admin役) {
    const assigned = await loadKarteAssignments(user.id).catch(() => [] as string[]);
    if (!assigned.includes(staffUserId)) return { ok: false, reason: "not_allowed" };
  }
  return { ok: true, isAdmin: admin役 };
}

/**
 * 221 §6: 1人あたり1日の回数。数えるだけで、本文は何も持たない。
 * 使う前に呼び、上限に達していれば false。
 */
export async function takeTranscriptQuota(
  admin: Admin,
  userId: string,
  todayYmd: string
): Promise<{ ok: boolean; used: number; limit: number }> {
  const id = transcriptQuotaId(userId, todayYmd);
  let used = 0;
  try {
    const { data, error } = await admin
      .from(GROWTH_TABLE)
      .select("id, data")
      .eq("id", id)
      .eq("record_type", TRANSCRIPT_QUOTA_TYPE)
      .maybeSingle();
    if (error && !isMissingTable(error.message)) throw new Error(error.message);
    const n = ((data as { data?: { count?: unknown } } | null)?.data?.count ?? 0) as number;
    used = typeof n === "number" && n > 0 ? Math.floor(n) : 0;
  } catch {
    used = 0; // 数えられないときは止めない（機能そのものは守りの対象ではない）
  }
  if (used >= TRANSCRIPT_DAILY_LIMIT) return { ok: false, used, limit: TRANSCRIPT_DAILY_LIMIT };
  try {
    await admin.from(GROWTH_TABLE).upsert({
      id,
      record_type: TRANSCRIPT_QUOTA_TYPE,
      data: { userId, date: todayYmd, count: used + 1 },
      updated_by: userId,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* 数えられなくても取り込みは続ける */
  }
  return { ok: true, used: used + 1, limit: TRANSCRIPT_DAILY_LIMIT };
}
