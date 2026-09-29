"use client";
// 等級ごとの要件表（指示書193 B）— G1→G2 から G4→G5 までを1枚に。
//   文言は確定版 第4節を md から解析した TRANSITION_SPECS をそのまま使う（書き換えない。** は太字として描く）。
//   パソコン幅: 横に並べた表（行ごとに開閉）。スマートフォン: 移行ごとに開閉できるカード（横スクロールさせない）。
//   現在地では、本人の次の移行の行を強調して最初から開き、各項目の横に本人の「到達／途上」と院長の「確認」を出す。
//   点数・割合・到達の数は出さない。他の人と比べる表示はしない。

import { useState } from "react";
import { TRANSITIONS, TRANSITION_SPECS, transitionLabel, type ItemReview, type ItemSelf, type TransitionKey } from "@/lib/growth-matrix";

/** ** … ** を太字に（文言は変えない） */
export function renderBold(text: string): React.ReactNode {
  const parts = text.split("**");
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>));
}

export type ItemMark = { self?: ItemSelf["status"]; review?: ItemReview };
export type GateMark = { ok: boolean };

const STATUS_LABEL: Record<NonNullable<ItemMark["self"]>, string> = { "": "", reached: "到達", in_progress: "途上" };
const REVIEW_LABEL: Record<NonNullable<ItemMark["review"]>, string> = { "": "", confirmed: "確認", dialogue: "対話で確かめる" };

function Marks({ mark }: { mark?: ItemMark }) {
  if (!mark || (!mark.self && !mark.review)) return null;
  return (
    <span className="ml-1 inline-flex gap-1 align-middle" data-item-marks>
      {mark.self && <span className={`text-[10px] px-1 py-0.5 rounded ${mark.self === "reached" ? "bg-teal-100 text-teal-900" : "bg-gray-100 text-gray-700"}`}>{STATUS_LABEL[mark.self]}（本人）</span>}
      {mark.review && <span className="text-[10px] px-1 py-0.5 rounded bg-violet-100 text-violet-900">{REVIEW_LABEL[mark.review]}（院長）</span>}
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

function GateList({ gates, gateMark }: { gates: string[]; gateMark?: (label: string) => GateMark | undefined }) {
  return (
    <ul className="list-disc pl-4 space-y-1">
      {gates.map((g, i) => {
        const mk = gateMark?.(g);
        return (
          <li key={i} className="leading-relaxed" data-req-gate>
            {mk && <span className={`mr-1 font-bold ${mk.ok ? "text-teal-700" : "text-gray-400"}`}>{mk.ok ? "○" : "×"}</span>}
            {renderBold(g)}
          </li>
        );
      })}
    </ul>
  );
}

export function GrowthRequirementsTable({
  highlight = null,
  marks,
  gateMark,
  title = "等級ごとの要件表（確定版 第4節）",
}: {
  /** 本人の次の移行（強調して最初から開く。null なら全部開く） */
  highlight?: TransitionKey | null;
  marks?: (itemKey: string) => ItemMark | undefined;
  gateMark?: (label: string) => GateMark | undefined;
  title?: string;
}) {
  const [open, setOpen] = useState<Record<TransitionKey, boolean>>(() => Object.fromEntries(TRANSITIONS.map((t) => [t.key, highlight ? t.key === highlight : true])) as Record<TransitionKey, boolean>);
  const toggle = (k: TransitionKey) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const COLS = ["移行", "必須の学び", "スキル・ナレッジ（横軸）", "マインド（縦軸）", "見る重心"];

  return (
    <section className="space-y-2" data-requirements-table>
      <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      <p className="text-[11px] text-gray-600">移行はチェックの数で決めず、本人と院長の対話で合意します。文言は確定版 v1.0 のままです。</p>

      {/* パソコン幅: 表 */}
      <div className="hidden sm:block">
        <table className="w-full text-[12px] border border-gray-200 bg-white table-fixed">
          <thead>
            <tr>
              {COLS.map((c, i) => (
                <th key={c} className={`border border-gray-200 bg-gray-50 px-2 py-1 text-left text-gray-700 ${i === 0 ? "w-[13em]" : i === 4 ? "w-[11em]" : ""}`}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TRANSITION_SPECS.map((t) => {
              const hl = t.key === highlight;
              const isOpen = open[t.key];
              return (
                <tr key={t.key} className={hl ? "bg-teal-50/60" : ""} data-req-row={t.key} data-highlight={hl ? "1" : "0"} data-open={isOpen ? "1" : "0"}>
                  <td className="border border-gray-200 px-2 py-1 align-top">
                    <button type="button" onClick={() => toggle(t.key)} className="text-left w-full" aria-expanded={isOpen} aria-label={`${transitionLabel(t.key)} の行を${isOpen ? "たたむ" : "開く"}`}>
                      <span className="font-bold text-gray-900">{isOpen ? "▾" : "▸"} {transitionLabel(t.key)}</span>
                      {hl && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-teal-600 text-white">次の移行</span>}
                      <span className="block text-[11px] text-gray-700 mt-0.5">{renderBold(t.heading)}</span>
                    </button>
                  </td>
                  {isOpen ? (
                    <>
                      <td className="border border-gray-200 px-2 py-1 align-top"><GateList gates={t.gates} gateMark={gateMark} /></td>
                      <td className="border border-gray-200 px-2 py-1 align-top"><ItemList items={t.s} marks={marks} /></td>
                      <td className="border border-gray-200 px-2 py-1 align-top"><ItemList items={t.m} marks={marks} /></td>
                      <td className="border border-gray-200 px-2 py-1 align-top">{renderBold(t.focus)}</td>
                    </>
                  ) : (
                    <td className="border border-gray-200 px-2 py-1 align-top text-gray-500" colSpan={4}>
                      （たたんでいます。「▸」で開く）
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* スマートフォン: 移行ごとのカード */}
      <div className="sm:hidden space-y-2">
        {TRANSITION_SPECS.map((t) => {
          const hl = t.key === highlight;
          return (
            <details key={t.key} open={open[t.key]} onToggle={(e) => setOpen((o) => ({ ...o, [t.key]: (e.target as HTMLDetailsElement).open }))} className={`rounded-lg border p-2 ${hl ? "border-teal-400 bg-teal-50/60" : "border-gray-200 bg-white"}`} data-req-card={t.key} data-highlight={hl ? "1" : "0"}>
              <summary className="cursor-pointer text-[12px] font-bold text-gray-900">
                {transitionLabel(t.key)}
                {hl && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-teal-600 text-white">次の移行</span>}
                <span className="block text-[11px] font-normal text-gray-700 mt-0.5">{renderBold(t.heading)}</span>
              </summary>
              <div className="mt-2 space-y-2 text-[12px]">
                <div>
                  <p className="font-medium text-gray-800">必須の学び</p>
                  <GateList gates={t.gates} gateMark={gateMark} />
                </div>
                <div>
                  <p className="font-medium text-gray-800">スキル・ナレッジ（横軸）</p>
                  <ItemList items={t.s} marks={marks} />
                </div>
                <div>
                  <p className="font-medium text-gray-800">マインド（縦軸）</p>
                  <ItemList items={t.m} marks={marks} />
                </div>
                <div>
                  <p className="font-medium text-gray-800">見る重心</p>
                  <p>{renderBold(t.focus)}</p>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
