"use client";

// 🌱 成長の行動例（成功の原則×行動例・考え方の例）と 今週の一歩
//
// ・ライブラリ：0. 土台（事実と解釈）→ 成功の八原則 → 成功の10の障害 → 成功の10の原則。本文は /api/success-principles（ログイン中のみ）
//   「問い：」「1on1の問い：」「※」の行は、そもそもスタッフ向けのデータに入っていない（管理画面のガイドだけに出る）
// ・考え方は「つい浮かぶ考え方 → 成長につながる考え方」を見分けやすく出す（文は .md のまま）
// ・検索は画面の中だけ（外部サービス・AIに渡さない）
// ・今週の一歩：本人だけ（Supabase の RLS）。表がまだ無い（SQL実行前）あいだは、ボタンもタブも出さない

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MarkdownView } from "@/components/deep-research/MarkdownView";
import { jstTodayYmd } from "@/lib/library";
import {
  LINE_LABEL,
  RESULT_LABEL,
  STEP_MEMO_MAX,
  STEP_TEXT_MAX,
  foundationParts,
  isActiveStep,
  isEndedStep,
  isStepable,
  searchSuccess,
  stepEndFor,
  stepPeriodLabel,
  type SuccessItem,
  type SuccessLine,
  type SuccessStaffData,
  type WeeklyStep,
} from "@/lib/success-principles";
import { cancelMyStep, loadMySteps, recordMyStep, setMyStep } from "@/lib/weekly-steps-client";

type Tab = "library" | "step";

function ThoughtLine({ l }: { l: SuccessLine }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-2" data-thought>
      <p className="text-[11px] text-gray-500">考え方</p>
      <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <p className="flex-1 rounded-md bg-white px-2 py-1.5 text-[13px] text-gray-500" data-thought-before>
          <span className="mr-1 text-[10px] text-gray-400">つい浮かぶ考え方</span>
          {l.before}
        </p>
        <span aria-hidden="true" className="self-center text-lg text-teal-600 sm:self-auto">
          →
        </span>
        <p className="flex-1 rounded-md border border-teal-200 bg-teal-50 px-2 py-1.5 text-[13px] font-medium text-teal-900" data-thought-after>
          <span className="mr-1 text-[10px] font-normal text-teal-700">成長につながる考え方</span>
          {l.after}
        </p>
      </div>
    </div>
  );
}

