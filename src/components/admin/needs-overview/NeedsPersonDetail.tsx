"use client";

// 🧭 欲求の一覧（指示書276 §3-2）— 一人ずつの詳しい画面（院長だけ）
// レーダー・15項目・高い欲求（上位3）/低い欲求（下位3）・ガイドの関わり方のヒント（可能性ノートの欲求の視点と同じ部品）・
// サーベイの原本・可能性ノートへの入口・前のサーベイとの比較。読むだけ。

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { NeedsRadarChart } from "@/components/NeedsRadarChart";
import { ItemList } from "@/components/NeedsPerspectiveSection";
import { NEEDS_GROUPS, NEED_GROUP_STYLE, NEED_KEYS, NEED_LABELS } from "@/lib/needs-survey";
import { NEEDS_GUIDE_ITEMS } from "@/lib/needs-guide-data";
import { NEEDS_PERSPECTIVE_NOTICE } from "@/lib/needs-guide";
import { NOT_DECIDED_LABEL } from "@/lib/michi-progress";
import { NEEDS_EMPTY_LABEL, snapshotDiff, type NeedsPersonRow, type NeedsSnapshot } from "@/lib/needs-overview";
import { formatDiff } from "@/lib/staff-growth";

type Snapshot = NeedsSnapshot & { strong: string[]; weak: string[]; imageUrl: string; isPdf: boolean };

const guideKeyOf = (surveyKey: string) => NEEDS_GUIDE_ITEMS.find((i) => i.surveyKey === surveyKey)?.key ?? "";

function Diff({ n }: { n: number | undefined }) {
  if (typeof n !== "number") return null;
  return (
    <span className={`ml-1 text-[10px] tabular-nums ${n === 0 ? "text-gray-400" : "font-bold text-indigo-700"}`} data-diff>
      {formatDiff(n)}
    </span>
  );
}

