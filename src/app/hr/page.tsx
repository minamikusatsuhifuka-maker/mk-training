"use client";

// 🧭 人事制度ポータル トップ（指示書116・機能ID hr_portal）
// 4つの制度カード＋FAQ入口＋ポータル内検索。掲載文言は data/hr-portal.ts（別添転記）のみ。

import { useState } from "react";
import Link from "next/link";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { HrPortalFooter } from "@/components/HrPortalParts";
import { searchHr, type HrSearchHit } from "@/lib/hr-search";

const PORTAL_CARDS = [
  { href: "/hr/grade", emoji: "🎯", title: "等級制度", desc: "G1〜G5・同心円の考え方" },
  { href: "/hr/evaluation", emoji: "🌱", title: "評価制度", desc: "S/A/B/C・7つの実・三面鏡" },
  { href: "/hr/promotion", emoji: "🪜", title: "ステージ移行", desc: "必須の学び・到達項目・対話の問い" },
  { href: "/hr/salary", emoji: "💴", title: "給与テーブル", desc: "月給レンジ・全号俸表" },
];

function HrPortalBody() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HrSearchHit[] | null>(null);

  const runSearch = (q: string) => {
    setQuery(q);
    setResults(q.trim() ? searchHr(q) : null);
  };

  return (
    <div className="space-y-6">
      {/* ポータル内検索（制度ページ本文＋FAQを横断・部分一致） */}
      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="キーワードで検索（例: 号俸・S評価・化粧品検定・1on1）"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-teal-200 bg-white"
        />
        {results !== null &&
          (results.length === 0 ? (
            <div className="text-sm text-gray-600 bg-white border border-gray-200 rounded-xl px-4 py-4 space-y-2">
              <p>見つかりませんでした。</p>
              <Link
                href="/hr/faq"
                className="inline-block text-teal-700 hover:underline text-sm"
              >
                FAQ一覧から探す →
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {results.map((r, i) => (
                <li key={`${r.href}-${i}`}>
                  <Link
                    href={r.href}
                    className="block bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-teal-200 hover:bg-teal-50/30 transition-colors"
                  >
                    <p className="text-xs font-semibold text-teal-700">
                      {r.pageTitle}
                      <span className="text-gray-400 font-normal">
                        ｜{r.section}
                      </span>
                    </p>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      {r.excerpt}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </div>

      {/* 制度カード */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PORTAL_CARDS.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="bg-white border border-gray-200 rounded-xl p-4 hover:border-teal-200 hover:shadow-sm transition-all"
          >
            <p className="text-base font-bold text-gray-800">
              {c.emoji} {c.title}
            </p>
            <p className="text-xs text-gray-500 mt-1">{c.desc}</p>
          </Link>
        ))}
      </div>

      {/* FAQ入口 */}
      <Link
        href="/hr/faq"
        className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-teal-200 hover:shadow-sm transition-all"
      >
        <p className="text-base font-bold text-gray-800">❓ よくある質問（FAQ）</p>
        <p className="text-xs text-gray-500 mt-1">
          等級制度・評価・給与と昇給・ステージ移行の40問
        </p>
      </Link>

      <HrPortalFooter />
    </div>
  );
}

export default function HrPortalPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader
        navKey="/hr"
        title="🧭 人事制度ポータル"
        description="等級・評価・給与・ステージ移行の閲覧とFAQ・検索"
      />
      <FeatureGate feature="hr_portal">
        <HrPortalBody />
      </FeatureGate>
    </div>
  );
}
