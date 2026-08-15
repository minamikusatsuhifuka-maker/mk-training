"use client";

// QR/URLからのスタッフ自己登録ページ（指示書55）
// 院内で共有された招待コード＋名前＋メール＋パスワードで登録 →
// 自動ログインして /profile へ。部外者は招待コードなしでは登録できない。
//
// 【162で直したこと】
// この画面には「ポータルの閲覧はログインなしでも こちら」というホームへのリンクが
// 残っていた（160でログインなしの閲覧を廃止したのに、案内だけが取り残されていた）。
// <Link> は本番でリンク先を先読みするため、**未ログイン時のホームの判定
// （ログイン画面へ戻す307）がクライアントに記録され**、登録・ログインに成功した
// あともホームに入れない原因になっていた。案内は削除し、登録後の遷移は
// 画面ごと読み込み直す（reloadTo）ことで、記録された判定を確実に捨てる。

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { reloadTo } from "@/lib/auth-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function JoinPage() {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("パスワードは8文字以上にしてください");
      return;
    }
    if (password !== password2) {
      setError("確認用のパスワードが一致しません");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          email: email.trim(),
          password,
        }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !j?.ok) {
        setError(j?.error ?? "登録に失敗しました");
        // 連投防止: 失敗後は数秒ボタンを無効化（サーバー側にも軽いレート制限あり）
        setCooldown(true);
        setTimeout(() => setCooldown(false), 3000);
        return;
      }
      // 登録成功 → 自動ログイン → /profile へ
      setDone(true);
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        // 作成は成功しているのでログインページへ誘導
        reloadTo("/login?next=/profile");
        return;
      }
      // 162: router.push ではなく画面ごと読み込み直す。
      // ここを通ることで、ログイン前に先読みされた「ログイン画面へ戻す」判定が
      // すべて捨てられ、以降どのメニューへ進んでもログインを求められない。
      // welcome=1 は初回の案内（ホームへ進む導線）を出すための目印。
      reloadTo("/profile?welcome=1");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
        <div className="text-center">
          <h1 className="text-lg font-bold text-teal">南草津皮フ科</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            スタッフアカウント 新規登録
          </p>
        </div>

        {done ? (
          <div className="text-center space-y-2 py-4">
            <p className="text-2xl">🎉</p>
            <p className="text-sm text-slate-700">
              登録が完了しました。ログインしています...
            </p>
            <p className="text-xs text-muted-foreground">
              このあとプロフィールを書いてみましょう
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              院内で共有された<strong>招待コード</strong>
              を入力して、自分のアカウントを登録してください。
            </p>
            <div className="space-y-1">
              <Label htmlFor="join-code">招待コード *</Label>
              <Input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="例：ABCD2345"
                autoComplete="off"
                className="font-mono tracking-widest uppercase"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="join-name">お名前 *</Label>
              <Input
                id="join-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例：山田 花子"
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="join-email">メールアドレス *</Label>
              <Input
                id="join-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="join-password">パスワード（8文字以上）*</Label>
              <Input
                id="join-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="join-password2">パスワード（確認用）*</Label>
              <Input
                id="join-password2"
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={
                busy ||
                cooldown ||
                !code.trim() ||
                !name.trim() ||
                !email.trim() ||
                !password ||
                !password2
              }
            >
              {busy ? "登録中..." : "登録する"}
            </Button>
          </form>
        )}

        <p className="text-[11px] text-muted-foreground text-center">
          すでにアカウントをお持ちの方は
          <Link href="/login" className="underline underline-offset-2 mx-0.5">
            ログイン
          </Link>
          へ。
          <br />
          {/* 162: 旧「ポータルの閲覧はログインなしでも こちら」を削除。
              160でログインなしの閲覧は廃止済みで案内自体が誤りだったうえ、
              ホームへのリンクの先読みが登録後の締め出しを起こしていた。 */}
          ポータルのご利用にはログインが必要です。
        </p>
      </div>
    </div>
  );
}
