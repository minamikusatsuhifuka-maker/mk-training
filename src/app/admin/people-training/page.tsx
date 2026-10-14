"use client";

// 🎓 人材育成研修（管理画面）— 院長と、受講者に指定された人
// ・STEP3-2（人材育成研修）の本文（.md の中身そのまま）と、ガイドの各章（STEP1・STEP2・STEP3-1）へのリンク
// ・院長には、今の受講者と、指定・解除の記録（いつ・誰を）も出す。指定・解除は「⚙ 委任」で行う（院長だけ）
// ・スタッフの欲求の値・診断結果は出さない

import { useEffect, useState } from "react";
import Link from "next/link";
import { GuideDocView, GuideToc } from "@/components/needs-guide/GuideDocView";
import { docTitle, type GuideTab, type NeedsGuideDoc } from "@/lib/needs-guide-docs";
import { guideHref } from "@/lib/people-training";

type Resp = {
  doc: NeedsGuideDoc | null;
  guideDocs: Pick<NeedsGuideDoc, "id" | "label" | "file">[];
  isAdmin: boolean;
  trainees?: { userId: string; name: string }[];
  logs?: { at: string; changes: { field: string; before: string; after: string }[] }[];
};

const fmtAt = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

export default function PeopleTrainingPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [failed, setFailed] = useState(false);
  const [tabs, setTabs] = useState<Record<string, GuideTab>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/people-training", { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as Resp;
        if (alive) setData(j);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return <p className="text-sm text-slate-600">人材育成研修を読み込めませんでした。</p>;
  if (!data) return <p className="text-sm text-slate-500">読み込み中...</p>;

  const jump = (id: string) => {
    setHighlightId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5" data-people-training>
      <h1 className="text-2xl font-bold text-slate-800">🎓 人材育成研修</h1>

      {/* ガイドの各章へ */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4" data-training-guide-links>
        <p className="text-sm font-bold text-slate-700">📘 欲求別成長支援ガイド</p>
        <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {data.guideDocs.map((d, i) => (
            <li key={d.id}>
              <Link href={guideHref(d.id)} className="block rounded-lg border border-slate-200 px-3 py-2 text-sm text-teal-800 hover:bg-teal-50" data-training-guide-link={d.id}>
                {i + 1}. {docTitle(d)}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 院長だけ：受講者と、指定・解除の記録 */}
      {data.isAdmin && (
        <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 space-y-2" data-training-admin>
          <p className="text-sm font-bold text-teal-900">受講者（院長だけに表示）</p>
          {data.trainees && data.trainees.length > 0 ? (
            <p className="text-sm text-slate-800" data-training-trainees>
              {data.trainees.map((t) => t.name).join("・")}
            </p>
          ) : (
            <p className="text-sm text-slate-600" data-training-trainees>まだ指定されていません。</p>
          )}
          <p className="text-xs text-slate-600">
            受講者の指定・解除は「
            <Link href="/admin/delegation" className="text-teal-800 underline">
              🔑 委任の設定
            </Link>
            」の「🎓 人材育成研修」で行います（院長だけ）。外すと、その人はすぐに研修とガイドを見られなくなります。
          </p>
          <details className="text-xs text-slate-700" data-training-logs>
            <summary className="cursor-pointer">指定・解除の記録（{data.logs?.length ?? 0}件）</summary>
            {data.logs && data.logs.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {data.logs.map((l, i) => (
                  <li key={i}>
                    {fmtAt(l.at)}
                    {l.changes.map((c) => (c.field === "指定" ? `指定：${c.after}` : `解除：${c.before}`)).join("　")}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1">記録はまだありません。</p>
            )}
          </details>
        </section>
      )}

      {data.doc && (
        <div className="space-y-4">
          <GuideToc doc={data.doc} onJump={jump} />
          <div className="rounded-2xl border border-slate-200 bg-white p-4 md:p-6">
            <GuideDocView doc={data.doc} tabs={tabs} onTab={(id, t) => setTabs((p) => ({ ...p, [id]: t }))} highlightId={highlightId} />
          </div>
        </div>
      )}
    </div>
  );
}
