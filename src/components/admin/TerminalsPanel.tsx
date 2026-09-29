"use client";
// 🖥 院内端末（指示書192 A・192-補）— 院長のみ
//   1. 番号ログインのスイッチ（既定OFF。ONは院長のパスワード再入力、OFFは即時）
//   2. この端末を院内端末として登録（パスワード再入力＋端末名）→ ブラウザに端末の鍵（HttpOnly Cookie）
//   3. 登録済み端末の一覧（端末名・登録日・最終利用日・停止中）と「登録を取り消す」
//   4. 自動ログアウトまでの分（5〜60）
//   5. 番号を設定している人の一覧と「番号を解除」（院長は番号を見られない）
//   6. 操作ログ（入力値・番号は残らない）

import { useCallback, useEffect, useState } from "react";
import { IDLE_MAX_MINUTES, IDLE_MIN_MINUTES } from "@/lib/terminal-auth";

type Device = { id: string; name: string; registeredAt: string; registeredBy: string; lastUsedAt: string; revokedAt: string; suspended: boolean; suspendedUntil: string; thisDevice: boolean };
type Data = {
  setting: { pinLoginEnabled: boolean; idleMinutes: number; updatedAt: string; updatedBy: string };
  devices: Device[];
  pinUsers: { userId: string; name: string; updatedAt: string; lockedUntil: string }[];
  logs: { id: string; at: string; by: string; action: string; target: string; changes: { field: string; before: string; after: string }[] }[];
  tableMissing: boolean;
  thisDeviceId: string;
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
  return j;
}
const fmt = (iso: string) => (iso ? iso.replace("T", " ").slice(0, 16) : "—");
const inputClass = "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white";

