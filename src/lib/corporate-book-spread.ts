// コーポレートブックの見開き表示（指示書213）— 画面とリーダーで共通に使う純関数
//
// 【並べ方（213 §2）】本と同じにする。
//   表紙（1ページ目）は1枚だけ。そのあとは 2・3／4・5／… の組（左が小さい番号）。
//   全53ページなので、最後は 52・53 の組になる。
//
// 【位置を保つ（213 §3）】
//   「いま何ページを読んでいるか」は**1つの数（page）だけ**で持ち、
//   見開きのときは、その数が入る組を出す。こうすると 1ページ⇔見開きを
//   切り替えても読んでいた位置が動かない（7ページ → 見開きでは 6–7）。
//
// クライアント・サーバーどちらからでも使える純関数のみ。

export type BookView = "single" | "spread";

/** その端末で選んだ表示を覚えておく場所（213 §1） */
export const BOOK_VIEW_STORAGE_KEY = "mk-corporate-book-view";

export function isBookView(v: unknown): v is BookView {
  return v === "single" || v === "spread";
}

/** その組の左ページ（＝組の代表）。1ページ目だけは単独 */
export function spreadStart(page: number): number {
  if (page <= 1) return 1;
  return page % 2 === 0 ? page : page - 1;
}

/** その組に出すページ。1ページ目は[1]、最後が奇数で余れば1枚だけ */
export function spreadPages(page: number, total: number): number[] {
  const s = Math.min(Math.max(spreadStart(page), 1), total);
  if (s === 1) return [1];
  const right = s + 1;
  return right <= total ? [s, right] : [s];
}

/**
 * 見開き単位で進む・戻る。戻り値は「新しい page」。
 * 端では動かさない（最後の組で次へを押しても最後の組のまま）。
 */
export function stepSpread(page: number, delta: number, total: number): number {
  const s = Math.min(Math.max(spreadStart(page), 1), total);
  if (delta > 0) {
    const next = s === 1 ? 2 : s + 2;
    return next > total ? s : next;
  }
  if (delta < 0) {
    if (s <= 2) return 1;
    return s - 2;
  }
  return s;
}

/** ページ番号の表示（213 §2）。例: 「1 / 53」「6–7 / 53」 */
export function spreadLabel(page: number, total: number): string {
  const ps = spreadPages(page, total);
  const head = ps.length === 2 ? `${ps[0]}–${ps[1]}` : `${ps[0]}`;
  return `${head} / ${total}`;
}

/** 先読みしておくページ（前後の組ぶん・213 §3） */
export function preloadPages(page: number, total: number, view: BookView): number[] {
  if (view === "single") {
    return [page - 1, page + 1].filter((n) => n >= 1 && n <= total);
  }
  const prev = stepSpread(page, -1, total);
  const next = stepSpread(page, 1, total);
  const set = new Set<number>();
  for (const p of [prev, next]) for (const n of spreadPages(p, total)) set.add(n);
  for (const n of spreadPages(page, total)) set.delete(n); // いま出ている分は除く
  return [...set].filter((n) => n >= 1 && n <= total);
}
