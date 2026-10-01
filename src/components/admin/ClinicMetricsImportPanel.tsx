"use client";

// 📈 クリニックの歩み — CSV 一括取り込み（指示書196）。管理者のみ（親で realAdmin のときだけ描画）。
// 貼り付け or ファイル選択 → 「プレビュー」（サーバーの保存内容と比較）→ 「反映する」。
// 差分計算・保存・操作ログはすべて /api/admin/clinic-metrics-import（サーバー）で行う。

import { useEffect, useRef, useState } from "react";
import type { ClinicMetrics } from "@/lib/clinic-metrics";
import { METRICS_CSV_HEADER, type ImportPreview } from "@/lib/clinic-metrics-import";

type ImportLog = {
  id: string;
  at: string;
  by: string;
  added: number;
  changed: number;
  unchanged: number;
  skipped: number;
};

const API = "/api/admin/clinic-metrics-import";

const STATUS_LABEL = {
  new: { text: "新規", cls: "bg-teal-100 text-teal-800" },
  changed: { text: "変更", cls: "bg-amber-100 text-amber-800" },
  unchanged: { text: "変更なし", cls: "bg-gray-100 text-gray-500" },
  error: { text: "エラー", cls: "bg-red-100 text-red-700" },
} as const;

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("ja-JP"));

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ClinicMetricsImportPanel({
  onImported,
}: {
  onImported: (metrics: ClinicMetrics) => void;
}) {
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewedCsv, setPreviewedCsv] = useState("");
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadLogs = () => {
    fetch(API, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { logs: [] }))
      .then((j: { logs?: ImportLog[] }) => setLogs(Array.isArray(j.logs) ? j.logs : []))
      .catch(() => {});
  };
  useEffect(loadLogs, []);

  const post = async (dryRun: boolean) => {
    const res = await fetch(API, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, dryRun }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `エラー（${res.status}）`);
    return j as { preview: ImportPreview; metrics?: ClinicMetrics };
  };

  const handlePreview = async () => {
    if (busy) return;
    setBusy("preview");
    setError("");
    setResult("");
    try {
      const j = await post(true);
      setPreview(j.preview);
      setPreviewedCsv(csv);
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : "プレビューに失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const handleApply = async () => {
    if (busy || !preview) return;
    setBusy("apply");
    setError("");
    try {
      const j = await post(false);
      const c = j.preview.counts;
      setResult(
        `✅ 反映しました：新規 ${c.new}件・変更 ${c.changed}件（変更なし ${c.unchanged}件${
          c.error > 0 ? `・エラーで取り込まなかった行 ${c.error}件` : ""
        }）`
      );
      setPreview(null);
      setCsv("");
      setPreviewedCsv("");
      if (j.metrics) onImported(j.metrics);
      loadLogs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "反映に失敗しました");
    } finally {
      setBusy(null);
    }
  };

  const handleFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    setCsv(text);
    setPreview(null);
    setResult("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const stale = preview !== null && csv !== previewedCsv;
  const applicable = preview ? preview.counts.new + preview.counts.changed : 0;
  const visibleRows = preview
    ? preview.rows.filter((r) => showUnchanged || r.status !== "unchanged")
    : [];

  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 space-y-2">
      <p className="text-xs font-semibold text-gray-700">📥 CSVで一括取り込み</p>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        形式は <code className="bg-white px-1 rounded">{METRICS_CSV_HEADER}</code>
        （1行目は見出し・単位は万円の整数）。同じ年月は保険・自費を上書きし、
        カウンセリング数と施策は変わりません。反映すると画面上の未保存の手入力は読み込み直されます。
      </p>
      <textarea
        value={csv}
        onChange={(e) => {
          setCsv(e.target.value);
          setResult("");
        }}
        rows={6}
        placeholder={`${METRICS_CSV_HEADER}\n2026-07,579,1130\n2026-08,557,708`}
        className="w-full rounded border border-gray-200 bg-white px-2 py-1 font-mono text-xs"
        aria-label="CSVの貼り付け欄"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs px-3 h-8 inline-flex items-center rounded border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">
          📄 CSVファイルを選ぶ
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
        <button
          type="button"
          onClick={handlePreview}
          disabled={!csv.trim() || busy !== null}
          className="text-xs px-3 h-8 rounded bg-white border border-teal-600 text-teal-700 hover:bg-teal-50 disabled:opacity-50"
        >
          {busy === "preview" ? "確認中..." : "🔍 プレビュー"}
        </button>
      </div>

      {error && <p className="text-xs text-red-600">⚠ {error}</p>}
      {result && <p className="text-xs text-teal-700 font-medium">{result}</p>}

      {preview && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-gray-700">プレビュー：</span>
            <span className="text-teal-700">新規 {preview.counts.new}件</span>
            <span className="text-amber-700">変更 {preview.counts.changed}件</span>
            <span className="text-gray-500">変更なし {preview.counts.unchanged}件</span>
            {preview.counts.error > 0 && (
              <span className="text-red-600">エラー {preview.counts.error}件（取り込みません）</span>
            )}
            {preview.counts.unchanged > 0 && (
              <label className="ml-auto inline-flex items-center gap-1 text-gray-500">
                <input
                  type="checkbox"
                  checked={showUnchanged}
                  onChange={(e) => setShowUnchanged(e.target.checked)}
                />
                変更なしも表示
              </label>
            )}
          </div>
          <div className="max-h-72 overflow-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-xs tabular-nums">
              <thead className="sticky top-0 bg-gray-50 text-[10px] text-gray-500">
                <tr>
                  <th className="px-2 py-1 text-left">行</th>
                  <th className="px-2 py-1 text-left">年月</th>
                  <th className="px-2 py-1 text-left">判定</th>
                  <th className="px-2 py-1 text-right">保険(万円)</th>
                  <th className="px-2 py-1 text-right">自費(万円)</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-2 text-center text-gray-400">
                      新規・変更・エラーの行はありません
                    </td>
                  </tr>
                ) : (
                  visibleRows.map((r) => {
                    const s = STATUS_LABEL[r.status];
                    const cell = (k: "insurance" | "selfPay") => {
                      const a = r.after?.[k] ?? null;
                      const b = r.before?.[k] ?? null;
                      if (r.status === "changed" && a !== b) {
                        return (
                          <>
                            <span className="text-gray-400 line-through">{fmt(b)}</span>
                            {" → "}
                            <span className="font-semibold">{fmt(a)}</span>
                          </>
                        );
                      }
                      return fmt(a);
                    };
                    return (
                      <tr
                        key={r.line}
                        data-import-status={r.status}
                        className="border-t border-gray-100"
                      >
                        <td className="px-2 py-1 text-gray-400">{r.line}</td>
                        <td className="px-2 py-1">{r.ym ?? "—"}</td>
                        <td className="px-2 py-1">
                          <span className={`rounded px-1.5 py-0.5 ${s.cls}`}>{s.text}</span>
                        </td>
                        {r.status === "error" ? (
                          <td colSpan={2} className="px-2 py-1 text-red-600">
                            {r.error}
                            <span className="ml-2 font-mono text-gray-400">{r.raw}</span>
                          </td>
                        ) : (
                          <>
                            <td className="px-2 py-1 text-right">{cell("insurance")}</td>
                            <td className="px-2 py-1 text-right">{cell("selfPay")}</td>
                          </>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {stale && (
            <p className="text-xs text-amber-700">
              ⚠ プレビュー後にCSVが変わりました。もう一度プレビューしてください。
            </p>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleApply}
              disabled={busy !== null || stale || applicable === 0}
              className="text-sm px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {busy === "apply"
                ? "反映中..."
                : applicable === 0
                  ? "反映する変更はありません"
                  : `反映する（新規${preview.counts.new}件・変更${preview.counts.changed}件）`}
            </button>
          </div>
        </div>
      )}

      {logs.length > 0 && (
        <details className="text-[11px] text-gray-500">
          <summary className="cursor-pointer">取り込みの記録（最新{logs.length}件）</summary>
          <ul className="mt-1 space-y-0.5">
            {logs.map((l) => (
              <li key={l.id}>
                {formatAt(l.at)}　{l.by}　新規{l.added}・変更{l.changed}・変更なし{l.unchanged}
                {l.skipped > 0 ? `・取り込まず${l.skipped}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
