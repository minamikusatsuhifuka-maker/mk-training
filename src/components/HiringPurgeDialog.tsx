"use client";
// 経歴・入職時の想いの一括削除（指示書189 A）— 院長のみ。確認画面 → 削除用パスワード入力 → 実行 → 件数表示
//   ・削除される内容の件数（学歴◯件・職歴◯件…）を出す
//   ・追加で選べるもの（採用資料の原本／スカウターの転記とポイント整理）は既定OFF
//   ・連絡先・家族構成は対象にしない
//   ・パスワードの照合はサーバー（/api/admin/hiring/purge）。画面では照合しない。未設定なら設定画面へ案内

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PurgeCounts } from "@/lib/delete-password";

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
  return j;
}

type Deleted = { profile: PurgeCounts["profile"]; profileTotal: number; docs: number; scouter: number };

export function HiringPurgeDialog({ userId, staffName, onClose, onDeleted }: { userId: string; staffName: string; onClose: () => void; onDeleted: (d: Deleted) => Promise<void> }) {
  const [info, setInfo] = useState<{ counts: PurgeCounts; password: { configured: boolean; lockedUntil: string } } | null>(null);
  const [includeDocs, setIncludeDocs] = useState(false);
  const [includeScouter, setIncludeScouter] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Deleted | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await api<{ counts: PurgeCounts; password: { configured: boolean; lockedUntil: string } }>(`/api/admin/hiring/purge?user=${encodeURIComponent(userId)}`);
        if (alive) setInfo(j);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const run = async () => {
    setError("");
    if (!password) return setError("削除用パスワードを入力してください");
    setBusy(true);
    try {
      const j = await api<{ deleted: Deleted }>("/api/admin/hiring/purge", { method: "POST", body: JSON.stringify({ userId, password, includeDocs, includeScouter }) });
      setPassword("");
      setDone(j.deleted);
      await onDeleted(j.deleted);
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const total = info ? info.counts.profileTotal + (includeDocs ? info.counts.docs : 0) + (includeScouter ? info.counts.scouter : 0) : 0;

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="経歴・入職時の想いの一括削除" data-hiring-purge>
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl p-3 space-y-2 max-h-[90vh] overflow-auto">
        <h3 className="text-sm font-medium text-gray-900">🗑 まとめて削除 — {staffName} さんの経歴・入職時の想い</h3>
        <p className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-md p-1.5" data-purge-warning>
          ⚠ 削除すると元に戻せません。
        </p>
        {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2" data-purge-error>{error}</p>}
        {done ? (
          <div className="space-y-2" data-purge-done>
            <p className="text-[12px] text-teal-900">✅ 削除しました（合計 {done.profileTotal + done.docs + done.scouter}件）</p>
            <ul className="text-[11px] text-gray-800 list-disc pl-4">
              {done.profile.map((p) => (
                <li key={p.key}>
                  {p.group}: {p.label} {p.count}件
                </li>
              ))}
              {includeDocs && <li>採用資料の原本 {done.docs}件</li>}
              {includeScouter && <li>スカウターの転記とポイント整理 {done.scouter}件</li>}
            </ul>
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm min-h-[44px]">
              閉じる
            </button>
          </div>
        ) : !info ? (
          <p className="text-[11px] text-gray-500">{error ? "" : "件数を確認中…"}</p>
        ) : (
          <>
            <div className="rounded-md border border-gray-200 p-2" data-purge-counts>
              <p className="text-[11px] font-medium text-gray-800">削除される内容（経歴・入職時の想いの全項目）</p>
              <ul className="text-[11px] text-gray-800 grid grid-cols-2 gap-x-3">
                {info.counts.profile.map((p) => (
                  <li key={p.key}>
                    {p.label} <strong>{p.count}</strong>件
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-gray-500 mt-1">件数は空でない行の数です。連絡先・家族構成はこの操作の対象にしません（スタッフ連絡先の画面で個別に直します）。</p>
            </div>
            <div className="rounded-md border border-gray-200 p-2 space-y-1" data-purge-options>
              <p className="text-[11px] font-medium text-gray-800">あわせて削除するもの（選んだ場合だけ）</p>
              <label className="flex items-center gap-2 text-[11px] text-gray-800">
                <input type="checkbox" checked={includeDocs} onChange={(e) => setIncludeDocs(e.target.checked)} aria-label="採用資料の原本も削除" />
                採用資料の原本（履歴書・適性検査など）{info.counts.docs}件
              </label>
              <label className="flex items-center gap-2 text-[11px] text-gray-800">
                <input type="checkbox" checked={includeScouter} onChange={(e) => setIncludeScouter(e.target.checked)} aria-label="スカウターの転記とポイント整理も削除" />
                スカウターの転記とポイント整理 {info.counts.scouter}件
              </label>
            </div>
            {!info.password.configured ? (
              <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-1.5" data-purge-unset>
                削除用パスワードが未設定のため実行できません。
                <Link href="/admin/delete-password" className="ml-1 underline underline-offset-2 text-teal-800">
                  🔑 削除用パスワードの設定へ
                </Link>
              </p>
            ) : (
              <label className="block text-[12px] text-gray-800">
                削除用パスワード
                <input type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white" aria-label="削除用パスワード" />
              </label>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => void run()} disabled={busy || !info.password.configured || !password || total === 0} className="px-4 py-2 bg-red-600 text-white rounded-full text-sm hover:bg-red-700 disabled:opacity-40 min-h-[44px]" data-purge-run>
                🗑 {total}件を削除する
              </button>
              <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm min-h-[44px]">
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
