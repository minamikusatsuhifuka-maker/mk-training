"use client";

// 人事制度ポータルの共用パーツ（指示書116）
// - 掲載文言は src/data/hr-portal.ts（別添からの転記）のみを描画する。
// - 文中の **…** は太字として描画（### 等の見出し記号はテキスト表示しない整形標準）。
// - 共通注記（毎年ブラッシュアップ）と出典表記はトップ＋4制度ページ末尾で共用。

import Link from "next/link";
import { useEffect } from "react";
import {
  HR_COMMON_NOTICE,
  HR_SOURCE_NOTE,
  type HrBlock,
  type HrSection,
} from "@/data/hr-portal";

// **…** を <strong> に変換（それ以外の記号は解釈しない）
export function renderInlineBold(text: string): React.ReactNode {
  const parts = text.split("**");
  if (parts.length < 3) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-gray-800">
        {p}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    )
  );
}

export function HrTableView({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border border-gray-100 rounded-lg">
        <thead>
          <tr className="bg-teal-50/60">
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-gray-100 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white even:bg-gray-50/50 align-top">
              {r.map((c, j) => (
                <td
                  key={j}
                  className="px-3 py-2 text-sm text-gray-700 border-b border-gray-50 leading-relaxed"
                >
                  {renderInlineBold(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HrBlocksView({ blocks }: { blocks: HrBlock[] }) {
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.type === "p") {
          return (
            <p key={i} className="text-sm text-gray-700 leading-relaxed">
              {renderInlineBold(b.text)}
            </p>
          );
        }
        if (b.type === "list") {
          return (
            <ul key={i} className="space-y-1.5 pl-1">
              {b.items.map((item, j) => (
                <li
                  key={j}
                  className="text-sm text-gray-700 leading-relaxed flex gap-2"
                >
                  <span className="text-teal-500 shrink-0 mt-0.5">・</span>
                  <span className="min-w-0">{renderInlineBold(item)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return <HrTableView key={i} headers={b.headers} rows={b.rows} />;
      })}
    </div>
  );
}

export function HrSectionView({ section }: { section: HrSection }) {
  return (
    <section
      id={section.id}
      className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 space-y-3 scroll-mt-4"
    >
      <h2 className="text-sm font-bold text-gray-800">
        {renderInlineBold(section.title)}
      </h2>
      {section.blocks.length > 0 && <HrBlocksView blocks={section.blocks} />}
    </section>
  );
}

// 共通注記（[COMMON:notice]）＋出典表記。
// 注記はトップ＋4制度ページのみ（指示書116 3-5）。出典は各ページ末尾（同 4章）
// → FAQページは showNotice={false} で出典のみ表示する。
export function HrPortalFooter({
  showNotice = true,
}: {
  showNotice?: boolean;
}) {
  return (
    <div className="space-y-3 pt-2">
      {showNotice && (
        <p className="text-xs text-gray-600 leading-relaxed bg-teal-50/60 border border-teal-100 rounded-xl px-4 py-3">
          {HR_COMMON_NOTICE}
        </p>
      )}
      <p className="text-[11px] text-gray-400 leading-relaxed px-1">
        {HR_SOURCE_NOTE}
      </p>
    </div>
  );
}

// ポータルトップへ戻る導線（サブページ共通）
export function HrBackLink() {
  return (
    <Link
      href="/hr"
      className="inline-flex items-center gap-1 text-xs text-teal-700 hover:underline"
    >
      ← 人事制度ポータルへ戻る
    </Link>
  );
}

// ハッシュアンカーへのスクロール（FeatureGate 配下はロード後にDOMが現れるため、
// コンテンツ側のマウント時に1回だけ実行する）
export function useScrollToHash(onHash?: (hash: string) => void) {
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!hash) return;
    onHash?.(hash);
    // 折りたたみを開いた後にレイアウトが確定してからスクロール
    const timer = setTimeout(() => {
      document
        .getElementById(hash)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(timer);
    // マウント時に1回だけ実行する意図（onHash は初回の値で固定してよい）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
