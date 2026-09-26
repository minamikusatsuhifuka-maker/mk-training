// サーベイ履歴の読み書き（指示書182 B・サーバー専用）
//
// 保存先は content_store のサーバー専用キー `survey_history:<userId>`。
// /api/content-store からは読むことも書くこともできない（content-store-policy の SERVER_ONLY_PREFIXES）。
// 読み書きはここと、これを使う /api/profile/survey・育成カルテ（管理者・公開分のみ）だけ。

import { STAFF_PHOTOS_BUCKET } from "./staff-profiles";
import { createSupabaseAdminClient } from "./supabase-admin";
import { serverGetContentRow, serverPutContentRow } from "./content-store-server";
import { storagePathFromPublicUrl } from "./storage-signed";
import type { NeedsSurvey } from "./needs-survey";
import {
  entryFromSurvey,
  normalizeSurveyHistory,
  surveyHistoryKey,
  type SurveyHistoryEntry,
} from "./survey-history";

export async function loadSurveyHistory(userId: string): Promise<SurveyHistoryEntry[]> {
  try {
    const row = await serverGetContentRow(surveyHistoryKey(userId));
    return row ? normalizeSurveyHistory(row.data) : [];
  } catch {
    return [];
  }
}

export async function saveSurveyHistory(
  userId: string,
  entries: SurveyHistoryEntry[]
): Promise<boolean> {
  return serverPutContentRow(
    surveyHistoryKey(userId),
    "survey_history",
    { entries: normalizeSurveyHistory({ entries }) },
    userId
  );
}

/**
 * 「現在の結果」を履歴の末尾に移す（182 B-1）。中身が無ければ何もしない。
 * 画像は消さない（履歴に紐づけて残す）。
 */
export async function archiveCurrentSurvey(
  userId: string,
  current: NeedsSurvey | undefined | null
): Promise<SurveyHistoryEntry | null> {
  const now = new Date().toISOString();
  const entry = entryFromSurvey(current, now);
  if (!entry) return null;
  const entries = await loadSurveyHistory(userId);
  const ok = await saveSurveyHistory(userId, [...entries, entry]);
  if (!ok) throw new Error("履歴の保存に失敗しました");
  return entry;
}

/**
 * 履歴の1件を削除する（182 B-2・本人の操作のみ）。画像も合わせて削除。
 * 画像のパスが本人の survey フォルダ配下でなければ実体には触れない（他人のものを消さない）。
 */
export async function deleteSurveyHistoryEntry(
  userId: string,
  entryId: string
): Promise<boolean> {
  const entries = await loadSurveyHistory(userId);
  const target = entries.find((e) => e.id === entryId);
  if (!target) return false;
  const path = storagePathFromPublicUrl(target.imageUrl);
  if (path && path.startsWith(`${userId}/survey/`)) {
    try {
      const admin = createSupabaseAdminClient();
      const { error } = await admin.storage.from(STAFF_PHOTOS_BUCKET).remove([path]);
      if (error) throw new Error(error.message);
    } catch (e) {
      // 実体を消せなければ参照も残す（再試行できる）
      throw new Error(
        `画像の削除に失敗しました（再試行してください）: ${e instanceof Error ? e.message : ""}`
      );
    }
  }
  const ok = await saveSurveyHistory(
    userId,
    entries.filter((e) => e.id !== entryId)
  );
  if (!ok) throw new Error("履歴の更新に失敗しました");
  return true;
}
