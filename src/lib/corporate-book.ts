// コーポレートブックの共有定数（131-補2）
// 改訂時はページ数・版表記をここで更新する（画像は scripts/generate-corporate-book-pages.js で再生成）
//
// 【画像の連番と紙面の番号（215で画像を1枚ずつ確かめた・216で画面に出す番号にした）】
//   画像1＝表紙（番号なし）／画像2＝目次（番号なし）／画像3＝紙面2 … 画像51＝紙面50／
//   画像52＝奥付（番号なし）／画像53＝裏表紙（番号なし）。
//   つまり **紙面の番号 ＝ 画像の連番 − 1**。画面にはこの紙面の番号を出す（216）。
//   中で覚えている位置は今までどおり**画像の連番**（page）で持つ。

export const CORPORATE_BOOK_PAGE_COUNT = 53;
export const CORPORATE_BOOK_VERSION = "2026年7月版";
export const CORPORATE_BOOK_API = "/api/corporate-book";

// 目次 → 画像連番の対応表（131-補3 → 216で項目の**最初のページ**にそろえ直した）
// 冊子に印刷された目次の数字は、そのページの下に印刷された番号より**1つ大きい**
//   （例: 「人材育成方針 … 17」だが、そのページの下は 16。画像では17枚目）。
//   ＝冊子の目次は画像の連番と同じ数字になっている。
// ここは**画像の連番**で持ち、画面には紙面の番号（画像−1）を出す（216）。
// 改訂で画像を再生成したら必ず実物と突き合わせて更新すること。
export const CORPORATE_BOOK_TOC: { label: string; page: number }[] = [
  // 216: 「クリニック理念」だけ項目の2ページ目（画像4）を指していたので、最初のページに直した
  { label: "クリニック理念", page: 3 },
  { label: "クリニックビジョン", page: 5 },
  { label: "経営方針 − 患者さんへの約束", page: 7 },
  { label: "経営方針 − スタッフへの約束", page: 8 },
  { label: "経営方針 − 社会への約束", page: 10 },
  { label: "経営方針 − 財務方針", page: 12 },
  { label: "経営方針 − フィロソフィー", page: 14 },
  { label: "人材育成方針", page: 17 },
  { label: "差別化・区分化・専門化戦略", page: 19 },
  { label: "職種別方針", page: 22 },
  { label: "クリニックルール", page: 25 },
  { label: "創業の歴史・精神", page: 28 },
  { label: "院長メッセージ", page: 32 },
  { label: "人事制度 第1章 当院の人材育成哲学", page: 36 },
  { label: "人事制度 第2章 5つの等級", page: 39 },
  { label: "人事制度 第3章 評価と対話", page: 43 },
  { label: "人事制度 第4章 学びの分かち合い", page: 46 },
  { label: "人事制度 第5章 キャリアの選び方", page: 47 },
  { label: "成功の定義", page: 49 },
  { label: "成功の5つの条件", page: 50 },
];

// ─── 紙面の番号（216） ───

/** 番号が印刷されていないページの呼び名（画像の連番 → 名前） */
export const CORPORATE_BOOK_NAMED_PAGES: Record<number, string> = {
  1: "表紙",
  2: "目次",
  52: "奥付",
  53: "裏表紙",
};

/** 紙面に印刷された最後の番号（画面の「/ 50」の分母） */
export const CORPORATE_BOOK_LAST_PRINTED = 50;

/** 画像の連番 → 紙面に印刷された番号。印刷されていないページは null */
export function printedPageOf(image: number): number | null {
  if (CORPORATE_BOOK_NAMED_PAGES[image]) return null;
  const n = image - 1;
  return n >= 1 && n <= CORPORATE_BOOK_LAST_PRINTED ? n : null;
}

/**
 * 紙面の番号 → 画像の連番。範囲外は null。
 * **紙面に「1」は印刷されていない**（本の1ページ目＝目次に番号が無い）。
 * 1と入れたときは、その位置にあたる目次を開く。
 */
export function imageOfPrintedPage(printed: number): number | null {
  if (!Number.isInteger(printed) || printed < 1 || printed > CORPORATE_BOOK_LAST_PRINTED) return null;
  return printed + 1;
}

/** 画面に出す1ページぶんの呼び名。例: "4" / "表紙" / "奥付" */
export function bookPageLabel(image: number): string {
  const named = CORPORATE_BOOK_NAMED_PAGES[image];
  if (named) return named;
  const printed = printedPageOf(image);
  return printed === null ? String(image) : String(printed);
}

/**
 * 画面に出す「いまのページ」の呼び名（216）。
 * 1ページなら "4"／"表紙"、見開きなら "4–5"（続きの番号）や "50・奥付"（番号と名前）。
 */
export function bookPagesLabel(images: readonly number[]): string {
  const parts = images.map(bookPageLabel);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const [a, b] = [printedPageOf(images[0]), printedPageOf(images[1])];
  // 続きの番号どうしなら「4–5」、名前が混じるなら「50・奥付」
  return a !== null && b !== null && b === a + 1 ? `${parts[0]}–${parts[1]}` : parts.join("・");
}

/** 画面の番号表示（分母つき）。例: "4–5 / 50" */
export function bookPagesLabelWithTotal(images: readonly number[]): string {
  return `${bookPagesLabel(images)} / ${CORPORATE_BOOK_LAST_PRINTED}`;
}

/** 画像の alt 文（読み上げ）。例: "コーポレートデザインブック 4ページ" / "… 表紙" */
export function bookPageAlt(image: number): string {
  const named = CORPORATE_BOOK_NAMED_PAGES[image];
  return named
    ? `コーポレートデザインブック ${named}`
    : `コーポレートデザインブック ${bookPageLabel(image)}ページ`;
}
