"use client";

// 📕 コーポレートブック 閲覧専用ビューア（131-補2・131-補3）
// - PDFは一切配信しない（ファイル持ち出し経路の遮断が目的・スクショは原理的に防止不可=承認済み前提）。
//   各ページは認証付きAPI /api/corporate-book?page=n（ログイン必須）から画像で取得する。
// - ページ送り: 前後ボタン＋スワイプ＋キーボード←→。タップで拡大トグル・モバイルはピンチも可。
// - 131-補3: ページ番号を直接入力してジャンプ／「📑 目次」開閉パネルから項目タップでジャンプ／最初へ・最後へ。
//   目次→画像番号の対応は lib/corporate-book.ts の CORPORATE_BOOK_TOC（画像実地確認済み）。
// - 前後1ページを先読みして体感速度を確保。版管理表記は lib/corporate-book.ts の定数から。
// - 直URLガードは PageAccessGate（page_corporate_book・公開型既定ON）が担当。
// - 208: 右上の「⛶ 全画面」で CorporateBookReader（body直下へ portal）に切り替える。
//   ページ番号は**このページが持つ** state をそのまま渡すので、終わると同じページに戻る。

import { useState, useEffect, useCallback, useRef } from "react";
import NavPageHeader from "@/components/NavPageHeader";
import { CorporateBookReader, enterFullscreenNow } from "@/components/CorporateBookReader";
import {
  preloadPages,
  spreadLabel,
  spreadPages,
  stepSpread,
  type BookView,
} from "@/lib/corporate-book-spread";
import { useBookView } from "@/lib/corporate-book-view-client";
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
  const [fullscreen, setFullscreen] = useState(false); // 208
  // 213 §1: 1ページ／見開き。最初は画面の形で決め、選んだらその端末に覚えておく
  //   （覚える先と画面の形はReactの外にあるので useBookView にまとめてある）
  const [view, setView] = useBookView();
  const touchStartX = useRef<number | null>(null);

  const changeView = useCallback(
    (next: BookView) => {
      setView(next);
      setZoomed(false);
    },
    [setView]
  );

  const jumpTo = useCallback((n: number) => {
    setPage(Math.min(CORPORATE_BOOK_PAGE_COUNT, Math.max(1, n)));
    setZoomed(false);
  }, []);

  // 213 §3: 見開きのときは**組単位**で進む・戻る
  const go = useCallback(
    (delta: number) => {
      setPage((p) =>
        view === "spread"
          ? stepSpread(p, delta, CORPORATE_BOOK_PAGE_COUNT)
          : Math.min(CORPORATE_BOOK_PAGE_COUNT, Math.max(1, p + delta))
      );
      setZoomed(false);
    },
    [view]
  );

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
      if (fullscreen) return; // 208: 全画面中は CorporateBookReader が受ける（二重送りを防ぐ）
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, fullscreen]);

  // 前後の先読み（213 §3: 見開きのときは前後の**組**を読み込む）
  useEffect(() => {
    preloadPages(page, CORPORATE_BOOK_PAGE_COUNT, view).forEach((n) => {
      const img = new Image();
      img.src = pageSrc(n);
    });
  }, [page, view]);

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

  // 213: 端の判定も見開き単位にする
  const atStart = view === "spread" ? stepSpread(page, -1, CORPORATE_BOOK_PAGE_COUNT) === page : page === 1;
  const atEnd =
    view === "spread" ? stepSpread(page, 1, CORPORATE_BOOK_PAGE_COUNT) === page : page === CORPORATE_BOOK_PAGE_COUNT;

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
        disabled={atStart}
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
          {view === "spread" ? spreadLabel(page, CORPORATE_BOOK_PAGE_COUNT) : `${page} / ${CORPORATE_BOOK_PAGE_COUNT}`}
        </button>
      )}
      <button
        type="button"
        onClick={() => go(1)}
        disabled={atEnd}
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

  /** 213 §1: 1ページ／見開きの切り替え */
  const viewSwitch = (
    <div className="flex rounded-full border border-gray-200 overflow-hidden text-sm w-fit mx-auto bg-white" data-book-view-switch>
      {([
        { v: "single" as BookView, label: "1ページ" },
        { v: "spread" as BookView, label: "見開き" },
      ]).map((t) => (
        <button
          key={t.v}
          type="button"
          onClick={() => changeView(t.v)}
          aria-pressed={view === t.v}
          className={`px-4 py-2 min-h-[44px] ${
            view === t.v ? "bg-teal-600 text-white" : "text-gray-700 hover:bg-gray-50"
          }`}
        >
          {t.label}
        </button>
      ))}
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

      {viewSwitch}

      {pager}

      {/* ページ画像（タップで拡大トグル・スワイプでページ送り・ピンチも可） */}
      <div
        className={`relative bg-white border border-gray-200 rounded-xl p-2 ${
          zoomed ? "overflow-auto" : "overflow-hidden"
        }`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* 208 §1: ブックの右上に置く。押した瞬間にブラウザの全画面を要求する必要がある */}
        <button
          type="button"
          onClick={() => {
            enterFullscreenNow();
            setFullscreen(true);
          }}
          className="absolute top-3 right-3 z-10 text-sm px-3 py-2 min-h-[44px] rounded-full bg-black/55 text-white hover:bg-black/75"
          title="全画面で読む（Escで終わります）"
          aria-label="全画面で読む"
          data-fullscreen-open
        >
          ⛶ 全画面
        </button>
        {/* 215 A: 見開きの2枚はすき間なく隣り合わせ（画像そのものを横並びの要素にする）。
            とじ目は2枚の内側の境界線＝画像と同じ高さで、1pxずつの左右対称にする。 */}
        <div className="flex items-start justify-center gap-0">
          {spreadPages(page, CORPORATE_BOOK_PAGE_COUNT)
            .slice(0, view === "spread" ? 2 : 1)
            .map((n, i) => {
              const n2 = view === "spread" ? n : page;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={n2}
                  src={pageSrc(n2)}
                  alt={`コーポレートデザインブック ${n2}ページ`}
                  onClick={() => setZoomed((z) => !z)}
                  data-book-page={n2}
                  className={`select-none rounded box-border ${
                    zoomed
                      ? "max-w-none w-[170%] cursor-zoom-out"
                      : `${view === "spread" ? "w-[50%]" : "w-full"} cursor-zoom-in`
                  } ${
                    view === "spread" && !zoomed
                      ? i > 0
                        ? "border-l border-gray-300"
                        : "border-r border-gray-300"
                      : ""
                  }`}
                  draggable={false}
                />
              );
            })}
        </div>
      </div>

      {pager}

      <p className="text-[11px] text-gray-400 text-center">
        {CORPORATE_BOOK_VERSION}。内容は毎年ブラッシュアップされます。
      </p>

      {/* 208: 全画面。ページ番号は上の state をそのまま使う＝終わると同じページに戻る */}
      {fullscreen && (
        <CorporateBookReader
          page={page}
          total={CORPORATE_BOOK_PAGE_COUNT}
          src={pageSrc}
          onGo={go}
          onClose={() => setFullscreen(false)}
        />
      )}
    </div>
  );
}
