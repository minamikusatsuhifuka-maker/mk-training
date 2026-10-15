"use client";

// 9マスへの入口「▦」とポップアップ（指示書247 §4 → 249で書けるようにした）
//
// ・すべての項目に出す（249）。何も書いていない項目は薄い色、書いてある項目は今の色
// ・中身は9マスの画面と同じ部品（NineGridEditor）。書く・直す・✓・「…」・下の段へ・上の段へ
// ・開く：パソコンはカーソルを合わせると開く（印からポップアップへ動かしても閉じない）。
//   スマホ（と印を押したとき）は、狭い画面なら下から大きく出す
// ・ポップアップの中を一度でも押したら、カーソルが外に出ても閉じない
// ・閉じる：外を押す／Escを2回（1回目は書きかけの取り消し）／「閉じる」。
//   閉じるときは書きかけを保存する（入力欄から離れたときの保存を先に走らせてから閉じる）
// ・保存の仕組みとデータの形は9マスの画面と同じ。保存できたら呼び出し側の一覧も差し替える
// ・body の直下に出す（行のドラッグ・overflow・祖先の効果に巻き込まれないように）

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hasGridText, type MatrixRecord } from "@/lib/priority-matrix";
import { NineGridEditor } from "./NineGridScreen";

/** マウスが印とポップアップの両方から離れてから閉じるまでの猶予（すき間を渡れるように） */
const LEAVE_CLOSE_MS = 250;

export function GridPeek({
  record,
  onRecordChange,
  onTaskCreated,
  dataKey,
}: {
  record: MatrixRecord;
  /** 保存できた新しい版（一覧の1件を差し替える） */
  onRecordChange: (next: MatrixRecord) => void;
  /** 「…」から四象限に行を足したとき */
  onTaskCreated?: () => void;
  /** 検証用の目印（項目のid） */
  dataKey: string;
}) {
  const [open, setOpen] = useState(false);
  /** 下から出す大きな形（スマホ） */
  const [sheet, setSheet] = useState(false);
  const [path, setPath] = useState<number[]>([]);
  // ポップアップの中を押した＝書いている途中。カーソルが外れても閉じない
  const pinned = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  const written = hasGridText(record.cells);

  const cancelLeave = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    leaveTimer.current = null;
  };

  /** 閉じる。書きかけの欄があれば、先に離れて保存を走らせる */
  const close = useCallback(() => {
    cancelLeave();
    const active = document.activeElement as HTMLElement | null;
    if (active && pop.current?.contains(active)) active.blur();
    pinned.current = false;
    setOpen(false);
    setSheet(false);
    setPath([]);
  }, []);

  const openAt = (asSheet: boolean) => {
    cancelLeave();
    setSheet(asSheet);
    setOpen(true);
  };

  const scheduleLeave = () => {
    if (pinned.current) return;
    cancelLeave();
    leaveTimer.current = setTimeout(() => {
      if (!pinned.current) close();
    }, LEAVE_CLOSE_MS);
  };

  useEffect(() => () => cancelLeave(), []);

  // 置き場所：パソコンは印の近く（画面の端で切れないように）。中身の高さが変わっても置き直す
  useLayoutEffect(() => {
    if (!open || sheet) return;
    const p = pop.current;
    if (!p) return;
    const place = () => {
      const b = btn.current?.getBoundingClientRect();
      if (!b) return;
      const w = p.offsetWidth;
      const h = p.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const left = Math.min(Math.max(8, b.left - 8), Math.max(8, vw - w - 8));
      let top = b.bottom + 4;
      if (top + h > vh - 8) top = b.top - h - 4 >= 8 ? b.top - h - 4 : Math.max(8, vh - h - 8);
      p.style.left = `${left}px`;
      p.style.top = `${top}px`;
      p.style.visibility = "visible";
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(p);
    window.addEventListener("resize", place);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [open, sheet]);

  // 外を押す／Esc（書いていないとき）で閉じる
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (btn.current?.contains(t) || pop.current?.contains(t))) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      // 書いている欄のEscは欄の取り消しだけで止まる（ここまで届かない）
      if (e.key === "Escape" && !e.isComposing) close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const closeButton = (
    <button
      type="button"
      onClick={close}
      data-pm-peek-close
      className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
    >
      閉じる
    </button>
  );

  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={(e) => {
          // 押したら：開いていれば閉じる。閉じていれば開く（狭い画面・指なら下から大きく）
          if (open && pinned.current) {
            close();
            return;
          }
          const narrow = window.matchMedia("(max-width: 639px)").matches;
          const touch = (e.nativeEvent as PointerEvent).pointerType && (e.nativeEvent as PointerEvent).pointerType !== "mouse";
          pinned.current = true;
          openAt(narrow || !!touch);
        }}
        // マウスのときだけ「合わせたら開く」
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") openAt(false);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") scheduleLeave();
        }}
        aria-label={written ? "9マスを開く（書いてあります）" : "9マスを開く（まだ何も書いていません）"}
        aria-expanded={open}
        title={written ? "9マス（書いてあります）" : "9マス（まだ何も書いていません）"}
        data-pm-peek={dataKey}
        data-pm-peek-written={written ? "1" : "0"}
        className={`shrink-0 rounded border px-1 text-[10px] font-bold leading-4 hover:bg-teal-50 ${
          written ? "border-teal-300 text-teal-700" : "border-slate-200 text-slate-300"
        }`}
      >
        ▦
      </button>
      {open &&
        createPortal(
          <>
            {sheet && <div className="fixed inset-0 z-[59] bg-black/30" data-pm-peek-backdrop />}
            <div
              ref={pop}
              role="dialog"
              aria-label={`${record.title}の9マス`}
              data-pm-peek-pop={dataKey}
              data-pm-peek-sheet={sheet ? "1" : "0"}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") cancelLeave();
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") scheduleLeave();
              }}
              onPointerDownCapture={() => {
                pinned.current = true;
                cancelLeave();
              }}
              style={
                sheet
                  ? { position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60 }
                  : { position: "fixed", left: 0, top: 0, visibility: "hidden", zIndex: 60 }
              }
              className={
                sheet
                  ? "max-h-[88vh] overflow-y-auto rounded-t-2xl border-t border-slate-300 bg-white p-3 pb-6 shadow-2xl"
                  : "max-h-[calc(100vh-16px)] w-[min(42rem,calc(100vw-16px))] overflow-y-auto rounded-lg border border-slate-300 bg-white p-3 shadow-xl"
              }
            >
              <NineGridEditor
                record={record}
                onRecordChange={onRecordChange}
                path={path}
                onPathChange={setPath}
                variant="popup"
                onTaskCreated={onTaskCreated}
                headerRight={closeButton}
              />
            </div>
          </>,
          document.body
        )}
    </>
  );
}
