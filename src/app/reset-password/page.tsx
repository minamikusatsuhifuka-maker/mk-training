"use client";

// パスワード設定ページ（招待メールの初回設定・パスワード再設定の両方で使う）
// 招待/再設定メールのリンクがここへリダイレクトされる。
// @supabase/ssr のブラウザクライアントが URL 中のトークン（?code= / #access_token=）を
// 自動検出してセッション化するので、セッション確立を待ってからパスワードを更新する。

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { reloadTo } from "@/lib/auth-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">(
    "checking"
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let done = false;

    // URLトークンの自動処理を待つ（onAuthStateChange＋念のためのポーリング）
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !done) {
        done = true;
        setReady("ok");
      }
    });

    const timer = setInterval(async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && !done) {
        done = true;
        setReady("ok");
        clearInterval(timer);
      }
    }, 500);

    // 8秒待ってもセッションが張れなければリンク切れ扱い
    const timeout = setTimeout(() => {
      if (!done) setReady("no-session");
      clearInterval(timer);
    }, 8000);

    return () => {
      sub.subscription.unsubscribe();
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください");
      return;
    }
    if (password !== confirm) {
      setError("確認用パスワードが一致しません");
      return;
    }
    setBusy(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(`設定に失敗しました: ${error.message}`);
      return;
    }
    // 162: ここも認証状態が変わる遷移なので画面ごと読み込み直す
    //（ログイン前に先読みされた判定を残さない。詳細は src/lib/auth-navigation.ts）
    reloadTo("/profile?welcome=1");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="text-center">
          <h1 className="text-lg font-bold text-teal">南草津皮フ科</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            パスワードの設定
          </p>
        </div>

        {ready === "checking" && (
          <p className="text-sm text-muted-foreground text-center py-4">
            確認中...
          </p>
        )}

        {ready === "no-session" && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-red-600">
              リンクが無効か、有効期限が切れています。
            </p>
            <p className="text-xs text-muted-foreground">
              <Link href="/login" className="underline underline-offset-2">
                ログインページ
              </Link>
              から「パスワードをお忘れですか？」で再設定メールを送るか、管理者に再招待を依頼してください。
            </p>
          </div>
        )}

        {ready === "ok" && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="new-password">新しいパスワード（8文字以上）</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm-password">新しいパスワード（確認）</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "設定中..." : "パスワードを設定してはじめる"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
