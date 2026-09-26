// 5つの基本的欲求サーベイの履歴（指示書182 B）— 型・正規化の純関数
//
// 【保存の考え方】
//   ・プロフィールの needsSurvey は「現在の結果」。新しい結果を保存するとき、前の結果を
//     履歴として残す（上書きしない）。現在保存されている1件は履歴の最初の1件として扱う
//   ・過去の結果画像も履歴に紐づけて残す（上書き・削除しない。削除は本人の操作だけ）
//   ・保存先は content_store のサーバー専用キー `survey_history:<userId>`（/api/content-store から
//     読み書きできない・172の value_keywords_log と同じ扱い）。読み書きは lib/survey-history-server.ts だけ
//   ・公開範囲は本人の「現在の公開設定」を履歴のすべてに適用する（B-3）。判定は survey-visibility.ts

import { normalizeNeedsSurvey, type NeedsSurvey } from "./needs-survey";

export const SURVEY_HISTORY_MAX = 50;

export function surveyHistoryKey(userId: string): string {
  return `survey_history:${userId}`;
}

export type SurveyHistoryEntry = {
  id: string;
  /** その結果の回答日時（当時の needsSurvey.updatedAt） */
  recordedAt: string;
  values: NonNullable<NeedsSurvey["values"]>;
  details: NonNullable<NeedsSurvey["details"]>;
  /** 結果画像（公開URLの文字列。返すときに署名URLへ差し替える・163） */
  imageUrl: string;
  aiParsed: boolean;
  /** 履歴に移した日時 */
  archivedAt: string;
};

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function normalizeSurveyHistoryEntry(raw: unknown): SurveyHistoryEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const id = text(g.id, 64).trim();
  if (!id) return null;
  const n = normalizeNeedsSurvey(g);
  const imageUrl = text(g.imageUrl, 1000);
  // 中身が何も無い行は残さない
  if (!imageUrl && Object.keys(n.values).length === 0 && Object.keys(n.details).length === 0) return null;
  return {
    id,
    recordedAt: text(g.recordedAt, 40),
    values: n.values,
    details: n.details,
    imageUrl,
    aiParsed: n.aiParsed,
    archivedAt: text(g.archivedAt, 40),
  };
}

/** 保存データ → 履歴（古い順・上限まで） */
export function normalizeSurveyHistory(raw: unknown): SurveyHistoryEntry[] {
  const entries = (raw as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(entries)) return [];
  const out = entries
    .map(normalizeSurveyHistoryEntry)
    .filter((e): e is SurveyHistoryEntry => e !== null);
  const seen = new Set<string>();
  return out
    .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .slice(-SURVEY_HISTORY_MAX);
}

/** 「現在の結果」に履歴に残す中身があるか */
export function hasArchivableContent(survey: NeedsSurvey | undefined | null): boolean {
  if (!survey) return false;
  return (
    !!survey.imageUrl ||
    Object.keys(survey.values ?? {}).length > 0 ||
    Object.keys(survey.details ?? {}).length > 0
  );
}

/** 現在の結果 → 履歴の1件（中身が無ければ null） */
export function entryFromSurvey(
  survey: NeedsSurvey | undefined | null,
  now: string
): SurveyHistoryEntry | null {
  if (!hasArchivableContent(survey) || !survey) return null;
  const n = normalizeNeedsSurvey(survey);
  return {
    id: `sv-${Date.parse(now) || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recordedAt: survey.updatedAt || now,
    values: n.values,
    details: n.details,
    imageUrl: survey.imageUrl ?? "",
    aiParsed: n.aiParsed,
    archivedAt: now,
  };
}

/** 履歴の1件をサーベイの形に戻す（公開判定・カルテ表示で needsSurvey と同じ関数を通すため） */
export function surveyFromEntry(
  entry: SurveyHistoryEntry,
  visibility: NeedsSurvey["visibility"]
): NeedsSurvey {
  return {
    values: entry.values,
    details: entry.details,
    imageUrl: entry.imageUrl || undefined,
    aiParsed: entry.aiParsed,
    visibility,
    updatedAt: entry.recordedAt,
  };
}

// ─── 文言（182 B-4・一言一句そのまま）───

export const SURVEY_HISTORY_NOTE =
  "新しい結果を保存すると、前回までの結果は履歴として残ります。履歴はご自身で削除できます。公開設定は過去の結果にも同じように適用されます。";

// ─── 文言（182 A-5・一言一句そのまま）───

export const SURVEY_OPTIONS_NOTICE =
  "公開設定の選択肢が増えました。これまでの「公開」は「レーダーと画像を公開」になっています。詳細15項目も見せてよい場合は「詳細も公開」を選んでください。";
