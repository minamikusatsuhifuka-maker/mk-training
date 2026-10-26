"use client";

// 🧭 成長の道しるべ（指示書270）— 表示の部品（スタッフの画面・可能性ノートの道しるべタブで共用）
// パソコンは表、スマートフォンは1ステップ1枚のカード（270 §2-1-3）。

import type { ReactNode } from "react";
import type { MichiLearn, MichiStep } from "@/lib/michishirube";

/** 「**…**」だけを太字にする（別紙の文の太字をそのまま出す） */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <strong key={i} className="font-semibold text-slate-900">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

const th = "border border-slate-200 bg-teal-50/70 px-2 py-1.5 text-left font-semibold text-slate-700 align-top";
const td = "border border-slate-200 px-2 py-1.5 align-top text-slate-700";

export function StepTable({
  steps,
  whenLabel,
  aside,
  cardsOnly,
}: {
  steps: MichiStep[];
  whenLabel: string;
  /** 幅の狭い所（可能性ノートの中）では、パソコンでもカードで並べる */
  cardsOnly?: boolean;
  /** 1行ごとに右に足す欄（道しるべタブの状態など） */
  aside?: { head: string; cell: (s: MichiStep) => ReactNode };
}) {
  const hasWhen = steps.some((s) => s.when);
  if (steps.length === 0) return <p className="text-xs text-muted-foreground">ステップはありません。</p>;
  return (
    <>
      <div className={cardsOnly ? "hidden" : "hidden md:block overflow-x-auto"}>
        <table className="w-full border-collapse text-[13px] leading-relaxed" data-michi-steps>
          <thead>
            <tr>
              <th className={`${th} w-14`}>No.</th>
              <th className={`${th} w-20`}>区分</th>
              <th className={th}>やること</th>
              <th className={th}>できた目安</th>
              <th className={th}>根拠の残し方</th>
              {hasWhen && <th className={`${th} w-28`}>{whenLabel || "目安の時期"}</th>}
              <th className={`${th} w-24`}>支える人</th>
              {aside && <th className={`${th} w-44`}>{aside.head}</th>}
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.id} data-step-id={s.id}>
                <td className={`${td} font-mono text-xs`}>{s.id}</td>
                <td className={td}>{s.category}</td>
                <td className={td}>
                  <Rich text={s.todo} />
                </td>
                <td className={td}>
                  <Rich text={s.sign} />
                </td>
                <td className={td}>{s.evidence}</td>
                {hasWhen && <td className={td}>{s.when}</td>}
                <td className={td}>{s.supporter}</td>
                {aside && <td className={td}>{aside.cell(s)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={`${cardsOnly ? "" : "md:hidden "}space-y-2`} data-michi-step-cards>
        {steps.map((s) => (
          <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5" data-step-id={s.id}>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-slate-500">{s.id}</span>
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-800">{s.category}</span>
            </div>
            <p className="text-sm font-medium text-slate-800 leading-relaxed">
              <Rich text={s.todo} />
            </p>
            <dl className="text-xs leading-relaxed text-slate-700 space-y-1">
              <CardRow label="できた目安">
                <Rich text={s.sign} />
              </CardRow>
              <CardRow label="根拠の残し方">{s.evidence}</CardRow>
              {s.when && <CardRow label={whenLabel || "目安の時期"}>{s.when}</CardRow>}
              <CardRow label="支える人">{s.supporter}</CardRow>
            </dl>
            {aside && <div className="pt-1 border-t border-slate-100">{aside.cell(s)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

export function LearnTable({
  rows,
  whenLabel,
  aside,
  cardsOnly,
}: {
  rows: MichiLearn[];
  whenLabel: string;
  cardsOnly?: boolean;
  aside?: { head: string; cell: (l: MichiLearn) => ReactNode };
}) {
  const hasWhen = rows.some((r) => r.when);
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">学びのステップはありません。</p>;
  return (
    <>
      <div className={cardsOnly ? "hidden" : "hidden md:block overflow-x-auto"}>
        <table className="w-full border-collapse text-[13px] leading-relaxed" data-michi-learn>
          <thead>
            <tr>
              <th className={`${th} w-16`}>No.</th>
              <th className={`${th} w-24`}>区分</th>
              <th className={th}>学ぶ</th>
              <th className={th}>実践（1か月以内に1つ）</th>
              <th className={th}>分かち合う</th>
              {hasWhen && <th className={`${th} w-28`}>{whenLabel || "目安の時期"}</th>}
              {aside && <th className={`${th} w-52`}>{aside.head}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-learn-id={r.id}>
                <td className={`${td} font-mono text-xs`}>{r.id}</td>
                <td className={td}>{r.category}</td>
                <td className={td}>{r.learn}</td>
                <td className={td}>{r.practice}</td>
                <td className={td}>{r.share}</td>
                {hasWhen && <td className={td}>{r.when}</td>}
                {aside && <td className={td}>{aside.cell(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={`${cardsOnly ? "" : "md:hidden "}space-y-2`} data-michi-learn-cards>
        {rows.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-1.5" data-learn-id={r.id}>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-mono text-slate-500">{r.id}</span>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">{r.category}</span>
            </div>
            <dl className="text-xs leading-relaxed text-slate-700 space-y-1">
              <CardRow label="① 学ぶ">{r.learn}</CardRow>
              <CardRow label="② 実践（1か月以内に1つ）">{r.practice}</CardRow>
              <CardRow label="③ 分かち合う">{r.share}</CardRow>
              {r.when && <CardRow label={whenLabel || "目安の時期"}>{r.when}</CardRow>}
            </dl>
            {aside && <div className="pt-1 border-t border-slate-100">{aside.cell(r)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}

function CardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** 区分の絞り込み（「すべて」＋区分） */
export function CategoryChips({
  categories,
  value,
  onChange,
}: {
  categories: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  if (categories.length === 0) return null;
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs transition ${
      active ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
    }`;
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="区分で絞り込む" data-michi-chips>
      <button type="button" className={chip(value === "")} onClick={() => onChange("")} aria-pressed={value === ""}>
        すべて
      </button>
      {categories.map((c) => (
        <button key={c} type="button" className={chip(value === c)} onClick={() => onChange(c)} aria-pressed={value === c}>
          {c}
        </button>
      ))}
    </div>
  );
}
