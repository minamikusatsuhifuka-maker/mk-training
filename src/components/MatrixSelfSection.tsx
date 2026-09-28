"use client";
// 自己評価シートの「成長マトリクスの位置と根拠」（指示書190 C・ルール1〜3）
//   1. 自分の位置（図の上で S◯×M◯ を選ぶ）
//   2. 次に伸ばす軸（横／縦／両方）と理由 → 185 の年間目標へつなげられる
//   3. 次の移行の到達状態（確定版 第4節の各項目）: 「到達」「途上」。「到達」には根拠（日付・場面）が最低1つ（ルール1）。
//      「安定して」「継続して」を含む項目は直近2半期の根拠（ルール2）。既存の記録（学び・目標・FB・約束）を紐づけられる。
//   画面に到達の数・割合・点数は出さない（確定版 第6節）。

import { useEffect, useState } from "react";
import Link from "next/link";
import { GrowthMatrixFigure } from "@/components/GrowthMatrixFigure";
import {
  EVIDENCE_MAX,
  NEXT_AXIS_LABEL,
  TRANSITIONS,
  attainmentItemsOf,
  canMarkReached,
  isValidEvidence,
  plainItemText,
  recentHalves,
  transitionLabel,
  type Evidence,
  type EvidenceLinkKind,
  type MLevel,
  type MatrixSelf,
  type NextAxis,
  type SLevel,
  type TransitionKey,
} from "@/lib/growth-matrix";
import { createGoalApi, fetchFeedbackApi, fetchGoalsApi, fetchLearningApi, fetchPromisesApi } from "@/lib/staff-growth-client";

export type LinkOption = { kind: EvidenceLinkKind; id: string; label: string; date: string };

const input = "w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] bg-white disabled:bg-gray-50 disabled:text-gray-600";

