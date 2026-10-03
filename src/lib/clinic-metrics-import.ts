// クリニックの歩み — CSV 一括取り込み（指示書196）の純粋関数
// 形式: `ym,insurance,selfPay`（1行目は見出し・単位は万円の整数）。Excel からの貼り付け（タブ区切り）も受ける。
//
// 方針:
// - 形式エラー（年月の形式・数値でない・同じ年月の重複）はその行に理由を付け、**取り込まない**
// - `ym` をキーにマージ。同じ年月の insurance / selfPay だけを上書きする
// - counseling（カウンセリング数）と initiatives（施策）には**触れない**
// サーバー（/api/admin/clinic-metrics-import）とテストから使う。"use client" のモジュールを import しないこと。

import {
  normalizeClinicMetrics,
  type ClinicMetrics,
  type MonthMetric,
} from "./clinic-metrics-core";

export const METRICS_CSV_HEADER = "ym,insurance,selfPay";
// 想定外に大きな貼り付けを止める（月次なので10年分でも120行）
export const METRICS_CSV_MAX_CHARS = 50_000;
export const METRICS_CSV_MAX_ROWS = 600;

export type ParsedMetricRow = {
  line: number; // 元テキストの行番号（1始まり）
  raw: string;
  ym: string | null; // 正規化済み "YYYY-MM"（読めなければ null）
  insurance: number | null;
  selfPay: number | null;
  error: string | null;
};

export type ParsedMetricsCsv = {
  rows: ParsedMetricRow[];
  fileError: string | null; // 全体のエラー（見出し違い・大きすぎる等）
};

function splitCells(line: string): string[] {
  const sep = line.includes("\t") ? "\t" : ",";
  return line
    .split(sep)
    .map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
}

