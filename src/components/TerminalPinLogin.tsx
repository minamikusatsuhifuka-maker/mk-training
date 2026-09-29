"use client";
// 院内端末ログイン（番号）（指示書192 C-1）— ログイン画面の部品
//   端末の鍵がある登録済み端末で、かつ管理画面のスイッチがON（192-補）のときだけ表示（/api/auth/pin-login GET が available を返す）。
//   メール欄・番号欄ともブラウザに保存・自動入力させない（autocomplete=off・type=text＋数字入力＋文字を伏せる CSS＝パスワード管理に拾わせない）。
//   照合はサーバーだけ。番号はこの画面に残さない（送信後に空にする）。

import { useEffect, useState } from "react";
import { PIN_MAX, PIN_MIN, PIN_UNSET_HINT, TERMINAL_NOTICE } from "@/lib/terminal-auth";

export function TerminalPinLogin({ onSuccess, onUsePassword, onAvailable }: { onSuccess: () => void; onUsePassword: () => void; onAvailable?: (available: boolean) => void }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/pin-login", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j: { available?: boolean }) => {
        if (!alive) return;
        setAvailable(j.available === true);
        onAvailable?.(j.available === true);
      })
      .catch(() => {
        if (!alive) return;
        setAvailable(false);
        onAvailable?.(false);
      });
    return () => {
      alive = false;
    };
    // onAvailable は初回だけ知らせればよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!available) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/pin-login", { method: "POST", cache: "no-store", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), pin }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      setPin("");
      if (!res.ok || !j.ok) {
        setError(res.status === 401 ? "この端末では番号ログインを使えません。パスワードでログインしてください" : j.error || "ログインに失敗しました");
        return;
      }
      onSuccess();
    } catch {
      setPin("");
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" data-terminal-pin-login autoComplete="off">
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-3 py-2">
        <p className="text-sm font-medium text-teal-900">🖥 院内端末ログイン（番号）</p>
        <p className="text-[11px] text-teal-900 mt-0.5" data-terminal-notice>{TERMINAL_NOTICE}</p>
      </div>
      <div className="space-y-1">
        <label htmlFor="terminal-email" className="text-sm font-medium">メールアドレス</label>
        <input
          id="terminal-email"
          name="terminal-email"
          type="text"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="terminal-pin" className="text-sm font-medium">番号（{PIN_MIN}〜{PIN_MAX}桁）</label>
        <input
          id="terminal-pin"
          name="terminal-pin"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={PIN_MAX}
          autoComplete="off"
          data-lpignore="true"
          data-1p-ignore="true"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_MAX))}
          required
          style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tracking-widest"
        />
      </div>
      {error && <p className="text-xs text-red-600" data-terminal-error>{error}</p>}
      <button type="submit" disabled={busy || !email || pin.length < PIN_MIN} className="w-full h-10 rounded-md bg-teal-600 text-white text-sm hover:bg-teal-700 disabled:opacity-50">
        {busy ? "ログイン中..." : "番号でログイン"}
      </button>
      <p className="text-[11px] text-muted-foreground" data-terminal-hint>{PIN_UNSET_HINT}</p>
      <button type="button" onClick={onUsePassword} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-2" data-terminal-use-password>
        パスワードでログインする
      </button>
    </form>
  );
}
