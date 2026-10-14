"use client";

// 欲求別成長支援ガイド・人材育成研修の本文（目次＋見出しごとの本文）
// ・本文は .md の中身そのまま（見出しで区切っただけ）。Markdown の表・箇条書きはそのまま表示する
// ・STEP2 の項目（15項目）は「欲求が強い人／低い人」をタブで切り替える
// ・見出しには id を付ける（検索の結果・目次から、その位置へ移動する）

import { MarkdownView } from "@/components/deep-research/MarkdownView";
import { GUIDE_TAB_TITLES, splitSections, tocOf, type GuideSection, type GuideTab, type NeedsGuideDoc } from "@/lib/needs-guide-docs";

const headingCls: Record<number, string> = {
  1: "text-xl font-bold text-slate-800",
  2: "text-lg font-bold text-slate-800 border-b border-slate-200 pb-1",
  3: "text-base font-semibold text-slate-700",
};

function Heading({ s }: { s: GuideSection }) {
  const cls = `${headingCls[Math.min(s.level, 3)]} scroll-mt-24 break-words`;
  if (s.level <= 1) return <h1 id={s.id} className={cls}>{s.title}</h1>;
  if (s.level === 2) return <h2 id={s.id} className={cls}>{s.title}</h2>;
  if (s.level === 3) return <h3 id={s.id} className={cls}>{s.title}</h3>;
  return <h4 id={s.id} className={`${cls} text-sm`}>{s.title}</h4>;
}

function Body({ s }: { s: GuideSection }) {
  if (!s.body.trim()) return null;
  return (
    <div className="break-words" data-guide-body={s.id}>
      <MarkdownView>{s.body}</MarkdownView>
    </div>
  );
}

/** 目次（## と ###）。押すとその見出しへ */
export function GuideToc({ doc, onJump }: { doc: NeedsGuideDoc; onJump: (sectionId: string) => void }) {
  const toc = tocOf(splitSections(doc));
  if (toc.length === 0) return null;
  return (
    <nav className="rounded-xl border border-slate-200 bg-white p-3" data-guide-toc={doc.id}>
      <p className="text-xs font-bold text-slate-600">目次</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {toc.map((s) => (
          <li key={s.id} className={s.level === 3 ? "pl-4" : ""}>
            <button type="button" onClick={() => onJump(s.id)} className="text-left text-teal-800 hover:underline" data-guide-toc-item={s.id}>
              {s.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * 本文。tabs は 項目の見出しid → 開いているタブ（無ければ「欲求が強い人」）。
 * highlightId の区切りは少しのあいだ色を付ける（検索の結果から来たとき）。
 */
export function GuideDocView({
  doc,
  tabs,
  onTab,
  highlightId,
}: {
  doc: NeedsGuideDoc;
  tabs: Record<string, GuideTab>;
  onTab: (itemSectionId: string, tab: GuideTab) => void;
  highlightId: string | null;
}) {
  const sections = splitSections(doc);
  const tabChildren = (id: string) => sections.filter((x) => x.parentId === id && x.tab !== null);
  const wrap = (s: GuideSection, el: React.ReactNode) => (
    <section
      key={s.id}
      className={`space-y-2 rounded-lg transition-colors ${highlightId === s.id ? "bg-amber-50 ring-2 ring-amber-300 p-2 -m-2" : ""}`}
      data-guide-section={s.id}
    >
      {el}
    </section>
  );
  const out: React.ReactNode[] = [];
  for (const s of sections) {
    if (s.tab !== null) continue; // タブの中身は項目のところで出す
    const kids = tabChildren(s.id);
    if (kids.length === 0) {
      out.push(
        wrap(
          s,
          <>
            {s.level > 0 && <Heading s={s} />}
            <Body s={s} />
          </>
        )
      );
      continue;
    }
    // 15項目：欲求が強い人／低い人をタブで
    const active: GuideTab = tabs[s.id] ?? "high";
    const shown = kids.find((k) => k.tab === active) ?? kids[0];
    out.push(
      wrap(
        s,
        <>
          <Heading s={s} />
          <Body s={s} />
          <div className="flex flex-wrap gap-2" role="tablist" data-guide-tabs={s.id}>
            {kids.map((k) => (
              <button
                key={k.id}
                type="button"
                role="tab"
                aria-selected={k.id === shown.id}
                onClick={() => onTab(s.id, k.tab!)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  k.id === shown.id ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                data-guide-tab={`${s.id}:${k.tab}`}
              >
                {GUIDE_TAB_TITLES[k.tab!]}
              </button>
            ))}
          </div>
          <div
            className={`rounded-xl border border-slate-200 bg-white p-3 space-y-2 transition-colors ${highlightId === shown.id ? "ring-2 ring-amber-300 bg-amber-50" : ""}`}
            role="tabpanel"
            data-guide-section={shown.id}
          >
            <Heading s={shown} />
            <Body s={shown} />
          </div>
        </>
      )
    );
  }
  return (
    <article className="space-y-5 text-slate-800" data-guide-doc={doc.id}>
      {out}
    </article>
  );
}