export function MatrixSelfSection({ value, onChange, locked, today }: { value: MatrixSelf; onChange: (next: MatrixSelf) => void; locked: boolean; today: string }) {
  const [links, setLinks] = useState<LinkOption[]>([]);
  const [goalMsg, setGoalMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // 既存の記録（紐づけ候補）。マイ成長記録のフラグがOFFなら取れない＝自由記述だけ
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: LinkOption[] = [];
      try {
        const l = await fetchLearningApi();
        for (const r of l.records) out.push({ kind: "learning", id: r.id, label: `学び: ${l.courses.find((c) => c.id === r.courseId)?.name ?? "講座"}`, date: r.startDate });
      } catch {
        /* 取れないときは候補なし */
      }
      try {
        const g = await fetchGoalsApi();
        for (const x of g.goals) out.push({ kind: "goal", id: x.id, label: `目標: ${x.title}`, date: x.dueDate || x.createdAt.slice(0, 10) });
      } catch {
        /* */
      }
      try {
        const f = await fetchFeedbackApi();
        for (const x of f.feedback) out.push({ kind: "feedback", id: x.id, label: `FB: ${x.fact.slice(0, 40)}`, date: x.date });
      } catch {
        /* */
      }
      try {
        const p = await fetchPromisesApi();
        for (const x of p.promises) out.push({ kind: "promise", id: x.oneOnOneKey, label: `1on1の約束: ${x.text.slice(0, 40)}`, date: x.heldOn });
      } catch {
        /* */
      }
      if (alive) setLinks(out.sort((a, b) => b.date.localeCompare(a.date)));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const items = value.transition ? attainmentItemsOf(value.transition) : [];
  const [curHalf, prevHalf] = recentHalves(today);
  const setItem = (key: string, patch: Partial<{ status: "" | "reached" | "in_progress"; evidence: Evidence[] }>) =>
    onChange({ ...value, items: { ...value.items, [key]: { ...(value.items[key] ?? { status: "" as const, evidence: [] }), ...patch } } });

  const linkToGoal = async () => {
    if (!value.nextAxis) return;
    setBusy(true);
    setGoalMsg("");
    try {
      await createGoalApi({
        level: "annual",
        title: `次に伸ばす軸: ${NEXT_AXIS_LABEL[value.nextAxis]}`,
        detail: value.nextAxisReason,
        why: `成長マトリクスの自己評価（${value.s || "S?"} × ${value.m || "M?"}）から`,
      });
      setGoalMsg("🎯 年間目標に追加しました（マイ成長記録の「目標」で確認できます）");
    } catch (e) {
      setGoalMsg(e instanceof Error ? `年間目標に追加できませんでした: ${e.message}` : "年間目標に追加できませんでした");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 space-y-4" data-matrix-self>
      <h2 className="text-sm font-semibold text-gray-800">🧭 成長マトリクスの位置と根拠</h2>
      <p className="text-[12px] text-gray-600 leading-relaxed">
        いま自分は横軸 S◯・縦軸 M◯ にいるか、図の上で選びます。次にどちらの軸を伸ばすかを書き、次の移行の到達状態について「到達」「途上」を自己評価します。
        「到達」にするには根拠となる事実（日付・場面）が最低1つ必要です。事実が示せない項目は「途上」として次の目標にします。移行の可否はチェックの数で決めず、院長との対話で合意します。
        全文は <Link href="/hr/matrix" className="text-teal-700 underline underline-offset-2">成長マトリクス</Link> へ。
      </p>

      {/* 1. 位置 */}
      <div className="space-y-2" data-matrix-position>
        <p className="text-[12px] font-medium text-gray-800">1. マトリクス上の自分の位置（図のマスを押して選ぶ）</p>
        <GrowthMatrixFigure compact picked={{ s: value.s, m: value.m }} onPick={locked ? undefined : (s, m) => onChange({ ...value, s, m })} markers={value.s && value.m ? [{ s: value.s, m: value.m, label: "自己評価", color: "#7c3aed" }] : []} />
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-gray-800">
          <label>
            横軸
            <select value={value.s} disabled={locked} onChange={(e) => onChange({ ...value, s: e.target.value as SLevel | "" })} className="ml-1 border border-gray-200 rounded-lg px-2 py-1 text-[12px]" aria-label="横軸の位置">
              <option value="">未選択</option>
              {(["S1", "S2", "S3", "S4", "S5"] as const).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            縦軸
            <select value={value.m} disabled={locked} onChange={(e) => onChange({ ...value, m: e.target.value as MLevel | "" })} className="ml-1 border border-gray-200 rounded-lg px-2 py-1 text-[12px]" aria-label="縦軸の位置">
              <option value="">未選択</option>
              {(["M1", "M2", "M3", "M4", "M5"] as const).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* 2. 次に伸ばす軸 */}
      <div className="space-y-2" data-matrix-next-axis>
        <p className="text-[12px] font-medium text-gray-800">2. 次に伸ばす軸</p>
        <div className="flex flex-wrap gap-3 text-[12px] text-gray-800">
          {(["s", "m", "both"] as const).map((a) => (
            <label key={a} className="flex items-center gap-1">
              <input type="radio" name="next-axis" disabled={locked} checked={value.nextAxis === a} onChange={() => onChange({ ...value, nextAxis: a as NextAxis })} />
              {NEXT_AXIS_LABEL[a]}
            </label>
          ))}
        </div>
        <textarea value={value.nextAxisReason} disabled={locked} onChange={(e) => onChange({ ...value, nextAxisReason: e.target.value })} rows={2} placeholder="その理由" className={input} aria-label="次に伸ばす軸の理由" />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void linkToGoal()} disabled={busy || !value.nextAxis} className="text-[12px] px-3 py-1.5 border border-teal-300 text-teal-800 rounded-full hover:bg-teal-50 disabled:opacity-40 min-h-[36px]" data-link-goal>
            🎯 年間目標につなげる（185）
          </button>
          {goalMsg && <span className="text-[11px] text-gray-700">{goalMsg}</span>}
        </div>
      </div>

      {/* 3. 到達状態 */}
      <div className="space-y-2" data-matrix-items>
        <p className="text-[12px] font-medium text-gray-800">3. 次の移行の到達状態</p>
        <label className="text-[12px] text-gray-800">
          次の移行
          <select value={value.transition} disabled={locked} onChange={(e) => onChange({ ...value, transition: e.target.value as TransitionKey | "" })} className="ml-1 border border-gray-200 rounded-lg px-2 py-1 text-[12px]" aria-label="次の移行">
            <option value="">未選択</option>
            {TRANSITIONS.map((t) => (
              <option key={t.key} value={t.key}>
                {transitionLabel(t.key)}（目標位置 {t.target.s} × {t.target.m}）
              </option>
            ))}
          </select>
        </label>
        {value.transition && (
          <ul className="space-y-2">
            {items.map((item) => {
              const self = value.items[item.key] ?? { status: "" as const, evidence: [] };
              const check = canMarkReached(item, self, today);
              return (
                <li key={item.key} className="rounded-lg border border-gray-200 p-2 space-y-1.5" data-matrix-item data-axis={item.axis} data-stable={item.stable ? "1" : "0"} data-status={self.status}>
                  <p className="text-[12px] text-gray-900">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full mr-1 ${item.axis === "s" ? "bg-cyan-100 text-cyan-900" : "bg-amber-100 text-amber-900"}`}>{item.axis === "s" ? "横軸" : "縦軸"}</span>
                    {plainItemText(item.text)}
                  </p>
                  {item.stable && (
                    <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1" data-stable-note>
                      「安定して」「継続して」を含む項目です。直近2半期（{prevHalf}・{curHalf}）それぞれの根拠を入れてください。
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-3 text-[12px] text-gray-800">
                    <label className={`flex items-center gap-1 ${!check.ok ? "text-gray-400" : ""}`} title={check.ok ? "" : check.reason}>
                      <input type="radio" name={`st-${item.key}`} disabled={locked || !check.ok} checked={self.status === "reached"} onChange={() => setItem(item.key, { status: "reached" })} aria-label={`${item.text} を到達にする`} />
                      到達
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="radio" name={`st-${item.key}`} disabled={locked} checked={self.status === "in_progress"} onChange={() => setItem(item.key, { status: "in_progress" })} aria-label={`${item.text} を途上にする`} />
                      途上
                    </label>
                    {!check.ok && <span className="text-[11px] text-gray-500" data-reach-block>{check.reason}</span>}
                  </div>
                  <div className="space-y-1">
                    {self.evidence.map((ev, i) => (
                      <div key={i} className="grid grid-cols-1 sm:grid-cols-[9em_1fr_auto] gap-1" data-evidence data-valid={isValidEvidence(ev) ? "1" : "0"}>
                        <input type="date" value={ev.date} disabled={locked} onChange={(e) => setItem(item.key, { evidence: self.evidence.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) })} className={input} aria-label="根拠の日付" />
                        <input value={ev.scene} disabled={locked} onChange={(e) => setItem(item.key, { evidence: self.evidence.map((x, j) => (j === i ? { ...x, scene: e.target.value } : x)) })} placeholder="場面（何があったか）" className={input} aria-label="根拠の場面" />
                        <button type="button" disabled={locked} onClick={() => setItem(item.key, { evidence: self.evidence.filter((_, j) => j !== i) })} className="text-[11px] text-gray-600 underline underline-offset-2 disabled:opacity-40">
                          削除
                        </button>
                        {ev.linkKind && <p className="sm:col-span-3 text-[11px] text-teal-800">🔗 {ev.linkLabel}</p>}
                      </div>
                    ))}
                    {!locked && self.evidence.length < EVIDENCE_MAX && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setItem(item.key, { evidence: [...self.evidence, { date: "", scene: "", linkKind: "", linkId: "", linkLabel: "" }] })} className="text-[11px] text-teal-800 underline underline-offset-2 min-h-[28px]" data-add-evidence>
                          ＋ 根拠（日付・場面）を追加
                        </button>
                        {links.length > 0 && (
                          <select
                            value=""
                            onChange={(e) => {
                              const l = links.find((x) => `${x.kind}:${x.id}` === e.target.value);
                              if (l) setItem(item.key, { evidence: [...self.evidence, { date: l.date, scene: l.label, linkKind: l.kind, linkId: l.id, linkLabel: l.label }] });
                            }}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-[11px]"
                            aria-label="既存の記録を根拠に紐づける"
                          >
                            <option value="">既存の記録を紐づける…</option>
                            {links.map((l) => (
                              <option key={`${l.kind}:${l.id}`} value={`${l.kind}:${l.id}`}>
                                {l.date} {l.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
