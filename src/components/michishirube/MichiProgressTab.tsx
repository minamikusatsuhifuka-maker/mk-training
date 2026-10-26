"use client";

// 🧭 可能性ノートの「🧭 道しるべ」タブ（指示書270 第2部）
// 本人（わたしの可能性ノート）と、院長・1on1を担当する幹部（可能性ノート）で同じ部品を使う。
// 何を付けられるかは、サーバーが返す isSelf / canConfirm / canSetLevel に従う（判定はサーバーの applyMichiOp）。

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import { LearnTable, StepTable } from "./MichiParts";
import type { MichiLearn, MichiStep } from "@/lib/michishirube";
import { GROWTH_TAB_STORAGE_KEY } from "@/lib/growth-tabs";
import {
  MICHI_EVIDENCE_MAX,
  MICHI_HALF_GOALS_MAX,
  MICHI_NOTE_MAX,
  NOT_DECIDED_LABEL,
  STAGE_MARKS,
  SKILL_STAGES,
  learnComplete,
  stageFromReach,
  stepStatusLabel,
  stepStatusOf,
  type MichiStepStatus,
} from "@/lib/michi-progress";
import type { MichiProgressView } from "@/lib/michi-progress-server";

export async function fetchMichiView(userId?: string): Promise<MichiProgressView | null> {
  try {
    const res = await fetch(`/api/growth/michishirube${userId ? `?user=${encodeURIComponent(userId)}` : ""}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    return (await res.json()) as MichiProgressView;
  } catch {
    return null;
  }
}

async function putOp(body: Record<string, unknown>): Promise<MichiProgressView> {
  const res = await fetch("/api/growth/michishirube", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const j = (await res.json().catch(() => ({}))) as MichiProgressView & { error?: string };
  if (!res.ok) throw new Error(j.error || `保存できませんでした (${res.status})`);
  return j;
}

const statusTone: Record<MichiStepStatus, string> = {
  todo: "bg-slate-100 text-slate-600",
  doing: "bg-sky-50 text-sky-800",
  done: "bg-amber-50 text-amber-800",
  confirmed: "bg-teal-600 text-white",
};

export function MichiProgressTab({ userId }: { userId?: string }) {
  const [view, setView] = useState<MichiProgressView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [showNext, setShowNext] = useState(false);
  const [levelDraft, setLevelDraft] = useState<string | null>(null);

  const load = useCallback(async () => {
    setView(await fetchMichiView(userId));
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      setView(await putOp({ ...body, ...(userId ? { user: userId } : {}) }));
      setMsg(done);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <p className="text-xs text-gray-500">読み込み中…</p>;
  if (!view) return <p className="text-xs text-gray-500">🧭 道しるべを読み込めませんでした。</p>;

  const p = view.progress;
  const cur = view.current;
  const levelName = cur?.name ?? (p.level || NOT_DECIDED_LABEL);

  return (
    <div className="space-y-4" data-tab-panel="michishirube">
      {/* 今いる段 */}
      <section className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 space-y-2" data-michi-current>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-sm font-medium text-gray-900">🧭 今いる段</h2>
          <span className="text-lg font-bold text-teal-900" data-michi-level-label>
            {p.level ? levelName : NOT_DECIDED_LABEL}
          </span>
          {cur && <span className="text-xs text-teal-800">{cur.oneLine}</span>}
          <Link href={`/michishirube${p.level ? `?level=${encodeURIComponent(p.level)}` : ""}`} className="text-[11px] text-teal-800 underline underline-offset-2 ml-auto">
            🧭 成長の道しるべへ
          </Link>
        </div>
        {cur && (
          <p className="text-sm text-gray-800" data-michi-count>
            この段のステップ <strong>{view.confirmed}/{view.total}</strong> 確認済み
            {view.pending > 0 && <span className="ml-2 text-xs text-amber-800">（確認を待っているステップ {view.pending}件）</span>}
          </p>
        )}
        {view.canSetLevel && (
          <div className="flex flex-wrap items-center gap-2" data-michi-set-level>
            <select
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
              value={levelDraft ?? p.level}
              onChange={(e) => setLevelDraft(e.target.value)}
              aria-label="今いる段"
            >
              <option value="">{NOT_DECIDED_LABEL}</option>
              {view.levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || levelDraft === null || levelDraft === p.level}
              onClick={async () => {
                if (await run({ op: "level", level: levelDraft ?? "" }, "💾 今いる段を保存しました")) setLevelDraft(null);
              }}
              className="rounded-full bg-teal-600 px-3 py-1 text-xs text-white disabled:opacity-40"
            >
              保存
            </button>
            <span className="text-[11px] text-gray-500">今いる段を決められるのは院長だけです。</span>
          </div>
        )}
        {p.levelHistory.length > 0 && (
          <details className="text-[11px] text-gray-600">
            <summary className="cursor-pointer">段の歩み（{p.levelHistory.length}）</summary>
            <ul className="mt-1 space-y-0.5">
              {[...p.levelHistory].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`}>
                  {h.at.slice(0, 10).replaceAll("-", "/")}　{h.level || NOT_DECIDED_LABEL}（{h.byName}）
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2" role="alert">{error}</p>}
      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}

      {!cur ? (
        <p className="text-xs text-gray-600">今いる段が決まると、その段のステップ・技能の4段階・学びの3点セットを付けられます。</p>
      ) : (
        <>
          {/* 半期の目標（3つまで） */}
          <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-1.5" data-michi-half>
            <h3 className="text-sm font-medium text-gray-900">🎯 半期の目標に選んだステップ（{p.halfGoals.length}/{MICHI_HALF_GOALS_MAX}）</h3>
            {p.halfGoals.length === 0 ? (
              <p className="text-[11px] text-gray-500">
                {view.isSelf ? "今の段のステップから3つまで選べます（下の表の「☆ 半期の目標」）。" : "まだ選ばれていません。"}
              </p>
            ) : (
              <ul className="text-sm text-gray-800 space-y-0.5">
                {p.halfGoals.map((id) => {
                  const s = cur.steps.find((x) => x.id === id);
                  return (
                    <li key={id}>
                      <span className="font-mono text-xs text-gray-500 mr-1">{id}</span>
                      {s?.todo.replaceAll("**", "") ?? ""}
                      <span className="ml-1 text-[11px] text-gray-500">（{stepStatusLabel(stepStatusOf(p, id))}）</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ステップ */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-gray-900">ステップ（{cur.id}）</h3>
            <StepTable
              steps={cur.steps}
              whenLabel={cur.whenLabel}
              cardsOnly
              aside={{ head: "進み具合", cell: (s) => <StepCell key={s.id} step={s} view={view} busy={busy} run={run} /> }}
            />
          </section>

          {/* 技能の4段階 */}
          <section className="space-y-2" data-michi-skills-progress>
            <h3 className="text-sm font-bold text-gray-900">技能の4段階</h3>
            <p className="text-[11px] text-gray-600">
              {SKILL_STAGES.slice(1).join(" → ")}。①②は本人が、③④は院長と1on1を担当する人が付けます。
            </p>
            {view.skillLines.map((line) => {
              const col = line.columns.find((c) => c.level === view.reachLevel);
              return (
                <div key={line.id} className="space-y-1">
                  <h4 className="text-xs font-semibold text-gray-800">{line.label}</h4>
                  <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
                    {line.items.map((it) => {
                      const stage = p.skills[it.id]?.stage ?? 0;
                      const need = col ? stageFromReach(it.reach[col.level]) : 0;
                      const canPick = (v: number) => view.canConfirm || (view.isSelf && v <= 2 && stage <= 2);
                      return (
                        <li key={it.id} className="px-3 py-2 flex flex-wrap items-center gap-2 text-sm" data-skill-row={it.id}>
                          <span className="flex-1 min-w-[10rem] text-gray-800">{it.name}</span>
                          {col && (
                            <span className="text-[11px] text-gray-600" data-skill-reach>
                              {col.label}
                              {it.reach[col.level]}
                              {need > 0 &&
                                (stage >= need ? (
                                  <span className="ml-1 rounded-full bg-teal-600 px-1.5 text-white">届いている</span>
                                ) : (
                                  <span className="ml-1 rounded-full bg-gray-100 px-1.5 text-gray-600">まだ</span>
                                ))}
                            </span>
                          )}
                          <div className="flex gap-1" role="group" aria-label={`${it.name}の段階`}>
                            {[1, 2, 3, 4].map((v) => (
                              <button
                                key={v}
                                type="button"
                                disabled={busy || !canPick(v)}
                                onClick={() => run({ op: "skill", skillId: it.id, stage: stage === v ? 0 : v }, "💾 技能の段階を保存しました")}
                                className={`h-8 w-8 rounded-full border text-sm ${
                                  stage === v ? "border-teal-600 bg-teal-600 text-white" : stage > v ? "border-teal-200 bg-teal-50 text-teal-800" : "border-gray-200 bg-white text-gray-600"
                                } disabled:opacity-40`}
                                aria-pressed={stage === v}
                                title={SKILL_STAGES[v]}
                                data-stage={v}
                              >
                                {STAGE_MARKS[v]}
                              </button>
                            ))}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>

          {/* 学びの3点セット */}
          <section className="space-y-2" data-michi-learn-progress>
            <h3 className="text-sm font-bold text-gray-900">{cur.learnTitle || "学びのステップ（3点セットで完了）"}</h3>
            <LearnTable
              rows={cur.learnings}
              whenLabel={cur.learnWhenLabel}
              cardsOnly
              aside={{ head: "学ぶ・実践・分かち合う", cell: (l) => <LearnCell key={l.id} row={l} view={view} busy={busy} run={run} /> }}
            />
          </section>

          {/* 次の段（見るだけ） */}
          {view.next && (view.next.steps.length > 0 || view.next.learnings.length > 0) && (
            <section className="space-y-2">
              <button type="button" onClick={() => setShowNext((v) => !v)} className="text-xs text-teal-800 underline underline-offset-2" data-michi-next-toggle>
                {showNext ? "▲" : "▼"} 次の段（{view.next.id}）のステップを見る
              </button>
              {showNext && (
                <div className="space-y-2 opacity-90" data-michi-next>
                  <StepTable steps={view.next.steps} whenLabel={view.next.whenLabel} cardsOnly />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

type Run = (body: Record<string, unknown>, done: string) => Promise<boolean>;

function StepCell({ step, view, busy, run }: { step: MichiStep; view: MichiProgressView; busy: boolean; run: Run }) {
  const p = view.progress;
  const sp = p.steps[step.id];
  const status = stepStatusOf(p, step.id);
  const [writing, setWriting] = useState(false);
  const [evidence, setEvidence] = useState(sp?.evidence ?? "");
  const isHalf = p.halfGoals.includes(step.id);
  return (
    <div className="space-y-1.5" data-step-cell={step.id}>
      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ${statusTone[status]}`} data-step-status={status}>
        {stepStatusLabel(status)}
      </span>
      {sp?.evidence && (status === "done" || status === "confirmed") && (
        <p className="text-[11px] text-gray-700 leading-relaxed">
          <span className="text-gray-500">根拠となる事実：</span>
          {sp.evidence}
        </p>
      )}
      {sp?.confirmed && <p className="text-[10px] text-teal-800">確認：{sp.confirmed.byName}（{sp.confirmed.at.slice(0, 10).replaceAll("-", "/")}）</p>}
      {view.isSelf && status !== "confirmed" && (
        <div className="flex flex-wrap gap-1">
          {(["todo", "doing"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy || status === s}
              onClick={() => run({ op: "step", stepId: step.id, status: s }, "💾 保存しました")}
              className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] disabled:opacity-40"
              data-set-status={s}
            >
              {stepStatusLabel(s)}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => setWriting((v) => !v)}
            className="rounded-full border border-amber-300 px-2 py-0.5 text-[11px] text-amber-800 disabled:opacity-40"
            data-set-status="done"
          >
            {stepStatusLabel("done")}
          </button>
        </div>
      )}
      {writing && (
        <div className="space-y-1">
          <AutoGrowTextarea
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs"
            value={evidence}
            onChange={(v) => setEvidence(v.slice(0, MICHI_EVIDENCE_MAX))}
            minRows={2}
            ariaLabel="根拠となる事実"
          />
          <p className="text-[10px] text-gray-500">根拠となる事実（{evidence.trim().length}/{MICHI_EVIDENCE_MAX}字・必須）</p>
          <button
            type="button"
            disabled={busy || !evidence.trim()}
            onClick={async () => {
              if (await run({ op: "step", stepId: step.id, status: "done", evidence }, "💾 「できた」にしました")) setWriting(false);
            }}
            className="rounded-full bg-amber-600 px-3 py-0.5 text-[11px] text-white disabled:opacity-40"
            data-save-done
          >
            保存
          </button>
        </div>
      )}
      {view.canConfirm && status === "done" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run({ op: "step", stepId: step.id, status: "confirmed" }, "✅ 確認済みにしました")}
          className="rounded-full bg-teal-600 px-3 py-0.5 text-[11px] text-white disabled:opacity-40"
          data-confirm-step
        >
          ✅ 確認済みにする
        </button>
      )}
      {view.canConfirm && status === "confirmed" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run({ op: "step", stepId: step.id, status: "done" }, "確認済みを外しました")}
          className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] text-gray-600 disabled:opacity-40"
        >
          確認済みを外す
        </button>
      )}
      {view.isSelf && (
        <label className="flex items-center gap-1 text-[11px] text-gray-700">
          <input
            type="checkbox"
            checked={isHalf}
            disabled={busy || (!isHalf && p.halfGoals.length >= MICHI_HALF_GOALS_MAX)}
            onChange={() =>
              run(
                { op: "half", stepIds: isHalf ? p.halfGoals.filter((x) => x !== step.id) : [...p.halfGoals, step.id] },
                "💾 半期の目標を保存しました"
              )
            }
            data-half-toggle={step.id}
          />
          ☆ 半期の目標
        </label>
      )}
    </div>
  );
}

function LearnCell({ row, view, busy, run }: { row: MichiLearn; view: MichiProgressView; busy: boolean; run: Run }) {
  const lp = view.progress.learns[row.id];
  const [learn, setLearn] = useState(lp?.learn ?? false);
  const [practice, setPractice] = useState(lp?.practice ?? false);
  const [share, setShare] = useState(lp?.share ?? false);
  const [note, setNote] = useState(lp?.note ?? "");
  const complete = learnComplete(lp);
  const dirty = learn !== (lp?.learn ?? false) || practice !== (lp?.practice ?? false) || share !== (lp?.share ?? false) || note !== (lp?.note ?? "");
  return (
    <div className="space-y-1" data-learn-cell={row.id}>
      <div className="flex flex-wrap gap-2 text-[11px] text-gray-800">
        {(
          [
            ["① 学ぶ", learn, setLearn],
            ["② 実践", practice, setPractice],
            ["③ 分かち合う", share, setShare],
          ] as [string, boolean, (v: boolean) => void][]
        ).map(([label, v, set]) => (
          <label key={label} className="flex items-center gap-1">
            <input type="checkbox" checked={v} disabled={!view.isSelf || busy} onChange={(e) => set(e.target.checked)} />
            {label}
          </label>
        ))}
      </div>
      {view.isSelf ? (
        <>
          <input
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-[11px]"
            value={note}
            maxLength={MICHI_NOTE_MAX}
            placeholder="ひとこと（実践した場面・分かち合った場所）"
            onChange={(e) => setNote(e.target.value)}
            aria-label="ひとこと（実践した場面・分かち合った場所）"
          />
          {dirty && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run({ op: "learn", learnId: row.id, learn, practice, share, note }, "💾 学びの3点セットを保存しました")}
              className="rounded-full bg-teal-600 px-3 py-0.5 text-[11px] text-white disabled:opacity-40"
              data-save-learn
            >
              保存
            </button>
          )}
        </>
      ) : (
        lp?.note && <p className="text-[11px] text-gray-700">{lp.note}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {complete && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] text-white" data-learn-complete>完了</span>}
        {lp?.confirmed && (
          <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[11px] text-white" data-learn-confirmed>
            確認済み（{lp.confirmed.byName}）
          </span>
        )}
        {view.canConfirm && complete && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run({ op: "learnConfirm", learnId: row.id, confirmed: !lp?.confirmed }, lp?.confirmed ? "確認済みを外しました" : "✅ 確認済みにしました")}
            className="rounded-full border border-teal-600 px-2 py-0.5 text-[11px] text-teal-800 disabled:opacity-40"
            data-confirm-learn
          >
            {lp?.confirmed ? "確認済みを外す" : "✅ 確認済みにする"}
          </button>
        )}
      </div>
    </div>
  );
}

/** 1on1ノート・可能性ノートの1on1タブに出す小さな印（今いる段・確認を待っているステップ） */
export function MichiBrief({ userId, onOpen }: { userId?: string; onOpen?: () => void }) {
  const [view, setView] = useState<MichiProgressView | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchMichiView(userId).then((v) => alive && setView(v));
    return () => {
      alive = false;
    };
  }, [userId]);
  if (!view) return null;
  const label = view.current?.name ?? (view.progress.level || NOT_DECIDED_LABEL);
  const body = (
    <>
      🧭 今いる段：<strong className="font-semibold">{view.progress.level ? label : NOT_DECIDED_LABEL}</strong>
      {view.current && <>・確認を待っているステップ {view.pending}件</>}
    </>
  );
  const cls = "inline-flex flex-wrap items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] text-teal-900";
  return onOpen ? (
    <button type="button" onClick={onOpen} className={`${cls} hover:bg-teal-100`} data-michi-brief>
      {body}
    </button>
  ) : (
    <Link
      href={userId ? `/staff-growth/${encodeURIComponent(userId)}` : "/my-growth"}
      onClick={() => {
        // 開いた先で「🧭 道しるべ」タブを開く（可能性ノートはタブをその端末で覚えている）
        try {
          window.localStorage.setItem(userId ? GROWTH_TAB_STORAGE_KEY.staff : GROWTH_TAB_STORAGE_KEY.my, "michishirube");
        } catch {
          /* 覚えられない端末では概要が開く */
        }
      }}
      className={`${cls} hover:bg-teal-100`}
      data-michi-brief
    >
      {body}
    </Link>
  );
}

/** 270 §3-6: 可能性ノートの「🎯 目標」に、半期の目標に選んだ道しるべのステップを並べて出す（選んでいなければ何も出さない） */
export function MichiHalfGoalsList({ userId }: { userId?: string }) {
  const [view, setView] = useState<MichiProgressView | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchMichiView(userId).then((v) => alive && setView(v));
    return () => {
      alive = false;
    };
  }, [userId]);
  if (!view?.current || view.progress.halfGoals.length === 0) return null;
  const cur = view.current;
  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-1" data-michi-half-in-goals>
      <h3 className="text-xs font-semibold text-teal-900">🧭 半期の目標に選んだ道しるべのステップ（{cur.id}）</h3>
      <ul className="text-[12px] text-gray-800 space-y-0.5">
        {view.progress.halfGoals.map((id) => (
          <li key={id}>
            <span className="font-mono text-[11px] text-gray-500 mr-1">{id}</span>
            {cur.steps.find((s) => s.id === id)?.todo.replaceAll("**", "") ?? ""}
            <span className="ml-1 text-[11px] text-gray-500">（{stepStatusLabel(stepStatusOf(view.progress, id))}）</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── 1on1ノート：今月のテーマ（270 §3-6・§3-7） ───

/**
 * その1on1の「本人」の道しるべを取る。相手の道しるべを見られる人（院長・その人の1on1を担当する幹部）なら相手、
 * そうでなければ自分（スタッフが自分で記録する回）。どちらも見られなければ null。
 */
async function themeOwnerView(partnerId: string): Promise<MichiProgressView | null> {
  if (partnerId) {
    const v = await fetchMichiView(partnerId);
    if (v) return v;
  }
  return fetchMichiView();
}

export function MichiThemePicker({
  partnerId,
  value,
  onChange,
  disabled,
}: {
  partnerId: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [view, setView] = useState<MichiProgressView | null>(null);
  useEffect(() => {
    let alive = true;
    void themeOwnerView(partnerId).then((v) => {
      if (alive) setView(v);
    });
    return () => {
      alive = false;
    };
  }, [partnerId]);
  if (!view) return null;
  const cur = view.current;
  const half = cur ? cur.steps.filter((s) => view.progress.halfGoals.includes(s.id)) : [];
  const rest = cur ? cur.steps.filter((s) => !view.progress.halfGoals.includes(s.id)) : [];
  const text = (s: MichiStep) => `${s.id} ${s.todo.replaceAll("**", "")}`;
  return (
    <div className="space-y-1 rounded-xl border border-teal-200 bg-teal-50/30 p-3" data-michi-theme>
      <MichiBriefStatic view={view} userId={view.isSelf ? undefined : view.userId} />
      {cur && (
        <label className="block text-sm font-medium text-gray-800">
          🧭 今月のテーマ（道しるべのステップ）
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="mt-1 block w-full border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-normal"
            data-michi-theme-select
          >
            <option value="">選ばない</option>
            {half.length > 0 && (
              <optgroup label="半期の目標">
                {half.map((s) => (
                  <option key={s.id} value={s.id}>
                    {text(s)}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={`${cur.id} のステップ`}>
              {rest.map((s) => (
                <option key={s.id} value={s.id}>
                  {text(s)}
                </option>
              ))}
            </optgroup>
            {value && !cur.steps.some((s) => s.id === value) && <option value={value}>{value}</option>}
          </select>
        </label>
      )}
    </div>
  );
}

function MichiBriefStatic({ view, userId }: { view: MichiProgressView; userId?: string }) {
  const label = view.current?.name ?? (view.progress.level || NOT_DECIDED_LABEL);
  return (
    <Link
      href={userId ? `/staff-growth/${encodeURIComponent(userId)}` : "/my-growth"}
      onClick={() => {
        try {
          window.localStorage.setItem(userId ? GROWTH_TAB_STORAGE_KEY.staff : GROWTH_TAB_STORAGE_KEY.my, "michishirube");
        } catch {
          /* 覚えられない端末では概要が開く */
        }
      }}
      className="inline-flex flex-wrap items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] text-teal-900 hover:bg-teal-100"
      data-michi-brief
    >
      🧭 今いる段：<strong className="font-semibold">{view.progress.level ? label : NOT_DECIDED_LABEL}</strong>
      {view.current && <>・確認を待っているステップ {view.pending}件</>}
    </Link>
  );
}

// 道しるべの中身（ステップの文）を一度だけ読む（1on1の記録の一覧で、今月のテーマの文を出すため）
let stepTextCache: Promise<Map<string, string>> | null = null;
function loadStepTexts(): Promise<Map<string, string>> {
  if (!stepTextCache) {
    stepTextCache = fetch("/api/michishirube", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) return new Map<string, string>();
        const j = (await res.json()) as { content?: { levels: { steps: MichiStep[] }[] } };
        return new Map((j.content?.levels ?? []).flatMap((l) => l.steps.map((s) => [s.id, s.todo.replaceAll("**", "")] as [string, string])));
      })
      .catch(() => new Map<string, string>());
  }
  return stepTextCache;
}

/** 1on1の記録に付いた今月のテーマ（ステップ）を出す */
export function MichiThemeLabel({ stepId }: { stepId: string }) {
  const [text, setText] = useState("");
  useEffect(() => {
    let alive = true;
    void loadStepTexts().then((m) => {
      if (alive) setText(m.get(stepId) ?? "");
    });
    return () => {
      alive = false;
    };
  }, [stepId]);
  if (!stepId) return null;
  return (
    <p className="text-xs text-teal-900" data-michi-theme-label>
      🧭 今月のテーマ：<span className="font-mono text-[11px] text-gray-500 mr-1">{stepId}</span>
      {text}
    </p>
  );
}
