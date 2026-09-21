"use client";

// 🎤 発表の構成案を作る（指示書174）— 173の振り返り画面に置くパネル（管理者のみ）
//
// STEP 1 発表条件 → STEP 2 構成案2案と推奨 → STEP 3 確定（1タップで切替） → STEP 4 プロンプト出力
// 直近の生成結果はサーバーに保存され、開き直しても再生成しない。「作り直す」で再生成。
// プロンプト本体はテンプレート（lib/presentation-plan.ts）で組み立て、AIには書かせない。

import { useCallback, useEffect, useMemo, useState } from "react";
import { PATIENT_NOTICE, type Period, sortPeriods } from "@/lib/director-retrospective";
import {
  DEFAULT_AUDIENCE,
  DEFAULT_MINUTES,
  DEFAULT_THEME,
  MINUTES_MAX,
  MINUTES_MIN,
  actMinutesTotal,
  choosePresentationPlan,
  fetchPresentationPlan,
  generatePresentationPlan,
  promptFromSaved,
  type PlanConditions,
  type PlanOption,
  type PresentationPlanSaved,
} from "@/lib/presentation-plan";

const INPUT =
  "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white";
const BTN_PRIMARY =
  "px-4 py-2 rounded-full bg-teal text-white text-xs font-medium hover:opacity-90 disabled:opacity-40 min-h-[40px]";
const BTN_GHOST =
  "px-3 py-2 rounded-full border border-gray-300 text-gray-700 text-xs hover:bg-gray-50 disabled:opacity-40 min-h-[40px]";
const BTN_SMALL =
  "px-2.5 py-1.5 rounded-full border border-gray-300 text-gray-700 text-[11px] hover:bg-gray-50 disabled:opacity-40 min-h-[32px]";

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] font-medium text-gray-700 mb-1">{children}</span>;
}