function ItemBody({ item, stepReady, onPick }: { item: SuccessItem; stepReady: boolean; onPick: (text: string) => void }) {
  return (
    <ul className="mt-2 space-y-2" data-item-body={item.id}>
      {item.lines.map((l, i) => (
        <li key={i} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {l.kind === "thought" ? (
              <ThoughtLine l={l} />
            ) : l.kind === "action" ? (
              <p className="text-[14px] leading-relaxed text-gray-800" data-line="action">
                <span aria-hidden="true" className="mr-1 text-teal-600">・</span>
                {l.text}
              </p>
            ) : (
              <p className={`text-[14px] leading-relaxed ${l.kind === "meaning" ? "text-gray-900" : "text-gray-800"}`} data-line={l.kind}>
                <span className="mr-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{LINE_LABEL[l.kind]}</span>
                {l.text}
              </p>
            )}
          </div>
          {stepReady && isStepable(l.kind) && (
            <button
              type="button"
              onClick={() => onPick(l.kind === "thought" ? (l.after ?? l.text) : l.text)}
              className="shrink-0 rounded-full border border-teal-300 bg-white px-2.5 py-1 text-[11px] text-teal-800 hover:bg-teal-50 min-h-[32px]"
              data-pick
            >
              今週の一歩にする
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Highlight({ before, match, after }: { before: string; match: string; after: string }) {
  return (
    <span>
      {before}
      <mark className="rounded bg-amber-200 px-0.5 text-gray-900">{match}</mark>
      {after}
    </span>
  );
}

export function GrowthActionsBoard() {
  const today = jstTodayYmd();
  const [data, setData] = useState<SuccessStaffData | null>(null);
  const [loadError, setLoadError] = useState("");
  const params = useSearchParams();
  // ホームの「今週の一歩」から来たら、そのタブを開く（表が無ければ行動例のまま）
  const [tab, setTab] = useState<Tab>(params.get("tab") === "step" ? "step" : "library");
  const [openCat, setOpenCat] = useState<string>("c0");
  const [openItem, setOpenItem] = useState<string>("");
  const [query, setQuery] = useState("");
  const [qCat, setQCat] = useState("");
  // 今週の一歩
  const [steps, setSteps] = useState<WeeklyStep[] | null>(null);
  const [stepReady, setStepReady] = useState(false);
  const [stepError, setStepError] = useState("");
  const [pick, setPick] = useState<{ text: string; source: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [records, setRecords] = useState<Record<string, { result: "done" | "more" | null; memo: string }>>({});
  const jumpRef = useRef<string>("");

  useEffect(() => {
    let alive = true;
    fetch("/api/success-principles", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { data: SuccessStaffData }) => alive && setData(j.data))
      .catch(() => alive && setLoadError("読み込めませんでした。読み込み直してください"));
    return () => {
      alive = false;
    };
  }, []);

  const loadSteps = useCallback(async () => {
    try {
      const r = await loadMySteps();
      setStepReady(r.ready);
      setSteps(r.ready ? r.steps : []);
      setStepError("");
    } catch (e) {
      setStepReady(false);
      setStepError(e instanceof Error ? e.message : "今週の一歩を読めませんでした");
    }
  }, []);
  useEffect(() => {
    void loadSteps();
  }, [loadSteps]);

  const current = useMemo(() => (steps ?? []).find((s) => isActiveStep(s, today)) ?? null, [steps, today]);
  const past = useMemo(() => (steps ?? []).filter((s) => isEndedStep(s, today)), [steps, today]);
  const hits = useMemo(() => (data ? searchSuccess(data, query, qCat) : []), [data, query, qCat]);

  // 検索結果を押したら、そのカテゴリーと項目を開いて、そこへ動く
  useEffect(() => {
    if (!jumpRef.current) return;
    const id = jumpRef.current;
    jumpRef.current = "";
    requestAnimationFrame(() => document.getElementById(`sp-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [openCat, openItem]);

  const jump = (categoryId: string, itemId: string) => {
    setTab("library");
    setOpenCat(categoryId);
    setOpenItem(itemId);
    jumpRef.current = itemId;
    if (categoryId === openCat && itemId === openItem)
      requestAnimationFrame(() => document.getElementById(`sp-${itemId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const savePick = async () => {
    if (!pick) return;
    setBusy(true);
    setStepError("");
    try {
      await setMyStep(pick.text, pick.source, today, current);
      setPick(null);
      setMsg("今週の一歩にしました");
      await loadSteps();
    } catch (e) {
      setStepError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</p>;
  if (!data) return <p className="py-10 text-center text-sm text-gray-500">読み込んでいます…</p>;

  return (
    <div className="space-y-4" data-growth-actions>
      <p className="rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-3 text-sm leading-relaxed text-gray-700" data-sp-note>
        {data.note}
      </p>

      {stepReady && (
        <div role="tablist" aria-label="表示" className="flex rounded-full border border-gray-200 bg-white p-1 text-sm w-fit">
          {(
            [
              ["library", "📚 行動例"],
              ["step", "👣 今週の一歩"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-[40px] w-[132px] rounded-full ${tab === k ? "bg-teal-600 text-white font-medium" : "text-gray-600 hover:bg-gray-50"}`}
              data-sp-tab={k}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {msg && <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800" role="status">{msg}</p>}
      {stepError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{stepError}</p>}

      {tab === "library" || !stepReady ? (
        <>
          {/* 検索（画面の中だけ） */}
          <div className="flex flex-col gap-2 sm:flex-row" data-sp-search>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="キーワードでさがす（例：感謝・約束・報告・解釈）"
              aria-label="キーワードでさがす"
              className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 text-sm"
            />
            <select value={qCat} onChange={(e) => setQCat(e.target.value)} aria-label="カテゴリーで絞り込む" className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-2 text-sm">
              <option value="">すべてのカテゴリー</option>
              <option value={data.foundation.id}>{data.foundation.title}</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          {query.trim() && (
            <section className="rounded-xl border border-gray-200 bg-white p-3" data-sp-hits>
              <p className="text-xs text-gray-600">{hits.length}件</p>
              <ul className="mt-1 divide-y divide-gray-100">
                {hits.slice(0, 200).map((h, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => jump(h.categoryId, h.itemId)} className="block w-full py-2 text-left hover:bg-gray-50" data-sp-hit={h.itemId}>
                      <span className="block text-[11px] text-teal-800">
                        {h.categoryTitle} › {h.itemTitle}
                      </span>
                      <span className="block text-[13px] text-gray-800">
                        <Highlight before={h.before} match={h.match} after={h.after} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ライブラリ：0. 土台が最初 */}
          <section className="rounded-xl border border-gray-200 bg-white" data-sp-cat={data.foundation.id}>
            <button
              type="button"
              aria-expanded={openCat === data.foundation.id}
              onClick={() => setOpenCat((c) => (c === data.foundation.id ? "" : data.foundation.id))}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] font-bold text-gray-900 min-h-[48px]"
            >
              {data.foundation.title}
              <span aria-hidden="true" className="text-xs text-gray-400">{openCat === data.foundation.id ? "▴" : "▾"}</span>
            </button>
            {openCat === data.foundation.id && (
              <div className="space-y-4 border-t border-gray-100 px-4 py-3" data-sp-foundation>
                {foundationParts(data.foundation.markdown).map((p) => (
                  <div key={p.id} id={`sp-${p.id}`} className="scroll-mt-24">
                    <h3 className="text-[14px] font-bold text-gray-900">{p.title}</h3>
                    <div className="mt-1 overflow-x-auto text-[14px] leading-relaxed text-gray-800">
                      <MarkdownView>{p.body}</MarkdownView>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          {data.categories.map((c) => (
            <section key={c.id} className="rounded-xl border border-gray-200 bg-white" data-sp-cat={c.id}>
              <button
                type="button"
                aria-expanded={openCat === c.id}
                onClick={() => setOpenCat((x) => (x === c.id ? "" : c.id))}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] font-bold text-gray-900 min-h-[48px]"
              >
                {c.title}
                <span className="text-xs font-normal text-gray-400">
                  {c.items.length}項目 {openCat === c.id ? "▴" : "▾"}
                </span>
              </button>
              {openCat === c.id && (
                <ul className="divide-y divide-gray-100 border-t border-gray-100">
                  {c.items.map((it) => (
                    <li key={it.id} id={`sp-${it.id}`} className="scroll-mt-24 px-4 py-2" data-sp-item={it.id}>
                      <button
                        type="button"
                        aria-expanded={openItem === it.id}
                        onClick={() => setOpenItem((x) => (x === it.id ? "" : it.id))}
                        className="flex w-full items-center justify-between gap-2 py-1 text-left text-[14px] font-medium text-gray-900 min-h-[40px]"
                      >
                        {it.title}
                        <span aria-hidden="true" className="text-xs text-gray-400">{openItem === it.id ? "▴" : "▾"}</span>
                      </button>
                      {openItem === it.id && (
                        <ItemBody item={it} stepReady={stepReady} onPick={(text) => setPick({ text, source: `${c.title} › ${it.title}` })} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </>
      ) : (
        <StepPanel
          current={current}
          past={past}
          busy={busy}
          records={records}
          setRecords={setRecords}
          onEdit={() => current && setPick({ text: current.text, source: current.source })}
          onNew={() => setPick({ text: "", source: "" })}
          onCancel={async () => {
            if (!current || !window.confirm("今週の一歩を取り消します。\n\nよろしいですか？")) return;
            setBusy(true);
            try {
              await cancelMyStep(current.id);
              setMsg("取り消しました");
              await loadSteps();
            } catch (e) {
              setStepError(e instanceof Error ? e.message : "取り消せませんでした");
            } finally {
              setBusy(false);
            }
          }}
          onRecord={async (s) => {
            const r = records[s.id];
            if (!r?.result) return;
            setBusy(true);
            try {
              await recordMyStep(s.id, r.result, r.memo);
              setMsg("ふり返りを保存しました");
              await loadSteps();
            } catch (e) {
              setStepError(e instanceof Error ? e.message : "保存できませんでした");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {pick && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center" onClick={(e) => e.target === e.currentTarget && setPick(null)}>
          <div role="dialog" aria-label="今週の一歩" className="w-full max-w-lg rounded-t-2xl bg-white p-5 sm:rounded-2xl" data-sp-pick>
            <h2 className="text-base font-bold text-gray-900">👣 今週の一歩</h2>
            <p className="mt-1 text-xs text-gray-600">
              期間：{stepPeriodLabel({ start_on: current?.start_on ?? today, end_on: current?.end_on ?? stepEndFor(today) })}
              {current ? "（今の一歩を入れ替えます）" : ""}
            </p>
            {pick.source && <p className="mt-1 text-[11px] text-teal-800">{pick.source}</p>}
            <label className="mt-3 block text-xs text-gray-700">
              自分の言葉に書き換えてもかまいません
              <textarea value={pick.text} rows={4} maxLength={STEP_TEXT_MAX} onChange={(e) => setPick({ ...pick, text: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" data-sp-pick-text />
            </label>
            <p className="mt-1 text-[11px] text-gray-500">見られるのは自分だけです。</p>
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPick(null)} className="min-h-[44px] rounded-full border border-gray-300 px-5 text-sm text-gray-700">
                閉じる
              </button>
              <button type="button" onClick={() => void savePick()} disabled={busy || !pick.text.trim()} className="min-h-[44px] rounded-full bg-teal-600 px-6 text-sm font-bold text-white disabled:opacity-50" data-sp-pick-save>
                {busy ? "保存しています…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepPanel({
  current,
  past,
  busy,
  records,
  setRecords,
  onEdit,
  onNew,
  onCancel,
  onRecord,
}: {
  current: WeeklyStep | null;
  past: WeeklyStep[];
  busy: boolean;
  records: Record<string, { result: "done" | "more" | null; memo: string }>;
  setRecords: (f: (p: Record<string, { result: "done" | "more" | null; memo: string }>) => Record<string, { result: "done" | "more" | null; memo: string }>) => void;
  onEdit: () => void;
  onNew: () => void;
  onCancel: () => void;
  onRecord: (s: WeeklyStep) => void;
}) {
  return (
    <div className="space-y-4" data-sp-step>
      <section className="rounded-xl border border-teal-200 bg-white p-4">
        <h2 className="text-sm font-bold text-gray-900">今の一歩</h2>
        {current ? (
          <div className="mt-2 space-y-1" data-sp-current>
            <p className="whitespace-pre-wrap text-[15px] font-medium text-gray-900">{current.text}</p>
            <p className="text-xs text-gray-600">{stepPeriodLabel(current)}</p>
            {current.source && <p className="text-[11px] text-teal-800">{current.source}</p>}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onEdit} disabled={busy} className="min-h-[40px] rounded-full border border-teal-300 px-4 text-sm text-teal-800" data-sp-edit>
                変更
              </button>
              <button type="button" onClick={onCancel} disabled={busy} className="min-h-[40px] rounded-full border border-gray-300 px-4 text-sm text-gray-700" data-sp-cancel>
                取り消し
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-gray-600">いまは一歩を決めていません。「📚 行動例」で「今週の一歩にする」を押すか、自分の言葉で書けます。</p>
            <button type="button" onClick={onNew} className="min-h-[40px] rounded-full bg-teal-600 px-4 text-sm font-medium text-white" data-sp-new>
              自分の言葉で書く
            </button>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4" data-sp-history>
        <h2 className="text-sm font-bold text-gray-900">これまでの一歩</h2>
        {past.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">まだありません</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {past.map((s) => {
              const r = records[s.id] ?? { result: s.result, memo: s.memo };
              return (
                <li key={s.id} className="py-3" data-sp-past={s.id}>
                  <p className="whitespace-pre-wrap text-[14px] text-gray-900">{s.text}</p>
                  <p className="text-xs text-gray-500">{stepPeriodLabel(s)}</p>
                  {s.result ? (
                    <p className="mt-1 text-sm" data-sp-result>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{RESULT_LABEL[s.result]}</span>
                      {s.memo && <span className="ml-2 whitespace-pre-wrap text-gray-700">{s.memo}</span>}
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2" data-sp-reflect>
                      <div className="flex gap-2">
                        {(["done", "more"] as const).map((k) => (
                          <button
                            key={k}
                            type="button"
                            aria-pressed={r.result === k}
                            onClick={() => setRecords((p) => ({ ...p, [s.id]: { ...r, result: k } }))}
                            className={`min-h-[40px] rounded-full border px-4 text-sm ${r.result === k ? "border-teal-600 bg-teal-600 text-white" : "border-gray-300 text-gray-700"}`}
                            data-sp-result-pick={k}
                          >
                            {RESULT_LABEL[k]}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={r.memo}
                        maxLength={STEP_MEMO_MAX}
                        placeholder="ひとことメモ（任意）"
                        aria-label="ひとことメモ"
                        onChange={(e) => setRecords((p) => ({ ...p, [s.id]: { ...r, memo: e.target.value } }))}
                        className="min-h-[40px] w-full rounded-lg border border-gray-300 px-3 text-sm"
                      />
                      <button type="button" onClick={() => onRecord(s)} disabled={busy || !r.result} className="min-h-[40px] rounded-full bg-teal-600 px-4 text-sm font-medium text-white disabled:opacity-50" data-sp-record>
                        保存
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <p className="text-[11px] text-gray-500">今週の一歩は自分だけが見られます。数や達成率は数えません。</p>
    </div>
  );
}
