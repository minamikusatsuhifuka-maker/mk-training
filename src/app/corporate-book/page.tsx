"use client";

// 📕 コーポレートブック 閲覧専用ビューア（131-補2）
// - PDFは一切配信しない（ファイル持ち出し経路の遮断が目的・スクショは原理的に防止不可=承認済み前提）。
//   各ページは認証付きAPI /api/corporate-book?page=n（ログイン必須）から画像で取得する。
// - ページ送り: 前後ボタン＋スワイプ＋キーボード←→。タップで拡大トグル・モバイルはピンチも可。
// - 前後1ページを先読みして体感速度を確保。版管理表記は lib/corporate-book.ts の定数から。
// - 直URLガードは PageAccessGate（page_corporate_book・公開型既定ON）が担当。

import { useState, useEffect, useCallback, useRef } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import {
  CORPORATE_BOOK_PAGE_COUNT,
  CORPORATE_BOOK_VERSION,
  CORPORATE_BOOK_API,
} from "@/lib/corporate-book";

const pageSrc = (n: number) => `${CORPORATE_BOOK_API}?page=${n}`;

export default function CorporateBookPage() {
  const [page, setPage] = useState(1);
  const [zoomed, setZoomed] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const go = useCallback((delta: number) => {
    setPage((p) =>
      Math.min(CORPORATE_BOOK_PAGE_COUNT, Math.max(1, p + delta))
    );
    setZoomed(false);
  }, []);

  // キーボード ←→ でページ送り
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // 前後1ページの先読み
  useEffect(() => {
    [page - 1, page + 1]
      .filter((n) => n >= 1 && n <= CORPORATE_BOOK_PAGE_COUNT)
      .forEach((n) => {
        const img = new Image();
        img.src = pageSrc(n);
      });
  }, [page]);

  // スワイプでページ送り（横方向のみ・50px以上）
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || zoomed) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 50) return;
    go(dx < 0 ? 1 : -1);
  };

  const pager = (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={() => go(-1)}
        disabled={page === 1}
        className="text-sm px-4 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        ← 前へ
      </button>
      <span className="text-sm text-gray-600 tabular-nums min-w-[64px] text-center">
        {page} / {CORPORATE_BOOK_PAGE_COUNT}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        disabled={page === CORPORATE_BOOK_PAGE_COUNT}
        className="text-sm px-4 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        次へ →
      </button>
    </div>
  );

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-4">
      <NavPageHeader
        navKey="/corporate-book"
        title="📕 コーポレートブック"
        description={`Corporate Design Book（${CORPORATE_BOOK_VERSION}・全${CORPORATE_BOOK_PAGE_COUNT}ページ）`}
      />

      <p className="text-sm text-gray-600 leading-relaxed bg-teal-50/60 border border-teal-100 rounded-xl px-4 py-3">
        当院の理念・ビジョン・人事制度のすべてがまとまった一冊です。困ったとき・迷ったときは、いつでもここに戻ってきてください。
      </p>

      {pager}

      {/* ページ画像（タップで拡大トグル・スワイプでページ送り・ピンチも可） */}
      <div
        className={`bg-white border border-gray-200 rounded-xl p-2 ${
          zoomed ? "overflow-auto" : "overflow-hidden"
        }`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={pageSrc(page)}
          alt={`コーポレートデザインブック ${page}ページ`}
          onClick={() => setZoomed((z) => !z)}
          className={`select-none mx-auto rounded ${
            zoomed
              ? "max-w-none w-[170%] cursor-zoom-out"
              : "w-full cursor-zoom-in"
          }`}
          draggable={false}
        />
      </div>

      {pager}

      <p className="text-[11px] text-gray-400 text-center">
        {CORPORATE_BOOK_VERSION}。内容は毎年ブラッシュアップされます。
      </p>
    </div>
  );
}
