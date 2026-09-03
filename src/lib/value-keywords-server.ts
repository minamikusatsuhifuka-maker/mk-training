// 価値観キーワードの一覧のサーバー専用処理（指示書172）
// - 一覧の保存は必ずここを通す（管理者API /api/admin/value-keywords からのみ）。
//   /api/content-store からは `value_keywords_config` に書けない（content-store-policy.ts）。
//   → 「誰がいつ何を変えたか」の記録（172-4）が必ず残る。
// - 操作ログは content_store `value_keywords_log`（サーバー専用キー・159と同じく時系列のみ・集計なし）。
// - 「その語を選択している人数」は staff_profile:<userId> を数えて出す（削除前の注意表示。172-3-1）。
//
// クライアントから import しないこと。

import {
  serverGetContentRow,
  serverGetContentRowsByPrefix,
  serverPutContentRow,
} from "./content-store-server";
import {
  VALUE_KEYWORDS_CONFIG_KEY,
  VALUE_KEYWORDS_LOG_KEY,
  VALUE_KEYWORDS_LOG_MAX,
  normalizeValueKeywordLog,
  normalizeValueKeywordsConfig,
  type ValueKeywordDef,
  type ValueKeywordLog,
  type ValueKeywordsConfig,
} from "./value-keywords";

export async function loadValueKeywordsConfigServer(): Promise<ValueKeywordsConfig> {
  const row = await serverGetContentRow(VALUE_KEYWORDS_CONFIG_KEY);
  return normalizeValueKeywordsConfig(row?.data ?? null);
}

/** 語の識別子 → その語を選択している人数（保存済みプロフィール全件を数える） */
export async function loadValueKeywordUsage(): Promise<Record<string, number>> {
  const rows = await serverGetContentRowsByPrefix("staff_profile:");
  const usage: Record<string, number> = {};
  for (const row of rows) {
    const p = row.data as { valueKeywords?: unknown } | null;
    const ids = Array.isArray(p?.valueKeywords) ? p.valueKeywords : [];
    // 1人が同じ語を二重に持っていても1と数える
    for (const id of new Set(ids.filter((v): v is string => typeof v === "string"))) {
      usage[id] = (usage[id] ?? 0) + 1;
    }
  }
  return usage;
}

export async function fetchValueKeywordLogsServer(): Promise<ValueKeywordLog[]> {
  const row = await serverGetContentRow(VALUE_KEYWORDS_LOG_KEY);
  const g = (row?.data ?? null) as { entries?: unknown[] } | null;
  const entries = Array.isArray(g?.entries) ? g.entries : [];
  return entries
    .map(normalizeValueKeywordLog)
    .filter((l): l is ValueKeywordLog => l !== null)
    .slice(0, VALUE_KEYWORDS_LOG_MAX);
}

type NewLog = Omit<ValueKeywordLog, "id" | "at" | "by">;

/** 変更前後の一覧から、記録する操作を機械的に導く（人が書いた説明ではなく差分そのもの） */
export function diffValueKeywordsConfig(
  before: ValueKeywordsConfig,
  after: ValueKeywordsConfig,
  usage: Record<string, number>,
  resetToDefault: boolean
): NewLog[] {
  const logs: NewLog[] = [];
  if (resetToDefault) {
    logs.push({
      action: "既定に戻す",
      wordId: "",
      before: `${before.words.length}語`,
      after: `${after.words.length}語`,
      affected: null,
    });
  }
  const beforeMap = new Map(before.words.map((w) => [w.id, w]));
  const afterMap = new Map(after.words.map((w) => [w.id, w]));
  const beforeRetired = new Map(before.retired.map((w) => [w.id, w]));

  for (const w of after.words) {
    const prev = beforeMap.get(w.id);
    if (!prev) {
      logs.push({
        action: beforeRetired.has(w.id) ? "復元" : "追加",
        wordId: w.id,
        before: beforeRetired.get(w.id)?.label ?? "",
        after: w.label,
        affected: usage[w.id] ?? 0,
      });
    } else if (prev.label !== w.label) {
      logs.push({
        action: "編集",
        wordId: w.id,
        before: prev.label,
        after: w.label,
        affected: usage[w.id] ?? 0,
      });
    }
  }
  for (const w of before.words) {
    if (!afterMap.has(w.id)) {
      logs.push({
        action: "削除",
        wordId: w.id,
        before: w.label,
        after: "",
        affected: usage[w.id] ?? 0,
      });
    }
  }
  // 並び替え: 両方に存在する語の相対順が変わったときだけ1件
  const common = after.words.map((w) => w.id).filter((id) => beforeMap.has(id));
  const beforeOrder = before.words.map((w) => w.id).filter((id) => afterMap.has(id));
  if (common.length > 0 && common.some((id, i) => id !== beforeOrder[i])) {
    logs.push({
      action: "並び替え",
      wordId: "",
      before: "",
      after: `${common.length}語の順序を変更`,
      affected: null,
    });
  }
  if (before.min !== after.min || before.max !== after.max) {
    logs.push({
      action: "個数変更",
      wordId: "",
      before: `${before.min}〜${before.max}個`,
      after: `${after.min}〜${after.max}個`,
      affected: null,
    });
  }
  return logs;
}

export class ValueKeywordsSaveError extends Error {}

/**
 * 一覧を保存し、操作ログを残す。
 * - retired はクライアントから受け取らず、ここで導く（消えた語は退避・戻った語は退避から外す）
 * - 保存に失敗したらログも残さない（順序: 設定 → ログ）
 */
export async function saveValueKeywordsConfigWithLog(input: {
  words: ValueKeywordDef[];
  min: number;
  max: number;
  actor: string;
  resetToDefault?: boolean;
}): Promise<{ config: ValueKeywordsConfig; usage: Record<string, number> }> {
  const before = await loadValueKeywordsConfigServer();
  const usage = await loadValueKeywordUsage();
  const now = new Date().toISOString();

  const activeIds = new Set(input.words.map((w) => w.id));
  const retired = [
    ...before.retired.filter((w) => !activeIds.has(w.id)),
    ...before.words
      .filter((w) => !activeIds.has(w.id))
      .map((w) => ({ id: w.id, label: w.label, retiredAt: now })),
  ];
  const candidate = normalizeValueKeywordsConfig({
    words: input.words,
    retired,
    min: input.min,
    max: input.max,
    updatedAt: now,
  });
  // normalize が既定に倒した＝語が0件など。保存させない（「全部消す」は既定に戻す操作で行う）
  if (candidate.words.length !== input.words.length) {
    throw new ValueKeywordsSaveError("語の一覧が不正です（0件や重複があります）");
  }

  const logs = diffValueKeywordsConfig(
    before,
    candidate,
    usage,
    input.resetToDefault === true
  );

  const ok = await serverPutContentRow(
    VALUE_KEYWORDS_CONFIG_KEY,
    "portal",
    candidate,
    input.actor
  );
  if (!ok) throw new ValueKeywordsSaveError("保存に失敗しました");

  if (logs.length > 0) {
    const existing = await fetchValueKeywordLogsServer();
    const stamped: ValueKeywordLog[] = logs.map((l, i) => ({
      ...l,
      id: `${now}-${i}`,
      at: now,
      by: input.actor,
    }));
    await serverPutContentRow(
      VALUE_KEYWORDS_LOG_KEY,
      "portal",
      { entries: [...stamped, ...existing].slice(0, VALUE_KEYWORDS_LOG_MAX) },
      input.actor
    );
  }

  return { config: candidate, usage };
}