export function TerminalsPanel() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [regPw, setRegPw] = useState("");
  const [enablePw, setEnablePw] = useState("");
  const [showLogs, setShowLogs] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api("/api/admin/terminals"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      setMsg(await fn());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setBusy(false);
    }
  };
  const post = (body: Record<string, unknown>) => api<Record<string, unknown>>("/api/admin/terminals", { method: "POST", body: JSON.stringify(body) });

  if (!data) {
    return (
      <div className="max-w-2xl space-y-2" data-terminals-panel>
        <h1 className="text-lg font-bold text-gray-900">🖥 院内端末（院長のみ）</h1>
        <p className="text-[11px] text-gray-500">{error || "読み込み中…"}</p>
      </div>
    );
  }
  const on = data.setting.pinLoginEnabled;
  const active = data.devices.filter((d) => !d.revokedAt);

  return (
    <div className="max-w-2xl space-y-3" data-terminals-panel data-pin-enabled={on ? "1" : "0"}>
      <h1 className="text-lg font-bold text-gray-900">🖥 院内端末（院長のみ）</h1>
      <p className="text-[11px] text-gray-600 leading-relaxed">
        院長が登録した院内端末でだけ、スタッフがメールアドレス＋本人が決めた番号（4〜6桁）でログインできます。院外・個人のスマートフォンはこれまでどおりパスワードです。
        管理者（院長）は番号ではログインできません。番号ログインは下のスイッチをONにしたときだけ動きます（既定OFF）。
      </p>
      {data.tableMissing && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg p-2" data-terminals-table-missing>
          院内端末のテーブルがまだ作られていません。交付済みのSQL（192_院内端末_テーブル作成.sql）を Supabase の SQL Editor で実行してください。
        </p>
      )}
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2" data-terminals-error>{error}</p>}
      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}

      {/* 1. スイッチ（192-補） */}
      <section className={`rounded-xl border p-3 space-y-2 ${on ? "border-teal-300 bg-teal-50/40" : "border-gray-200 bg-white"}`} data-pin-switch>
        <h2 className="text-sm font-medium text-gray-900">1. 番号ログインを開始する — 現在 <strong data-pin-switch-state>{on ? "ON（開始中）" : "OFF（これまでどおり）"}</strong></h2>
        {on ? (
          <div className="space-y-1">
            <p className="text-[11px] text-gray-700">ONのあいだ、登録済み端末のログイン画面に「院内端末ログイン（番号）」が出て、院内端末は無操作 {data.setting.idleMinutes}分で自動ログアウトします。マイプロフィールに番号の設定が出ます。</p>
            <button type="button" disabled={busy} onClick={() => { if (confirm("番号ログインを停止します（即時）。登録済み端末でもパスワードのみになります。よろしいですか？")) void run(async () => { await post({ action: "disable" }); return "番号ログインを停止しました（OFF）"; }); }} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm min-h-[44px] disabled:opacity-40" data-pin-disable>
              ⏹ 番号ログインを停止する（OFF・即時）
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-gray-700">OFFのあいだは、ログイン画面・API・自動ログアウト・マイプロフィールの番号設定のいずれも従来どおりです（院内端末の登録だけは準備のため使えます）。</p>
            <label className="block text-[12px] text-gray-800">
              院長のログインパスワード（本人確認）
              <input type="password" autoComplete="current-password" value={enablePw} onChange={(e) => setEnablePw(e.target.value)} className={inputClass} aria-label="開始のための院長のログインパスワード" />
            </label>
            <button type="button" disabled={busy || !enablePw} onClick={() => void run(async () => { await post({ action: "enable", loginPassword: enablePw }); setEnablePw(""); return "番号ログインを開始しました（ON）。スタッフには「最初の1回はパスワードでログインしてマイプロフィールで番号を設定」と案内してください"; })} className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 min-h-[44px] disabled:opacity-40" data-pin-enable>
              ▶ 番号ログインを開始する（ON）
            </button>
          </div>
        )}
      </section>

      {/* 2. この端末を登録 */}
      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" data-device-register>
        <h2 className="text-sm font-medium text-gray-900">2. この端末を院内端末として登録</h2>
        <p className="text-[11px] text-gray-600">今このブラウザに端末の鍵（推測できない長い乱数）を保存します。サーバーにはハッシュだけを保存し、鍵は HttpOnly・Secure・SameSite=Strict の Cookie に入ります。</p>
        <label className="block text-[12px] text-gray-800">
          端末名（例: 受付PC、処置室PC）
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} aria-label="端末名" />
        </label>
        <label className="block text-[12px] text-gray-800">
          院長のログインパスワード（本人確認）
          <input type="password" autoComplete="current-password" value={regPw} onChange={(e) => setRegPw(e.target.value)} className={inputClass} aria-label="登録のための院長のログインパスワード" />
        </label>
        <button type="button" disabled={busy || !name.trim() || !regPw} onClick={() => void run(async () => { await post({ action: "register", name: name.trim(), loginPassword: regPw }); setName(""); setRegPw(""); return "この端末を院内端末として登録しました（端末の鍵を保存）"; })} className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 min-h-[44px] disabled:opacity-40" data-device-register-run>
          🖥 この端末を院内端末として登録
        </button>
      </section>

      {/* 3. 一覧 */}
      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" data-device-list>
        <h2 className="text-sm font-medium text-gray-900">3. 登録済みの端末（{active.length}台）</h2>
        {active.length === 0 ? (
          <p className="text-[11px] text-gray-500">まだありません。</p>
        ) : (
          <ul className="space-y-1.5">
            {active.map((d) => (
              <li key={d.id} className="rounded-lg border border-gray-200 p-2 flex flex-wrap items-center gap-2 text-[12px]" data-device={d.id} data-suspended={d.suspended ? "1" : "0"}>
                <span className="flex-1 min-w-[10em]">
                  <strong className="text-gray-900">{d.name}</strong>
                  {d.thisDevice && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-900">この端末</span>}
                  {d.suspended && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-800" data-device-suspended>⚠ 失敗が多いため一時停止中（{fmt(d.suspendedUntil)}まで）</span>}
                  <span className="block text-[11px] text-gray-600">登録 {fmt(d.registeredAt)} ／ 最終利用 {fmt(d.lastUsedAt)}</span>
                </span>
                <button type="button" disabled={busy} onClick={() => { if (confirm(`「${d.name}」の登録を取り消します。即時に番号ログインできなくなります。よろしいですか？`)) void run(async () => { await post({ action: "revoke", id: d.id }); return "登録を取り消しました"; }); }} className="px-3 py-1.5 border border-red-300 text-red-700 rounded-full text-[11px] hover:bg-red-50 min-h-[36px] disabled:opacity-40" data-device-revoke>
                  登録を取り消す
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 4. 自動ログアウト */}
      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" data-idle-setting>
        <h2 className="text-sm font-medium text-gray-900">4. 院内端末の自動ログアウト</h2>
        <label className="text-[12px] text-gray-800 flex items-center gap-2">
          操作がないまま
          <select value={data.setting.idleMinutes} disabled={busy} onChange={(e) => void run(async () => { await post({ action: "idle", minutes: Number(e.target.value) }); return "自動ログアウトの時間を保存しました"; })} className="border border-gray-200 rounded-lg px-2 py-1 text-sm" aria-label="自動ログアウトまでの分">
            {Array.from({ length: (IDLE_MAX_MINUTES - IDLE_MIN_MINUTES) / 5 + 1 }, (_, i) => IDLE_MIN_MINUTES + i * 5).map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          分たったら自動でログアウト（1分前に予告。ログアウト時にそのタブの下書きを消します）
        </label>
      </section>

      {/* 5. 番号を設定している人 */}
      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" data-pin-users>
        <h2 className="text-sm font-medium text-gray-900">5. 番号を設定している人（{data.pinUsers.length}人）</h2>
        <p className="text-[11px] text-gray-600">院長にできるのは番号の解除（リセット）だけです。番号を見ることはできません。</p>
        {data.pinUsers.length === 0 ? (
          <p className="text-[11px] text-gray-500">まだいません。</p>
        ) : (
          <ul className="space-y-1">
            {data.pinUsers.map((u) => (
              <li key={u.userId} className="flex flex-wrap items-center gap-2 text-[12px] rounded-lg border border-gray-100 p-2" data-pin-user={u.userId}>
                <span className="flex-1">
                  {u.name}
                  <span className="ml-1 text-[11px] text-gray-500">設定 {fmt(u.updatedAt)}</span>
                  {u.lockedUntil && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900">5回失敗で停止中（{fmt(u.lockedUntil)}まで）</span>}
                </span>
                <button type="button" disabled={busy} onClick={() => { if (confirm(`${u.name} さんの番号を解除します（本人が設定し直すまでパスワードでログイン）。よろしいですか？`)) void run(async () => { await post({ action: "resetPin", userId: u.userId }); return "番号を解除しました"; }); }} className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-full text-[11px] hover:bg-gray-50 min-h-[36px] disabled:opacity-40" data-pin-reset>
                  番号を解除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 6. ログ */}
      <div>
        <button type="button" onClick={() => setShowLogs((v) => !v)} className="text-[11px] text-gray-700 underline underline-offset-2 min-h-[32px]">
          {showLogs ? "▲ 操作ログを隠す" : `▼ 操作ログ（${data.logs.length}件・入力値・番号は記録しません）`}
        </button>
        {showLogs && (
          <ul className="text-[11px] text-gray-700 space-y-0.5 mt-1" data-terminal-logs>
            {data.logs.map((l) => (
              <li key={l.id}>
                <span className="text-gray-500">{fmt(l.at)}</span> {l.by} が {l.action}
                {l.changes.length > 0 ? `（${l.changes.map((c) => `${c.field}: ${c.before || "—"} → ${c.after || "—"}`).join(" / ")}）` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
