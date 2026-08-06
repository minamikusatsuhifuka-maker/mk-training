"use client";

// 分かち愛マンスリーダイジェスト（指示書146-C）
// 既定は前月分を表示。過去月は簡易アーカイブ（セレクタ）で切り替えられる。
// 出すのは「全体件数」と「実投稿の抜粋」だけ。個人別の件数・順位は出さない。

import { useEffect, useState } from "react";
import {
  buildMonthlyDigest,
  formatYmJa,
  listDigestMonths,
  previousYm,
  type DigestExcerpt,
  type MonthlyDigest,
} from "@/lib/monthly-digest";

function ExcerptList({
  title,
  accent,
  items,
  whoPrefix,
}: {
  title: string;
  accent: string;
  items: DigestExcerpt[];
  whoPrefix?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={`text-xs font-medium mb-2 ${accent}`}>{title}</p>
      <div className="space-y-2">
        {items.map((e) => (
          <div
            key={e.id}
            className="p-3 bg-white border border-gray-100 rounded-xl"
          >
            <p className="text-sm text-gray-800 leading-relaxed max-w-prose whitespace-pre-wrap">
              {e.text}
            </p>
            {e.who && (
              <p className="text-xs text-gray-600 mt-1.5">
                {whoPrefix}
                {e.who}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MonthlyDigestSection() {
  const [ym, setYm] = useState<string>(() => previousYm());
  const [months, setMonths] = useState<string[]>([]);
  const [digest, setDigest] = useState<MonthlyDigest | null>(null);

  useEffect(() => {
    listDigestMonths()
      .then((list) => {
        setMonths(list);
        // 前月に投稿が無ければ、投稿がある直近の月にフォールバック
        setYm((cur) => (list.includes(cur) ? cur : (list[0] ?? cur)));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    buildMonthlyDigest(ym)
      .then((d) => {
        if (!cancelled) setDigest(d);
      })
      .catch(() => {
        /* 取得失敗時は直前の表示を残す（ホームは壊さない） */
      });
    return () => {
      cancelled = true;
    };
  }, [ym]);

  // 未取得・投稿0件はカードごと非表示（他セクションと同じ流儀）。
  // 月を切り替えた直後は取得済みの前の月を出したままにして、ちらつかせない。
  if (!digest || digest.counts.total === 0) return null;

  const { counts } = digest;

  return (
    <section className="px-4 py-5 border-b border-gray-100">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
          分かち愛ダイジェスト
        </h2>
        {months.length > 1 && (
          <select
            value={ym}
            onChange={(e) => setYm(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700"
            aria-label="表示する月"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {formatYmJa(m)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-4">
        <div>
          <p className="text-sm font-medium text-gray-900">
            {formatYmJa(digest.ym)}の分かち愛
          </p>
          {/* 全体の件数のみ。誰が何件かは出さない */}
          <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-gray-700">
            {counts.thankyou > 0 && <span>♥ ありがとう {counts.thankyou}件</span>}
            {counts.kizuki > 0 && <span>💡 気づき {counts.kizuki}件</span>}
            {counts.good > 0 && <span>💛 良いこと {counts.good}件</span>}
          </div>
        </div>

        <ExcerptList
          title="♥ ありがとうカードから"
          accent="text-rose-700"
          items={digest.thankyou}
          whoPrefix="→ "
        />
        <ExcerptList
          title="💡 日々の気づきから"
          accent="text-teal-700"
          items={digest.kizuki}
          whoPrefix="— "
        />
        <ExcerptList
          title="💛 良いこと共有から"
          accent="text-amber-700"
          items={digest.good}
          whoPrefix="— "
        />

        <p className="text-[11px] text-gray-500">
          その月の投稿から新しい順に抜粋しています（各種別3件まで）。
        </p>
      </div>
    </section>
  );
}
