"use client";
// 必須の学び（ゲート）の登録（指示書190 B-1）— **院長のみ**（講座マスタ・設定の中）
//   確定版 第4節の必須の学びを一括で初期登録し、講座マスタ（180）の講座を紐づける（1つのゲートに複数可）。判定は○×のみ。

import { useCallback, useEffect, useState } from "react";
import { GATE_KINDS, TRANSITIONS, transitionLabel, type Gate, type GateKind, type TransitionKey } from "@/lib/growth-matrix";
import type { Course } from "@/lib/staff-growth";

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
  return j;
}

const sel = "border border-gray-200 rounded-lg px-2 py-1 text-[12px] bg-white";

export function GateMasterPanel() {
  const [data, setData] = useState<{ gates: Gate[]; courses: Course[]; tableMissing: boolean } | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ transition: TransitionKey; label: string; kind: GateKind; perYearMin: number }>({ transition: "g1_g2", label: "", kind: "course", perYearMin: 1 });

  const load = useCallback(async () => {
    try {
      setData(await api("/api/growth/gates"));
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
    try {
      setMsg(await fn());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setBusy(false);
    }
  };
  const patchGate = (g: Gate, patch: Partial<Gate>) => run(async () => { await api("/api/growth/gates", { method: "PATCH", body: JSON.stringify({ id: g.id, ...patch }) }); return "💾 保存しました"; });

  if (!data) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-3" data-gate-master>
        <h2 className="text-sm font-medium text-gray-900">🚪 必須の学び（ゲート）</h2>
        <p className="text-[11px] text-gray-500 mt-1">{error || "読み込み中…"}</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-3" data-gate-master>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-gray-900">🚪 必須の学び（ゲート）— 移行ごとの○×判定（院長のみ）</h2>
        <button type="button" disabled={busy} onClick={() => void run(async () => { const j = await api<{ added: number }>("/api/growth/gates", { method: "PUT", body: JSON.stringify({ seed: true }) }); return `確定版 第4節から ${j.added}件を初期登録しました（既にあるものは飛ばしました）`; })} className="px-3 py-1.5 border border-teal-300 text-teal-800 rounded-full text-[11px] hover:bg-teal-50 disabled:opacity-40 min-h-[36px]" data-gate-seed>
          📥 確定版の必須の学びを一括登録
        </button>
      </div>
      <p className="text-[10px] text-gray-600 leading-relaxed">
        種類: 受講＝紐づけた講座の学びの記録が1件以上で○／年あたり回数＝直近1年の受講回数で○×／資格＝紐づけた講座の記録または院長の確認で○／院長の確認＝カルテの現在地で確認日と根拠を記入して○。
        講座は 180 の講座マスタから紐づけます（1つのゲートに複数可）。判定は○×だけで、割合や点数にはしません。
      </p>
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}

      {TRANSITIONS.map((t) => {
        const list = data.gates.filter((g) => g.transition === t.key);
        return (
          <div key={t.key} className="space-y-1.5" data-gate-transition={t.key}>
            <h3 className="text-[12px] font-medium text-gray-800">{transitionLabel(t.key)}（目標位置 {t.target.s} × {t.target.m}）</h3>
            {list.length === 0 ? (
              <p className="text-[11px] text-gray-500">まだありません。</p>
            ) : (
              <ul className="space-y-1">
                {list.map((g) => (
                  <li key={g.id} className="rounded-lg border border-gray-200 p-2 space-y-1" data-gate-row data-kind={g.kind}>
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="text-gray-900 flex-1 min-w-[12em]">{g.label}</span>
                      <select value={g.kind} disabled={busy} onChange={(e) => void patchGate(g, { kind: e.target.value as GateKind })} className={sel} aria-label={`${g.label} の種類`}>
                        {GATE_KINDS.map((k) => (
                          <option key={k.value} value={k.value}>{k.label}</option>
                        ))}
                      </select>
                      {g.kind === "per_year" && (
                        <label className="text-[11px] text-gray-700">
                          年
                          <input type="number" min={1} max={99} value={g.perYearMin} disabled={busy} onChange={(e) => void patchGate(g, { perYearMin: Number(e.target.value) })} className="w-14 border border-gray-200 rounded px-1 py-1 mx-1" aria-label={`${g.label} の年あたり回数`} />
                          回以上
                        </label>
                      )}
                      <button type="button" disabled={busy} onClick={() => { if (confirm(`「${g.label}」を削除します。よろしいですか？`)) void run(async () => { await api("/api/growth/gates", { method: "DELETE", body: JSON.stringify({ id: g.id }) }); return "削除しました"; }); }} className="text-[11px] text-red-700 underline underline-offset-2">
                        削除
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 text-[11px]">
                      <span className="text-gray-600">紐づけた講座:</span>
                      {g.courseIds.length === 0 && <span className="text-gray-400">なし</span>}
                      {g.courseIds.map((cid) => (
                        <span key={cid} className="px-1.5 py-0.5 rounded-full bg-teal-50 border border-teal-200 text-teal-900">
                          {data.courses.find((c) => c.id === cid)?.name ?? "（不明）"}
                          <button type="button" disabled={busy} onClick={() => void patchGate(g, { courseIds: g.courseIds.filter((x) => x !== cid) })} className="ml-1 text-teal-700" aria-label="紐づけを外す">×</button>
                        </span>
                      ))}
                      <select value="" disabled={busy} onChange={(e) => { if (e.target.value) void patchGate(g, { courseIds: [...g.courseIds, e.target.value] }); }} className={sel} aria-label={`${g.label} に講座を紐づける`} data-gate-link-course>
                        <option value="">＋ 講座を紐づける…</option>
                        {data.courses.filter((c) => !g.courseIds.includes(c.id)).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      <div className="rounded-lg border border-dashed border-gray-300 p-2 space-y-1.5" data-gate-new>
        <p className="text-[12px] font-medium text-gray-800">＋ ゲートを追加</p>
        <div className="flex flex-wrap gap-2 text-[12px]">
          <select value={form.transition} onChange={(e) => setForm((f) => ({ ...f, transition: e.target.value as TransitionKey }))} className={sel} aria-label="移行">
            {TRANSITIONS.map((t) => (
              <option key={t.key} value={t.key}>{transitionLabel(t.key)}</option>
            ))}
          </select>
          <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="名前（例: 業界セミナー 年1回以上）" className={`${sel} flex-1 min-w-[14em]`} aria-label="ゲートの名前" />
          <select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as GateKind }))} className={sel} aria-label="ゲートの種類">
            {GATE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          {form.kind === "per_year" && <input type="number" min={1} max={99} value={form.perYearMin} onChange={(e) => setForm((f) => ({ ...f, perYearMin: Number(e.target.value) }))} className="w-16 border border-gray-200 rounded px-1 py-1" aria-label="年あたり回数" />}
          <button type="button" disabled={busy || !form.label.trim()} onClick={() => void run(async () => { await api("/api/growth/gates", { method: "POST", body: JSON.stringify(form) }); setForm((f) => ({ ...f, label: "" })); return "追加しました"; })} className="px-3 py-1.5 bg-teal-600 text-white rounded-full text-[12px] hover:bg-teal-700 disabled:opacity-40 min-h-[36px]" data-gate-add>
            追加
          </button>
        </div>
        <p className="text-[10px] text-gray-500">{GATE_KINDS.find((k) => k.value === form.kind)?.hint}</p>
      </div>
    </section>
  );
}
