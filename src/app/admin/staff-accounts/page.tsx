"use client";

// スタッフアカウント招待管理（Supabase Auth・招待制）
// メール＋表示名で招待 → 招待メールから初回パスワード設定。
// 操作にはログインが必要（例外: ユーザーが1人もいない初回のみ招待可）。

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { JoinConfig } from "@/lib/join-config";

type AccountSummary = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastSignInAt: string | null;
  invitedAt: string | null;
  banned: boolean;
  isAdmin: boolean;
  /** 招待時の表示名が未設定のときの代替表示用（本人のプロフィール名・APIが付与） */
  profileName?: string;
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export default function StaffAccountsAdminPage() {
  const [users, setUsers] = useState<AccountSummary[]>([]);
  const [me, setMe] = useState("");
  const [bootstrap, setBootstrap] = useState(false);
  const [preLogin, setPreLogin] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [serviceError, setServiceError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // 発行直後の仮パスワード（この画面でのみ一度だけ表示。どこにも保存しない）
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  // 📱 QR・招待コード（指示書55）
  const [joinConfig, setJoinConfig] = useState<JoinConfig | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch("/api/admin/staff-accounts");
    const j = (await res.json().catch(() => null)) as {
      users?: AccountSummary[];
      bootstrap?: boolean;
      preLogin?: boolean;
      me?: string;
      error?: string;
    } | null;
    if (res.status === 401) {
      setNeedLogin(true);
      setServiceError("");
    } else if (res.status === 503) {
      setServiceError(j?.error ?? "サーバー設定が不足しています");
      setNeedLogin(false);
    } else if (res.ok && j) {
      setUsers(j.users ?? []);
      setBootstrap(!!j.bootstrap);
      setPreLogin(!!j.preLogin);
      setMe(j.me ?? "");
      setNeedLogin(false);
      setServiceError("");
    } else {
      setError(j?.error ?? "一覧の取得に失敗しました");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    // reload() を直接呼ぶと react-hooks/set-state-in-effect が誤検知するため
    // マイクロタスクに逃がして非同期に開始する
    Promise.resolve()
      .then(reload)
      .catch(() => setLoaded(true));
  }, [reload]);

  // 登録URLとQR・招待コード設定の読み込み（管理者のみ成功する。失敗時はセクション非表示）
  useEffect(() => {
    const url = `${window.location.origin}/join`;
    setJoinUrl(url);
    QRCode.toDataURL(url, { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => {});
    fetch("/api/admin/join-config")
      .then(async (res) => {
        if (!res.ok) return;
        const j = (await res.json()) as { config?: JoinConfig };
        if (j.config) setJoinConfig(j.config);
      })
      .catch(() => {});
  }, []);

  // 招待コード設定の更新（受付切替・再発行）
  const updateJoinConfig = async (patch: {
    enabled?: boolean;
    regenerate?: boolean;
  }) => {
    setJoinBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/join-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await res.json().catch(() => null)) as {
        config?: JoinConfig;
        error?: string;
      } | null;
      if (!res.ok || !j?.config) {
        setError(j?.error ?? "招待コード設定の更新に失敗しました");
        return;
      }
      setJoinConfig(j.config);
    } finally {
      setJoinBusy(false);
    }
  };

  const copyText = async (text: string, mark: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      mark(true);
      setTimeout(() => mark(false), 2000);
    } catch {
      setError("コピーに失敗しました。手動で選択してコピーしてください");
    }
  };

  // 🖨 印刷用の貼り紙ビュー（QR＋URL＋手順＋コード）を別ウィンドウで開く
  const openPrintView = () => {
    if (!joinConfig || !qrDataUrl) return;
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) {
      setError("ポップアップがブロックされました。許可してください");
      return;
    }
    w.document.write(`<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><title>スタッフ登録のご案内</title>
<style>
  body { font-family: "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif; text-align: center; padding: 32px 24px; color: #1e293b; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { font-size: 13px; color: #64748b; margin-bottom: 20px; }
  img { width: 240px; height: 240px; }
  .url { font-size: 13px; color: #334155; margin: 8px 0 20px; word-break: break-all; }
  ol { text-align: left; display: inline-block; font-size: 15px; line-height: 2; margin: 0 auto; }
  .code { font-family: monospace; font-size: 20px; letter-spacing: 4px; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 2px 10px; }
  .note { font-size: 11px; color: #94a3b8; margin-top: 24px; }
  @media print { .noprint { display: none; } }
</style></head><body>
  <h1>南草津皮フ科 スタッフポータル</h1>
  <p class="sub">スタッフアカウント登録のご案内</p>
  <img src="${qrDataUrl}" alt="登録ページのQRコード">
  <p class="url">${joinUrl}</p>
  <ol>
    <li>① QRコードを読み取る（または上のURLを開く）</li>
    <li>② 招待コード「<span class="code">${joinConfig.code}</span>」を入力する</li>
    <li>③ 名前・メールアドレス・パスワードを登録する</li>
  </ol>
  <p class="note">※ このご案内は院内のみで共有してください</p>
  <p class="noprint" style="margin-top:24px"><button onclick="window.print()" style="font-size:14px;padding:8px 20px">🖨 印刷する</button></p>
</body></html>`);
    w.document.close();
  };

  const post = async (body: Record<string, string>, successMsg: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    const res = await fetch("/api/admin/staff-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    setBusy(false);
    if (!res.ok) {
      let msg = j?.error ?? "操作に失敗しました";
      // メール送信のレート制限時は、メール不要の代替手段を案内する
      if (/rate limit/i.test(msg)) {
        msg += "（メール送信の制限中です。各アカウントの「🔑 仮パスワード発行」も利用できます）";
      }
      setError(msg);
      return false;
    }
    setMessage(successMsg);
    await reload();
    return true;
  };

  // 仮パスワード発行（サーバー生成 → この画面で一度だけ表示）
  const issueTempPassword = async (u: AccountSummary) => {
    if (
      !confirm(
        `${u.email} に仮パスワードを発行しますか？\n（このアカウントの現在のパスワードは使えなくなります）`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    setIssued(null);
    setCopied(false);
    const res = await fetch("/api/admin/staff-accounts/temp-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: u.id }),
    });
    const j = (await res.json().catch(() => null)) as {
      tempPassword?: string;
      error?: string;
    } | null;
    setBusy(false);
    if (!res.ok || !j?.tempPassword) {
      setError(j?.error ?? "仮パスワードの発行に失敗しました");
      return;
    }
    setIssued({ email: u.email, password: j.tempPassword });
  };

  const copyIssuedPassword = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("コピーに失敗しました。手動で選択してコピーしてください");
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await post(
      { action: "invite", email: email.trim(), name: name.trim() },
      `📨 ${email.trim()} に招待メールを送りました`
    );
    if (ok) {
      setEmail("");
      setName("");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          👤 スタッフアカウント
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          メールアドレスで招待し、スタッフが自分でパスワードを設定してログインします（招待制・自由登録なし）。
          アカウントはプロフィール編集（
          <Link href="/profile" className="underline underline-offset-2">
            /profile
          </Link>
          ）に使います。
        </p>
      </div>

      {!loaded ? (
        <p className="text-sm text-slate-600">読み込み中...</p>
      ) : serviceError ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          ⚠️ {serviceError}
        </div>
      ) : needLogin ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 space-y-2">
          <p>⚠️ アカウント管理の操作にはスタッフアカウントでのログインが必要です。</p>
          <Link
            href="/login?next=/admin/staff-accounts"
            className="inline-block underline underline-offset-2"
          >
            ログインページへ
          </Link>
        </div>
      ) : (
        <>
          {bootstrap && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
              まだアカウントがありません。まず管理者（自分）のメールアドレスを招待してください。
              以降の招待・管理にはログインが必要になります。
            </div>
          )}

          {preLogin && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              ⚠️
              まだ誰もログインしていないため、初期セットアップとして未ログインでも「🔑
              仮パスワード発行」だけ利用できます。誰かが一度ログインすると、以降の操作にはログインが必要になります。
            </div>
          )}

          {(message || error) && (
            <p
              className={`text-sm rounded-md px-3 py-2 border ${
                error
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              {error || message}
            </p>
          )}

          {/* 発行した仮パスワード（一度だけ表示） */}
          {issued && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-2">
              <p className="text-sm font-semibold text-teal-900">
                🔑 {issued.email} の仮パスワードを発行しました
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-base font-mono tracking-wider bg-white border border-teal-200 rounded-md px-3 py-1.5 select-all">
                  {issued.password}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={copyIssuedPassword}
                >
                  {copied ? "✅ コピーしました" : "📋 コピー"}
                </Button>
                <button
                  type="button"
                  onClick={() => setIssued(null)}
                  className="text-xs text-teal-700 underline underline-offset-2"
                >
                  閉じる
                </button>
              </div>
              <p className="text-xs text-teal-800">
                ⚠️
                この画面を閉じると再表示できません。本人に直接（口頭・対面などで）渡し、初回ログイン後に
                /profile の「パスワード変更」で自分のパスワードに変更してもらってください。
              </p>
            </div>
          )}

          {/* 招待フォーム（未ログインの初期セットアップ中は招待不可のため隠す） */}
          {!preLogin && (
          <form
            onSubmit={handleInvite}
            className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"
          >
            <h2 className="text-sm font-semibold text-slate-800">
              📨 新しいスタッフを招待
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="メールアドレス"
                required
              />
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="表示名（例：山田 花子）"
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={busy || !email.trim() || !name.trim()}>
                {busy ? "処理中..." : "招待メールを送る"}
              </Button>
            </div>
          </form>
          )}

          {/* 📱 QR・招待コード（自己登録。指示書55） */}
          {joinConfig && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">
                  📱 QR・招待コード（スタッフの自己登録）
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  スタッフがQRコードまたはURLから登録ページ（/join）を開き、招待コード＋名前＋メール＋パスワードで自分で登録できます。招待メール・🔑仮パスワードとの併用も可能です。
                </p>
              </div>

              <div className="flex flex-wrap gap-5 items-start">
                {/* QRコード */}
                <div className="text-center space-y-2">
                  {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={qrDataUrl}
                      alt="登録ページのQRコード"
                      className="w-40 h-40 border border-slate-200 rounded-lg"
                    />
                  ) : (
                    <div className="w-40 h-40 border border-slate-200 rounded-lg flex items-center justify-center text-xs text-slate-400">
                      QR生成中...
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={openPrintView}
                    disabled={!qrDataUrl}
                  >
                    🖨 印刷用を開く
                  </Button>
                </div>

                <div className="flex-1 min-w-[240px] space-y-3">
                  {/* 受付状態 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        joinConfig.enabled
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {joinConfig.enabled ? "✅ 受付中" : "⏸ 停止中"}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={joinBusy}
                      onClick={() =>
                        updateJoinConfig({ enabled: !joinConfig.enabled })
                      }
                    >
                      {joinConfig.enabled ? "受付を停止" : "受付を再開"}
                    </Button>
                  </div>

                  {/* 招待コード */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-600">
                      招待コード
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-base font-mono tracking-[0.3em] bg-slate-50 border border-slate-200 rounded-md px-3 py-1.5 select-all">
                        {joinConfig.code}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => copyText(joinConfig.code, setCodeCopied)}
                      >
                        {codeCopied ? "✅ コピーしました" : "📋 コピー"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={joinBusy}
                        onClick={() => {
                          if (
                            confirm(
                              "招待コードを再発行しますか？\n（今のコードは使えなくなります。既存アカウントには影響しません）"
                            )
                          ) {
                            updateJoinConfig({ regenerate: true });
                          }
                        }}
                      >
                        ♻️ 再発行
                      </Button>
                    </div>
                  </div>

                  {/* 登録URL */}
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-600">
                      登録URL
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 break-all">
                        {joinUrl}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => copyText(joinUrl, setUrlCopied)}
                      >
                        {urlCopied ? "✅ コピーしました" : "📋 コピー"}
                      </Button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    ⚠️
                    招待コードは院内のみで共有してください。漏れた場合は再発行してください（既存アカウントには影響しません）。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 一覧 */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-semibold text-slate-800">
              招待済みアカウント（{users.length}）
            </h2>
            {users.length === 0 ? (
              <p className="text-sm text-slate-600">まだ招待がありません。</p>
            ) : (
              <ul className="space-y-2">
                {users.map((u) => (
                  <li
                    key={u.id}
                    className={`rounded-xl border px-4 py-3 ${
                      u.banned
                        ? "border-red-200 bg-red-50/50"
                        : "border-slate-100 bg-slate-50"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {/* 招待時の表示名が未設定なら、本人が登録したプロフィール名で代替表示 */}
                      <span className="text-sm font-medium text-slate-800">
                        {u.displayName || u.profileName || "（表示名なし）"}
                      </span>
                      {!u.displayName && u.profileName && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600"
                          title="招待時の表示名は未設定です。本人のマイプロフィールの名前を表示しています"
                        >
                          プロフィール名
                        </span>
                      )}
                      <span className="text-xs text-slate-500">{u.email}</span>
                      {u.id === me && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">
                          自分
                        </span>
                      )}
                      {u.isAdmin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          👑 管理者
                        </span>
                      )}
                      {u.banned ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                          無効
                        </span>
                      ) : u.lastSignInAt ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          利用中
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          招待中（未ログイン）
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      招待: {fmt(u.invitedAt ?? u.createdAt)} ／ 最終ログイン:{" "}
                      {fmt(u.lastSignInAt)}
                    </p>
                    <div className="flex gap-2 mt-2">
                      {!u.banned && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => issueTempPassword(u)}
                          className="text-xs px-2 py-1 border border-teal-200 text-teal-700 rounded hover:bg-teal-50 disabled:opacity-50"
                        >
                          🔑 仮パスワード発行
                        </button>
                      )}
                      {!preLogin && !u.banned && (
                        u.isAdmin ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  `${u.email} の管理者権限を解除しますか？`
                                )
                              ) {
                                post(
                                  { action: "demote", userId: u.id },
                                  `👤 ${u.email} の管理者権限を解除しました`
                                );
                              }
                            }}
                            className="text-xs px-2 py-1 border border-amber-200 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
                          >
                            👑 管理者を解除
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  `${u.email} を管理者にしますか？（管理画面のすべての操作ができるようになります）`
                                )
                              ) {
                                post(
                                  { action: "promote", userId: u.id },
                                  `👑 ${u.email} を管理者にしました`
                                );
                              }
                            }}
                            className="text-xs px-2 py-1 border border-slate-200 text-slate-600 rounded hover:bg-white disabled:opacity-50"
                          >
                            👑 管理者にする
                          </button>
                        )
                      )}
                      {!preLogin && !u.lastSignInAt && !u.banned && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            post(
                              { action: "reinvite", userId: u.id },
                              `📨 ${u.email} に招待メールを再送しました`
                            )
                          }
                          className="text-xs px-2 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-50"
                        >
                          再招待
                        </button>
                      )}
                      {!preLogin &&
                        u.id !== me &&
                        (u.banned ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              post(
                                { action: "enable", userId: u.id },
                                `✅ ${u.email} を有効化しました`
                              )
                            }
                            className="text-xs px-2 py-1 border border-emerald-200 text-emerald-700 rounded hover:bg-emerald-50 disabled:opacity-50"
                          >
                            有効化
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  `${u.email} を無効化しますか？（ログインできなくなります）`
                                )
                              ) {
                                post(
                                  { action: "disable", userId: u.id },
                                  `🚫 ${u.email} を無効化しました`
                                );
                              }
                            }}
                            className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                          >
                            無効化
                          </button>
                        ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
