"use client";
// 🧭 現在地（指示書190 D）— **本人（マイ成長記録）と院長（育成カルテ）のみ**。183の担当幹部には出さない
//   等級・キャリアライン（院長が設定）／マトリクス上の位置（合意した位置と本人の自己評価を並べる）／
//   次の移行のゲート○×（B）／到達状態の各項目と根拠（C）／図の上に本人の点
//   院長: 項目ごとに「確認」「対話で確かめる」、合意した位置を面談の日付とともに記録
//   画面に到達の数・割合・点数は出さない。位置・等級で比較・並べ替え・絞り込みをしない。

import { useCallback, useEffect, useState } from "react";
// 220 §2-4/§2-5: 入力欄はふだん隠し、長い表はたたむ
import { Collapsible, OpenOnDemand } from "@/components/GrowthTabsBar";
import Link from "next/link";
import { GrowthMatrixFigure, type MatrixMarker } from "@/components/GrowthMatrixFigure";
import { GateDates, GrowthRequirementsTable } from "@/components/GrowthRequirementsTable";
import {
  CAREER_LINES,
  GRADES,
  ITEM_REVIEW_LABEL,
  MEETING_LABEL,
  NEXT_AXIS_LABEL,
  gateDateParts,
  gateKindLabel,
  plainItemText,
  transitionLabel,
  type AttainmentItem,
  type GateResult,
  type ItemReview,
  type MLevel,
  type MatrixReview,
  type MatrixSelf,
  type MeetingType,
  type SLevel,
  type StaffGrade,
  type TransitionKey,
} from "@/lib/growth-matrix";

type PositionResponse = {
  userId: string;
  grade: StaffGrade;
  self: { matrix: MatrixSelf; periodLabel: string; status: string; updatedAt: string } | null;
  review: MatrixReview;
  transition: TransitionKey | null;
  items: AttainmentItem[];
  gates: GateResult[];
  gatesTableMissing: boolean;
  today: string;
  isAdmin: boolean;
  isOwner: boolean;
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
  return j;
}

