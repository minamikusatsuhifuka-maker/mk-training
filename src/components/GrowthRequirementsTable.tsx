"use client";
// 等級ごとの要件表（指示書193 B・194 A）— G1→G2 から G4→G5 までを1枚に。
//   文言は確定版 第4節を md から解析した TRANSITION_SPECS をそのまま使う（書き換えない。** は太字として描く）。
//   194 A: 現在地（mode="card"）は、次の移行を**カード**（見出し1行／必須の学びの○×1段／横軸｜縦軸の2列）で出し、
//          他の移行は1行の見出しだけ（開くと同じカード）。ポータル（mode="auto"）は、パソコン幅では横軸・縦軸の列に
//          十分な幅（1行12文字以上）を持たせた表、幅が足りなければカード。
//   点数・割合・到達の数は出さない。他の人と比べる表示はしない。

import { useState } from "react";
import { TRANSITIONS, TRANSITION_SPECS, transitionLabel, type GateDatePart, type ItemReview, type ItemSelf, type TransitionKey, type TransitionSpec } from "@/lib/growth-matrix";

/** ** … ** を太字に（文言は変えない） */
export function renderBold(text: string): React.ReactNode {
  const parts = text.split("**");
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>));
}

export type ItemMark = { self?: ItemSelf["status"]; review?: ItemReview };
export type GateMark = { ok: boolean; dates?: GateDatePart[] };

/** 学びの記録を開く合図（わたしの可能性ノートは別タブにあるので、受け手がタブを切り替える） */
export const OPEN_LEARNING_EVENT = "mk-open-learning";

