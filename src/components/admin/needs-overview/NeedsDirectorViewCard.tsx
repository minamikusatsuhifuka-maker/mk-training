"use client";

// 277 §2: 「⚙ 機能」→「🚀 機能の表示設定」のスイッチ「🧭 院長は欲求サーベイの資料とデータを見る」（院長だけ）
// ・院長かどうかはサーバーが決める（/api/admin/needs-overview?view=1 が 404 なら欄ごと出さない＝ほかの管理者には無い）
// ・ON にする前に、知らせてから ON にするよう確かめる（ブラウザの確認の小窓は使わず、画面の中で2段階）
// ・ON にした日時・OFF に戻した日時・文を直した記録・お知らせを確認した人／まだの人
// ・3章・4章の文はここで直せる（コードに書き込まない）

import { useEffect, useState } from "react";
import {
  NEEDS_DIRECTOR_TEXT_FIELDS,
  NEEDS_DIRECTOR_VIEW_CONFIRM,
  NEEDS_DIRECTOR_VIEW_LABEL,
  type NeedsDirectorTexts,
  type NeedsDirectorViewState,
} from "@/lib/needs-director-view";

type Row = { userId: string; name: string; testSeed?: true; ackAt: string };
type Resp = { state: NeedsDirectorViewState; acked: Row[]; pending: Row[] };

