"use client";

// 📕 コーポレートブック 閲覧専用ビューア（131-補2・131-補3）
// - PDFは一切配信しない（ファイル持ち出し経路の遮断が目的・スクショは原理的に防止不可=承認済み前提）。
//   各ページは認証付きAPI /api/corporate-book?page=n（ログイン必須）から画像で取得する。
// - ページ送り: 前後ボタン＋スワイプ＋キーボード←→。タップで拡大トグル・モバイルはピンチも可。
// - 131-補3: ページ番号を直接入力してジャンプ／「📑 目次」開閉パネルから項目タップでジャンプ／最初へ・最後へ。
//   目次→画像番号の対応は lib/corporate-book.ts の CORPORATE_BOOK_TOC（画像実地確認済み）。
// - 前後1ページを先読みして体感速度を確保。版管理表記は lib/corporate-book.ts の定数から。
// - 直URLガードは PageAccessGate（page_corporate_book・公開型既定ON）が担当。

import { useState, useEffect, useCallback, useRef } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import {
  CORPORATE_BOOK_PAGE_COUNT,
  CORPORATE_BOOK_VERSION,
  CORPORATE_BOOK_API,
  CORPORATE_BOOK_TOC,
} from "@/lib/corporate-book";

const pageSrc = (n: number) => `${CORPORATE_BOOK_API}?page=${n}`;

export default function CorporateBookPage() {
  const [page, setPage] = useState(1);
  const [zoomed, setZoomed] = useState(false);
  const [pageInput, setPageInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const jumpTo = useCallback((n: number) => {
    setPage(Math.min(CORPORATE_BOOK_PAGE_COUNT, Math.max(1, n)));
    setZoomed(false);
  }, []);

  const go = useCallback((delta: number) => {
    setPage((p) =>
      Math.min(CORPORATE_BOOK_PAGE_COUNT, Math.max(1, p + delta))
    );
    setZoomed(false);
  }, []);

  // ページ番号入力の確定（無効値=範囲外・数字以外は無視して現在ページ維持）
  const commitPageInput = useCallback(() => {
    setEditing(false);
    const n = Number(pageInput.trim());
    if (!Number.isInteger(n) || n < 1 || n > CORPORATE_BOOK_PAGE_COUNT) return;
    jumpTo(n);
  }, [pageInput, jumpTo]);

  // キーボード ←→ でページ送り（ページ番号の入力中は無効）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
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
    <div className="flex items-center justify-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={() => jumpTo(1)}
        disabled={page === 1}
        title="最初のページへ"
        className="text-sm px-3 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        ⏮
      </button>
      <button
        type="button"
        onClick={() => go(-1)}
        disabled={page === 1}
        className="text-sm px-4 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        ← 前へ
      </button>
      {editing ? (
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={CORPORATE_BOOK_PAGE_COUNT}
          value={pageInput}
          autoFocus
          onChange={(e) => setPageInput(e.target.value)}
          onBlur={commitPageInput}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitPageInput();
            if (e.key === "Escape") setEditing(false);
          }}
          className="text-sm text-center tabular-nums w-16 px-1 py-1.5 rounded-lg border border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-200"
          aria-label={`表示するページ番号（1〜${CORPORATE_BOOK_PAGE_COUNT}）`}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setPageInput(String(page));
            setEditing(true);
          }}
          title="タップしてページ番号を入力"
          className="text-sm text-gray-600 tabular-nums min-w-[64px] text-center px-2 py-1.5 rounded-lg border border-dashed border-gray-300 hover:border-teal-300 hover:text-teal-700"
        >
          {page} / {CORPORATE_BOOK_PAGE_COUNT}
        </button>
      )}
      <button
        type="button"
        onClick={() => go(1)}
        disabled={page === CORPORATE_BOOK_PAGE_COUNT}
        className="text-sm px-4 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        次へ →
      </button>
      <button
        type="button"
        onClick={() => jumpTo(CORPORATE_BOOK_PAGE_COUNT)}
        disabled={page === CORPORATE_BOOK_PAGE_COUNT}
        title="最後のページへ"
        className="text-sm px-3 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        ⏭
      </button>
    </div>
  );

  const toc = (
    <div className="text-center">
      <button
        type="button"
        onClick={() => setTocOpen((o) => !o)}
        className={`text-sm px-4 py-2 rounded-full border ${
          tocOpen
            ? "border-teal-300 bg-teal-50 text-teal-700"
            : "border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
      >
        📑 目次 {tocOpen ? "▲" : "▼"}
      </button>
      {tocOpen && (
        <div className="mt-2 bg-white border border-gray-200 rounded-xl p-2 max-h-72 overflow-y-auto text-left shadow-sm">
          {CORPORATE_BOOK_TOC.map((item, i) => {
            // いま表示中のページが属する項目（次項目の開始前まで）をハイライト
            const next = CORPORATE_BOOK_TOC[i + 1];
            const current =
              page >= item.page && (!next || page < next.page);
            return (
              <button
                key={item.page + item.label}
                type="button"
                onClick={() => {
                  jumpTo(item.page);
                  setTocOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg hover:bg-teal-50 ${
                  current
                    ? "bg-teal-50 text-teal-800 font-medium"
                    : "text-gray-700"
                }`}
              >
                <span>{item.label}</span>
                <span className="text-xs text-gray-400 tabular-nums shrink-0">
                  p.{item.page}
                </span>
              </button>
            );
          })}
        </div>
      )}
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

      {toc}

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
