"use client";
// 削除用パスワードの設定（指示書189 B）— 院長のみ
//   ・設定・変更・再設定には院長のログインパスワードの再入力が要る（本人確認はサーバー）
//   ・8文字以上。画面にパスワードを表示しない。元のパスワードは表示しない（忘れたら設定し直す）
//   ・状態は「設定済みか／ロック中か」だけ受け取る（ハッシュは返ってこない）

import { useCallback, useEffect, useState } from "react";
import { DELETE_PASSWORD_MIN, validateNewDeletePassword } from "@/lib/delete-password";

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
  return j;
}

const inputClass = "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white";

export function DeletePasswordPanel() {
  const [status, setStatus] = useState<{ configured: boolean; updatedAt: string; lockedUntil: string } | null>(null);
  const [loginPassword, setLoginPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      setStatus(await api("/api/admin/hiring/delete-password"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    setError("");
    setMsg("");
    const invalid = validateNewDeletePassword(newPassword);
    if (invalid) return setError(invalid);
    if (newPassword !== confirm) return setError("確認用の削除用パスワードが一致しません");
    if (!loginPassword) return setError("本人確認のため、院長のログインパスワードを入力してください");
    setBusy(true);
    try {
      await api("/api/admin/hiring/delete-password", { method: "PUT", body: JSON.stringify({ loginPassword, newPassword }) });
      setLoginPassword("");
      setNewPassword("");
      setConfirm("");
      setMsg(status?.configured ? "🔑 削除用パスワードを変更しました" : "🔑 削除用パスワードを設定しました");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-xl space-y-3" data-delete-password-panel>
      <h1 className="text-lg font-bold text-gray-900">🗑 削除用パスワードの設定（院長のみ）</h1>
      <p className="text-[11px] text-gray-600 leading-relaxed">
        成長記録の「📜 経歴・入職時の想い」を<strong>まとめて削除</strong>するときに入力するパスワードです。設定・変更には院長のログインパスワードの再入力が要ります。
        パスワードはハッシュ化して保存し、画面に表示したりログに残したりしません。忘れた場合は、ログインパスワードを再入力して新しく設定し直してください（元のパスワードは表示できません）。
      </p>
      {status && (
        <p className="text-[11px] rounded-lg border p-2 bg-gray-50 border-gray-200 text-gray-800" data-delete-password-status data-configured={status.configured ? "1" : "0"}>
          現在: {status.configured ? `設定済み（最終更新 ${status.updatedAt ? status.updatedAt.replace("T", " ").slice(0, 16) : "—"}）` : "未設定（一括削除は実行できません）"}
          {status.lockedUntil && <span className="block text-amber-900">⚠ 入力を5回続けて間違えたため、{status.lockedUntil.replace("T", " ").slice(0, 16)}（UTC）までロック中です</span>}
        </p>
      )}
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <label className="block text-[12px] text-gray-800">
          院長のログインパスワード（本人確認）
          <input type="password" autoComplete="current-password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} className={inputClass} aria-label="院長のログインパスワード" />
        </label>
        <label className="block text-[12px] text-gray-800">
          新しい削除用パスワード（{DELETE_PASSWORD_MIN}文字以上）
          <input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputClass} aria-label="新しい削除用パスワード" />
        </label>
        <label className="block text-[12px] text-gray-800">
          新しい削除用パスワード（確認）
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} aria-label="新しい削除用パスワード（確認）" />
        </label>
        <button type="button" onClick={() => void submit()} disabled={busy} className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]" data-delete-password-save>
          {status?.configured ? "🔑 削除用パスワードを変更" : "🔑 削除用パスワードを設定"}
        </button>
      </div>
    </div>
  );
}
