"use client";
// スカウター結果の転記フォーム（指示書188 1-1 ③）— 院長が**確認・修正してから保存**する
//   AIの転記（/api/admin/hiring/scouter/extract）の提案を受け取り、報告書の項目どおりの欄で直せる。
//   受検者の氏名・IDの欄は存在しない（転記しない）。

import { useState } from "react";
import { SCOUTER_SECTIONS, type NamedScore, type ScouterTranscript } from "@/lib/scouter";

const cell = "w-full rounded-md border border-gray-200 px-2 py-1 text-[12px] min-h-[32px] bg-white";

function NamedScoreList({
  label,
  items,
  onChange,
  note,
}: {
  label: string;
  items: NamedScore[];
  onChange: (next: NamedScore[]) => void;
  note?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-gray-800">
        {label}
        {note && <span className="ml-1 text-[10px] font-normal text-gray-500">{note}</span>}
      </p>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[1fr_6em_auto] gap-1">
          <input value={it.name} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="項目名（報告書の表記）" className={cell} aria-label={`${label} の項目名`} />
          <input value={it.score} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, score: e.target.value } : x)))} placeholder="得点" className={cell} aria-label={`${label} の得点`} />
          <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-[11px] text-gray-600 underline underline-offset-2 px-1" aria-label={`${label} の行を削除`}>
            削除
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, { name: "", score: "" }])} className="text-[11px] text-teal-800 underline underline-offset-2 min-h-[28px]">
        ＋ 行を追加
      </button>
    </div>
  );
}

export function ScouterTranscriptForm({
  initial,
  busy,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: ScouterTranscript;
  busy: boolean;
  submitLabel: string;
  onSubmit: (t: ScouterTranscript) => Promise<void>;
  onCancel: () => void;
}) {
  const [t, setT] = useState<ScouterTranscript>(initial);
  const setScale = (sec: (typeof SCOUTER_SECTIONS)[number]["key"], name: string, v: string) =>
    setT((x) => ({ ...x, sections: { ...x.sections, [sec]: { ...x.sections[sec], [name]: v } } }));

  return (
    <div className="rounded-lg border border-violet-300 bg-violet-50/50 p-2 space-y-2" data-scouter-form>
      <p className="text-[10px] text-violet-900 leading-relaxed">
        報告書の<strong>記載どおり</strong>に転記した提案です（解釈は加えていません）。値を確かめ、必要なら直してから保存してください。読み取れなかった欄は空のままで構いません。
        受検者の氏名・IDなど検査結果以外の個人情報は転記しません。
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-[11px] text-gray-800">
          受検日
          <input type="date" value={t.testDate} onChange={(e) => setT((x) => ({ ...x, testDate: e.target.value }))} className={cell} aria-label="受検日" />
        </label>
        <label className="text-[11px] text-gray-800">
          検査名
          <input value={t.testName} onChange={(e) => setT((x) => ({ ...x, testName: e.target.value }))} placeholder="例: 検査SS" className={cell} aria-label="検査名" />
        </label>
      </div>
      {SCOUTER_SECTIONS.map((s) => (
        <div key={s.key} className="bg-white rounded-md border border-gray-200 p-1.5">
          <p className="text-[11px] font-medium text-gray-800 mb-1">{s.label}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
            {s.scales.map((n) => (
              <label key={n} className="text-[10px] text-gray-600">
                {n}
                <input value={t.sections[s.key][n]} onChange={(e) => setScale(s.key, n, e.target.value)} className={cell} aria-label={`${n} の得点`} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="bg-white rounded-md border border-gray-200 p-1.5 space-y-2">
        <NamedScoreList label="6 ネガティブ傾向" note="（転記のみ。ポイント整理には使いません）" items={t.negative} onChange={(negative) => setT((x) => ({ ...x, negative }))} />
        <NamedScoreList label="7 職務適性" items={t.jobFit} onChange={(jobFit) => setT((x) => ({ ...x, jobFit }))} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-[11px] text-gray-800">
            8 戦闘力
            <input value={t.power} onChange={(e) => setT((x) => ({ ...x, power: e.target.value }))} className={cell} aria-label="戦闘力" />
          </label>
          <label className="text-[11px] text-gray-800">
            9 虚偽回答の傾向（得点）<span className="text-[10px] text-gray-500">転記のみ</span>
            <input value={t.honesty.score} onChange={(e) => setT((x) => ({ ...x, honesty: { ...x.honesty, score: e.target.value } }))} className={cell} aria-label="虚偽回答の傾向の得点" />
          </label>
        </div>
        <label className="text-[11px] text-gray-800 block">
          9 虚偽回答の傾向（コメント）
          <input value={t.honesty.comment} onChange={(e) => setT((x) => ({ ...x, honesty: { ...x.honesty, comment: e.target.value } }))} className={cell} aria-label="虚偽回答の傾向のコメント" />
        </label>
        <label className="text-[11px] text-gray-800 block">
          人物像および人材活用に関するコメント（原文のまま）
          <textarea value={t.comment} onChange={(e) => setT((x) => ({ ...x, comment: e.target.value }))} rows={5} className={`${cell} min-h-[96px]`} aria-label="コメント本文" />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void onSubmit(t)} disabled={busy} className="px-4 py-2 bg-violet-700 text-white rounded-full text-sm hover:bg-violet-800 disabled:opacity-40 min-h-[44px]" data-scouter-save>
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm hover:bg-gray-50 min-h-[44px]">
          キャンセル
        </button>
      </div>
    </div>
  );
}
