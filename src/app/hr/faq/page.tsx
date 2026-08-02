"use client";

// よくある質問ページ（指示書116・[FAQ] 40問の転記のみ）
// カテゴリタブ＋アコーディオン。ハッシュ #q12 で該当の質問を開いて遷移する。

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  HrPortalFooter,
  HrBackLink,
  useScrollToHash,
} from "@/components/HrPortalParts";
import {
  HR_FAQ,
  HR_FAQ_CATEGORIES,
  type HrFaqCategory,
} from "@/data/hr-portal";

function FaqBody() {
  const [category, setCategory] = useState<HrFaqCategory>(
    HR_FAQ_CATEGORIES[0]
  );
  const [openIds, setOpenIds] = useState<Set<number>>(new Set());

  // #q12 → 該当カテゴリに切替え・開いた状態でスクロール
  useScrollToHash((hash) => {
    const m = /^q(\d+)$/.exec(hash);
    if (!m) return;
    const id = Number(m[1]);
    const item = HR_FAQ.find((f) => f.id === id);
    if (!item) return;
    setCategory(item.category);
    setOpenIds((prev) => new Set(prev).add(id));
  });

  const toggle = (id: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const items = HR_FAQ.filter((f) => f.category === category);

  return (
    <div className="space-y-4">
      <HrBackLink />

      {/* カテゴリタブ */}
      <div className="flex rounded-full border border-gray-200 overflow-hidden text-xs sm:text-sm w-fit bg-white flex-wrap">
        {HR_FAQ_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={
              category === c
                ? "px-3 sm:px-4 py-2 bg-teal-600 text-white font-medium"
                : "px-3 sm:px-4 py-2 text-gray-600 hover:bg-gray-50"
            }
          >
            {c}
            <span className="ml-1 opacity-70">
              {HR_FAQ.filter((f) => f.category === c).length}
            </span>
          </button>
        ))}
      </div>

      {/* アコーディオン */}
      <div className="space-y-2">
        {items.map((f) => {
          const open = openIds.has(f.id);
          return (
            <section
              key={f.id}
              id={`q${f.id}`}
              className="bg-white border border-gray-200 rounded-xl overflow-hidden scroll-mt-4"
            >
              <button
                type="button"
                onClick={() => toggle(f.id)}
                className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left hover:bg-teal-50/30 transition-colors"
              >
                <span className="text-sm font-semibold text-gray-800 leading-relaxed">
                  Q{f.id}. {f.q}
                </span>
                <span className="text-gray-400 text-xs shrink-0 mt-0.5">
                  {open ? "▲" : "▼"}
                </span>
              </button>
              {open && (
                <p className="px-4 pb-4 text-sm text-gray-700 leading-relaxed border-t border-gray-50 pt-3">
                  {f.a}
                </p>
              )}
            </section>
          );
        })}
      </div>

      {/* 共通注記はトップ＋4制度ページのみのため、FAQは出典表記のみ */}
      <HrPortalFooter showNotice={false} />
    </div>
  );
}

export default function HrFaqPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="❓ よくある質問"
        description="等級制度・評価・給与と昇給・ステージ移行"
      />
      <FeatureGate feature="hr_portal">
        <FaqBody />
      </FeatureGate>
    </div>
  );
}
