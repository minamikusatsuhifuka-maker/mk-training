"use client";

// 📣 イベントの参加記録（指示書228 §3）— 院長＋委任の設定で「📣 イベントの出欠・参加記録」を任された幹部
// ・イベントごと：日時・題名・参加した人
// ・人ごと：いつ・どのイベントに参加したか
// ・期間（開催日）で絞り込み・CSVで書き出し
// ・確定のあとに直せるのは院長と任された幹部（この画面の「直す」）。記録を消せるのは院長だけ
// スタッフの画面には出さない。ページの到達可否は proxy.ts（/admin/<項目>）、APIは requireAdminItem が判定する。

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AttendanceEditor } from "@/components/notices/AttendanceEditor";
import {
  attendanceByPerson,
  attendanceCsv,
  filterByPeriod,
  formatHeld,
  type AttendanceRecordView,
} from "@/lib/notices";

type View = "event" | "person";

export default function NoticeAttendancePage() {
  const [records, setRecords] = useState<AttendanceRecordView[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("event");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notice-attendance", { cache: "no-store", credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as { records?: AttendanceRecordView[]; isAdmin?: boolean; error?: string };
      if (!res.ok) throw new Error(j.error || `読み込めませんでした (${res.status})`);
      setRecords(j.records ?? []);
      setIsAdmin(j.isAdmin === true);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => filterByPeriod(records ?? [], from, to), [records, from, to]);
  const people = useMemo(() => attendanceByPerson(rows), [rows]);

  const download = () => {
    const csv = attendanceCsv(rows);
    // Excel で文字化けしないよう先頭に BOM を付ける
    const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `イベントの参加記録${from || to ? `_${from || "最初"}〜${to || "今日"}` : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const removeRecord = async (r: AttendanceRecordView) => {
    if (!window.confirm(`「${r.title}」の参加の記録を消します。元に戻せません。よろしいですか？`)) return;
    const res = await fetch(`/api/admin/notice-attendance?noticeId=${encodeURIComponent(r.noticeId)}`, { method: "DELETE" });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      window.alert(j.error || "消せませんでした");
      return;
    }
    await load();
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">📣 イベントの参加記録</h1>
        <p className="mt-1 text-xs text-gray-600 leading-relaxed">
          イベントのあとに「参加を確定」した記録です。見られるのは院長と、委任の設定で指定した幹部だけ（スタッフの画面には出しません）。
          参加の確定は、イベントの画面（<Link href="/notices" className="underline">📣 お知らせ・イベント</Link>）で、開催日時を過ぎると出ます。
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-700">
          開催日（から）
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm" data-period-from />
        </label>
        <label className="text-xs text-gray-700">
          開催日（まで）
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm" data-period-to />
        </label>
        {(from || to) && (
          <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="min-h-[36px] text-xs text-gray-600 underline">
            期間を外す
          </button>
        )}
        <button
          type="button"
          onClick={download}
          disabled={rows.length === 0}
          className="ml-auto min-h-[40px] rounded-lg border border-teal-600 px-3 text-sm text-teal-800 disabled:opacity-40"
          data-attendance-csv
        >
          ⬇ CSVで書き出す
        </button>
      </div>

      <div className="flex gap-1.5" role="tablist">
        {(
          [
            ["event", "イベントごと"],
            ["person", "人ごと"],
          ] as const
        ).map(([k, t]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
            className={`min-h-[36px] rounded-full border px-4 text-sm ${view === k ? "border-teal-600 bg-teal-600 text-white" : "border-gray-300 text-gray-700"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!records && !error && <p className="text-sm text-gray-500">読み込み中…</p>}
      {records && rows.length === 0 && <p className="text-sm text-gray-500">この期間の記録はありません。</p>}

      {view === "event" && (
        <ul className="space-y-2" data-attendance-by-event>
          {rows.map((r) => (
            <li key={r.noticeId} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-600">{formatHeld(r)}</span>
                <span className="text-sm font-medium text-gray-900">{r.title}</span>
                {r.testSeed && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] text-violet-800">🧪 検証用</span>}
                {!r.noticeExists && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">お知らせは消されています</span>}
                <span className="ml-auto text-xs text-gray-600">{r.participants.length}人</span>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">
                {r.participants.length > 0 ? r.participants.map((p) => p.name).join("、") : "（参加した人なし）"}
              </p>
              {editing === r.noticeId ? (
                <AttendanceEditor
                  noticeId={r.noticeId}
                  onSaved={() => void load()}
                  onClose={() => setEditing(null)}
                />
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setEditing(r.noticeId)} className="min-h-[32px] text-xs text-teal-700 underline">
                    ✏️ 直す
                  </button>
                  {r.noticeExists && (
                    <Link href={`/notices?id=${encodeURIComponent(r.noticeId)}`} className="min-h-[32px] text-xs text-gray-600 underline">
                      イベントを開く
                    </Link>
                  )}
                  {isAdmin && (
                    <button type="button" onClick={() => removeRecord(r)} className="min-h-[32px] text-xs text-red-600 underline">
                      記録を消す
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {view === "person" && (
        <ul className="space-y-2" data-attendance-by-person>
          {people.map((p) => (
            <li key={p.userId} className="rounded-xl border border-gray-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-900">{p.name}</span>
                <span className="text-xs text-gray-600">{p.events.length}回</span>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {p.events.map((e) => (
                  <li key={e.noticeId} className="text-xs text-gray-700">
                    <span className="text-gray-500">{formatHeld(e)}</span>　{e.title}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
