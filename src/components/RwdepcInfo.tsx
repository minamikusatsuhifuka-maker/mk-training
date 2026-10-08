"use client";

// 「RWDEPC」にカーソルを合わせると、文字・英語・日本語の表が出る（指示書223 §1-3）
//
// 【出すもの】表だけ。説明の文は足さない（223 §1-3）。中身の正本は lib/rwdepc.ts の RWDEPC_TABLE。
//
// 【開き方・閉じ方】
//   ・マウス: 乗ると開き、離れると閉じる
//   ・スマートフォン・タブレット: タップで開き、もう一度タップするか外側を押すと閉じる
//     （199で分かったとおり、タップでは「乗った」と「クリック」が続けて起きる。
//      そのため **乗ったで開くのはマウスのときだけ** にして、開いた直後に閉じないようにする）
//   ・キーボード: ⓘ を選ぶ（フォーカス）と開く。Esc でも閉じる
//
// 【切れない置き方】ページの中に置くと、祖先の overflow で切れたり画面の端で欠けたりする。
//   body に出して（portal）画面の座標で置き、左右・下は画面の内側に収める。
//   幅は画面の幅から余白を引いた中に収める（スマートフォンでも収まる）。

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RWDEPC_TABLE, RWDEPC_TABLE_HEAD } from "@/lib/rwdepc";

/** 画面の端からの余白（px） */
const EDGE = 8;
/** 表の幅（px・画面が狭いときは画面に合わせて縮める） */
const PANEL_W = 268;

export function RwdepcInfo({
  /** 「RWDEPC」の文字も出すか（false なら ⓘ だけ） */
  withWord = true,
  /** 文字の見た目（置く場所の字の大きさに合わせる） */
  className = "",
}: {
  withWord?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tableId = useId();

  /**
   * 置き場所を決める。**状態を持たず**、出した表のスタイルを直に書き換える
   * （描画のあとに測る必要があるため。状態に入れると描き直しが連鎖する）。
   */
  const place = useCallback(() => {
    const panel = panelRef.current;
    const trigger = wrapRef.current?.getBoundingClientRect();
    if (!panel || !trigger) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(PANEL_W, vw - EDGE * 2);
    panel.style.width = `${width}px`;
    const height = panel.offsetHeight;
    // 左右は画面の内側に収める
    panel.style.left = `${Math.max(EDGE, Math.min(trigger.left, vw - width - EDGE))}px`;
    // 下に入らなければ上に出す
    const below = trigger.bottom + 6;
    panel.style.top = `${
      below + height > vh - EDGE ? Math.max(EDGE, trigger.top - height - 6) : below
    }px`;
    panel.style.visibility = "visible";
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: Event) => {
      const t = e.target as Node | null;
      if (t && (wrapRef.current?.contains(t) || panelRef.current?.contains(t))) return;
      setOpen(false); // 外側を押したら閉じる
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return (
    <span
      ref={wrapRef}
      className={`inline-flex items-center gap-0.5 align-baseline ${className}`}
      // 乗って開くのはマウスだけ（タップでは click が続けて来るため）
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setOpen(false);
      }}
    >
      {withWord && <span data-rwdepc-word>RWDEPC</span>}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        // キーボードで選んだときだけ開く（タップのフォーカスで開くと、続く click で閉じてしまう）
        onFocus={(e) => {
          if (e.currentTarget.matches(":focus-visible")) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        aria-expanded={open}
        aria-controls={open ? tableId : undefined}
        aria-label="RWDEPCの意味"
        className="leading-none text-violet-700 hover:text-violet-900 cursor-help"
        data-rwdepc-info
      >
        ⓘ
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={tableId}
            role="tooltip"
            className="fixed z-[60] rounded-xl border border-violet-200 bg-white shadow-lg p-2"
            // 置き場所は place() が測ってから書き込む（それまでは出さない）
            style={{ left: EDGE, top: EDGE, width: PANEL_W, visibility: "hidden" }}
            data-rwdepc-table
          >
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  {RWDEPC_TABLE_HEAD.map((h) => (
                    <th
                      key={h}
                      className="border-b border-violet-100 px-1 py-0.5 text-left font-medium text-violet-900"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RWDEPC_TABLE.map((row) => (
                  <tr key={row.mark}>
                    <td className="border-b border-gray-100 px-1 py-0.5 font-bold text-violet-700">
                      {row.mark}
                    </td>
                    <td className="border-b border-gray-100 px-1 py-0.5 text-gray-700">
                      {row.en}
                    </td>
                    <td className="border-b border-gray-100 px-1 py-0.5 text-gray-900">
                      {row.ja}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
          document.body
        )}
    </span>
  );
}
