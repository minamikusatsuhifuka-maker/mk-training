"use client";

// 📕 コーポレートブックの全画面リーダー（指示書208）
//
// 【なぜ別部品にしたか】
// 全画面の表示は **createPortal で body の直下**に出す。/corporate-book は AppShellInner の
// `main`（`overflow-y-auto`）の中にあり、その場に置くと外枠の内側に収まってしまう。
// 祖先に backdrop-filter / transform があると `fixed inset-0` がその箱に張り付く問題も
// 併せて避けられる（過去に踏んだ罠）。読み込みは /corporate-book を開いた人だけ。
//
// 【ページの形】
// 画像は 1118×2000（縦長・比率 0.559）。横長の画面で「全体を収める」と左右が大きく余り
// 文字が小さくなるので、**2つの収め方**を用意して切り替えられるようにしている。
//   page  … 1ページ全体を画面に収める（比率はそのまま・最大の大きさ）
//   width … 画面の幅いっぱいに広げ、縦にスクロールして読む（文字が大きい）
// スマートフォンの縦向きは既定を width にする（208 §2「文字が読める大きさを保つ」）。
//
// 【全画面の入り方】
// ブラウザ自体の全画面（Fullscreen API）は**押した瞬間に**要求する（利用者の操作から
// 離れると拒否されるため）。iPhone・iPad の Safari のように使えない環境では要求が失敗するが、
// 画面いっぱいの重ね表示はそのまま出るので見た目は同じになる（208 §1）。
//
// 【終わり方】
// 「×」・Esc・ブラウザの「戻る」のどれでも終わる。開くときに履歴を1つ積み、
// 戻るで popstate を受けて閉じる。ページ番号は呼び出し側が持っているので、
// 終わると同じページのままになる（208 §4）。

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { spreadPages, stepSpread } from "@/lib/corporate-book-spread";
import { bookPageAlt, bookPagesLabelWithTotal } from "@/lib/corporate-book";
import { useBookView } from "@/lib/corporate-book-view-client";

/** 操作ボタンを薄くするまでの時間（ミリ秒・208 §3「数秒触らないと薄くする」） */
const IDLE_MS = 3000;

type FitMode = "page" | "width";

/** ブラウザ自体の全画面を要求する（使えない環境では false を返すだけ） */
function requestBrowserFullscreen(): boolean {
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  try {
    if (typeof el.requestFullscreen === "function") {
      void el.requestFullscreen().catch(() => {});
      return true;
    }
    if (typeof el.webkitRequestFullscreen === "function") {
      void el.webkitRequestFullscreen();
      return true;
    }
  } catch {
    /* 使えない環境（iOS Safari など）。重ね表示だけで続ける */
  }
  return false;
}

function exitBrowserFullscreen(): void {
  const doc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitFullscreenElement?: Element | null;
  };
  try {
    if (doc.fullscreenElement && typeof doc.exitFullscreen === "function") {
      void doc.exitFullscreen().catch(() => {});
    } else if (doc.webkitFullscreenElement && typeof doc.webkitExitFullscreen === "function") {
      void doc.webkitExitFullscreen();
    }
  } catch {
    /* 失敗しても重ね表示を閉じる方は進める */
  }
}

function inBrowserFullscreen(): boolean {
  const doc = document as Document & { webkitFullscreenElement?: Element | null };
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement);
}

/** 全画面を開くときに呼ぶ（押した瞬間に実行する必要があるもの） */
export function enterFullscreenNow(): void {
  requestBrowserFullscreen();
  try {
    // 「戻る」で終われるようにする（208 §4）
    window.history.pushState({ corporateBookFullscreen: true }, "");
  } catch {
    /* 履歴が使えなくても「×」とEscで終われる */
  }
}

