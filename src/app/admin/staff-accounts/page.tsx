"use client";

// スタッフアカウント招待管理（Supabase Auth・招待制）
// メール＋表示名で招待 → 招待メールから初回パスワード設定。
// 操作にはログインが必要（例外: ユーザーが1人もいない初回のみ招待可）。

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AccountSummary = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  lastSignInAt: string | null;
  invitedAt: string | null;
  banned: boolean;
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
                      <span className="text-sm font-medium text-slate-800">
                        {u.displayName || "（表示名なし）"}
                      </span>
                      <span className="text-xs text-slate-500">{u.email}</span>
                      {u.id === me && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 text-teal-700">
                          自分
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
