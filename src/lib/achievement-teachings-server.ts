// 🌱 アチーブメントの教え（成功のサイクル・失敗のサイクル／人生の方程式／成功の公式／身につけたい7つの習慣）
// 指示書「mk_training_success_cycle.md」「mk_training_achievement_formulas.md」
//
// - 文言は院長がアチーブメントの資料から確定したもの。**一字一句変えない・説明を足さない**
// - 静的な内容（DB なし）。サーバーのページ（/achievement）だけが読む。
//   クライアントの JS（/_next/static は誰でも取れる）に文言を入れないため、"use client" のファイルから import しない

export type CycleNode = {
  /** 図の行（タイトル）。2行のものは配列で2つ */
  title: string[];
  /** サブ（無ければ空）。2行のものは配列で2つ */
  sub: string[];
  /** スタート（二重枠＋「スタート」） */
  start?: true;
  /** 枠をやや太く */
  bold?: true;
};

export type Cycle = {
  id: "success" | "failure";
  name: string;
  /** 円の中央に小さく添える（無ければ空） */
  caption: string;
  /** 0°（真上）から時計回りに45°刻みの8つ */
  nodes: CycleNode[];
};

export const CYCLE_LEAD = [
  "どちらのサイクルも、スタートは「願望」の持ち方です。",
  "はっきりした願望から始めると成功のサイクルが回り、否定的な考え方から始めると失敗のサイクルが回ります。",
  "失敗のサイクルに入ったと気づいたら、すぐに「願望の明確化」に戻りましょう。",
];

export const SUCCESS_CYCLE: Cycle = {
  id: "success",
  name: "成功のサイクル",
  caption: "願望から始まる",
  nodes: [
    { title: ["達成"], sub: [] },
    { title: ["自信"], sub: ["セルフイメージ向上"] },
    { title: ["① 願望の明確化"], sub: ["成功イメージの確立"], start: true },
    { title: ["目標の設定"], sub: [] },
    { title: ["達成計画の立案"], sub: [] },
    { title: ["② 成果の視覚化"], sub: [], bold: true },
    { title: ["最優先テーマの実行"], sub: [] },
    { title: ["③ 継続"], sub: [], bold: true },
  ],
};

export const FAILURE_CYCLE: Cycle = {
  id: "failure",
  name: "失敗のサイクル",
  caption: "",
  nodes: [
    { title: ["未達成"], sub: [] },
    { title: ["自信喪失"], sub: [] },
    { title: ["否定的考え方"], sub: ["悲観的な願望"], start: true },
    { title: ["無目的無目標"], sub: [] },
    { title: ["無計画"], sub: ["安住・怠惰・", "コンフォートゾーン"] },
    { title: ["思考の分散"], sub: ["あれもこれも"] },
    { title: ["楽な方へ", "流される生き方"], sub: ["無秩序"] },
    { title: ["言い訳の癖"], sub: ["自己正当化"] },
  ],
};

/** スタートのノードから時計回りの順（スマホのリスト表示） */
export function nodesFromStart(cycle: Cycle): CycleNode[] {
  const s = Math.max(0, cycle.nodes.findIndex((n) => n.start));
  return [...cycle.nodes.slice(s), ...cycle.nodes.slice(0, s)];
}

export type Formula = {
  id: "life" | "success";
  heading: string;
  left: string;
  right: [string, string, string];
};

export const LIFE_EQUATION: Formula = {
  id: "life",
  heading: "人生の方程式",
  left: "その人の人生",
  right: ["先天的特質", "環境", "本人の選択"],
};

export const SUCCESS_FORMULA: Formula = {
  id: "success",
  heading: "成功の公式",
  left: "成功",
  right: ["能力", "熱意", "考え方"],
};

export type HabitColumn = {
  principle: string;
  title: string;
  theory: string;
  items: string[];
};

export const HABITS_HEADING = "身につけたい7つの習慣";

export const DESTRUCTIVE_HABITS: HabitColumn = {
  principle: "人間関係破壊の原則",
  title: "致命的な7つの習慣",
  theory: "外的コントロール理論",
  items: ["1．批判する", "2．責める", "3．文句を言う", "4．ガミガミ言う", "5．脅す", "6．罰する", "7．目先の褒美で釣る"],
};

export const CONSTRUCTIVE_HABITS: HabitColumn = {
  principle: "人間関係構築の原則",
  title: "身につけたい7つの習慣",
  theory: "内的コントロール理論",
  items: ["1．傾聴する", "2．支援する", "3．励ます", "4．尊敬する", "5．信頼する", "6．受容する", "7．意見の違いについて交渉する"],
};
