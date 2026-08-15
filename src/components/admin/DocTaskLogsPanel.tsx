"use client";

// 書類進捗ボードの操作ログ（指示書159-B）— **管理者のみ**
//
// 【根拠】就業規則 正職員 第74条／準職員 第73条「パソコン通信等の管理」により、
// 医院は情報漏洩の防止および院内のパソコン環境の保全のため、
// 必要に応じてサーバー上のデータ等を調査できる。その範囲の記録である。
//
// 【この画面に作らないもの（159-B-5）】
//   ・人別の処理件数の集計
//   ・ランキング・比較・順位付け
//   ・期間別の実績グラフ
//   ・「誰が一番多い／少ない」が分かる並び替え
// 規程が認めているのは**漏洩防止と環境保全を目的とした調査**であって、
// 評価や指導の材料ではない。あとから「使わない」と決めるのではなく、
// **最初から存在させない**（指示書152と同じ線）。
// したがってここは **新しい順の時系列一覧だけ** を出す。並び替えの選択肢も置かない。

import { useCallback, useEffect, useState } from "react";
import { fetchDocTaskLogs, docTypeDef, type DocTaskLog } from "@/lib/doc-tasks";

function formatAt(at: string): string {
  if (!at) return "";
  // 表示は日本時間の「YYYY-MM-DD HH:MM」まで（秒は調査に不要）
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

function docTypeLabel(docType: string): string {
  if (!docType) return "";
  try {
    const def = docTypeDef(docType as Parameters<typeof docTypeDef>[0]);
    return `${def.emoji} ${def.label}`;
  } catch {
    return docType;
  }
}

const ACTION_STYLE: Record<string, string> = {
  登録: "bg-teal-50 text-teal-800 border-teal-200",
  更新: "bg-slate-50 text-slate-700 border-slate-200",
  削除: "bg-red-50 text-red-700 border-red-200",
  設定変更: "bg-amber-50 text-amber-800 border-amber-200",
};

export function DocTaskLogsPanel() {
  const [logs, setLogs] = useState<DocTaskLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    try {
      const r = await fetchDocTaskLogs(before);
      setLogs((prev) => (before ? [...prev, ...r.logs] : r.logs));
      // 返ってきた件数が0なら、それ以上古い記録は無い
      if (r.logs.length === 0) setDone(true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(); // 状態を入れるのは通信の完了後（レンダー中には呼ばれない）
  }, [load]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3">
      <h2 className="text-sm font-medium text-gray-900">🗂 操作ログ</h2>
      <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
        書類進捗ボードの登録・更新・削除と、開ける人の設定変更の記録です。
        <strong>この画面は管理者だけが見られます</strong>
        （スタッフの画面には出ません）。
        就業規則の「パソコン通信等の管理」に基づく、
        <strong>情報漏洩の防止と院内環境の保全のための記録</strong>です。
        <br />
        評価や指導に使う集計・順位付けは<strong>設けていません</strong>。
        新しい順に並べて表示するだけです。
      </p>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mt-2">
          {error}
        </p>
      )}

      {logs.length === 0 && !loading && !error ? (
        <p className="text-[11px] text-gray-500 mt-3">
          まだ記録はありません。ボードで操作すると、ここに残ります。
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {logs.map((log) => (
            <li
              key={log.id}
              className="rounded-lg border border-gray-200 p-2 text-[11px] leading-relaxed"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-gray-500 tabular-nums">
                  {formatAt(log.at)}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded border ${
                    ACTION_STYLE[log.action] ??
                    "bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  {log.action}
                </span>
                <span className="text-gray-800">{log.by}</span>
                {log.chartNo && (
                  <span className="text-gray-700">
                    ID {log.chartNo}
                    {log.docType && <>／{docTypeLabel(log.docType)}</>}
                  </span>
                )}
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

      {/* 続き読みは「古い方へ」だけ。並び替えの選択肢は置かない（159-B-5） */}
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
    </section>
  );
}