export function NeedsPersonDetail({
  userId,
  person,
  onClose,
  fullView = false,
}: {
  userId: string;
  person: NeedsPersonRow | undefined;
  onClose: () => void;
  /** 277: スイッチが ON（公開設定にかかわらず見ている） */
  fullView?: boolean;
}) {
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [prevIdx, setPrevIdx] = useState(1);

  useEffect(() => {
    // 人が変わったら作り直す（呼び出し側が key={userId} を付ける）ので、ここで中身を戻さない
    let alive = true;
    fetch(`/api/admin/needs-overview?user=${encodeURIComponent(userId)}`, { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return ((await r.json()) as { snapshots: Snapshot[] }).snapshots;
      })
      .then((s) => alive && setSnaps(s))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cur = snaps?.[0];
  const prev = snaps && snaps.length > 1 ? snaps[Math.min(prevIdx, snaps.length - 1)] : undefined;
  const diff = cur && prev ? snapshotDiff(prev, cur) : null;
  const hasDetails = !!cur && Object.keys(cur.details).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/30" onClick={onClose} data-person-detail={userId}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${person?.name ?? ""}の欲求`}
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900">
              🧭 {person?.name ?? "（名前不明）"}
              {person?.testSeed && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] text-amber-900">🧪 検証用</span>}
            </h2>
            <p className="text-[12px] text-gray-600">
              {person?.roleLabel || "職種 —"}・{person?.level ? person.levelName : NOT_DECIDED_LABEL}
            </p>
          </div>
          <button type="button" onClick={onClose} className="min-h-[40px] shrink-0 rounded-full border border-gray-300 px-3 text-sm" data-close-detail>
            ✕ 閉じる
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <Link href={`/staff-growth/${encodeURIComponent(userId)}`} className="inline-flex min-h-[36px] items-center rounded-full border border-teal-600 px-3 text-teal-800" data-link-growth>
            🌱 可能性ノートへ
          </Link>
          {cur?.imageUrl && (
            <a href={cur.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[36px] items-center rounded-full border border-gray-300 px-3 text-gray-800" data-link-original>
              {cur.isPdf ? "📄 サーベイの原本（PDF）を開く" : "🖼 サーベイの原本（画像）を開く"}
            </a>
          )}
        </div>

        {failed && <p className="mt-3 text-sm text-red-700">読み込みに失敗しました</p>}
        {!snaps && !failed && <p className="mt-3 text-sm text-gray-500">読み込み中…</p>}
        {snaps && !cur && <p className="mt-3 text-sm text-gray-700" data-detail-empty>{NEEDS_EMPTY_LABEL}</p>}

        {cur && (
          <div className="mt-3 space-y-3">
            <section className="flex flex-wrap items-center gap-3">
              <NeedsRadarChart values={cur.values} size={220} />
              <div className="space-y-1 text-[12px]">
                <p className="text-gray-600">入れた日 <span className="tabular-nums text-gray-900">{cur.answeredOn || "—"}</span></p>
                {NEED_KEYS.map((k) => (
                  <p key={k} className={NEED_GROUP_STYLE[k].text}>
                    <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${NEED_GROUP_STYLE[k].dot}`} />
                    {NEED_LABELS[k]} <span className="font-bold tabular-nums">{cur.values[k] ?? "—"}</span>
                    {diff && <Diff n={diff.values[k]} />}
                  </p>
                ))}
              </div>
            </section>

            {snaps && snaps.length > 1 && (
              <label className="flex flex-wrap items-center gap-1 text-[12px] text-gray-700" data-prev-select>
                前のサーベイと比べる：
                <select value={prevIdx} onChange={(e) => setPrevIdx(Number(e.target.value))} className="min-h-[36px] rounded border border-gray-300 px-2">
                  {snaps.slice(1).map((s, i) => (
                    <option key={i + 1} value={i + 1}>{s.answeredOn || "日付なし"}</option>
                  ))}
                </select>
                <span className="text-[11px] text-gray-500">（＋/− は前 → 今の差）</span>
              </label>
            )}

            {hasDetails ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs" data-detail-items>
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500">
                      <th className="py-1 pr-2 text-left font-medium">項目</th>
                      {prev && <th className="px-2 py-1 text-right font-medium">前（{prev.answeredOn}）</th>}
                      <th className="px-2 py-1 text-right font-medium">欲求</th>
                    </tr>
                  </thead>
                  <tbody>
                    {NEEDS_GROUPS.map((g) => {
                      const s = NEED_GROUP_STYLE[g.key];
                      return (
                        <Fragment key={g.key}>
                          <tr className={`${s.headerBg} border-t-2 border-gray-200`}>
                            <td colSpan={prev ? 3 : 2} className="px-2 py-1">
                              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${s.dot}`} />
                              <span className={`font-semibold ${s.text}`}>{g.label}</span>
                            </td>
                          </tr>
                          {g.items.map((it) => (
                            <tr key={it.key} className={`border-b border-l-4 border-gray-50 ${s.rowBorder}`}>
                              <td className="whitespace-nowrap py-1 pl-2 pr-2 text-gray-800">
                                {it.label}
                                {cur.strong.includes(it.key) && <span className="ml-1 text-[10px] font-bold text-rose-600">▲ 高い欲求</span>}
                                {cur.weak.includes(it.key) && <span className="ml-1 text-[10px] font-bold text-sky-700">▼ 低い欲求</span>}
                              </td>
                              {prev && <td className="px-2 py-1 text-right tabular-nums text-gray-500">{prev.details[it.key] ?? "—"}</td>}
                              <td className="px-2 py-1 text-right tabular-nums text-gray-800">
                                {cur.details[it.key] ?? "—"}
                                {diff && <Diff n={diff.details[it.key]} />}
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-[12px] text-gray-600">
                {fullView ? "15項目の値はまだ入っていません。" : "15項目は、本人が「詳細（詳細15項目の欲求値）も公開」を選んだときだけ見られます。"}
              </p>
            )}

            {cur.strong.length > 0 && (
              <section className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/30 p-3" data-detail-hints>
                <p className="text-sm font-bold text-indigo-950">🧭 関わり方のヒント（欲求別成長支援ガイド）</p>
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-950">{NEEDS_PERSPECTIVE_NOTICE}</p>
                <ItemList keys={cur.strong.map(guideKeyOf).filter(Boolean)} side="high" label="高い欲求（上位3）" />
                <ItemList keys={cur.weak.map(guideKeyOf).filter(Boolean)} side="low" label="低い欲求（下位3）" />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
