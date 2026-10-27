"use client";

// 🔤 フォントの設定（指示書271）— ブラウザ側。今のフォントを1か所で持ち、置き場所4か所の FontSwitcher が同じものを見る。
//   ・画面に当てる：<html data-font data-text-size>（globals.css）。最初の描画は layout.tsx の初期化スクリプトが済ませている
//   ・端末にも控える（FONT_LOCAL_KEY と Cookie）＝次に開いたときの最初の表示を速くする
//   ・サーバーと合わせる：ページを開いたら1回だけ /api/font-prefs を読み、違えばサーバーの値に合わせる
//   ・139 のときの端末だけの選択は、アカウントにまだ選択が無ければアカウントへ移して消す（選び直しをさせない）

import { useSyncExternalStore } from "react";
import {
  FONT_COOKIE,
  FONT_LOCAL_KEY,
  LEGACY_FONT_LOCAL_KEY,
  fontToken,
  isFontId,
  normalizeFontPref,
  parseFontToken,
  resolveFontPref,
  type FontPref,
} from "./font-pref";

export type FontState = {
  /** 今の画面に使っているフォント */
  effective: FontPref;
  /** 本人の選択（無ければ院長の既定に従っている） */
  mine: FontPref | null;
  /** 院長の既定（まだ決めていなければ null） */
  def: FontPref | null;
  /** サーバーと合わせ終わったか */
  synced: boolean;
};

type ServerReply = { mine?: unknown; def?: unknown };

function readInitial(): FontPref {
  const d = document.documentElement;
  return {
    font: isFontId(d.getAttribute("data-font")) ? (d.getAttribute("data-font") as FontPref["font"]) : "noto",
    size: (parseFontToken(`noto.${d.getAttribute("data-text-size") ?? "md"}`)?.size ?? "md"),
  };
}

let state: FontState | null = null;
const listeners = new Set<() => void>();

function current(): FontState {
  if (!state) state = { effective: readInitial(), mine: null, def: null, synced: false };
  return state;
}

function emit(next: FontState) {
  state = next;
  for (const l of listeners) l();
}

/** 画面に当てて、端末に控える */
export function applyFontPref(p: FontPref) {
  const d = document.documentElement;
  if (p.font === "noto") d.removeAttribute("data-font");
  else d.setAttribute("data-font", p.font);
  if (p.size === "md") d.removeAttribute("data-text-size");
  else d.setAttribute("data-text-size", p.size);
  const token = fontToken(p);
  try {
    localStorage.setItem(FONT_LOCAL_KEY, token);
  } catch {
    /* 保存できなくても表示中は効く */
  }
  const secure = location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${FONT_COOKIE}=${token}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax${secure}`;
}

function take(reply: ServerReply) {
  const mine = normalizeFontPref(reply.mine);
  const def = normalizeFontPref(reply.def);
  const effective = resolveFontPref(mine, def);
  applyFontPref(effective);
  emit({ effective, mine, def, synced: true });
}

async function call(method: "GET" | "PUT" | "DELETE", body?: FontPref): Promise<ServerReply | null> {
  try {
    const res = await fetch("/api/font-prefs", {
      method,
      cache: "reload",
      credentials: "same-origin",
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) return null;
    return (await res.json()) as ServerReply;
  } catch {
    return null;
  }
}

let syncStarted = false;

/** ページを開いたら1回だけ、サーバーの値に合わせる（ログインしている画面だけで呼ぶ） */
export function syncFontPrefOnce() {
  if (syncStarted) return;
  syncStarted = true;
  void (async () => {
    const reply = await call("GET");
    if (!reply) return;
    let legacy: string | null = null;
    try {
      legacy = localStorage.getItem(LEGACY_FONT_LOCAL_KEY);
    } catch {
      /* 読めなければ移さない */
    }
    if (legacy !== null) {
      // 139 のときの端末だけの選択：アカウントにまだ選択が無ければ移す（大きさは標準）。どちらでも端末からは消す
      if (!normalizeFontPref(reply.mine) && isFontId(legacy)) {
        const moved = await call("PUT", { font: legacy, size: "md" });
        if (moved) {
          try {
            localStorage.removeItem(LEGACY_FONT_LOCAL_KEY);
          } catch {
            /* 次に開いたときにもう一度 */
          }
          take(moved);
          return;
        }
      } else {
        try {
          localStorage.removeItem(LEGACY_FONT_LOCAL_KEY);
        } catch {
          /* 次に開いたときにもう一度 */
        }
      }
    }
    take(reply);
  })();
}

/** 本人が選ぶ（すぐ画面に当てて、アカウントに残す） */
export async function chooseFontPref(p: FontPref): Promise<boolean> {
  const prev = current();
  applyFontPref(p);
  emit({ ...prev, effective: p, mine: p });
  const reply = await call("PUT", p);
  if (reply) take(reply);
  return !!reply;
}

/** 「既定に戻す」：本人の選択を消して院長の既定に従う */
export async function resetFontPref(): Promise<boolean> {
  const reply = await call("DELETE");
  if (reply) take(reply);
  return !!reply;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const SERVER_STATE: FontState = { effective: { font: "noto", size: "md" }, mine: null, def: null, synced: false };

export function useFontState(): FontState {
  return useSyncExternalStore(subscribe, current, () => SERVER_STATE);
}
