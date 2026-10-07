"use client";

// コーポレートブックの「1ページ／見開き」の覚え方（指示書213 §1）— 画面側専用
//
// 【なぜ useSyncExternalStore なのか】
// 覚えておく先（localStorage）と、最初の既定を決める画面の形（matchMedia）は
// **Reactの外にある状態**。効果の中で読んで setState すると
// 「効果の中で同期的に状態を変えている」としてLintに止められ、
// 余分な再描画も起きる。外の状態はこの形で読むのが決まり。
//
// サーバー側の値は "single" に固定しておく（描き始めの食い違いを作らない）。
// 画面が出たあとに、覚えてある値・画面の形で確定する。

import { useCallback, useSyncExternalStore } from "react";
import { BOOK_VIEW_STORAGE_KEY, isBookView, type BookView } from "./corporate-book-spread";

/** 横長の画面（パソコン・タブレットの横向き）は見開きを既定にする */
const LANDSCAPE = "(min-width: 768px) and (orientation: landscape)";

/** 同じ画面の中の別の部品（全画面リーダー）にも変更を伝える */
const listeners = new Set<() => void>();
/** localStorage が使えない端末でも、その場の切り替えは効かせるための控え */
let chosen: BookView | null = null;
function notify() {
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const mq = window.matchMedia(LANDSCAPE);
  mq.addEventListener("change", cb);
  // 別のタブで切り替えたときも合わせる
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot(): BookView {
  if (chosen) return chosen; // この画面で選んだものが最優先
  try {
    const v = window.localStorage.getItem(BOOK_VIEW_STORAGE_KEY);
    if (isBookView(v)) return v; // 選んだものが最優先（画面を回しても勝手に変わらない）
  } catch {
    /* 使えない端末では画面の形で決める */
  }
  try {
    return window.matchMedia(LANDSCAPE).matches ? "spread" : "single";
  } catch {
    return "single";
  }
}

/** サーバー側（描き始め）の値。ここで画面の形は見られないので1ページ固定 */
function getServerSnapshot(): BookView {
  return "single";
}

export function useBookView(): [BookView, (next: BookView) => void] {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setView = useCallback((next: BookView) => {
    chosen = next;
    try {
      window.localStorage.setItem(BOOK_VIEW_STORAGE_KEY, next);
    } catch {
      /* 覚えられない端末でも、その場の切り替えは効かせたいので notify は行う */
    }
    notify();
  }, []);
  return [view, setView];
}
