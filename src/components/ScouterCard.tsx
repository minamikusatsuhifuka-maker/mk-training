"use client";
// 🧭 適性検査（スカウター）カード（指示書188 4）— **院長のみ**（HiringDocsPanel と同じく isAdmin のときだけ描画）
//   受検日ごとに: 「原本を開く」（10分の署名URL）／転記結果のコンパクトな表／AIのポイント（3区分・根拠）と注記
//   ポイントは院長が文章を修正でき、「作り直す」で再生成。生成日・モデルを表示。
//   得点は検索・絞り込みに使わない（この画面で見るだけ）。

import { useCallback, useEffect, useState } from "react";
import { SCOUTER_NOTE, SCOUTER_SECTIONS, type ScouterPointItem, type ScouterPoints, type ScouterResult, type ScouterTranscript } from "@/lib/scouter";
import { ScouterTranscriptForm } from "@/components/ScouterTranscriptForm";

export const SCOUTER_SAVED_EVENT = "hiring:scouter-saved";

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
  return j;
}

const fmtDate = (s: string) => (s ? s.replaceAll("-", "/") : "");
const fmtAt = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

type PointsDraft = { strengths: ScouterPointItem[]; hints: ScouterPointItem[]; questions: ScouterPointItem[] };
const POINT_GROUPS: { key: keyof PointsDraft; label: string }[] = [
  { key: "strengths", label: "① 強みと活かし方" },
  { key: "hints", label: "② 関わり方のヒント（支援の工夫）" },
  { key: "questions", label: "③ 1on1で本人と確かめたい問い" },
];

function CompactTable({ r }: { r: ScouterResult }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" data-scouter-table>
      {SCOUTER_SECTIONS.map((s) => (
        <div key={s.key} className="rounded-md border border-gray-100 bg-gray-50/60 px-1.5 py-1">
          <p className="text-[10px] text-gray-500">{s.label}</p>
          <p className="text-[11px] text-gray-900 leading-snug">
            {s.scales.map((n) => (
              <span key={n} className="inline-block mr-2 whitespace-nowrap">
                {n} <strong>{r.sections[s.key][n] || "–"}</strong>
              </span>
            ))}
          </p>
        </div>
      ))}
      {r.negative.length > 0 && (
        <div className="rounded-md border border-gray-100 bg-gray-50/60 px-1.5 py-1">
          <p className="text-[10px] text-gray-500">6 ネガティブ傾向（転記のみ）</p>
          <p className="text-[11px] text-gray-900 leading-snug">
            {r.negative.map((x, i) => (
              <span key={i} className="inline-block mr-2 whitespace-nowrap">
                {x.name} <strong>{x.score || "–"}</strong>
              </span>
            ))}
          </p>
        </div>
      )}
      {(r.jobFit.length > 0 || r.power) && (
        <div className="rounded-md border border-gray-100 bg-gray-50/60 px-1.5 py-1">
          <p className="text-[10px] text-gray-500">7 職務適性 ／ 8 戦闘力</p>
          <p className="text-[11px] text-gray-900 leading-snug">
            {r.jobFit.map((x, i) => (
              <span key={i} className="inline-block mr-2 whitespace-nowrap">
                {x.name} <strong>{x.score || "–"}</strong>
              </span>
            ))}
            {r.power && (
              <span className="inline-block mr-2 whitespace-nowrap">
                戦闘力 <strong>{r.power}</strong>
              </span>
            )}
          </p>
        </div>
      )}
      {(r.honesty.score || r.honesty.comment) && (
        <div className="rounded-md border border-gray-100 bg-gray-50/60 px-1.5 py-1">
          <p className="text-[10px] text-gray-500">9 虚偽回答の傾向（転記のみ）</p>
          <p className="text-[11px] text-gray-900 leading-snug">
            {r.honesty.score && <strong className="mr-1">{r.honesty.score}</strong>}
            {r.honesty.comment}
          </p>
        </div>
      )}
      {r.comment && (
        <details className="sm:col-span-2 rounded-md border border-gray-100 bg-gray-50/60 px-1.5 py-1">
          <summary className="text-[10px] text-gray-600 cursor-pointer">人物像および人材活用に関するコメント（原文）</summary>
          <p className="text-[11px] text-gray-900 whitespace-pre-wrap mt-1">{r.comment}</p>
        </details>
      )}
    </div>
  );
}

