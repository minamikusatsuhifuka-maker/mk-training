"use client";

// 画面切り替えを速く見せる（指示書「メニュー・画面切り替えを200ms以内にする」）
//
//   useNavPending … このアプリの中の別の画面へのリンクを押した瞬間に「切り替え中」にする。
//                   main の中身は隠して（消さずに残す）スケルトンを出し、新しい画面になったら戻す。
//                   押したのに切り替わらなかったとき（リンクの押し方を画面が止めた等）は、3秒で元に戻す。
//
// 先読みは next/link の標準（リンクが見えたとき・カーソルを合わせたとき）に任せる。
//   全画面をまとめて先読みする案は、ページを開くたびに約50回の認証確認が走るため採らなかった。
// 認証・閲覧範囲は変えない。

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const PENDING_TIMEOUT_MS = 3000;

/** 押されたリンクが「このアプリの別の画面への、ふつうの移動」なら、その行き先（パス） */
function targetOf(e: MouseEvent): string | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const el = e.target instanceof Element ? e.target.closest("a[href]") : null;
  if (!(el instanceof HTMLAnchorElement)) return null;
  if (el.target && el.target !== "_self") return null;
  if (el.hasAttribute("download") || el.dataset.noNavPending !== undefined) return null;
  let url: URL;
  try {
    url = new URL(el.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  // 同じ画面の中（クエリや # だけが変わる）は出さない
  if (url.pathname === window.location.pathname) return null;
  // ファイルやAPIへのリンクは画面の移動ではない
  if (url.pathname.startsWith("/api/") || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return null;
  return url.pathname;
}

export function useNavPending(): boolean {
  const pathname = usePathname();
  const [pending, setPending] = useState<{ from: string; at: number } | null>(null);
  // 新しい画面になった（パスが変わった）ら切り替え中をやめる（描画の中で前のパスと比べる＝React の勧める形）
  const [prevPath, setPrevPath] = useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    if (pending) setPending(null);
  }

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const to = targetOf(e);
      if (to) setPending({ from: window.location.pathname, at: Date.now() });
    };
    // 捕まえる段階で受ける（画面側のクリック処理より先に「切り替え中」にして、押した直後の描画に間に合わせる）
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // 戻る/進む・3秒たった → 切り替え中をやめる
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setPending(null), Math.max(0, PENDING_TIMEOUT_MS - (Date.now() - pending.at)));
    const onPop = () => setPending(null);
    window.addEventListener("popstate", onPop);
    return () => {
      clearTimeout(t);
      window.removeEventListener("popstate", onPop);
    };
  }, [pending]);

  return !!pending && pathname === pending.from;
}
