"use client";
// マイプロフィール「院内端末用の番号」（指示書192 B・192-補）
//   番号ログインがON（または検証用アカウント）で、管理者でないときだけ表示（/api/auth/terminal の canSetPin）。
//   4〜6桁。設定・変更・解除には本人のログインパスワードの再入力。番号は scrypt で保存され、誰にも表示されない。

import { useCallback, useEffect, useState } from "react";
import { PIN_MAX, PIN_MIN, validatePin } from "@/lib/terminal-auth";

type Status = { canSetPin: boolean; pinSet: boolean; pinUpdatedAt: string; pinLoginEnabled: boolean; isAdmin: boolean };

const input = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

export function TerminalPinSection() {
  const [st, setSt] = useState<Status | null>(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/terminal", { cache: "no-store", credentials: "same-origin" });
      if (!res.ok) return;
      setSt((await res.json()) as Status);
    } catch {
      /* 表示しない */
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!st || !st.canSetPin) return null;

  const call = async (method: "PUT" | "DELETE", body: Record<string, unknown>) => {
    const res = await fetch("/api/auth/terminal", { method, cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
  };

  const save = async () => {
    setError("");
    setMsg("");
    const invalid = validatePin(pin);
    if (invalid) return setError(invalid);
    if (pin !== pin2) return setError("確認用の番号が一致しません");
    if (!password) return setError("本人確認のため、ログインパスワードを入力してください");
    setBusy(true);
    try {
      await call("PUT", { pin, loginPassword: password });
      setPin("");
      setPin2("");
      setPassword("");
      setMsg(st.pinSet ? "🔢 番号を変更しました" : "🔢 番号を設定しました。院内端末のログイン画面でメールアドレスと番号を入力してください");
      await load();
    } catch (e) {
      setPin("");
      setPin2("");
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError("");
    setMsg("");
    if (!password) return setError("解除にもログインパスワードの入力が必要です");
    if (!confirm("院内端末用の番号を解除します。以後はパスワードでログインします。よろしいですか？")) return;
    setBusy(true);
    try {
      await call("DELETE", { loginPassword: password });
      setPassword("");
      setMsg("番号を解除しました");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "解除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3" data-terminal-pin-section>
      <h2 className="text-sm font-semibold">🖥 院内端末用の番号</h2>
      <p className="text-xs text-muted-foreground leading-relaxed">
        院長が登録した院内端末でだけ、メールアドレスとこの番号でログインできます（院外や個人のスマートフォンはこれまでどおりパスワード）。
        {PIN_MIN}〜{PIN_MAX}桁の数字。同じ数字の繰り返し・連番・0000・1234・生年月日から作った番号は使えません。番号は暗号化（ハッシュ）して保存し、誰にも表示されません。
      </p>
      <p className="text-xs" data-terminal-pin-status data-set={st.pinSet ? "1" : "0"}>
        現在: {st.pinSet ? `設定済み（最終更新 ${st.pinUpdatedAt ? st.pinUpdatedAt.replace("T", " ").slice(0, 16) : "—"}）` : "未設定（院内端末でもパスワードでログインします）"}
      </p>
      {error && <p className="text-xs text-red-600" data-terminal-pin-error>{error}</p>}
      {msg && <p className="text-xs text-emerald-700">{msg}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-sm font-medium">新しい番号（{PIN_MIN}〜{PIN_MAX}桁）</span>
          <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={PIN_MAX} autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_MAX))} style={{ WebkitTextSecurity: "disc" } as React.CSSProperties} className={input} aria-label="新しい番号" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-sm font-medium">新しい番号（確認）</span>
          <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={PIN_MAX} autoComplete="off" data-lpignore="true" data-1p-ignore="true" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, "").slice(0, PIN_MAX))} style={{ WebkitTextSecurity: "disc" } as React.CSSProperties} className={input} aria-label="新しい番号（確認）" />
        </label>
      </div>
      <label className="space-y-1 text-sm block">
        <span className="text-sm font-medium">ログインパスワード（本人確認）</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} aria-label="ログインパスワード（本人確認）" />
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        {st.pinSet && (
          <button type="button" onClick={() => void remove()} disabled={busy} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm min-h-[40px] disabled:opacity-50" data-terminal-pin-remove>
            番号を解除
          </button>
        )}
        <button type="button" onClick={() => void save()} disabled={busy || !pin || !pin2 || !password} className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 min-h-[40px] disabled:opacity-50" data-terminal-pin-save>
          {busy ? "保存中..." : st.pinSet ? "番号を変更" : "番号を設定"}
        </button>
      </div>
    </div>
  );
}
