"use client";

// 成長記録のタブの帯と、画面を見やすくするための小さな部品（指示書220）
//
// ・タブはスマートフォンで**横にスクロール**できる（220 §2-2）
// ・開いていたタブは**その端末で覚える**（213と同じ理由で useSyncExternalStore。
//   効果の中で読んで setState すると Lint（react-hooks/set-state-in-effect）に止められ、
//   SSRとの食い違いも起きるため）
// ・`Collapsible` は「長いものは最初たたんでおく」（220 §2-5）、
//   `OpenOnDemand` は「入力欄はふだん隠し、押したときだけ開く」（220 §2-4）に使う

import { useCallback, useState, useSyncExternalStore } from "react";
import {
  resolveGrowthTab,
  type GrowthTab,
  type GrowthTabKey,
} from "@/lib/growth-tabs";

// ─── 開いていたタブを覚える ───

const listeners = new Set<() => void>();
/** localStorage が使えない端末でも、その場の切り替えは効かせるための控え */
const chosen = new Map<string, string>();

function notify() {
  for (const cb of listeners) cb();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readStored(key: string): string {
  const here = chosen.get(key);
  if (here) return here;
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/**
 * 覚えていたタブを読む。初めて開いたとき・覚えていたタブが見られないときは先頭（概要）。
 * サーバー側（描き始め）は常に空＝先頭にして、食い違いを作らない。
 */
export function useRememberedTab(
  storageKey: string,
  tabs: readonly GrowthTab[]
): [GrowthTabKey, (next: GrowthTabKey) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => readStored(storageKey),
    () => ""
  );
  const setTab = useCallback(
    (next: GrowthTabKey) => {
      chosen.set(storageKey, next);
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        /* 覚えられない端末でも、その場の切り替えは効かせたいので notify は行う */
      }
      notify();
    },
    [storageKey]
  );
  return [resolveGrowthTab(stored, tabs), setTab];
}

// ─── タブの帯 ───

export function GrowthTabsBar({
  tabs,
  current,
  onChange,
  label = "成長記録の表示切替",
}: {
  tabs: readonly GrowthTab[];
  current: GrowthTabKey;
  onChange: (next: GrowthTabKey) => void;
  label?: string;
}) {
  return (
    // スマートフォンでは横スクロール（はみ出しても画面は横に伸びない）
    <div className="-mx-1 overflow-x-auto px-1" data-growth-tabs>
      <div className="flex gap-1 border-b border-gray-200 w-max min-w-full" role="tablist" aria-label={label}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={current === t.key}
            onClick={() => onChange(t.key)}
            data-growth-tab={t.key}
            className={`shrink-0 min-h-[40px] px-3 py-1.5 text-[13px] rounded-t-lg border border-b-0 whitespace-nowrap ${
              current === t.key
                ? "border-gray-200 bg-white text-gray-900 font-medium"
                : "border-transparent bg-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 長いものをたたむ（220 §2-5） ───

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  note = "",
  testId,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** 見出しの右に小さく出す補足 */
  note?: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-gray-200 bg-white" data-collapsible={testId} data-open={open ? "1" : "0"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-2 py-2 text-left min-h-[40px]"
      >
        <span className="text-[12px] font-medium text-gray-800">{title}</span>
        <span className="flex items-center gap-2 shrink-0">
          {note && <span className="text-[10px] text-gray-500">{note}</span>}
          <span className="text-[11px] text-teal-800">{open ? "たたむ ▲" : "ひらく ▼"}</span>
        </span>
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </div>
  );
}

// ─── 入力欄は押したときだけ開く（220 §2-4） ───

export function OpenOnDemand({
  openLabel,
  closeLabel = "とじる",
  children,
  testId,
}: {
  openLabel: string;
  closeLabel?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div data-open-on-demand={testId} data-open={open ? "1" : "0"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="px-3 py-1.5 border border-teal-300 text-teal-800 rounded-full text-[11px] hover:bg-teal-50 min-h-[36px]"
      >
        {open ? closeLabel : openLabel}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}
