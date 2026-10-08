// RWDEPC対話モード（指示書153・223）— 1on1ノートの対話フレーム
// 問いかけ例・リマインダー文言は指示書153のものを**一言一句そのまま**収載（創作・追加禁止）。
//
// 223: R（人間関係の構築）を入力欄にした。入力するのは R→W→D→E→P→C の6つ。
// 話す前のリマインダー（153）は、そのまま冒頭に残す。
// RWDEPCの文字・英語・日本語の対応は RWDEPC_TABLE が**唯一の正本**で、
// 欄の名前・ポップアップ・AIへの指示文はすべてここから取る（223 §1-1）。
//
// 【原則】スコア・評価的な集計は表示しない（152と同じ）。
// E欄は「本人の自己評価」を書く欄で、記録者の評価欄ではない（ガード文を常時表示する）。

/** 話す前の場づくりリマインダー（153・常時表示・文言を変えないこと） */
export const RWDEPC_REMINDERS: readonly string[] = [
  "評価も批判もしない。まず聴く",
  "相手の話を遮らない。本音を歓迎する",
  "感謝・誠実・敬意 — 安心して話せる場は自分がつくる",
];

/** R欄の説明（223 §2「書く中身」。ラベル直下に出す） */
export const RWDEPC_R_NOTE =
  "関係づくりのやりとりを書く欄です（記録者が伝えたねぎらい・感謝、本人が話してくれた近況やうれしかったこと）";

/** E欄のガード文（ラベル直下に常時表示・文言を変えないこと） */
export const RWDEPC_E_GUARD =
  "本人の自己評価をそのまま書く欄です（記録者の評価を書く欄ではありません）";

/**
 * RWDEPCの文字・英語・日本語（223 §1-1 の表。**ここが唯一の正本**）。
 * リードマネジメントの型を意識して身に付けるため、画面のポップアップとAIへの指示文で同じものを使う。
 */
export const RWDEPC_TABLE: readonly { mark: string; en: string; ja: string }[] = [
  { mark: "R", en: "Relation", ja: "人間関係の構築" },
  { mark: "W", en: "Wants", ja: "願望の明確化" },
  { mark: "D", en: "Doing", ja: "現在の行動の把握" },
  { mark: "E", en: "Evaluation", ja: "自己評価" },
  { mark: "P", en: "Plan", ja: "計画立案" },
  { mark: "C", en: "Commitment", ja: "実行の約束" },
];

/** 表の見出し（ポップアップ・報告で同じ言い方を使う） */
export const RWDEPC_TABLE_HEAD: readonly string[] = ["文字", "英語", "日本語"];

/** 文字 → 日本語（欄の名前は表から取る＝写しを作らない） */
function jaOf(mark: string): string {
  return RWDEPC_TABLE.find((t) => t.mark === mark)?.ja ?? "";
}

export type RwdepcStepKey = "r" | "w" | "d" | "e" | "p" | "c";

export type RwdepcStep = {
  key: RwdepcStepKey;
  /** 見出しの記号（R・W・D・E・P・C） */
  mark: string;
  /** 見出しの名前（願望の明確化 など） */
  label: string;
  /** 問いかけ例（指示書153のリスト全部） */
  questions: readonly string[];
};

export const RWDEPC_STEPS: readonly RwdepcStep[] = [
  {
    // 223 §2: 関係づくりのやりとりを書く欄。問いかけ例は153に無いので置かない（創作しない）
    key: "r",
    mark: "R",
    label: jaOf("R"),
    questions: [],
  },
  {
    key: "w",
    mark: "W",
    label: jaOf("W"),
    questions: [
      "この職場で、どんな状態になれたら最高ですか？",
      "どんなキャリア・働き方を築いていきたいですか？",
      "チームにどう貢献できている自分でありたいですか？",
      "1年後、どうなっていたら「成長した」と言えそうですか？",
      "仕事を通じて大切にしたいことは何ですか？",
      "最近「こうなりたい」と思った瞬間はありましたか？",
      "憧れている人・目標にしている姿はありますか？",
      "もし制約がなかったら、何に挑戦してみたいですか？",
    ],
  },
  {
    key: "d",
    mark: "D",
    label: jaOf("D"),
    questions: [
      "その理想に向けて、今週はどんな行動をしましたか？",
      "いま一番時間を使っていることは何ですか？",
      "最近続けていること・始めたことはありますか？",
      "うまくいっていることは何ですか？",
      "逆に、後回しになっていることはありますか？",
      "その場面で、実際にはどう動きましたか？",
      "誰かに相談・協力を求めましたか？",
      "事実として、どれくらいの頻度・回数でやれていますか？",
    ],
  },
  {
    key: "e",
    mark: "E",
    label: jaOf("E"),
    questions: [
      "いまのやり方を続けて、望む姿に近づけそうですか？",
      "その行動は、願望にとって効果的だと思いますか？",
      "続けたいこと・変えたいことはどれですか？",
      "10点満点なら今何点ですか？その心は？",
      "もし親友が同じ状況なら、何と声をかけますか？",
      "いまの選択は、自分の大切にしたいことと一致していますか？",
      "何が一番のブレーキになっていると思いますか？",
      "このままの場合とやり方を変えた場合、半年後はどう違いそうですか？",
    ],
  },
  {
    key: "p",
    mark: "P",
    label: jaOf("P"),
    questions: [
      "明日からできる一番小さな一歩は何ですか？",
      "いつ・どこで・何を・どのくらいやりますか？",
      "それは自分でコントロールできることですか？",
      "障害になりそうなことと、その備えは？",
      "誰の協力があると進めやすいですか？",
      "うまくいったと分かるサインは何ですか？",
      "続けやすくする工夫はありますか？",
      "最初の一歩はいつ踏み出しますか？",
    ],
  },
  {
    key: "c",
    mark: "C",
    label: jaOf("C"),
    questions: [
      "では、次回までにこれをやってみる、で良いですか？",
      "この約束を一言で言うと？",
      "私がサポートできることはありますか？",
      "次回、何ができていたら一緒に喜べますか？",
    ],
  },
];

export type RwdepcData = {
  /** 223: 人間関係の構築。これまでの記録には無い＝空（画面では「—」で出す） */
  r: string;
  w: string;
  d: string;
  e: string;
  p: string;
  c: string;
};

export const EMPTY_RWDEPC: RwdepcData = { r: "", w: "", d: "", e: "", p: "", c: "" };

const FIELD_MAX = 4000;

export function normalizeRwdepc(raw: unknown): RwdepcData {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const t = (v: unknown) => (typeof v === "string" ? v.slice(0, FIELD_MAX) : "");
  return { r: t(o.r), w: t(o.w), d: t(o.d), e: t(o.e), p: t(o.p), c: t(o.c) };
}

export function hasRwdepcBody(r: RwdepcData): boolean {
  return !!(
    r.r.trim() ||
    r.w.trim() ||
    r.d.trim() ||
    r.e.trim() ||
    r.p.trim() ||
    r.c.trim()
  );
}
