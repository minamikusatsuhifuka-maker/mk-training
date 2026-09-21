"use client";

// 院長の振り返り記録の操作ログ（指示書173-5・159と同じ仕組み）— **管理者のみ**
//
// 新しい順の時系列一覧だけ。集計・ランキング・並び替えは最初から作らない（159-B-5）。
// 本文そのものは記録していない（どの項目が「空 → 記載あり」に変わったかまで）。

import { useCallback, useEffect, useState } from "react";
import {
  fetchRetrospectiveLogs,
  type RetrospectiveLog,
} from "@/lib/director-retrospective";

function formatAt(at: string): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at.slice(0, 16).replace("T", " ");
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

const ACTION_STYLE: Record<string, string> = {
  登録: "bg-teal-50 text-teal-800 border-teal-200",
  更新: "bg-slate-50 text-slate-700 border-slate-200",
  削除: "bg-red-50 text-red-700 border-red-200",
  出力: "bg-amber-50 text-amber-800 border-amber-200",
};

export function DirectorRetrospectiveLogsPanel() {
  const [logs, setLogs] = useState<RetrospectiveLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    try {
      const r = await fetchRetrospectiveLogs(before);
      setLogs((prev) => (before ? [...prev, ...r.logs] : r.logs));
      if (r.logs.length === 0) setDone(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <p className="text-[11px] text-gray-600 leading-relaxed">
        記録の登録・更新・削除と、Markdown出力の記録です。<strong>管理者だけが見られます</strong>。
        本文そのものは記録していません（どの項目が「空 → 記載あり」に変わったかまで）。
        集計・順位付けは設けていません。
      </p>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mt-2">
          {error}
        </p>
      )}

      {logs.length === 0 && !loading && !error ? (
        <p className="text-[11px] text-gray-500 mt-3">まだ記録はありません。</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {logs.map((log) => (
            <li
              key={log.id}
              className="rounded-lg border border-gray-200 p-2 text-[11px] leading-relaxed"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-500 tabular-nums">{formatAt(log.at)}</span>
                <span
                  className={`px-1.5 py-0.5 rounded border ${
                    ACTION_STYLE[log.action] ?? "bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  {log.action}
                </span>
                {log.kind && <span className="text-gray-700">{log.kind}</span>}
                <span className="text-gray-800">{log.by}</span>
                {log.target && <span className="text-gray-700">対象: {log.target}</span>}
              </div>
              {log.changes.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-gray-600">
                  {log.changes.map((c, i) => (
                    <li key={`${log.id}-${i}`}>
                      {c.field}: {c.before || "—"} → <strong>{c.after || "—"}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {logs.length > 0 && !done && (
        <button
          type="button"
          onClick={() => load(logs[logs.length - 1]?.at)}
          disabled={loading}
          className="mt-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-full text-xs hover:bg-gray-50 disabled:opacity-40 min-h-[36px]"
        >
          {loading ? "読み込み中…" : "もっと古い記録を読む"}
        </button>
      )}
    </div>
  );
}
