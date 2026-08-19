"use client";

// スタッフ連絡先の操作ログ（指示書169-3-5）— **管理者のみ**
//
// 【根拠】就業規則 正職員 第74条／準職員 第73条「パソコン通信等の管理」により、
// 医院は情報漏洩の防止および院内のパソコン環境の保全のため、
// 必要に応じてサーバー上のデータ等を調査できる。その範囲の記録である。
//
// 【この画面に作らないもの（159-B-5と同じ線）】
//   ・人別の処理件数の集計 ・ランキング・比較・順位付け
//   ・期間別の実績グラフ   ・「誰が一番多い／少ない」が分かる並び替え
// あとから「使わない」と決めるのではなく、**最初から存在させない**。
// したがってここは **新しい順の時系列一覧だけ** を出す。
//
// 【記録の粒度】
// 住所や電話番号そのものは残していない（「空 → 記載あり」までの粒度）。
// 削除した連絡先の中身がログに残り続けることを避けるため。
//
// 【閲覧のログは取っていない】
// 一覧を開くたびに記録が増えて「誰が何を変更したか」を追えなくなること、
// 指名した人しか開けず、その一覧は上の設定で常に確認できることから、
// 監視色を強めてまで取る実益が薄いと判断した（169-3-5の自己判断事項）。

import { useCallback, useEffect, useState } from "react";
import {
  fetchStaffContactLogs,
  type StaffContactLog,
} from "@/lib/staff-contacts";

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

const ACTION_STYLE: Record<string, string> = {
  登録: "bg-teal-50 text-teal-800 border-teal-200",
  更新: "bg-slate-50 text-slate-700 border-slate-200",
  削除: "bg-red-50 text-red-700 border-red-200",
  設定変更: "bg-amber-50 text-amber-800 border-amber-200",
};

export function StaffContactLogsPanel() {
  const [logs, setLogs] = useState<StaffContactLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (before?: string) => {
    setLoading(true);
    try {
      const r = await fetchStaffContactLogs(before);
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
    void load();
  }, [load]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3">
      <h2 className="text-sm font-medium text-gray-900">🗂 操作ログ</h2>
      <p className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">
        連絡先の登録・更新・削除と、開ける人の設定変更の記録です。
        <strong>この画面は管理者だけが見られます</strong>。
        就業規則の「パソコン通信等の管理」に基づく、
        <strong>情報漏洩の防止と院内環境の保全のための記録</strong>です。
        <br />
        <strong>住所や電話番号そのものは記録していません</strong>
        （どの項目が「空 → 記載あり」に変わったかまで）。
        評価や指導に使う集計・順位付けは<strong>設けていません</strong>。
      </p>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mt-2">
          {error}
        </p>
      )}

      {logs.length === 0 && !loading && !error ? (
        <p className="text-[11px] text-gray-500 mt-3">
          まだ記録はありません。連絡先を操作すると、ここに残ります。
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
                {log.target && (
                  <span className="text-gray-700">対象: {log.target}</span>
                )}
              </div>
              {log.changes.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-gray-600">
                  {log.changes.map((c, i) => (
                    <li key={`${log.id}-${i}`}>
                      {c.field}: {c.before || "—"} →{" "}
                      <strong>{c.after || "—"}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* 続き読みは「古い方へ」だけ。並び替えの選択肢は置かない */}
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