function parseYm(s: string): string | null {
  const m = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}`;
}

// 万円の整数（0以上）。それ以外は理由を返す
function parseAmount(s: string, label: string): { value: number | null; error: string | null } {
  if (s === "") return { value: null, error: `${label}が空欄です` };
  if (!/^\d+$/.test(s)) {
    return /^-?\d+(\.\d+)?$/.test(s)
      ? { value: null, error: `${label}は0以上の整数（万円）で入力してください（${s}）` }
      : { value: null, error: `${label}が数値ではありません（${s}）` };
  }
  const n = Number(s);
  if (!Number.isSafeInteger(n)) return { value: null, error: `${label}が大きすぎます` };
  return { value: n, error: null };
}

export function parseMetricsCsv(text: string): ParsedMetricsCsv {
  if (typeof text !== "string" || text.trim() === "") {
    return { rows: [], fileError: "CSVが空です" };
  }
  if (text.length > METRICS_CSV_MAX_CHARS) {
    return { rows: [], fileError: "CSVが大きすぎます" };
  }
  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);

  const rows: ParsedMetricRow[] = [];
  let headerSeen = false;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === "") continue;
    const cells = splitCells(raw);

    // 最初の空でない行が見出し（"ym" で始まる）なら列の並びを確かめて読み飛ばす。
    // 見出しなしで数値行から始まる貼り付けも受ける。
    if (!headerSeen) {
      headerSeen = true;
      if (cells[0].toLowerCase() === "ym") {
        const got = cells.map((c) => c.toLowerCase()).join(",");
        if (got !== METRICS_CSV_HEADER.toLowerCase()) {
          return {
            rows: [],
            fileError: `見出しは「${METRICS_CSV_HEADER}」の順にしてください（現在: ${cells.join(",")}）`,
          };
        }
        continue;
      }
    }

    const row: ParsedMetricRow = {
      line: i + 1,
      raw,
      ym: null,
      insurance: null,
      selfPay: null,
      error: null,
    };
    rows.push(row);
    if (rows.length > METRICS_CSV_MAX_ROWS) {
      return { rows: [], fileError: `行が多すぎます（${METRICS_CSV_MAX_ROWS}行まで）` };
    }

    if (cells.length !== 3) {
      row.error = `列の数が${cells.length}です（年月,保険,自費 の3列）`;
      continue;
    }
    row.ym = parseYm(cells[0]);
    if (!row.ym) {
      row.error = `年月の形式が違います（${cells[0] || "空欄"}。例: 2026-08）`;
      continue;
    }
    const ins = parseAmount(cells[1], "保険売上");
    const sp = parseAmount(cells[2], "自費売上");
    row.insurance = ins.value;
    row.selfPay = sp.value;
    row.error = ins.error ?? sp.error;
  }

  // 同じ年月の重複: どちらが正しいか決められないので、該当行をすべてエラーにする
  const linesByYm = new Map<string, number[]>();
  for (const r of rows) {
    if (!r.ym) continue;
    linesByYm.set(r.ym, [...(linesByYm.get(r.ym) ?? []), r.line]);
  }
  for (const r of rows) {
    if (!r.ym) continue;
    const ls = linesByYm.get(r.ym)!;
    if (ls.length > 1 && !r.error) {
      const others = ls.filter((l) => l !== r.line).join("・");
      r.error = `同じ年月（${r.ym}）が${others}行目にもあります`;
    }
  }

  if (rows.length === 0) return { rows, fileError: "データ行がありません" };
  return { rows, fileError: null };
}

export type ImportStatus = "new" | "changed" | "unchanged" | "error";

export type ImportPreviewRow = {
  line: number;
  raw: string;
  ym: string | null;
  status: ImportStatus;
  before: { insurance: number | null; selfPay: number | null } | null;
  after: { insurance: number | null; selfPay: number | null } | null;
  error: string | null;
};

export type ImportPreview = {
  rows: ImportPreviewRow[];
  counts: { new: number; changed: number; unchanged: number; error: number };
};

/** 現在の保存内容と突き合わせて、行ごとに 新規／変更／変更なし／エラー を出す */
export function previewMetricsImport(
  current: ClinicMetrics,
  parsed: ParsedMetricsCsv
): ImportPreview {
  const byYm = new Map(current.months.map((m) => [m.ym, m]));
  const counts = { new: 0, changed: 0, unchanged: 0, error: 0 };
  const rows: ImportPreviewRow[] = parsed.rows.map((r) => {
    if (r.error || !r.ym) {
      counts.error++;
      return { line: r.line, raw: r.raw, ym: r.ym, status: "error", before: null, after: null, error: r.error ?? "読み取れません" };
    }
    const after = { insurance: r.insurance, selfPay: r.selfPay };
    const prev = byYm.get(r.ym);
    if (!prev) {
      counts.new++;
      return { line: r.line, raw: r.raw, ym: r.ym, status: "new", before: null, after, error: null };
    }
    const before = { insurance: prev.insurance, selfPay: prev.selfPay };
    // 旧データ（合算 sales のみ）の月は内訳が入るので「変更」になる
    const same =
      prev.insurance === r.insurance && prev.selfPay === r.selfPay && prev.sales == null;
    if (same) counts.unchanged++;
    else counts.changed++;
    return { line: r.line, raw: r.raw, ym: r.ym, status: same ? "unchanged" : "changed", before, after, error: null };
  });
  return { rows, counts };
}

/**
 * エラーのない行だけを ym キーでマージした新しい ClinicMetrics を返す。
 * - 既存月: insurance / selfPay だけ上書き（counseling はそのまま。旧 sales は内訳が入るので正規化で消える）
 * - 新規月: counseling は null（未入力）
 * - initiatives はそのまま
 */
export function mergeMetricsImport(
  current: ClinicMetrics,
  parsed: ParsedMetricsCsv
): ClinicMetrics {
  const byYm = new Map<string, MonthMetric>(current.months.map((m) => [m.ym, { ...m }]));
  for (const r of parsed.rows) {
    if (r.error || !r.ym) continue;
    const prev = byYm.get(r.ym);
    byYm.set(
      r.ym,
      prev
        ? { ...prev, insurance: r.insurance, selfPay: r.selfPay }
        : { ym: r.ym, insurance: r.insurance, selfPay: r.selfPay, counseling: null }
    );
  }
  return normalizeClinicMetrics({
    months: Array.from(byYm.values()),
    initiatives: current.initiatives,
    // 198: 年度の始まりの設定は取り込みで消さない
    fiscalStartMonth: current.fiscalStartMonth,
    updatedAt: current.updatedAt,
  });
}

/** 取り込みの前後で counseling と initiatives が変わっていないか（変わっていたら保存しない） */
export function untouchedFieldsPreserved(before: ClinicMetrics, after: ClinicMetrics): boolean {
  const afterByYm = new Map(after.months.map((m) => [m.ym, m]));
  for (const m of before.months) {
    const a = afterByYm.get(m.ym);
    if (!a || a.counseling !== m.counseling) return false;
  }
  for (const m of after.months) {
    if (!before.months.some((b) => b.ym === m.ym) && m.counseling !== null) return false;
  }
  return JSON.stringify(before.initiatives) === JSON.stringify(after.initiatives);
}