function openLearning(e: React.MouseEvent, id: string) {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent(OPEN_LEARNING_EVENT, { detail: id }));
  // タブの切り替えで一覧が描かれてから移る
  window.setTimeout(() => {
    const el = document.getElementById(`learning-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-teal-400");
    window.setTimeout(() => el.classList.remove("ring-2", "ring-teal-400"), 2000);
  }, 80);
}

/**
 * 197 A: 受講日の行。日付は学びの記録（同じ画面の一覧 #learning-<id>）へのリンク。
 * 一覧が無い画面（印刷など）では、ただの文字として読める。
 */
export function GateDates({ parts, className = "" }: { parts: GateDatePart[]; className?: string }) {
  if (parts.length === 0) return null;
  return (
    <span className={`text-[10px] text-gray-600 ${className}`} data-gate-dates>
      📅{" "}
      {parts.map((p, i) =>
        "learningId" in p ? (
          <a key={i} href={`#learning-${p.learningId}`} onClick={(e) => openLearning(e, p.learningId)} className="text-teal-800 underline underline-offset-2" data-gate-date-link={p.learningId}>
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  );
}

const STATUS_LABEL: Record<NonNullable<ItemMark["self"]>, string> = { "": "", reached: "到達", in_progress: "途上" };
const REVIEW_LABEL: Record<NonNullable<ItemMark["review"]>, string> = { "": "", confirmed: "確認", dialogue: "対話で確かめる" };

function Marks({ mark }: { mark?: ItemMark }) {
  if (!mark || (!mark.self && !mark.review)) return null;
  return (
    <span className="ml-1 inline-flex gap-1 align-middle" data-item-marks>
      {mark.self && <span className={`text-[10px] px-1 py-0.5 rounded ${mark.self === "reached" ? "bg-teal-100 text-teal-900" : "bg-gray-100 text-gray-700"}`}>{STATUS_LABEL[mark.self]}（本人）</span>}
      {mark.review && <span className="text-[10px] px-1 py-0.5 rounded bg-violet-100 text-violet-900">✓ {REVIEW_LABEL[mark.review]}（院長）</span>}
    </span>
  );
}

function ItemList({ items, marks }: { items: { key: string; text: string }[]; marks?: (key: string) => ItemMark | undefined }) {
  return (
    <ul className="list-disc pl-4 space-y-1">
      {items.map((it) => (
        <li key={it.key} className="leading-relaxed" data-req-item={it.key}>
          {renderBold(it.text)}
          <Marks mark={marks?.(it.key)} />
        </li>
      ))}
    </ul>
  );
}

function GateList({ gates, gateMark, inline = false }: { gates: string[]; gateMark?: (label: string) => GateMark | undefined; inline?: boolean }) {
  return (
    <ul className={inline ? "flex flex-wrap gap-x-3 gap-y-1" : "list-disc pl-4 space-y-1"}>
      {gates.map((g, i) => {
        const mk = gateMark?.(g);
        return (
          <li key={i} className={`leading-relaxed ${inline ? "inline-flex items-start gap-1 rounded border border-gray-200 bg-white px-1.5 py-0.5" : ""}`} data-req-gate>
            {mk && <span className={`mr-0.5 font-bold ${mk.ok ? "text-teal-700" : "text-gray-400"}`}>{mk.ok ? "○" : "×"}</span>}
            <span>
              {renderBold(g)}
              {mk?.dates && mk.dates.length > 0 && <GateDates parts={mk.dates} className="block" />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 194 A: 1移行のカード（見出し1行／必須の学び1段／横軸｜縦軸の2列。スマートフォンでは縦に並ぶ） */
export function TransitionCard({ t, hl, marks, gateMark }: { t: TransitionSpec; hl: boolean; marks?: (key: string) => ItemMark | undefined; gateMark?: (label: string) => GateMark | undefined }) {
  return (
    <div className="space-y-2 text-[12px]" data-req-card-body={t.key}>
      <p className="text-[11px] text-gray-700" data-req-card-head>
        {renderBold(t.heading)}
        <span className="mx-1 text-gray-400">｜</span>
        {renderBold(t.focus)}
      </p>
      <div className="print-card">
        <p className="text-[11px] font-medium text-gray-800 mb-0.5">必須の学び（ゲート）</p>
        <GateList gates={t.gates} gateMark={gateMark} inline />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="print-card rounded-md border border-cyan-100 bg-cyan-50/40 p-2" data-req-axis="s">
          <p className="text-[11px] font-medium text-cyan-900 mb-1">スキル・ナレッジ（横軸）</p>
          <ItemList items={t.s} marks={marks} />
        </div>
        <div className="print-card rounded-md border border-amber-100 bg-amber-50/40 p-2" data-req-axis="m">
          <p className="text-[11px] font-medium text-amber-900 mb-1">マインド（縦軸）</p>
          <ItemList items={t.m} marks={marks} />
        </div>
      </div>
      {hl && <p className="text-[10px] text-gray-500">移行はチェックの数で決めず、本人と院長の対話で合意します。</p>}
    </div>
  );
}

export function GrowthRequirementsTable({
  highlight = null,
  marks,
  gateMark,
  title = "等級ごとの要件表（確定版 第4節）",
  mode = "auto",
}: {
  /** 本人の次の移行（強調して最初から開く。null なら全部開く） */
  highlight?: TransitionKey | null;
  marks?: (itemKey: string) => ItemMark | undefined;
  gateMark?: (label: string) => GateMark | undefined;
  title?: string;
  /** card=常にカード（現在地）／auto=パソコン幅は表・足りなければカード（ポータル） */
  mode?: "card" | "auto";
}) {
  const [open, setOpen] = useState<Record<TransitionKey, boolean>>(() => Object.fromEntries(TRANSITIONS.map((t) => [t.key, highlight ? t.key === highlight : true])) as Record<TransitionKey, boolean>);
  const toggle = (k: TransitionKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const cards = (
    <div className="space-y-2">
      {TRANSITION_SPECS.map((t) => {
        const hl = t.key === highlight;
        const isOpen = open[t.key];
        return (
          <div key={t.key} className={`rounded-lg border ${hl ? "border-teal-400 bg-teal-50/50" : "border-gray-200 bg-white"} ${isOpen ? "p-2" : "px-2 py-1"}`} data-req-card={t.key} data-highlight={hl ? "1" : "0"} data-open={isOpen ? "1" : "0"}>
            <button type="button" onClick={() => toggle(t.key)} className="w-full text-left text-[12px] font-bold text-gray-900 min-h-[36px]" aria-expanded={isOpen} aria-label={`${transitionLabel(t.key)} を${isOpen ? "たたむ" : "開く"}`}>
              {isOpen ? "▾" : "▸"} {transitionLabel(t.key)}
              {hl && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-teal-600 text-white font-normal">次の移行</span>}
              {!isOpen && <span className="ml-1 font-normal text-[11px] text-gray-700">{renderBold(t.heading)}</span>}
            </button>
            {isOpen && <TransitionCard t={t} hl={hl} marks={marks} gateMark={gateMark} />}
          </div>
        );
      })}
    </div>
  );

  return (
    <section className="space-y-2" data-requirements-table data-mode={mode}>
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <p className="text-[11px] text-gray-600">移行はチェックの数で決めず、本人と院長の対話で合意します。文言は確定版 v1.0 のままです。</p>
      {mode === "card" ? (
        cards
      ) : (
        <>
          {/* パソコン幅（768px以上）: 表。横軸・縦軸の列は1行12文字以上（最小幅 13em）。必須の学び・見る重心は狭く */}
          <div className="hidden md:block" data-req-table-wrap>
            <table className="w-full text-[12px] border border-gray-200 bg-white">
              <thead>
                <tr>
                  <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left text-gray-700 w-[8em]">移行</th>
                  <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left text-gray-700 w-[10em]">必須の学び</th>
                  <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left text-gray-700 min-w-[13em]">スキル・ナレッジ（横軸）</th>
                  <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left text-gray-700 min-w-[13em]">マインド（縦軸）</th>
                  <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left text-gray-700 w-[7em]">見る重心</th>
                </tr>
              </thead>
              <tbody>
                {TRANSITION_SPECS.map((t) => (
                  <tr key={t.key} className={t.key === highlight ? "bg-teal-50/60" : ""} data-req-row={t.key} data-highlight={t.key === highlight ? "1" : "0"} data-open="1">
                    <td className="border border-gray-200 px-2 py-1 align-top">
                      <span className="font-bold text-gray-900">{transitionLabel(t.key)}</span>
                      <span className="block text-[11px] text-gray-700 mt-0.5">{renderBold(t.heading)}</span>
                    </td>
                    <td className="border border-gray-200 px-2 py-1 align-top text-[11px]"><GateList gates={t.gates} gateMark={gateMark} /></td>
                    <td className="border border-gray-200 px-2 py-1 align-top" data-req-col="s"><ItemList items={t.s} marks={marks} /></td>
                    <td className="border border-gray-200 px-2 py-1 align-top" data-req-col="m"><ItemList items={t.m} marks={marks} /></td>
                    <td className="border border-gray-200 px-2 py-1 align-top text-[11px]">{renderBold(t.focus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 幅が足りないとき: 現在地と同じカード */}
          <div className="md:hidden">{cards}</div>
        </>
      )}
    </section>
  );
}