function PointsView({ r, busy, aiEnabled, onRegenerate, onSave }: { r: ScouterResult; busy: boolean; aiEnabled: boolean; onRegenerate: () => Promise<void>; onSave: (d: PointsDraft) => Promise<void> }) {
  const [editing, setEditing] = useState<PointsDraft | null>(null);
  const p: ScouterPoints | null = r.points;
  return (
    <div className="rounded-md border border-violet-200 bg-violet-50/40 p-1.5 space-y-1.5" data-scouter-points>
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-[11px] font-medium text-violet-900">🪄 AIのポイント整理（関わり方のための参考メモ）</p>
        <div className="flex gap-1.5">
          {p && !editing && (
            <button type="button" onClick={() => setEditing({ strengths: p.strengths, hints: p.hints, questions: p.questions })} disabled={busy} className="px-2.5 py-1 border border-violet-300 text-violet-900 rounded-full text-[11px] hover:bg-white disabled:opacity-40 min-h-[32px]" data-points-edit>
              ✏️ 文章を修正
            </button>
          )}
          <button
            type="button"
            onClick={() => void onRegenerate()}
            disabled={busy || !aiEnabled}
            title={aiEnabled ? "" : "AI下書きの設定（有料枠の確認）がOFFのため実行できません（講座マスタ・設定でON）"}
            className="px-2.5 py-1 bg-violet-700 text-white rounded-full text-[11px] hover:bg-violet-800 disabled:opacity-40 min-h-[32px]"
            data-points-generate
          >
            {p ? "🔄 作り直す" : "🪄 ポイントを整理"}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-violet-900 bg-white/70 border border-violet-100 rounded p-1" data-scouter-note>
        {SCOUTER_NOTE}
      </p>
      {!p && <p className="text-[11px] text-gray-600">まだ整理していません。1〜5・7・8の得点だけから作ります（ネガティブ傾向・虚偽回答は使いません）。</p>}
      {p && !editing && (
        <div className="space-y-1.5">
          {POINT_GROUPS.map((g) => (
            <div key={g.key}>
              <p className="text-[11px] font-medium text-gray-800">{g.label}</p>
              {p[g.key].length === 0 ? (
                <p className="text-[11px] text-gray-500">（なし）</p>
              ) : (
                <ul className="list-disc pl-4 space-y-0.5">
                  {p[g.key].map((it, i) => (
                    <li key={i} className="text-[11px] text-gray-900">
                      {it.text}
                      {it.evidence && <span className="block text-[10px] text-gray-500">根拠: {it.evidence}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          <p className="text-[10px] text-gray-500">
            生成 {fmtAt(p.generatedAt)} ・ モデル {p.model || "–"}
            {p.editedAt ? ` ・ 院長が修正 ${fmtAt(p.editedAt)}` : ""}
          </p>
        </div>
      )}
      {editing && (
        <div className="space-y-2" data-points-editor>
          {POINT_GROUPS.map((g) => (
            <div key={g.key} className="space-y-1">
              <p className="text-[11px] font-medium text-gray-800">{g.label}</p>
              {editing[g.key].map((it, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_14em_auto] gap-1">
                  <textarea value={it.text} onChange={(e) => setEditing((d) => (d ? { ...d, [g.key]: d[g.key].map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) } : d))} rows={2} className="w-full rounded-md border border-gray-200 px-2 py-1 text-[12px] bg-white" aria-label={`${g.label} の本文`} />
                  <input value={it.evidence} onChange={(e) => setEditing((d) => (d ? { ...d, [g.key]: d[g.key].map((x, j) => (j === i ? { ...x, evidence: e.target.value } : x)) } : d))} placeholder="根拠（区分・尺度・得点）" className="w-full rounded-md border border-gray-200 px-2 py-1 text-[11px] bg-white" aria-label={`${g.label} の根拠`} />
                  <button type="button" onClick={() => setEditing((d) => (d ? { ...d, [g.key]: d[g.key].filter((_, j) => j !== i) } : d))} className="text-[11px] text-gray-600 underline underline-offset-2">
                    削除
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setEditing((d) => (d ? { ...d, [g.key]: [...d[g.key], { text: "", evidence: "" }] } : d))} className="text-[11px] text-teal-800 underline underline-offset-2">
                ＋ 追加
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => void onSave(editing).then(() => setEditing(null))} disabled={busy} className="px-3 py-1.5 bg-teal-600 text-white rounded-full text-[12px] hover:bg-teal-700 disabled:opacity-40 min-h-[36px]" data-points-save>
              💾 保存
            </button>
            <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-full text-[12px] min-h-[36px]">
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ScouterCard({ userId }: { userId: string }) {
  const [data, setData] = useState<{ results: ScouterResult[]; aiEnabled: boolean; tableMissing: boolean } | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<{ url: string; mimeType: string; fileName: string } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/admin/hiring/scouter?user=${encodeURIComponent(userId)}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, [userId]);
  useEffect(() => {
    void load();
    const onSaved = () => void load();
    window.addEventListener(SCOUTER_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(SCOUTER_SAVED_EVENT, onSaved);
  }, [load]);

  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(""), 4000);
  };
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setError("");
    try {
      flash(await fn());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "処理に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const openOriginal = async (r: ScouterResult) => {
    setError("");
    try {
      setViewer(await api(`/api/admin/hiring/file?id=${encodeURIComponent(r.docId)}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "原本を開けませんでした");
    }
  };

  if (!data) {
    return (
      <section id="scouter" className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3">
        <h2 className="text-sm font-medium text-gray-900">🧭 適性検査（スカウター）（院長のみ）</h2>
        <p className="text-[11px] text-gray-500 mt-1">{error || "読み込み中…"}</p>
      </section>
    );
  }

  return (
    <section id="scouter" className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3 space-y-2" data-scouter-card>
      <h2 className="text-sm font-medium text-gray-900">🧭 適性検査（スカウター）（院長のみ）</h2>
      <p className="text-[10px] text-gray-600 leading-relaxed">
        採用資料に登録した検査結果から転記した内容と、AIのポイント整理です。幹部には出ません。得点は検索・絞り込みに使いません。転記は「📁 採用資料」の「🪄 検査結果を取り込む」から。
      </p>
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      {msg && <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>}
      {data.results.length === 0 ? (
        <p className="text-[11px] text-gray-500">まだ転記した検査結果がありません。</p>
      ) : (
        <ul className="space-y-2">
          {data.results.map((r) => (
            <li key={r.id} className="rounded-lg border border-gray-200 bg-white p-2 space-y-1.5" data-scouter-result data-test-date={r.testDate}>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[12px] text-gray-900 flex-1 min-w-0">
                  受検日 <strong>{fmtDate(r.testDate) || "未設定"}</strong>
                  {r.testName && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-900">{r.testName}</span>}
                </p>
                <button type="button" onClick={() => void openOriginal(r)} disabled={!r.docId} className="px-3 py-1.5 border border-teal-300 text-teal-800 rounded-full text-[11px] hover:bg-teal-50 disabled:opacity-40 min-h-[36px]" data-scouter-open>
                  👁 原本を開く
                </button>
                <button type="button" onClick={() => setEditing(editing === r.id ? null : r.id)} disabled={busy} className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-full text-[11px] hover:bg-gray-50 disabled:opacity-40 min-h-[36px]">
                  ✏️ 転記を修正
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm("この検査結果の転記とポイント整理を削除します（原本の資料は残ります）。よろしいですか？")) return;
                    void run(async () => {
                      await api("/api/admin/hiring/scouter", { method: "DELETE", body: JSON.stringify({ id: r.id }) });
                      return "🗑 削除しました";
                    });
                  }}
                  disabled={busy}
                  className="px-3 py-1.5 border border-red-300 text-red-700 rounded-full text-[11px] hover:bg-red-50 disabled:opacity-40 min-h-[36px]"
                >
                  🗑 削除
                </button>
              </div>
              {editing === r.id ? (
                <ScouterTranscriptForm
                  initial={r}
                  busy={busy}
                  submitLabel="💾 修正を保存"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (t: ScouterTranscript) => {
                    await run(async () => {
                      await api("/api/admin/hiring/scouter", { method: "PATCH", body: JSON.stringify({ id: r.id, transcript: t }) });
                      return "💾 転記を保存しました";
                    });
                    setEditing(null);
                  }}
                />
              ) : (
                <CompactTable r={r} />
              )}
              <PointsView
                r={r}
                busy={busy}
                aiEnabled={data.aiEnabled}
                onRegenerate={() =>
                  run(async () => {
                    await api("/api/admin/hiring/scouter/points", { method: "POST", body: JSON.stringify({ id: r.id }) });
                    return "🪄 ポイントを整理しました（院長が修正できます）";
                  })
                }
                onSave={(d) =>
                  run(async () => {
                    await api("/api/admin/hiring/scouter", { method: "PATCH", body: JSON.stringify({ id: r.id, points: d }) });
                    return "💾 ポイントの文章を保存しました";
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
      {!data.aiEnabled && data.results.length > 0 && (
        <p className="text-[10px] text-gray-500" data-ai-disabled>
          🪄 ポイント整理は、179で院長が確認する「有料枠・学習に使われない契約」の設定がONのときだけ使えます（🗂 講座マスタ・設定）。
        </p>
      )}
      {viewer && (
        <div className="rounded-lg border border-gray-200 bg-white p-2 space-y-1" data-scouter-viewer>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-gray-700 truncate">{viewer.fileName}（リンクは10分で切れます）</p>
            <div className="flex gap-2 shrink-0">
              <a href={viewer.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-teal-800 underline underline-offset-2">別タブで開く</a>
              <button type="button" onClick={() => setViewer(null)} className="text-[11px] text-gray-700 underline underline-offset-2">閉じる</button>
            </div>
          </div>
          {viewer.mimeType === "application/pdf" ? (
            <iframe src={viewer.url} title={viewer.fileName} className="w-full h-[70vh] rounded border border-gray-200" />
          ) : viewer.mimeType === "text/plain" ? (
            <p className="text-[11px] text-gray-600">文章の資料は「別タブで開く」で確認してください。</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={viewer.url} alt={viewer.fileName} className="max-w-full max-h-[70vh] object-contain rounded border border-gray-200" />
          )}
        </div>
      )}
    </section>
  );
}
