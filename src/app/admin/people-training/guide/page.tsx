"use client";

// 📘 欲求別成長支援ガイド（管理画面）— 院長・管理者と、人材育成研修の受講者に指定された人
// ・カテゴリー（7）の一覧 → 開くと目次と本文。15項目は「欲求が強い人／低い人」をタブで切り替える
// ・検索：全カテゴリーの本文から探し、「カテゴリー › 見出し」と前後の文を出す。押すとその位置へ。カテゴリーで絞れる
//   検索は画面の中だけで行う（外部サービス・AIに渡さない）
// ・本文は .md の中身そのまま（サーバーが見られる人にだけ返す）。スタッフの欲求の値・診断結果は出さない
// ・?doc=<カテゴリー>&sec=<見出し> で、その位置を開く（人材育成研修からのリンク）

import { useCallback, useEffect, useMemo, useState } from "react";
import { GuideDocView, GuideToc } from "@/components/needs-guide/GuideDocView";
import { docTitle, searchDocs, splitSections, type GuideTab, type NeedsGuideDoc, type SearchHit } from "@/lib/needs-guide-docs";

type Load = { state: "loading" } | { state: "error" } | { state: "ready"; docs: NeedsGuideDoc[] };

function readParams(): { doc: string; sec: string } {
  try {
    const p = new URLSearchParams(window.location.search);
    return { doc: p.get("doc") ?? "", sec: p.get("sec") ?? "" };
  } catch {
    return { doc: "", sec: "" };
  }
}

export default function NeedsGuidePage() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [docId, setDocId] = useState<string>("");
  const [tabs, setTabs] = useState<Record<string, GuideTab>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/people-training/guide", { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { docs?: NeedsGuideDoc[] };
        if (!alive) return;
        const docs = Array.isArray(j.docs) ? j.docs : [];
        setLoad({ state: "ready", docs });
        const { doc, sec } = readParams();
        if (doc && docs.some((d) => d.id === doc)) {
          setDocId(doc);
          if (sec) jumpLater(sec);
        }
      })
      .catch(() => alive && setLoad({ state: "error" }));
    return () => {
      alive = false;
    };
  }, []);

  const docs = useMemo(() => (load.state === "ready" ? load.docs : []), [load]);
  const doc = docs.find((d) => d.id === docId) ?? null;
  const hits: SearchHit[] = useMemo(() => searchDocs(docs, query, { docId: filter || undefined }), [docs, query, filter]);

  /** 見出しへ移動（本文が描かれてから） */
  const jump = useCallback((sectionId: string) => {
    setHighlightId(sectionId);
    jumpLater(sectionId);
  }, []);

  const openHit = (h: SearchHit) => {
    setDocId(h.docId);
    // タブの中の文なら、そのタブを開く（親＝項目の見出し）
    const tab = h.tab;
    const d = docs.find((x) => x.id === h.docId);
    const parentId = tab && d ? splitSections(d).find((x) => x.id === h.sectionId)?.parentId : null;
    if (tab && parentId) setTabs((prev) => ({ ...prev, [parentId]: tab }));
    jump(h.sectionId);
  };

  if (load.state === "loading") return <p className="text-sm text-slate-500">読み込み中...</p>;
  if (load.state === "error") return <p className="text-sm text-slate-600">ガイドを読み込めませんでした。</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-5" data-needs-guide>
      <div>
        <h1 className="text-2xl font-bold text-slate-800">📘 欲求別成長支援ガイド</h1>
      </div>

      {/* 検索 */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="キーワード（例：承認・声かけ・頑張りすぎ）"
            className="min-w-0 flex-1 basis-56 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            aria-label="ガイドを検索"
            data-guide-search
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
            aria-label="カテゴリーで絞り込む"
            data-guide-filter
          >
            <option value="">すべてのカテゴリー</option>
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {docTitle(d)}
              </option>
            ))}
          </select>
        </div>
        {query.trim() && (
          <div>
            <p className="text-xs text-slate-500" data-guide-hit-count>
              {hits.length}件{hits.length >= 200 ? "（多いので200件まで）" : ""}
            </p>
            <ul className="mt-1 max-h-96 space-y-1 overflow-y-auto">
              {hits.map((h, i) => (
                <li key={`${h.sectionId}-${i}`}>
                  <button
                    type="button"
                    onClick={() => openHit(h)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-teal-50"
                    data-guide-hit={h.sectionId}
                  >
                    <span className="block text-xs font-medium text-teal-800 break-words">{h.path}</span>
                    <span className="block text-sm text-slate-700 break-words">
                      {h.before}
                      <mark className="rounded bg-amber-200 px-0.5 text-slate-900">{h.match}</mark>
                      {h.after}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* カテゴリーの一覧 */}
      <section className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-guide-categories>
        {docs.map((d, i) => (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              setDocId(d.id);
              setHighlightId(null);
              jumpLater(`guide-top`);
            }}
            className={`rounded-xl border px-4 py-3 text-left text-sm ${
              d.id === docId ? "border-teal-600 bg-teal-50 font-semibold text-teal-900" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
            }`}
            data-guide-category={d.id}
          >
            {i + 1}. {docTitle(d)}
          </button>
        ))}
      </section>

      <div id="guide-top" className="scroll-mt-24" />
      {doc && (
        <div className="space-y-4">
          <GuideToc doc={doc} onJump={jump} />
          <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
            <GuideDocView doc={doc} tabs={tabs} onTab={(id, t) => setTabs((p) => ({ ...p, [id]: t }))} highlightId={highlightId} />
          </div>
        </div>
      )}
    </div>
  );
}

/** 描かれてから、その見出しの位置へ移動する */
function jumpLater(id: string) {
  let tries = 0;
  const go = () => {
    const el = document.getElementById(id) ?? document.querySelector(`[data-guide-section="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (tries++ < 20) window.setTimeout(go, 50);
  };
  window.setTimeout(go, 0);
}