const fmt = (iso: string) => {
  const d = new Date(iso);
  return !iso || Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
const WHAT = { on: "ONにした", off: "OFFに戻した", texts: "文を直した" } as const;

export function NeedsDirectorViewCard() {
  const [data, setData] = useState<Resp | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<NeedsDirectorTexts | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/needs-overview?view=1", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Resp>) : null))
      .then((d) => alive && d && setData(d))
      .catch(() => {
        /* 院長でなければ出さない */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!data) return null;
  const s = data.state;

  const post = async (body: unknown, done: string) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/needs-overview", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json().catch(() => ({}))) as Resp & { error?: string };
      if (!r.ok) throw new Error(j.error || "保存に失敗しました");
      setData(j);
      setMsg(done);
    } catch (e) {
      setMsg(`⚠ ${e instanceof Error ? e.message : "保存に失敗しました"}`);
    } finally {
      setBusy(false);
    }
  };

  const realPending = data.pending.filter((p) => !p.testSeed);
  const testRows = [...data.acked, ...data.pending].filter((p) => p.testSeed);

  return (
    <div className="space-y-3 rounded-xl border-2 border-indigo-200 bg-white p-4" data-needs-director-card data-on={s.on ? "1" : "0"}>
      <div className="space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-800">
          {NEEDS_DIRECTOR_VIEW_LABEL}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.on ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>{s.on ? "ON" : "OFF"}</span>
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-800">院長だけ</span>
        </p>
        <p className="text-xs leading-relaxed text-gray-600">
          ONにすると同時に、①公開設定の画面の説明文が下の文に変わり、②スタッフ全員にお知らせが出て、③「🧭 欲求の一覧」で非公開の人を含む全員の5つ・15項目と原本が見えるようになります。
          「注力」「現況」はアプリに出しません（原本で確かめます）。スタッフ同士の見え方は変わりません。OFFに戻すと3つとも元に戻ります。
        </p>
        <p className="text-[11px] text-gray-500">
          ONにした日時：{fmt(s.onAt)}　OFFに戻した日時：{fmt(s.offAt)}
        </p>
      </div>

      {s.on ? (
        <button type="button" disabled={busy} onClick={() => post({ action: "switch", on: false }, "OFFに戻しました")} className="min-h-[40px] rounded-full border border-gray-400 px-4 text-sm" data-director-switch-off>
          OFFに戻す
        </button>
      ) : confirming ? (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3" data-director-confirm>
          <p className="text-sm text-amber-950">{NEEDS_DIRECTOR_VIEW_CONFIRM}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => post({ action: "switch", on: true }, "ONにしました").then(() => setConfirming(false))} className="min-h-[40px] rounded-full bg-indigo-700 px-4 text-sm text-white" data-director-switch-on>
              知らせたのでONにする
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="min-h-[40px] rounded-full border border-gray-300 px-4 text-sm">
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="min-h-[40px] rounded-full bg-indigo-700 px-4 text-sm text-white" data-director-switch-start>
          ONにする…
        </button>
      )}
      {msg && <p className="text-xs text-gray-700" role="status">{msg}</p>}

      <details className="rounded-lg border border-gray-200 p-3" data-director-texts>
        <summary className="cursor-pointer text-sm font-medium text-gray-800">📝 説明文とお知らせの文（院長が直せます）</summary>
        <div className="mt-2 space-y-2">
          {NEEDS_DIRECTOR_TEXT_FIELDS.map((f) => {
            const v = (draft ?? s.texts)[f.key];
            return (
              <label key={f.key} className="block space-y-0.5">
                <span className="text-xs text-gray-700">{f.label}</span>
                <textarea
                  value={v}
                  maxLength={f.max}
                  rows={f.key === "notice" ? 5 : 2}
                  onChange={(e) => setDraft({ ...(draft ?? s.texts), [f.key]: e.target.value })}
                  className="w-full rounded border border-gray-300 p-2 text-sm"
                  data-director-text={f.key}
                />
              </label>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !draft} onClick={() => post({ action: "texts", texts: draft }, "文を保存しました").then(() => setDraft(null))} className="min-h-[40px] rounded-full bg-teal-700 px-4 text-sm text-white disabled:opacity-40" data-director-texts-save>
              💾 文を保存
            </button>
            {draft && (
              <button type="button" onClick={() => setDraft(null)} className="min-h-[40px] rounded-full border border-gray-300 px-4 text-sm">
                元に戻す
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-500">空にした欄は、はじめの案に戻ります。</p>
        </div>
      </details>

      <details className="rounded-lg border border-gray-200 p-3" open={s.on} data-director-acks>
        <summary className="cursor-pointer text-sm font-medium text-gray-800">
          ✅ お知らせを確認した人 {s.on ? `${data.acked.filter((p) => !p.testSeed).length}人／まだ ${realPending.length}人` : "（ONの間だけ数えます）"}
        </summary>
        {s.on && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2 text-xs">
            <div>
              <p className="font-medium text-gray-700">確認しました</p>
              <ul className="mt-1 space-y-0.5">
                {data.acked.filter((p) => !p.testSeed).map((p) => (
                  <li key={p.userId} data-acked={p.userId}>{p.name}<span className="ml-1 text-gray-500">{fmt(p.ackAt)}</span></li>
                ))}
                {data.acked.filter((p) => !p.testSeed).length === 0 && <li className="text-gray-400">まだいません</li>}
              </ul>
            </div>
            <div>
              <p className="font-medium text-gray-700">まだの人</p>
              <ul className="mt-1 space-y-0.5">
                {realPending.map((p) => (
                  <li key={p.userId} data-pending={p.userId}>{p.name}</li>
                ))}
                {realPending.length === 0 && <li className="text-gray-400">いません</li>}
              </ul>
            </div>
            {testRows.length > 0 && (
              <p className="text-[11px] text-amber-900 sm:col-span-2">
                🧪 検証用（数に入れません）：{testRows.map((p) => `${p.name}${p.ackAt ? "（確認済み）" : ""}`).join("・")}
              </p>
            )}
          </div>
        )}
      </details>

      {s.log.length > 0 && (
        <details className="text-xs text-gray-600">
          <summary className="cursor-pointer">記録</summary>
          <ul className="mt-1 space-y-0.5">
            {s.log.slice().reverse().map((l, i) => (
              <li key={i}>{fmt(l.at)}　{l.byName}　{WHAT[l.what]}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
