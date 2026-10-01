// クリニックの歩み — CSV 一括取り込みのサーバー専用処理（指示書196）
// - 取り込みは必ずここを通す（管理者API /api/admin/clinic-metrics-import からのみ）。
// - プレビューと反映の差分計算は、クライアントの手元ではなく**サーバーの保存内容**に対して行う
//   （管理画面で未保存の手入力があっても、それと混ざった比較にならない）。
// - 操作ログは content_store `clinic_metrics_import_log`（サーバー専用キー）に「誰が・いつ・何件」だけ残す。
//   数値の中身は残さない（196-A-4）。
//
// クライアントから import しないこと。

import { serverGetContentRow, serverPutContentRow } from "./content-store-server";
import {
  PORTAL_METRICS_KEY,
  normalizeClinicMetrics,
  type ClinicMetrics,
} from "./clinic-metrics-core";
import {
  mergeMetricsImport,
  previewMetricsImport,
  untouchedFieldsPreserved,
  type ImportPreview,
  type ParsedMetricsCsv,
} from "./clinic-metrics-import";

export const CLINIC_METRICS_IMPORT_LOG_KEY = "clinic_metrics_import_log";
const LOG_MAX = 100;

export type ClinicMetricsImportLog = {
  id: string;
  at: string;
  by: string;
  added: number;
  changed: number;
  unchanged: number;
  skipped: number; // エラーで取り込まなかった行
};

export class ClinicMetricsImportError extends Error {}

export async function loadClinicMetricsServer(): Promise<ClinicMetrics> {
  const row = await serverGetContentRow(PORTAL_METRICS_KEY);
  return normalizeClinicMetrics(row?.data ?? null);
}

function normalizeLog(v: unknown): ClinicMetricsImportLog | null {
  const o = (v ?? {}) as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  if (typeof o.id !== "string" || typeof o.at !== "string") return null;
  return {
    id: o.id,
    at: o.at,
    by: typeof o.by === "string" ? o.by : "",
    added: n(o.added),
    changed: n(o.changed),
    unchanged: n(o.unchanged),
    skipped: n(o.skipped),
  };
}

export async function fetchClinicMetricsImportLogs(): Promise<ClinicMetricsImportLog[]> {
  const row = await serverGetContentRow(CLINIC_METRICS_IMPORT_LOG_KEY);
  const g = (row?.data ?? null) as { entries?: unknown[] } | null;
  const entries = Array.isArray(g?.entries) ? g.entries : [];
  return entries
    .map(normalizeLog)
    .filter((l): l is ClinicMetricsImportLog => l !== null)
    .slice(0, LOG_MAX);
}

export async function previewClinicMetricsImport(
  parsed: ParsedMetricsCsv
): Promise<ImportPreview> {
  return previewMetricsImport(await loadClinicMetricsServer(), parsed);
}

/**
 * エラーのない行だけをマージして保存し、操作ログを残す。
 * - 件数は保存直前のサーバー内容に対して数え直す（プレビュー後に他で保存されていても正しい件数になる）
 * - counseling / initiatives が1つでも変わる結果なら保存しない（歯止め）
 * - 保存に失敗したらログも残さない（順序: データ → ログ）
 */
export async function importClinicMetricsWithLog(input: {
  parsed: ParsedMetricsCsv;
  actor: string;
}): Promise<{ preview: ImportPreview; metrics: ClinicMetrics }> {
  const before = await loadClinicMetricsServer();
  const preview = previewMetricsImport(before, input.parsed);
  const { counts } = preview;
  if (counts.new + counts.changed + counts.unchanged === 0) {
    throw new ClinicMetricsImportError("取り込める行がありません（すべてエラーです）");
  }

  const merged = mergeMetricsImport(before, input.parsed);
  if (!untouchedFieldsPreserved(before, merged)) {
    throw new ClinicMetricsImportError(
      "カウンセリング数・施策が変わる結果になったため保存を止めました"
    );
  }

  const now = new Date().toISOString();
  const payload: ClinicMetrics = { ...merged, updatedAt: now };
  // 変更なしだけの取り込みでもデータは書き換えない（ログだけ残す）
  if (counts.new + counts.changed > 0) {
    const ok = await serverPutContentRow(PORTAL_METRICS_KEY, "portal", payload, input.actor);
    if (!ok) throw new ClinicMetricsImportError("保存に失敗しました");
  }

  const existing = await fetchClinicMetricsImportLogs();
  const entry: ClinicMetricsImportLog = {
    id: now,
    at: now,
    by: input.actor,
    added: counts.new,
    changed: counts.changed,
    unchanged: counts.unchanged,
    skipped: counts.error,
  };
  await serverPutContentRow(
    CLINIC_METRICS_IMPORT_LOG_KEY,
    "portal",
    { entries: [entry, ...existing].slice(0, LOG_MAX) },
    input.actor
  );

  return {
    preview,
    metrics: counts.new + counts.changed > 0 ? payload : before,
  };
}