export function CorporateBookReader({
  page,
  total,
  src,
  onGo,
  onClose,
}: {
  page: number;
  total: number;
  /** ページ番号 → 画像のURL */
  src: (n: number) => string;
  /** ページ送り（-1 / +1） */
  onGo: (delta: number) => void;
  onClose: () => void;
}) {
  // 既定の収め方は最初の描画で決める（効果の中で setState しない＝余分な再描画を作らない）
  const [fit, setFit] = useState<FitMode>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 640px) and (orientation: portrait)").matches
      ? "width"
      : "page"
  );
  const [idle, setIdle] = useState(false);
  // 213: 全画面でも 1ページ／見開き を切り替えられる（通常の画面と同じ設定を使う）
  const [view, setView] = useBookView();
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);
  /** 自分で閉じる処理に入ったか（fullscreenchange との二重発火を防ぐ） */
  const closing = useRef(false);

  // 画面を回したときは既定に合わせ直す（縦向き＝幅いっぱい／横向き＝全体を収める）
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px) and (orientation: portrait)");
    const apply = (e: MediaQueryListEvent) => setFit(e.matches ? "width" : "page");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  // 操作のボタンを薄くする・触ったら戻す
  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);
  // 開いた直後から数え始める（idle の初期値は false なので、ここで setState はしない）
  useEffect(() => {
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  const close = useCallback(
    (fromHistory: boolean) => {
      if (closing.current) return;
      closing.current = true;
      exitBrowserFullscreen();
      if (!fromHistory) {
        // 自分が積んだ履歴を戻す（popstate 経由のときは既に戻っている）
        try {
          if (window.history.state?.corporateBookFullscreen) window.history.back();
        } catch {
          /* 何もしない */
        }
      }
      onClose();
    },
    [onClose]
  );

  // キー操作（←→でページ送り・Escで終わる）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      wake();
      if (e.key === "ArrowLeft") onGo(-1);
      else if (e.key === "ArrowRight") onGo(1);
      else if (e.key === "Escape") {
        e.preventDefault();
        close(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onGo, close, wake]);

  // ブラウザの「戻る」で終わる
  useEffect(() => {
    const onPop = () => close(true);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [close]);

  // ブラウザ自体の全画面が外から解除されたとき（F11・ブラウザのEsc）も終わる
  useEffect(() => {
    const onFs = () => {
      if (!inBrowserFullscreen()) close(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, [close]);

  // ページが変わったら先頭まで戻す（幅いっぱいで読んでいるとき）
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [page]);

  // スワイプ（横方向が縦方向より大きいときだけページ送り＝縦スクロールを邪魔しない）
  const onTouchStart = (e: React.TouchEvent) => {
    wake();
    const t = e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    onGo(dx < 0 ? 1 : -1);
  };

  // 画面の左右の端をタップしてページ送り（中央はボタンの出し入れ）
  const onAreaClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    if (x < 0.25) {
      wake();
      onGo(-1);
    } else if (x > 0.75) {
      wake();
      onGo(1);
    } else if (idle) {
      wake();
    } else {
      setIdle(true);
    }
  };

  // 213: 端の判定も見開き単位にする（最後の組で「次へ」を押せないように）
  const atStart = view === "spread" ? stepSpread(page, -1, total) === page : page === 1;
  const atEnd = view === "spread" ? stepSpread(page, 1, total) === page : page === total;

  const faded = idle ? "opacity-20" : "opacity-100";
  const chip =
    "pointer-events-auto rounded-full bg-black/55 text-white text-sm px-3 py-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-black/75 disabled:opacity-30";

  const body = (
    <div
      className="fixed inset-0 z-[100] bg-neutral-900 overscroll-contain"
      style={{ height: "100dvh" }}
      role="dialog"
      aria-modal="true"
      aria-label="コーポレートブック（全画面）"
      onMouseMove={wake}
      data-corporate-book-fullscreen
    >
      {/* ページ画像。比率はそのまま。page=全体を収める／width=幅いっぱいで縦スクロール */}
      <div
        ref={scroller}
        className={`h-full w-full ${fit === "width" ? "overflow-y-auto" : "overflow-hidden"} flex ${
          fit === "width" ? "items-start" : "items-center"
        } justify-center`}
        onClick={onAreaClick}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* 215 A: 見開きの2枚は**すき間なく隣り合わせ**、組として画面の中央に置く。
            余った幅は組の外側（左右の端）に出す。
            そのために、画像そのものを横並びの要素にする（包みの箱で半分ずつ分けると、
            箱の中で画像が中央に寄って**あいだに帯ができる**＝213で起きていたこと）。
            とじ目は2枚の**内側の境界線**にする（画像と同じ高さになる・1pxずつで左右対称＝
            どちらの画像も同じ大きさになり、下の端がそろう）。 */}
        {spreadPages(page, total)
          .slice(0, view === "spread" ? 2 : 1)
          .map((n, i) => {
            const shown = view === "spread" ? n : page;
            const size =
              fit === "width"
                ? view === "spread"
                  ? "w-[50%] h-auto" // 2枚で幅いっぱい（とじ目の1pxは box-border で内側に収める）
                  : "w-full h-auto"
                : view === "spread"
                  ? "max-h-full max-w-[50%] w-auto h-auto object-contain"
                  : "max-h-full max-w-full w-auto h-auto object-contain";
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={shown}
                src={src(shown)}
                alt={bookPageAlt(shown)}
                draggable={false}
                data-book-page={shown}
                className={`select-none box-border ${size} ${
                  view === "spread" ? (i > 0 ? "border-l border-white/30" : "border-r border-white/30") : ""
                }`}
              />
            );
          })}
      </div>

      {/* 操作のボタン類は端に小さく置く（208 §3） */}
      <div className={`pointer-events-none absolute inset-0 transition-opacity duration-500 ${faded}`}>
        <div className="absolute top-2 right-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              wake();
              setFit((f) => (f === "page" ? "width" : "page"));
            }}
            className={chip}
            title={fit === "page" ? "幅いっぱいにする（文字が大きくなります）" : "1ページ全体を収める"}
            aria-label={fit === "page" ? "幅いっぱいにする" : "1ページ全体を収める"}
            data-fit-toggle
          >
            {fit === "page" ? "⤢ 幅" : "⤡ 全体"}
          </button>
          <button
            type="button"
            onClick={() => {
              wake();
              setView(view === "spread" ? "single" : "spread");
            }}
            className={chip}
            title={view === "spread" ? "1ページで読む" : "見開きで読む"}
            aria-label={view === "spread" ? "1ページで読む" : "見開きで読む"}
            data-book-view-toggle
          >
            {view === "spread" ? "▭ 1ページ" : "▥ 見開き"}
          </button>
          <button
            type="button"
            onClick={() => close(false)}
            className={chip}
            title="全画面を終わる（Escでも終われます）"
            aria-label="全画面を終わる"
            data-fullscreen-close
          >
            ✕
          </button>
        </div>

        <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              wake();
              onGo(-1);
            }}
            disabled={atStart}
            className={chip}
            aria-label="前のページへ"
          >
            ←
          </button>
          <span className="pointer-events-none rounded-full bg-black/55 text-white text-xs tabular-nums px-3 py-2" data-fullscreen-pageno>
            {bookPagesLabelWithTotal(view === "spread" ? spreadPages(page, total) : [page])}
          </span>
          <button
            type="button"
            onClick={() => {
              wake();
              onGo(1);
            }}
            disabled={atEnd}
            className={chip}
            aria-label="次のページへ"
          >
            →
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
