// 季節の装飾（指示書146-D）
// 月ごとのささやかな飾り。上品・控えめを守るため、次の3点をコード側の制約にする。
// - 文字の上に重ねない（装飾はヘッダー帯の中だけに置き、本文領域には出さない）
// - 1画面に置く飾りは最大4つ・不透明度は控えめ
// - 動きは「ゆっくり揺れる」程度。OSの「視差効果を減らす」設定では止める（globals.css 側）
//
// 絵柄は絵文字で表現する（SVGを12ヶ月分描き起こすより保守が楽で、
// 端末のフォントに追随して破綻しにくいため）。

export type SeasonalTheme = {
  /** 装飾に使う絵文字（最大4つまで表示する） */
  marks: string[];
  /** ヘッダー帯にかける淡い背景（Tailwind クラス） */
  bandClass: string;
  /** スクリーンリーダー向けの説明 */
  label: string;
};

// 12ヶ月分。院内の季節感に合わせた控えめな選定。
const THEMES: Record<number, SeasonalTheme> = {
  1: { marks: ["🎍", "❄️", "🌅"], bandClass: "from-rose-50 to-white", label: "お正月" },
  2: { marks: ["❄️", "🌸"], bandClass: "from-sky-50 to-white", label: "冬の終わり" },
  3: { marks: ["🌸", "🌱"], bandClass: "from-pink-50 to-white", label: "早春" },
  4: { marks: ["🌸", "🌸", "🍃"], bandClass: "from-pink-50 to-white", label: "桜" },
  5: { marks: ["🎏", "🌿"], bandClass: "from-emerald-50 to-white", label: "新緑" },
  6: { marks: ["💠", "☔", "🐌"], bandClass: "from-indigo-50 to-white", label: "あじさい" },
  7: { marks: ["🎐", "🌊"], bandClass: "from-sky-50 to-white", label: "風鈴" },
  8: { marks: ["🌻", "🎐"], bandClass: "from-amber-50 to-white", label: "ひまわり" },
  9: { marks: ["🌾", "🌕"], bandClass: "from-amber-50 to-white", label: "実り" },
  10: { marks: ["🍁", "🍂"], bandClass: "from-orange-50 to-white", label: "紅葉" },
  11: { marks: ["🍂", "🌰"], bandClass: "from-orange-50 to-white", label: "晩秋" },
  12: { marks: ["❄️", "🎄", "❄️"], bandClass: "from-sky-50 to-white", label: "雪" },
};

export function seasonalThemeFor(now: Date = new Date()): SeasonalTheme {
  return THEMES[now.getMonth() + 1] ?? THEMES[1];
}

/**
 * キャラの季節小物（マフラー等）について:
 * 24キャラ × 12ヶ月ぶんのSVG差分を持つことになり、キャラのリデザインのたびに
 * 全季節を描き直す保守コストが見合わないため、今回は見送る。
 * 実装するなら「キャラSVGの上に小物SVGを重ねる1レイヤー方式」が現実的
 * （キャラ本体に手を入れずに済む）。
 */
