"use client";

// 271: 表示を作り直す画面（院長の画面に入れない人の /admin の404 など）では、React が <html> を作り直して
// 初期化スクリプトが入れた data-font / data-text-size が消える。描画のあとに Cookie から入れ直す。
// ふつうの画面では属性が残っているので何もしない。

import { useEffect } from "react";
import { FONT_COOKIE, parseFontToken } from "@/lib/font-pref";

export function FontRestore() {
  useEffect(() => {
    const d = document.documentElement;
    if (d.hasAttribute("data-font") || d.hasAttribute("data-text-size")) return;
    const m = document.cookie.match(new RegExp(`(?:^|; )${FONT_COOKIE}=([^;]*)`));
    const p = parseFontToken(m ? decodeURIComponent(m[1]) : null);
    if (!p) return;
    if (p.font !== "noto") d.setAttribute("data-font", p.font);
    if (p.size !== "md") d.setAttribute("data-text-size", p.size);
  }, []);
  return null;
}
