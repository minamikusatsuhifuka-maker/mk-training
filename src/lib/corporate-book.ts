// コーポレートブックの共有定数（131-補2）
// 改訂時はページ数・版表記をここで更新する（画像は scripts/generate-corporate-book-pages.js で再生成）

export const CORPORATE_BOOK_PAGE_COUNT = 53;
export const CORPORATE_BOOK_VERSION = "2026年7月版";
export const CORPORATE_BOOK_API = "/api/corporate-book";

// 目次 → 画像連番の対応表（131-補3）
// 冊子の目次印字とはズレがあるため、全53枚の画像を実地確認して確定した値。
// （目次印字は「クリニック理念=3」だが画像連番では4。以降の項目は目次印字=画像連番で一致）
// 改訂で画像を再生成したら必ず実物と突き合わせて更新すること。
export const CORPORATE_BOOK_TOC: { label: string; page: number }[] = [
  { label: "クリニック理念", page: 4 },
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
