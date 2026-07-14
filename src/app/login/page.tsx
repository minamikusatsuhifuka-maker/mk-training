"use client";

// スタッフログイン（メール＋パスワード、Supabase Auth・招待制）
// 段階導入②: ポータル閲覧にログインは不要。プロフィール編集系のみ要ログイン。

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/profile";

  const [mode, setMode] = useState<"login" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setError(
        error.message.includes("Invalid login credentials")
          ? "メールアドレスまたはパスワードが違います"
          : `ログインに失敗しました: ${error.message}`
      );
      return;
    }
    router.push(next);
    router.refresh();
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      setError(`送信に失敗しました: ${error.message}`);
      return;
    }
    setInfo(
      "パスワード再設定メールを送信しました。メール内のリンクから新しいパスワードを設定してください。"
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="text-center">
          <h1 className="text-lg font-bold text-teal">南草津皮フ科</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            スタッフアカウント ログイン
          </p>
        </div>

        {mode === "login" ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="login-email">メールアドレス</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="login-password">パスワード</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "ログイン中..." : "ログイン"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError("");
                setInfo("");
              }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              パスワードをお忘れですか？
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              登録済みメールアドレスに、パスワード再設定用のリンクを送ります。
            </p>
            <div className="space-y-1">
              <Label htmlFor="reset-email">メールアドレス</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            {info && <p className="text-xs text-emerald-700">{info}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "送信中..." : "再設定メールを送る"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setInfo("");
              }}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              ← ログインに戻る
            </button>
          </form>
        )}

        <p className="text-[11px] text-muted-foreground text-center">
          はじめての方は
          <Link href="/join" className="underline underline-offset-2 mx-0.5">
            招待コードで登録 →
          </Link>
          <br />
          ポータルの閲覧はログインなしでも
          <Link href="/" className="underline underline-offset-2 mx-0.5">
            こちら
          </Link>
          から利用できます。
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
