// 1on1の書き起こしの取り込み（指示書221）— サーバー専用
//
// 【置き場所】新しい表もSQLも足さない。成長記録の表 clinic_staff_growth に
//   ・同意の印   record_type = "transcript_consent"（id: tcons-<userId>・スタッフごとに1行）
//   ・1日の回数  record_type = "transcript_quota"（id: tq-<userId>-<YYYYMMDD>・人ごと日ごとに1行）
//   どちらも成長記録系のAPIが record_type で絞って読むため、既存のどのAPIからも出てこない。
//
// 【使える人（221 §0-4・§4）】院長、または**担当スタッフの1on1で自分が記録者になる幹部**だけ。
//   同意の印がないスタッフは、院長でも取り込めない（221 §1）。判定はここ（サーバー）で行う。
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
  normalizeConsent,
  transcriptConsentId,
  transcriptQuotaId,
  type TranscriptConsent,
} from "./one-on-one-transcript";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

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

/** そのスタッフの同意の印（無ければ null） */
export async function loadTranscriptConsent(
  admin: Admin,
  userId: string
): Promise<TranscriptConsent | null> {
  try {
    const { data, error } = await admin
      .from(GROWTH_TABLE)
      .select("id, data")
      .eq("id", transcriptConsentId(userId))
      .eq("record_type", TRANSCRIPT_CONSENT_TYPE)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error.message)) return null;
      throw new Error(error.message);
    }
    return normalizeConsent((data as { data?: unknown } | null)?.data);
  } catch {
    return null;
  }
}

/** 印を付ける／外す（院長のみ。呼ぶ前に院長であることを確かめること） */
export async function saveTranscriptConsent(
  admin: Admin,
  input: { userId: string; consented: boolean; on: string; by: string }
): Promise<TranscriptConsent | null> {
  const id = transcriptConsentId(input.userId);
  if (!input.consented) {
    const { error } = await admin
      .from(GROWTH_TABLE)
      .delete()
      .eq("id", id)
      .eq("record_type", TRANSCRIPT_CONSENT_TYPE);
    if (error && !isMissingTable(error.message)) throw new Error(error.message);
    return null;
  }
  const row: TranscriptConsent = {
    userId: input.userId,
    on: input.on,
    by: input.by,
    updatedAt: new Date().toISOString(),
  };
  const { error } = await admin.from(GROWTH_TABLE).upsert({
    id,
    record_type: TRANSCRIPT_CONSENT_TYPE,
    data: row,
    updated_by: input.by,
    updated_at: row.updatedAt,
  });
  if (error) throw new Error(error.message);
  return row;
}

export type TranscriptPermission =
  | { ok: true; isAdmin: boolean }
  | { ok: false; reason: "not_allowed" | "no_consent" | "feature_off" };

/**
 * 221 §0-4・§1・§4: その人が、そのスタッフの1on1を取り込んでよいか。
 * ・院長 … 同意の印があるスタッフなら可
 * ・幹部 … 担当に指定されたスタッフで、かつ同意の印があれば可（記録者は自分になる）
 * ・それ以外 … 不可
 */
export async function canImportTranscript(
  admin: Admin,
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
  const consent = await loadTranscriptConsent(admin, staffUserId);
  if (!consent) return { ok: false, reason: "no_consent" };
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
