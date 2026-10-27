"use client";

// 271: 表示を作り直す画面（院長の画面に入れない人の /admin の404 など）では、React が <html> を作り直して
// 初期化スクリプトが入れた data-font / data-text-size が消える。描画のあとに Cookie から入れ直す。
// ふつうの画面では属性が残っているので何もしない。
// 272: 選んだフォントの読み込みに失敗したら、この画面では あ標準 に戻す（本人の選択は消さない＝次に開いたときにまた試す）。
//      失敗した書体は document.fonts の loadingerror で分かる。あとから同じ書体が入れられたときも外す。

import { useEffect } from "react";
import { FONT_COOKIE, parseFontToken } from "@/lib/font-pref";

export function FontRestore({ families }: { families: Record<string, string> }) {
  useEffect(() => {
    const d = document.documentElement;
    if (d.hasAttribute("data-font") || d.hasAttribute("data-text-size")) return;
    const m = document.cookie.match(new RegExp(`(?:^|; )${FONT_COOKIE}=([^;]*)`));
    const p = parseFontToken(m ? decodeURIComponent(m[1]) : null);
    if (!p) return;
    if (p.font !== "noto") d.setAttribute("data-font", p.font);
    if (p.size !== "md") d.setAttribute("data-text-size", p.size);
  }, []);

  useEffect(() => {
    if (!("fonts" in document)) return;
    const d = document.documentElement;
    const broken = new Set<string>();
    const name = (f: FontFace) => f.family.replace(/^['"]|['"]$/g, "");
    const check = () => {
      const id = d.getAttribute("data-font");
      if (id && broken.has(families[id] ?? "")) d.removeAttribute("data-font");
    };
    for (const f of document.fonts) if (f.status === "error") broken.add(name(f));
    check();
    const onError = (e: Event) => {
      for (const f of (e as FontFaceSetLoadEvent).fontfaces) broken.add(name(f));
      check();
    };
    document.fonts.addEventListener("loadingerror", onError);
    const mo = new MutationObserver(check);
    mo.observe(d, { attributes: true, attributeFilter: ["data-font"] });
    return () => {
      document.fonts.removeEventListener("loadingerror", onError);
      mo.disconnect();
    };
  }, [families]);

  return null;
}
