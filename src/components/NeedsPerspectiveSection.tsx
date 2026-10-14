"use client";

// 可能性ノート（院長・担当の幹部の画面）「欲求の視点（関わる側のヒント）」
// ・初期状態は閉じる。開いたときに初めてサーバーへ聞く（開かなければ取りに行かない）
// ・見られる人の判定はサーバー（/api/growth/needs-perspective）。404 なら区画ごと出さない
// ・文言は needs-guide-data.ts（docs/needs-guide/*.md から機械的に作ったもの）をそのまま出す
// ・数値は出さない（項目名中心）。他のスタッフとの比較・順位・平均は出さない
// 本人の画面（わたしの可能性ノート）では使わない。

import { useState } from "react";
import { NEEDS_GUIDE_HINTS, NEEDS_GUIDE_ITEMS } from "@/lib/needs-guide-data";
import {
  NEEDS_GUIDE_SECTION_LABELS,
  NEEDS_PERSPECTIVE_NOTICE,
  patternCategories,
  splitBold,
  type NeedsGuideItem,
  type NeedsGuideSide,
  type NeedsPerspective,
} from "@/lib/needs-guide";

type Resp = { available: boolean; perspective: NeedsPerspective | null; focusCurrentShared: boolean };

const itemOf = (key: string) => NEEDS_GUIDE_ITEMS.find((i) => i.key === key);

function Rich({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </>
  );
}

function GuideCard({ item, side }: { item: NeedsGuideItem; side: "high" | "low" }) {
  const s: NeedsGuideSide = item[side];
  return (
    <div className="mt-1.5 rounded-lg border border-gray-200 bg-white p-3 space-y-2" data-needs-card={`${item.key}:${side}`}>
      <div className="text-[11px] text-gray-600 whitespace-pre-wrap break-words">{item.meaning}</div>
      {NEEDS_GUIDE_SECTION_LABELS.map(({ key, label }) => {
        const lines = s[key];
        if (!lines || lines.length === 0) return null;
        return (
          <div key={key}>
            <p className="text-[12px] font-bold text-gray-800">{label}</p>
            <ul className="mt-0.5 list-disc pl-5 space-y-0.5 text-[12px] leading-relaxed text-gray-800">
              {lines.map((l, i) => (
                <li key={i} className="break-words">
                  <Rich text={l} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function ItemList({ keys, side, label }: { keys: string[]; side: "high" | "low"; label: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="space-y-1" data-needs-list={side}>
      <p className="text-[12px] font-bold text-gray-900">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {keys.map((k) => {
          const it = itemOf(k);
          if (!it) return null;
          const on = open === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setOpen(on ? null : k)}
              aria-expanded={on}
              className={`min-h-[36px] rounded-full border px-3 text-[12px] ${on ? "border-teal-600 bg-teal-600 text-white" : "border-gray-300 bg-white text-gray-800"}`}
              data-needs-item={k}
            >
              {it.name} {on ? "▴" : "▾"}
            </button>
          );
        })}
      </div>
      {open && itemOf(open) && <GuideCard item={itemOf(open)!} side={side} />}
    </div>
  );
}

export function NeedsPerspectiveSection({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Resp | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading) {
      setLoading(true);
      try {
        const res = await fetch(`/api/growth/needs-perspective?user=${encodeURIComponent(userId)}`, { cache: "no-store", credentials: "same-origin" });
        if (!res.ok) {
          setHidden(true);
          return;
        }
        setData((await res.json()) as Resp);
      } catch {
        setHidden(true);
      } finally {
        setLoading(false);
      }
    }
  };

  if (hidden) return null;
  const p = data?.perspective ?? null;
  const cats = p ? patternCategories(p, NEEDS_GUIDE_ITEMS) : [];
  const phiItem = p?.phi ? itemOf(p.phi) : undefined;

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/30" data-needs-perspective data-open={open ? "1" : "0"}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left min-h-[44px]"
      >
        <span className="text-sm font-bold text-indigo-950">🧭 欲求の視点（関わる側のヒント）</span>
        <span className="text-xs text-indigo-800">{open ? "閉じる ▴" : "開く ▾"}</span>
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-3">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-950" data-needs-notice>
            {NEEDS_PERSPECTIVE_NOTICE}
          </p>
          {loading && <p className="text-xs text-gray-500">読み込み中…</p>}
          {data && !data.available && <p className="text-[12px] text-gray-700" data-needs-empty>診断結果がまだありません</p>}
          {p && (
            <>
              {phiItem && (
                <div className="rounded-lg border border-indigo-200 bg-white p-3" data-needs-phi>
                  <p className="text-[12px] font-bold text-gray-900">まず聴くテーマ：{phiItem.name}</p>
                  <p className="mt-1 text-[13px] text-gray-800">{phiItem.firstQuestion}</p>
                </div>
              )}
              <ItemList keys={p.strong} side="high" label="高い欲求（上位3）" />
              <ItemList keys={p.weak} side="low" label="低い欲求（下位3）" />
              {(p.overwork.length > 0 || p.rethink.length > 0) && (
                <div className="space-y-1.5" data-needs-patterns>
                  <p className="text-[12px] font-bold text-gray-900">気になるパターン</p>
                  {p.overwork.length > 0 && (
                    <p className="text-[12px] text-gray-800">頑張りすぎの可能性：{p.overwork.map((k) => itemOf(k)?.name).join("・")}</p>
                  )}
                  {p.rethink.length > 0 && (
                    <p className="text-[12px] text-gray-800">やり方の見直し：{p.rethink.map((k) => itemOf(k)?.name).join("・")}</p>
                  )}
                  {cats.map((c) => {
                    const h = NEEDS_GUIDE_HINTS.find((x) => x.category === c);
                    if (!h) return null;
                    return (
                      <div key={c} className="rounded-lg border border-gray-200 bg-white p-3">
                        <p className="text-[12px] font-bold text-gray-800">{h.title}</p>
                        <ul className="mt-0.5 list-disc pl-5 space-y-0.5 text-[12px] leading-relaxed text-gray-800">
                          {h.items.map((l, i) => (
                            <li key={i}>
                              <Rich text={l} />
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
              {!data?.focusCurrentShared && (
                <p className="text-[11px] leading-relaxed text-gray-500" data-needs-limited>
                  「まず聴くテーマ（φ）」と「気になるパターン」は「注力」「現況」の値を使います。今の公開設定では、注力・現況は本人以外に渡さない決まりのため表示していません。
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