function OptionCard({
  index,
  option,
  recommended,
  chosen,
  busy,
  onChoose,
}: {
  index: 0 | 1;
  option: PlanOption;
  recommended: boolean;
  chosen: boolean;
  busy: boolean;
  onChoose: () => void;
}) {
  const total = actMinutesTotal(option);
  return (
    <div
      className={`rounded-xl border p-3 space-y-2 ${
        chosen ? "border-teal bg-teal-50/40" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500">
            案{index === 0 ? "A" : "B"}
            {recommended && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">★ 推奨</span>
            )}
          </p>
          <p className="text-sm font-bold text-gray-900">{option.name}</p>
          {option.structure && <p className="text-[11px] text-gray-600">{option.structure}</p>}
        </div>
        <button
          type="button"
          onClick={onChoose}
          disabled={busy || chosen}
          className={`${BTN_SMALL} shrink-0 ${chosen ? "border-teal bg-teal text-white" : ""}`}
        >
          {chosen ? "✓ 採用中" : "この案にする"}
        </button>
      </div>

      <ol className="space-y-1.5">
        {option.acts.map((a, i) => (
          <li
            key={i}
            className={`rounded-lg border p-2 text-[11px] leading-relaxed ${
              a.missing ? "border-amber-300 bg-amber-50" : "border-gray-100 bg-gray-50"
            }`}
          >
            <p className="font-medium text-gray-900">
              {i + 1}. {a.title}
              <span className="ml-1.5 text-gray-500 font-normal tabular-nums">{a.minutes}分</span>
            </p>
            {a.content && <p className="text-gray-700 whitespace-pre-wrap">{a.content}</p>}
            <p className={a.missing ? "text-amber-800" : "text-gray-500"}>素材: {a.materials || "—"}</p>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-gray-600">
        合計 <span className="tabular-nums">{total}</span>分
      </p>
      <p className="text-[11px] text-gray-800">
        <span className="text-gray-500">核の1枚（四象限の推移）: </span>
        {option.corePlacement || "—"}
      </p>
      {option.strengths.length > 0 && (
        <p className="text-[11px] text-teal-800">
          <span className="text-gray-500">強み: </span>
          {option.strengths.join("／")}
        </p>
      )}
      {option.weaknesses.length > 0 && (
        <p className="text-[11px] text-red-800">
          <span className="text-gray-500">弱み: </span>
          {option.weaknesses.join("／")}
        </p>
      )}
    </div>
  );
}

export function PresentationPlanPanel({ periods }: { periods: Period[] }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<PresentationPlanSaved | null>(null);
  const [step, setStep] = useState<1 | 2 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // STEP 1 の入力
  const [source, setSource] = useState<PlanConditions["source"]>("records");
  const [selected, setSelected] = useState<Set<string> | null>(null); // null = 全期
  const [pasteText, setPasteText] = useState("");
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES));
  const [audience, setAudience] = useState(DEFAULT_AUDIENCE);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [emphasis, setEmphasis] = useState("");
  const [showMaterial, setShowMaterial] = useState(false);
  const [copied, setCopied] = useState(false);

  const sortedPeriods = useMemo(() => sortPeriods(periods), [periods]);

  const load = useCallback(async () => {
    try {
      const r = await fetchPresentationPlan();
      setSaved(r.saved);
      if (r.saved) {
        setStep(2);
        const c = r.saved.conditions;
        setSource(c.source);
        setSelected(c.periodIds ? new Set(c.periodIds) : null);
        setMinutes(String(c.minutes));
        setAudience(c.audience);
        setTheme(c.theme);
        setEmphasis(c.emphasis);
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (open && !loaded) void load();
  }, [open, loaded, load]);

  const isChecked = (id: string) => selected === null || selected.has(id);
  const togglePeriod = (id: string) =>
    setSelected((prev) => {
      const base = prev ? new Set(prev) : new Set(sortedPeriods.map((p) => p.id));
      if (base.has(id)) base.delete(id);
      else base.add(id);
      return base;
    });

  const generate = async () => {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const m = Number(minutes);
      const periodIds =
        selected === null ? null : sortedPeriods.filter((p) => selected.has(p.id)).map((p) => p.id);
      if (source === "records" && periodIds && periodIds.length === 0) {
        throw new Error("期を1つ以上選んでください");
      }
      const r = await generatePresentationPlan({
        conditions: {
          source,
          periodIds,
          minutes: Number.isInteger(m) ? m : DEFAULT_MINUTES,
          audience,
          theme,
          emphasis,
        },
        pasteText: source === "paste" ? pasteText : "",
      });
      setSaved(r.saved);
      setStep(2);
      setMsg("✨ 構成案を2案作りました（推奨案が選ばれています）");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const choose = async (chosen: 0 | 1) => {
    if (!saved || saved.chosen === chosen) return;
    setBusy(true);
    setError("");
    try {
      const r = await choosePresentationPlan(chosen);
      setSaved(r.saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "切り替えに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const prompt = useMemo(() => (saved ? promptFromSaved(saved) : ""), [saved]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("コピーできませんでした。テキストを選択してコピーしてください");
    }
  };

  const downloadPrompt = () => {
    const blob = new Blob([prompt], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `プレゼン資料作成プロンプト_${saved?.conditions.minutes ?? DEFAULT_MINUTES}分.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-900 min-h-[36px]"
      >
        <span className="text-gray-400 text-xs">{open ? "▾" : "▸"}</span>
        🎤 発表の構成案を作る
      </button>

      {open && (
        <div className="space-y-3">
          <p className="text-[11px] text-gray-600 leading-relaxed">
            振り返り記録（または貼り付けた振り返りシート）から、AIが<strong>発表の構成案を2案</strong>作り、推奨案を1つ選びます。
            確定した構成で<strong>プレゼン資料作成プロンプト（Markdown）</strong>を出力し、Claude.ai に貼り付けてスライドと台本を作ります。
            AIに送る前に、登録済みスタッフの氏名は役割名に置き換えられます。AIは素材にない出来事・数字を作りません（足りない幕は「記録なし：院長に確認」）。
          </p>

          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
          )}
          {msg && (
            <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>
          )}

          {/* ステップ表示 */}
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            {(
              [
                [1, "1 発表条件"],
                [2, "2 構成案と推奨／3 確定"],
                [4, "4 プロンプト出力"],
              ] as const
            ).map(([n, label]) => (
              <button
                key={n}
                type="button"
                disabled={n !== 1 && !saved}
                onClick={() => setStep(n)}
                className={`px-2.5 py-1.5 rounded-full border min-h-[32px] disabled:opacity-40 ${
                  step === n ? "border-teal bg-teal-light text-teal font-medium" : "border-gray-300 text-gray-700"
                }`}
              >
                STEP {label}
              </button>
            ))}
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-2">
              <div>
                <Label>入力元</Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["records", "① 173の記録（期を選択）"],
                      ["paste", "② 振り返りシートの貼り付け"],
                    ] as const
                  ).map(([v, label]) => (
                    <label
                      key={v}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs min-h-[40px] cursor-pointer ${
                        source === v ? "border-teal bg-teal-light text-teal font-medium" : "border-gray-300 bg-white text-gray-700"
                      }`}
                    >
                      <input type="radio" name="planSource" checked={source === v} onChange={() => setSource(v)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {source === "records" ? (
                <div>
                  <Label>使う期（既定: 全期）</Label>
                  {sortedPeriods.length === 0 ? (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      まだ期がありません。上の「＋ 期を追加」で記録するか、「② 振り返りシートの貼り付け」を選んでください。
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelected(null)}
                        className={`${BTN_SMALL} ${selected === null ? "border-teal bg-teal-light text-teal" : ""}`}
                      >
                        全期
                      </button>
                      {sortedPeriods.map((p) => (
                        <label
                          key={p.id}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] min-h-[32px] cursor-pointer ${
                            isChecked(p.id) ? "border-teal bg-teal-light text-teal" : "border-gray-300 text-gray-700"
                          }`}
                        >
                          <input type="checkbox" checked={isChecked(p.id)} onChange={() => togglePeriod(p.id)} />
                          {p.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <Label>振り返りシート（Markdown・そのまま貼り付け）</Label>
                  <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed mb-1">
                    ⚠️ {PATIENT_NOTICE}
                  </p>
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[200px] bg-white leading-relaxed font-mono"
                    placeholder="振り返りシートの内容を貼り付けてください"
                  />
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    貼り付けた文章も、AIに送る前に登録済みスタッフの氏名を役割名に置き換えます。貼り付けた原文は保存しません。
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block">
                  <Label>発表時間（分）</Label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MINUTES_MIN}
                    max={MINUTES_MAX}
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    className={INPUT}
                  />
                </label>
                <label className="block">
                  <Label>聴き手</Label>
                  <input value={audience} onChange={(e) => setAudience(e.target.value)} className={INPUT} />
                </label>
              </div>
              <label className="block">
                <Label>テーマ</Label>
                <input value={theme} onChange={(e) => setTheme(e.target.value)} className={INPUT} />
              </label>
              <label className="block">
                <Label>特に伝えたいこと（任意）</Label>
                <textarea
                  value={emphasis}
                  onChange={(e) => setEmphasis(e.target.value)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[64px] bg-white leading-relaxed"
                />
              </label>
              <div className="flex flex-wrap gap-2 items-center">
                <button type="button" onClick={generate} disabled={busy} className={BTN_PRIMARY}>
                  {busy ? "AIが構成案を作っています…（30秒ほど）" : saved ? "🔁 作り直す（2案を再生成）" : "✨ 構成案を2案作る"}
                </button>
                {saved && (
                  <button type="button" onClick={() => setStep(2)} disabled={busy} className={BTN_GHOST}>
                    前回の結果を見る
                  </button>
                )}
              </div>
            </div>
          )}

          {/* STEP 2・3 */}
          {step === 2 && saved && (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-relaxed">
                <p className="font-medium text-amber-900">
                  ★ 推奨: 案{saved.result.recommended === 0 ? "A" : "B"}「
                  {saved.result.options[saved.result.recommended].name}」
                </p>
                <p className="text-gray-800 whitespace-pre-wrap mt-1">{saved.result.reason}</p>
                <p className="text-gray-500 mt-1">
                  生成: {saved.generatedAt.slice(0, 16).replace("T", " ")} ／ {saved.provider} / {saved.model} ／ 入力元:
                  {saved.conditions.source === "records" ? " 173の記録" : " 振り返りシートの貼り付け"} ／{" "}
                  {saved.conditions.minutes}分
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {([0, 1] as const).map((i) => (
                  <OptionCard
                    key={i}
                    index={i}
                    option={saved.result.options[i]}
                    recommended={saved.result.recommended === i}
                    chosen={saved.chosen === i}
                    busy={busy}
                    onChoose={() => void choose(i)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setStep(4)} disabled={busy} className={BTN_PRIMARY}>
                  📝 案{saved.chosen === 0 ? "A" : "B"}でプロンプトを出力
                </button>
                <button type="button" onClick={() => setStep(1)} disabled={busy} className={BTN_GHOST}>
                  条件を変えて作り直す
                </button>
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setShowMaterial((v) => !v)}
                  className="text-[11px] text-gray-600 underline min-h-[32px]"
                >
                  {showMaterial ? "▾" : "▸"} AIに送った素材（匿名化済み）を確認する
                </button>
                {showMaterial && (
                  <pre className="mt-1 max-h-72 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-2 text-[10px] leading-relaxed whitespace-pre-wrap">
                    {saved.material}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {step === 4 && saved && (
            <div className="space-y-2">
              <p className="text-[11px] text-gray-600">
                案{saved.chosen === 0 ? "A" : "B"}「{saved.result.options[saved.chosen].name}」で組み立てたプロンプトです。
                Claude.ai に貼り付けてスライドと台本を作ってください。素材は匿名化済みです。
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copyPrompt} className={BTN_PRIMARY}>
                  {copied ? "✓ コピーしました" : "📋 コピー"}
                </button>
                <button type="button" onClick={downloadPrompt} className={BTN_GHOST}>
                  ⬇️ .md をダウンロード
                </button>
                <button type="button" onClick={() => setStep(2)} className={BTN_GHOST}>
                  ← 案を選び直す
                </button>
              </div>
              <textarea
                readOnly
                value={prompt}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 p-2 text-[11px] leading-relaxed font-mono min-h-[360px]"
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
