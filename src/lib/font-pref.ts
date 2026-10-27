// 🔤 フォントの設定（指示書139・271）— 純関数・依存なし（クライアント・サーバー・proxy で共用）
//
// 【どのフォントが使われるか（271 §2）】
//   1. 本人が自分で選んでいれば、本人の選択（アカウントの user_metadata.app_font に残す＝端末をまたいで同じ）
//   2. 選んでいなければ、院長が決めた全員の既定（content_store の FONT_DEFAULT_KEY）
//   3. どちらも読めないときは、あ標準・標準の大きさ
// 【最初の描画（一瞬だけ別のフォント・大きさで出さない）】
//   proxy.ts がページを返すたびに、その人に使うフォントを Cookie（FONT_COOKIE）に入れる。
//   layout.tsx の初期化スクリプトが最初の描画の前に Cookie → 端末に残した値（FONT_LOCAL_KEY）の順で読み、
//   <html data-font data-text-size> に入れる。ログインしていない画面は院長の既定。

export const FONT_IDS = ["noto", "biz", "rounded"] as const;
export type FontId = (typeof FONT_IDS)[number];

export const SIZE_IDS = ["sm", "md", "lg", "xl"] as const;
export type SizeId = (typeof SIZE_IDS)[number];

export type FontPref = { font: FontId; size: SizeId };

export const FONT_CHOICES: readonly { id: FontId; label: string; desc: string; preview: string }[] = [
  { id: "noto", label: "標準", desc: "Noto Sans JP", preview: "font-preview-noto" },
  { id: "biz", label: "UD", desc: "BIZ UDPゴシック", preview: "font-preview-biz" },
  { id: "rounded", label: "まる", desc: "M PLUS Rounded 1c", preview: "font-preview-rounded" },
];

/** 文字の大きさ（271 §1）。scale は画面全体の文字の倍率（globals.css の html[data-text-size]） */
export const SIZE_CHOICES: readonly { id: SizeId; label: string; scale: number }[] = [
  { id: "sm", label: "小", scale: 0.9 },
  { id: "md", label: "標準", scale: 1 },
  { id: "lg", label: "大", scale: 1.125 },
  { id: "xl", label: "特大", scale: 1.25 },
];

/** 出した時点で誰の見た目も変わらないよう、今と同じ「あ標準・標準の大きさ」 */
export const BUILTIN_FONT_PREF: FontPref = { font: "noto", size: "md" };

/** 院長が決める全員の既定（content_store・書くのは /api/admin/font-default だけ） */
export const FONT_DEFAULT_KEY = "portal_font_default";
/** proxy がその人に使うフォントを入れる Cookie（"biz.lg" の形。HttpOnly ではない＝初期化スクリプトが読む） */
export const FONT_COOKIE = "mk_font";
/** 端末に残す今のフォント（"biz.lg" の形）。最初の表示を速くするための控え */
export const FONT_LOCAL_KEY = "app_font_v2";
/** 139 のときの端末だけの選択（"noto" | "biz" | "rounded"）。次にログインしたときにアカウントへ移して消す */
export const LEGACY_FONT_LOCAL_KEY = "app_font";
/** アカウントの user_metadata の中の置き場所 */
export const FONT_META_FIELD = "app_font";

export function isFontId(v: unknown): v is FontId {
  return typeof v === "string" && (FONT_IDS as readonly string[]).includes(v);
}

export function isSizeId(v: unknown): v is SizeId {
  return typeof v === "string" && (SIZE_IDS as readonly string[]).includes(v);
}

/** 保存された値（{font,size}）を確かめる。どちらかが変なら null */
export function normalizeFontPref(v: unknown): FontPref | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isFontId(o.font) || !isSizeId(o.size)) return null;
  return { font: o.font, size: o.size };
}

/** "biz.lg" → {font,size}（読めなければ null） */
export function parseFontToken(v: unknown): FontPref | null {
  if (typeof v !== "string") return null;
  const [font, size] = v.split(".");
  return normalizeFontPref({ font, size });
}

export function fontToken(p: FontPref): string {
  return `${p.font}.${p.size}`;
}

export function samePref(a: FontPref | null, b: FontPref | null): boolean {
  return !!a && !!b && a.font === b.font && a.size === b.size;
}

/** 本人の選択 → 院長の既定 → あ標準・標準 */
export function resolveFontPref(mine: FontPref | null, def: FontPref | null): FontPref {
  return mine ?? def ?? BUILTIN_FONT_PREF;
}

export function fontLabel(id: FontId): string {
  return `あ${FONT_CHOICES.find((c) => c.id === id)?.label ?? ""}`;
}

export function sizeLabel(id: SizeId): string {
  return SIZE_CHOICES.find((c) => c.id === id)?.label ?? "";
}

/** 「あUD・大」の形（画面の説明に出す） */
export function prefLabel(p: FontPref): string {
  return `${fontLabel(p.font)}・${sizeLabel(p.size)}`;
}

/**
 * 最初の描画の前に <html data-font data-text-size> を入れるスクリプト（layout.tsx の body の先頭）。
 * Cookie（サーバーが決めたその人のフォント）→ 端末の控え → 139 の端末だけの選択 の順。
 * 標準（noto・md）は属性を付けない＝CSS の既定のまま。
 */
export function fontInitScript(): string {
  const fonts = JSON.stringify(FONT_IDS);
  const sizes = JSON.stringify(SIZE_IDS);
  return `try{var F=${fonts},S=${sizes},t=null,m=document.cookie.match(/(?:^|; )${FONT_COOKIE}=([^;]*)/);if(m)t=decodeURIComponent(m[1]);if(!t){try{t=localStorage.getItem(${JSON.stringify(FONT_LOCAL_KEY)});if(!t){var l=localStorage.getItem(${JSON.stringify(LEGACY_FONT_LOCAL_KEY)});if(l)t=l+".md"}}catch(e){}}if(t){var p=t.split("."),d=document.documentElement;if(F.indexOf(p[0])>0)d.setAttribute("data-font",p[0]);if(S.indexOf(p[1])>=0&&p[1]!=="md")d.setAttribute("data-text-size",p[1])}}catch(e){}`;
}