export function GateStatusList({ gates, transition, tableMissing }: { gates: GateResult[]; transition: TransitionKey | null; tableMissing?: boolean }) {
  if (!transition) return <p className="text-[11px] text-gray-500">次の移行が決まると、必須の学びの○×が出ます（等級の設定、または自己評価シートで移行を選ぶ）。</p>;
  if (tableMissing) return <p className="text-[11px] text-gray-500">成長記録のテーブルがまだ作られていません。</p>;
  if (gates.length === 0) return <p className="text-[11px] text-gray-500">{transitionLabel(transition)} の必須の学びはまだ登録されていません（🗂 講座マスタ・設定 → ゲート）。</p>;
  return (
    <ul className="space-y-1" data-gate-list>
      {gates.map((r) => (
        <li key={r.gate.id} className="text-[12px] text-gray-900 flex gap-2 items-start" data-gate data-ok={r.ok ? "1" : "0"}>
          <span className={`shrink-0 w-6 text-center font-bold ${r.ok ? "text-teal-700" : "text-gray-400"}`}>{r.ok ? "○" : "×"}</span>
          <span className="min-w-0">
            {r.gate.label}
            <span className="ml-1 text-[10px] text-gray-500">（{gateKindLabel(r.gate.kind)}・{r.basis}）</span>
            <GateDates parts={gateDateParts(r)} className="block" />
            {!r.ok && r.courseNames.length > 0 && <span className="block text-[11px] text-teal-800">→ 次に受ける講座: {r.courseNames.join("・")}</span>}
            {r.check?.note && <span className="block text-[11px] text-gray-600">根拠: {r.check.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CurrentPositionCard({ userId, mode }: { userId?: string; mode: "owner" | "director" }) {
  const [data, setData] = useState<PositionResponse | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [agree, setAgree] = useState<{ s: SLevel | ""; m: MLevel | ""; meeting: MeetingType; date: string; note: string }>({ s: "", m: "", meeting: "half", date: "", note: "" });
  const [gateCheck, setGateCheck] = useState<Record<string, { checkedOn: string; note: string }>>({});

  const load = useCallback(async () => {
    try {
      const j = await api<PositionResponse>(`/api/growth/position${userId ? `?user=${encodeURIComponent(userId)}` : ""}`);
      setData(j);
      setHidden(false);
    } catch (e) {
      if (/\(404\)/.test(String(e))) setHidden(true);
      else setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, [userId]);
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
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  };
  const patch = (body: Record<string, unknown>) => api("/api/growth/position", { method: "PATCH", body: JSON.stringify({ userId: data?.userId, ...body }) });

  if (hidden) return null;
  if (!data) {
    return (
      <section className="rounded-xl border border-teal-200 bg-teal-50/30 p-3" data-position-card>
        <h2 className="text-sm font-medium text-gray-900">🧭 現在地</h2>
        <p className="text-[11px] text-gray-500 mt-1">{error || "読み込み中…"}</p>
      </section>
    );
  }
  const isDirector = mode === "director" && data.isAdmin;
  const self = data.self?.matrix ?? null;
  const agreed = data.review.agreed[0] ?? null;
  const markers: MatrixMarker[] = [];
  if (agreed) markers.push({ s: agreed.s, m: agreed.m, label: "合意", color: "#0f766e" });
  if (self?.s && self?.m) markers.push({ s: self.s, m: self.m, label: "自己評価", color: "#7c3aed", hollow: true });

  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50/30 p-3 space-y-3" data-position-card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-gray-900">🧭 現在地（成長マトリクス）</h2>
        <Link href="/hr/matrix" className="text-[11px] text-teal-800 underline underline-offset-2">確定版の全文</Link>
      </div>
      <p className="text-[10px] text-gray-600">{isDirector ? "本人と院長だけが見られます（担当幹部には出しません）。" : "あなたと院長だけが見られます。"}移行はチェックの数ではなく対話で合意します。位置や等級で他の人と比べたり並べ替えたりはしません。</p>
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}

      {/* 等級・キャリアライン */}
      <div className="rounded-lg border border-gray-200 bg-white p-2 flex flex-wrap items-center gap-3 text-[12px] text-gray-900" data-position-grade>
        <span>
          等級: <strong>{data.grade.grade || "未設定"}</strong>
        </span>
        <span>
          キャリアライン: <strong>{data.grade.careerLine || "未設定"}</strong>
        </span>
        {data.transition && <span className="text-[11px] text-gray-600">次の移行: {transitionLabel(data.transition)}</span>}
        {isDirector && (
          <span className="flex flex-wrap gap-2 ml-auto">
            <select value={data.grade.grade} disabled={busy} onChange={(e) => void run(async () => { await patch({ grade: e.target.value }); return "等級を保存しました"; })} className="border border-gray-200 rounded-lg px-2 py-1 text-[12px]" aria-label="等級">
              <option value="">等級 未設定</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <select value={data.grade.careerLine} disabled={busy} onChange={(e) => void run(async () => { await patch({ careerLine: e.target.value }); return "キャリアラインを保存しました"; })} className="border border-gray-200 rounded-lg px-2 py-1 text-[12px]" aria-label="キャリアライン">
              <option value="">キャリアライン 未設定</option>
              {CAREER_LINES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </span>
        )}
      </div>

      {/* 図＋位置 */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_16em] gap-2 items-start">
        <GrowthMatrixFigure compact markers={markers} />
        <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-1 text-[12px] text-gray-900" data-position-summary>
          <p>合意した位置: <strong>{agreed ? `${agreed.s} × ${agreed.m}` : "未記録"}</strong>{agreed && <span className="block text-[10px] text-gray-500">{MEETING_LABEL[agreed.meeting]} {agreed.date.replaceAll("-", "/")}</span>}</p>
          <p>本人の自己評価: <strong>{self?.s && self?.m ? `${self.s} × ${self.m}` : "未記入"}</strong>{data.self && <span className="block text-[10px] text-gray-500">{data.self.periodLabel} {data.self.status === "submitted" ? "提出済み" : "下書き"}</span>}</p>
          {self?.nextAxis && <p>次に伸ばす軸: <strong>{NEXT_AXIS_LABEL[self.nextAxis]}</strong>{self.nextAxisReason && <span className="block text-[11px] text-gray-700 whitespace-pre-wrap">{self.nextAxisReason}</span>}</p>}
          {data.review.agreed.length > 1 && (
            <details className="text-[11px] text-gray-600">
              <summary className="cursor-pointer">合意の履歴</summary>
              <ul className="list-disc pl-4">
                {data.review.agreed.map((a, i) => (
                  <li key={i}>{a.date.replaceAll("-", "/")} {MEETING_LABEL[a.meeting]}: {a.s} × {a.m}{a.note ? `（${a.note}）` : ""}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>

      {/* 院長: 合意した位置の記録 */}
      {isDirector && (
        <div className="rounded-lg border border-teal-200 bg-white p-2 space-y-1.5" data-agree-form>
          {/* 220 §2-4: ふだんは隠し、押したときだけ開く */}
          <OpenOnDemand openLabel="＋ 合意した位置を記録する（半期面談・年次対話）" testId="agree-form">
          <div className="flex flex-wrap gap-2 text-[12px]">
            <select value={agree.s} onChange={(e) => setAgree((a) => ({ ...a, s: e.target.value as SLevel | "" }))} className="border border-gray-200 rounded-lg px-2 py-1" aria-label="合意した横軸">
              <option value="">S?</option>
              {(["S1", "S2", "S3", "S4", "S5"] as const).map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={agree.m} onChange={(e) => setAgree((a) => ({ ...a, m: e.target.value as MLevel | "" }))} className="border border-gray-200 rounded-lg px-2 py-1" aria-label="合意した縦軸">
              <option value="">M?</option>
              {(["M1", "M2", "M3", "M4", "M5"] as const).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={agree.meeting} onChange={(e) => setAgree((a) => ({ ...a, meeting: e.target.value as MeetingType }))} className="border border-gray-200 rounded-lg px-2 py-1" aria-label="面談の種類">
              <option value="half">{MEETING_LABEL.half}</option>
              <option value="annual">{MEETING_LABEL.annual}</option>
            </select>
            <input type="date" value={agree.date} onChange={(e) => setAgree((a) => ({ ...a, date: e.target.value }))} className="border border-gray-200 rounded-lg px-2 py-1" aria-label="面談の日付" />
            <input value={agree.note} onChange={(e) => setAgree((a) => ({ ...a, note: e.target.value }))} placeholder="メモ（任意）" className="border border-gray-200 rounded-lg px-2 py-1 flex-1 min-w-[10em]" aria-label="合意のメモ" />
            <button type="button" disabled={busy || !agree.s || !agree.m || !agree.date} onClick={() => void run(async () => { await patch({ agreed: agree }); setAgree((a) => ({ ...a, note: "" })); return "合意した位置を記録しました"; })} className="px-3 py-1.5 bg-teal-600 text-white rounded-full text-[12px] hover:bg-teal-700 disabled:opacity-40 min-h-[36px]" data-agree-save>
              💾 記録
            </button>
          </div>
          </OpenOnDemand>
        </div>
      )}

      {/* ゲート（220 §2-5: 長いので最初はたたむ） */}
      <Collapsible
        title={`必須の学び（ゲート）${data.transition ? `— ${transitionLabel(data.transition)}` : ""}`}
        note={`${data.gates.filter((g) => g.ok).length}/${data.gates.length} 達成`}
        testId="gates"
      >
      <div className="space-y-1.5" data-position-gates>
        <GateStatusList gates={data.gates} transition={data.transition} tableMissing={data.gatesTableMissing} />
        {isDirector && data.gates.some((g) => g.gate.kind === "license" || g.gate.kind === "director") && (
          <div className="space-y-1.5 pt-1 border-t border-gray-100" data-gate-check-form>
            {/* 220 §2-4: ふだんは隠し、押したときだけ開く */}
            <OpenOnDemand openLabel="✏️ 資格・院長の確認を記録する" testId="gate-check">
            {data.gates.filter((g) => g.gate.kind === "license" || g.gate.kind === "director").map((g) => {
              const st = gateCheck[g.gate.id] ?? { checkedOn: g.check?.checkedOn ?? "", note: g.check?.note ?? "" };
              return (
                <div key={g.gate.id} className="grid grid-cols-1 sm:grid-cols-[1fr_9em_1fr_auto_auto] gap-1 items-center text-[11px]" data-gate-check={g.gate.id}>
                  <span className="text-gray-800">{g.gate.label}</span>
                  <input type="date" value={st.checkedOn} onChange={(e) => setGateCheck((s) => ({ ...s, [g.gate.id]: { ...st, checkedOn: e.target.value } }))} className="border border-gray-200 rounded px-1 py-1" aria-label={`${g.gate.label} の確認日`} />
                  <input value={st.note} onChange={(e) => setGateCheck((s) => ({ ...s, [g.gate.id]: { ...st, note: e.target.value } }))} placeholder="根拠" className="border border-gray-200 rounded px-1 py-1" aria-label={`${g.gate.label} の根拠`} />
                  <button type="button" disabled={busy} onClick={() => void run(async () => { await api("/api/growth/gates", { method: "PUT", body: JSON.stringify({ check: { userId: data.userId, gateId: g.gate.id, ok: true, checkedOn: st.checkedOn, note: st.note } }) }); return `○にしました: ${g.gate.label}`; })} className="px-2 py-1 bg-teal-600 text-white rounded-full disabled:opacity-40 min-h-[32px]" aria-label={`${g.gate.label} を○にする`}>
                    ○
                  </button>
                  <button type="button" disabled={busy || !g.check?.ok} onClick={() => void run(async () => { await api("/api/growth/gates", { method: "PUT", body: JSON.stringify({ check: { userId: data.userId, gateId: g.gate.id, ok: false, checkedOn: "", note: "" } }) }); return `×に戻しました: ${g.gate.label}`; })} className="px-2 py-1 border border-gray-300 text-gray-700 rounded-full disabled:opacity-40 min-h-[32px]" aria-label={`${g.gate.label} を×にする`}>
                    ×
                  </button>
                </div>
              );
            })}
            </OpenOnDemand>
          </div>
        )}
      </div>
      </Collapsible>

      {/* 193 B-2: 等級ごとの要件表（本人の次の移行を強調して開く。項目の横に本人の到達／途上と院長の確認） */}
      <Collapsible title="等級ごとの要件表" note="長い表です" testId="requirements">
      <div data-position-requirements>
        <GrowthRequirementsTable
          mode="card"
          highlight={data.transition}
          marks={(key) => {
            const st = self?.items[key];
            const rv = data.review.itemReviews[key];
            return st?.status || rv ? { self: st?.status, review: rv } : undefined;
          }}
          gateMark={(label) => {
            const g = data.gates.find((x) => x.gate.label === label);
            return g ? { ok: g.ok, dates: gateDateParts(g) } : undefined;
          }}
        />
      </div>
      </Collapsible>

      {/* 到達状態と根拠 */}
      <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-1.5" data-position-items>
        <p className="text-[12px] font-medium text-gray-800">到達状態と根拠の記録{data.transition ? `— ${transitionLabel(data.transition)}` : ""}</p>
        {!data.transition || data.items.length === 0 ? (
          <p className="text-[11px] text-gray-500">次の移行が決まると項目が出ます。</p>
        ) : !self ? (
          <p className="text-[11px] text-gray-500">本人の自己評価シート（成長マトリクスの位置と根拠）はまだ記入されていません。</p>
        ) : (
          <ul className="space-y-1.5">
            {data.items.map((item) => {
              const st = self.items[item.key] ?? { status: "", evidence: [] };
              const rv: ItemReview = data.review.itemReviews[item.key] ?? "";
              return (
                <li key={item.key} className="text-[12px] text-gray-900 rounded-md border border-gray-100 p-1.5" data-position-item data-status={st.status} data-review={rv}>
                  <p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full mr-1 ${item.axis === "s" ? "bg-cyan-100 text-cyan-900" : "bg-amber-100 text-amber-900"}`}>{item.axis === "s" ? "横" : "縦"}</span>
                    {plainItemText(item.text)}
                    <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded ${st.status === "reached" ? "bg-teal-100 text-teal-900" : st.status === "in_progress" ? "bg-gray-100 text-gray-700" : "bg-gray-50 text-gray-400"}`}>{st.status === "reached" ? "到達（本人）" : st.status === "in_progress" ? "途上（本人）" : "未記入"}</span>
                    {rv && !isDirector && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-900">✓ {ITEM_REVIEW_LABEL[rv]}（院長）</span>}
                  </p>
                  {st.evidence.length > 0 && (
                    <ul className="list-disc pl-5 text-[11px] text-gray-700">
                      {st.evidence.map((e, i) => (
                        <li key={i}>{e.date.replaceAll("-", "/")} {e.scene}{e.linkKind ? "（記録に紐づけ）" : ""}</li>
                      ))}
                    </ul>
                  )}
                  {/* 194 B: 印が無いときは「確認」「対話で確かめる」の2つだけ（枠線）。印があるときは印＋小さく「取り消す」 */}
                  {isDirector && !rv && (
                    <div className="flex gap-2 mt-1" data-review-buttons>
                      {(["confirmed", "dialogue"] as const).map((v) => (
                        <button key={v} type="button" disabled={busy} onClick={() => void run(async () => { await patch({ itemReviews: { [item.key]: v } }); return `「${ITEM_REVIEW_LABEL[v]}」を付けました`; })} className="text-[11px] px-2 py-1 rounded-full border border-violet-300 text-violet-900 hover:bg-violet-50 min-h-[28px] disabled:opacity-40" aria-label={`${item.text} を${ITEM_REVIEW_LABEL[v]}にする`}>
                          {ITEM_REVIEW_LABEL[v]}
                        </button>
                      ))}
                    </div>
                  )}
                  {isDirector && rv && (
                    <div className="flex items-center gap-2 mt-1" data-review-set>
                      <span className="text-[11px] px-2 py-1 rounded-full bg-violet-600 text-white">✓ {ITEM_REVIEW_LABEL[rv]}（院長）</span>
                      <button type="button" disabled={busy} onClick={() => void run(async () => { await patch({ itemReviews: { [item.key]: "" } }); return "確認を取り消しました"; })} className="text-[10px] text-gray-600 underline underline-offset-2 disabled:opacity-40" aria-label={`${item.text} の確認を取り消す`}>
                        取り消す
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
