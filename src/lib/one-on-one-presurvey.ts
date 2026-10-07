// 1on1の事前アンケート（指示書197・197-補・200 → 204 v2で2部構成に）
//
// 【2部構成（204 §2・§3）】
//   第1部「働く目的と目標」… 毎回、**前回の答え（＝育成カルテの目標）が入った状態**で見直す。
//                            1-2 だけは毎回まっさらから答える。
//   第2部「今回の1on1」    … 197の問い・文言・必須をそのまま（今日話したいこと〜支援してほしいこと）。
//
// 【第1部とカルテの目標は同じもの（204 §4）】
//   1-1（目的）・1-3（3年）・1-4（年）・1-5（半期）・1-6（月）は育成カルテの「目標」そのもの。
//   提出すると**変わった段だけ**カルテの目標が更新される（週は聞かない・変えない）。
//   連動する5問は**削除・種類の変更ができない**（文言とヒントは院長が直せる）。
//
// 【保存先】
// - 質問の定義 … content_store `one_on_one_presurvey_config`（院長が編集・並べ替え）。
//   読みはログイン済み全員（スタッフが回答するため）・書きは管理者のみ（content-store-policy）。
// - 回答 … private_store `one_on_one_presurvey`（本人＝owner）。
//   **見られるのは本人・院長・院長が指定した管理者だけ**（204 §5。判定は presurvey-access-server）。
//
// 【原則】
// - 回答は評価に使わない（冒頭に常時表示する PRESURVEY_INTRO）。
// - 1-2の選択は一覧・件数・集計・絞り込み・並び替え・AIに使わない（204 §5-4）。1-7もAIに渡さない。
// - 注記は「情報として伝える文」とし、強く迫る言い回しにしない（リードマネジメントの「強制しない」）。
// - 回答には**その時点の質問文**を一緒に保存する（院長が後で質問を直しても、過去の回答の
//   見え方が変わらない。152・153と同じ考え方）。**旧形式の回答は読み替えず、そのまま表示する**（204 §7）。

import { getContent, saveContent } from "./content-store";
import type { GoalLevel } from "./staff-growth";

export const PRESURVEY_CONFIG_KEY = "one_on_one_presurvey_config";

/**
 * 冒頭に常時表示する文。**メールと画面で同じものを使う正本**（206-補 1）。
 *
 * 197では「文言を変えないこと」としていたが、後半が
 * 「あなたの成長を支え、1on1の対話を深めるために使います。」＝コーポレートブックにない
 * 言い回しだったため、**この1文に限り院長の判断で変更**した（206 B・206-補の決定）。
 * 後半は「スタッフへの約束」から取っている。
 *
 * ここを直せば、画面（/one-on-one/presurvey の冒頭）と
 * 事前アンケートの知らせのメール（presurvey-mail-server）の両方が変わる。
 * **この文を他の場所に書き写さないこと**（206 Bでメール側に写しがあり、ずれていた）。
 */
export const PRESURVEY_INTRO =
  "回答は評価には使いません。当院は目標・目的を定める機会を提供しサポートします。";

// ─── 2部構成（204 §2・§3） ───

export type PresurveyPart = 1 | 2;

export const PRESURVEY_PARTS: { value: PresurveyPart; title: string; lead: string }[] = [
  {
    value: 1,
    title: "第1部　働く目的と目標",
    lead: "前回の答えが入っています。読み返して、変わったところだけ直してください。",
  },
  {
    value: 2,
    title: "第2部　今回の1on1",
    lead: "今回の1on1で話したいことを書いてください。",
  },
];

export function partTitle(part: PresurveyPart): string {
  return PRESURVEY_PARTS.find((p) => p.value === part)?.title ?? "";
}

/** 回答の初期値の入り方（204 §2の「入り方」） */
export type PresurveyPrefill =
  /** 育成カルテの目標の、いまの値を入れる（連動する5問） */
  | "karte"
  /** 前回の自分の答えを入れる */
  | "previous"
  /** 空欄から（前回の答えは参考に小さく出す） */
  | "blank";

/** 回答のしかた（自動表示の有無で分かれる） */
export type PresurveyKind =
  /** 自由記述だけ */
  | "text"
  /** 本人の目標を自動表示＋「変わりない／変わった」＋記述（197の形・既定では使わない） */
  | "goal_confirm"
  /** 前回の自分の回答を表示＋「変わりない」を選べる＋記述（197の形・既定では使わない） */
  | "carry_over"
  /** 選択肢＋記述（記述は任意） */
  | "choice_text"
  /** 選択肢＋**記述も必須**（204 §2の1-2「3択＋場面を書く」） */
  | "choice_scene"
  /** 前回の1on1の約束を自動表示＋選択肢＋ひとこと */
  | "promise_check";

/** 1on1画面でどの欄の隣に出すか（197-補 2.）。top は画面の上部 */
export type PresurveySlot = "top" | "w" | "d" | "e" | "p" | "c";

export const PRESURVEY_SLOTS: { value: PresurveySlot; label: string }[] = [
  { value: "top", label: "画面の上部（最初の話題・承認の材料）" },
  { value: "w", label: "W｜願望の明確化 の隣" },
  { value: "d", label: "D｜現在の行動の把握 の隣" },
  { value: "e", label: "E｜自己評価 の隣" },
  { value: "p", label: "P｜計画立案 の隣" },
  { value: "c", label: "C｜実行の約束 の隣" },
];

export const PRESURVEY_KINDS: { value: PresurveyKind; label: string }[] = [
  { value: "text", label: "自由記述" },
  { value: "choice_text", label: "選択肢＋記述（記述は任意）" },
  { value: "choice_scene", label: "選択肢＋記述（どちらも必須）" },
  { value: "goal_confirm", label: "目標の確認（本人の目標を自動表示）" },
  { value: "carry_over", label: "前回の回答を引き継ぐ" },
  { value: "promise_check", label: "前回の約束の振り返り（約束を自動表示）" },
];

export type PresurveyQuestion = {
  /** 安定id（回答と結びつく。197の9問は q1〜q9・204で足した第1部は p1_*・追加は pq_xxx） */
  id: string;
  /** 第1部／第2部（204 §2・§3） */
  part: PresurveyPart;
  /** 質問文 */
  text: string;
  required: boolean;
  kind: PresurveyKind;
  /** 選択肢（choice系のみ） */
  choices: string[];
  /** 選択肢のあとの記述欄のラベル（空なら記述欄を出さない） */
  followUpLabel: string;
  /** 常時表示の注記（1-7の「＊…」） */
  note: string;
  /** 添え書き（1-4〜1-6の「何を・いつまでに」／2-5の線引き） */
  hint: string;
  /** 204 §2-3: コーポレートブックの一文（ヒント） */
  bookHint: string;
  /** そのヒントの出典（小さく添える） */
  bookSource: string;
  /** リードマネジメントでの役割（画面に小さく出す・院長が編集できる） */
  role: string;
  /** 1on1画面での置き場所 */
  slot: PresurveySlot;
  /** 初期値の入り方（204 §2） */
  prefill: PresurveyPrefill;
  /**
   * 育成カルテの目標の段（204 §4）。空でなければ**カルテと連動する**＝
   * 削除・種類の変更ができない。週（weekly）は使わない。
   */
  karteLevel: GoalLevel | "";
  /** 使わない質問は削除せず非表示にする（過去の回答を壊さないため） */
  hidden?: boolean;
};

/** カルテの目標と連動する質問か（＝削除・種類変更ができない・204 §7） */
export function isKarteLinked(q: Pick<PresurveyQuestion, "karteLevel">): boolean {
  return q.karteLevel !== "";
}

/** 連動して更新してよい段（週は聞かない・変えない・204 §2） */
export const PRESURVEY_KARTE_LEVELS: GoalLevel[] = [
  "purpose",
  "three_year",
  "annual",
  "half",
  "monthly",
];

export function isPresurveyKarteLevel(v: unknown): v is GoalLevel {
  return typeof v === "string" && (PRESURVEY_KARTE_LEVELS as string[]).includes(v);
}

/** 1-4〜1-6 の添え書き（204 §2・文言を変えないこと） */
const WHEN_HINT = "「何を・いつまでに」を入れると、次の1on1で振り返りやすくなります。";

/**
 * 初期の質問（204 §2・§3）。質問文・選択肢・注記・添え書き・ヒントは
 * 指示書204 v2 の表のまま（創作・言い換え禁止）。
 *
 * idの付け方: 第2部と1-7は**197のidをそのまま使う**（過去の回答と結びつけるため）。
 *   1-7 = q5 ／ 2-1 = q1 ／ 2-2 = q2 ／ 2-3 = q6 ／ 2-4 = q7 ／ 2-5 = q8 ／ 2-6 = q9
 * 197の q3（現在の目標）・q4（3年後）は第1部に置き換わったので**非表示**にして残す
 * （過去の回答の見え方を変えないため・削除はしない）。
 */
export const DEFAULT_PRESURVEY_QUESTIONS: PresurveyQuestion[] = [
  // ── 第1部　働く目的と目標 ──
  {
    id: "p1_purpose",
    part: 1,
    text: "あなたは何のために、誰のために働いていますか？",
    required: true,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: "",
    bookHint:
      "「なぜ、ここで働いているのか」「どんな自分になりたいのか」——その問いに向き合い、言葉にしようとするだけで、あなたはすでに素晴らしい一歩を踏み出しています。",
    bookSource: "フィロソフィー③",
    role: "",
    slot: "w",
    prefill: "karte",
    karteLevel: "purpose",
  },
  {
    id: "p1_growth",
    part: 1,
    text: "働くことは、あなたの成長につながり、人生を豊かにしてくれていますか？",
    required: true,
    kind: "choice_scene",
    choices: ["つながっている", "一部つながっている", "まだ実感できていない"],
    followUpLabel:
      "そう感じる場面、まだ実感できていない場面を教えてください（一言でも構いません）",
    note: "",
    hint: "",
    bookHint:
      "自己成長を通じて豊かな人間となり、他者貢献しながら良好な人間関係の中で豊かな人生を実現しましょう。",
    bookSource: "スタッフへの約束",
    role: "",
    slot: "e",
    prefill: "blank",
    karteLevel: "",
  },
  {
    id: "p1_3y",
    part: 1,
    text: "3年後、どうなっていたいですか？",
    required: true,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: "",
    bookHint:
      "何のために誰のためになぜ生きていくのか、自分がどういう存在としてありたいのか。",
    bookSource: "スタッフへの約束",
    role: "",
    slot: "w",
    prefill: "karte",
    karteLevel: "three_year",
  },
  {
    id: "p1_annual",
    part: 1,
    text: "1年後、どうなっていたいですか？ どんな目標がありますか？",
    required: true,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: WHEN_HINT,
    bookHint: "",
    bookSource: "",
    role: "",
    slot: "w",
    prefill: "karte",
    karteLevel: "annual",
  },
  {
    id: "p1_half",
    part: 1,
    text: "今期末、どうなっていたいですか？ どんな目標がありますか？",
    required: true,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: WHEN_HINT,
    bookHint: "",
    bookSource: "",
    role: "",
    slot: "w",
    prefill: "karte",
    karteLevel: "half",
  },
  {
    id: "p1_monthly",
    part: 1,
    text: "1か月後、どうなっていたいですか？ どんな目標がありますか？",
    required: true,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: WHEN_HINT,
    bookHint: "",
    bookSource: "",
    role: "",
    slot: "w",
    prefill: "karte",
    karteLevel: "monthly",
  },
  {
    // 197の質問5（問いと注記をそのまま）
    id: "q5",
    part: 1,
    text: "当院でそのビジョンは実現できそうですか？",
    required: true,
    kind: "choice_text",
    choices: [
      "実現できそう",
      "条件がそろえば実現できそう",
      "まだ分からない",
      "難しいと感じる",
    ],
    followUpLabel: "そのために、当院で必要なこと・自分がすることは？",
    note: "＊当院でのキャリアアップには、アチーブメントの学びを続け、実践し続けることが欠かせません。",
    hint: "",
    bookHint:
      "自分の目的と、クリニックの理念が重なり合う部分を大切に育てていきましょう。",
    bookSource: "フィロソフィー③",
    role: "願望と環境の確認・期待を情報として伝える",
    slot: "w",
    prefill: "previous",
    karteLevel: "",
  },

  // ── 第2部　今回の1on1（197の問い・文言・必須をそのまま） ──
  {
    id: "q1",
    part: 2,
    text: "今日の1on1でいちばん話したいことは何ですか？",
    required: true,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: "",
    bookHint: "",
    bookSource: "",
    role: "本人の関心から始める（主体性・信頼関係）",
    slot: "top",
    prefill: "blank",
    karteLevel: "",
  },
  {
    id: "q2",
    part: 2,
    text: "前回から今日までで、うまくいったこと・自分を褒めたいことは何ですか？",
    required: false,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: "",
    bookHint: "",
    bookSource: "",
    role: "承認の材料（ポジティブフィードバック・自己有能感）",
    slot: "top",
    prefill: "blank",
    karteLevel: "",
  },
  {
    id: "q6",
    part: 2,
    text: "前回の1on1の約束は、どうでしたか？",
    required: true,
    kind: "promise_check",
    choices: ["できた", "一部できた", "まだ"],
    followUpLabel: "ひとこと",
    note: "",
    hint: "",
    bookHint: "",
    bookSource: "",
    role: "行動（事実の確認）",
    slot: "d",
    prefill: "blank",
    karteLevel: "",
  },
  {
    id: "q7",
    part: 2,
    text: "いまの取り組み方は、目標に近づく助けになっていると思いますか？",
    required: true,
    kind: "choice_text",
    choices: ["なっている", "一部なっている", "なっていない"],
    followUpLabel: "その理由",
    note: "",
    hint: "",
    bookHint: "",
    bookSource: "",
    role: "自己評価",
    slot: "e",
    prefill: "blank",
    karteLevel: "",
  },
  {
    id: "q8",
    part: 2,
    text: "次の1on1までに、自分で決めてやってみたいことを1つ挙げるとしたら？",
    required: true,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: "1-6は「どうなっていたいか」、ここは「そのために何をするか」です。",
    bookHint: "",
    bookSource: "",
    role: "計画・約束（本人が決める）",
    slot: "p",
    prefill: "blank",
    karteLevel: "",
  },
  {
    id: "q9",
    part: 2,
    text: "それを実現するために、院長やチームからどんな支援があると助かりますか？",
    required: false,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: "",
    bookHint: "",
    bookSource: "",
    role: "支援（身に付けたい習慣「支援する」・185の機会・支援）",
    slot: "c",
    prefill: "blank",
    karteLevel: "",
  },

  // ── 197の質問3・4（第1部に置き換わった。過去の回答のために残し、非表示にする） ──
  {
    id: "q3",
    part: 1,
    text: "現在の目標を教えてください。",
    required: false,
    kind: "goal_confirm",
    choices: ["変わりない", "変わった"],
    followUpLabel: "いまの目標（変わった場合は書き換えてください）",
    note: "",
    hint: "",
    bookHint: "",
    bookSource: "",
    role: "願望",
    slot: "w",
    prefill: "blank",
    karteLevel: "",
    hidden: true,
  },
  {
    id: "q4",
    part: 1,
    text: "キャリアにおいて、3年後どうなっていたいですか？",
    required: false,
    kind: "carry_over",
    choices: ["変わりない"],
    followUpLabel: "3年後のありたい姿",
    note: "",
    hint: "もし制約がなかったら、どんな姿を描きますか？",
    bookHint: "",
    bookSource: "",
    role: "願望（理想の姿を引き出す）",
    slot: "w",
    prefill: "blank",
    karteLevel: "",
    hidden: true,
  },
];

const TEXT_MAX = 400;
const ANSWER_MAX = 4000;
const CHOICES_MAX = 10;

function str(v: unknown, max = TEXT_MAX): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function isKind(v: unknown): v is PresurveyKind {
  return PRESURVEY_KINDS.some((k) => k.value === v);
}

function isSlot(v: unknown): v is PresurveySlot {
  return PRESURVEY_SLOTS.some((s) => s.value === v);
}

function isPrefill(v: unknown): v is PresurveyPrefill {
  return v === "karte" || v === "previous" || v === "blank";
}

/** 追加する質問のid（既定の問いと衝突しない接頭辞） */
export function genPresurveyQuestionId(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `pq_${rnd}`;
}

/** 既定の定義（カルテ連動の決まりを取り出す元） */
const DEFAULT_BY_ID = new Map(DEFAULT_PRESURVEY_QUESTIONS.map((q) => [q.id, q]));

/**
 * 保存データを検証（1件も残らなければ既定に倒す＝設定未保存・壊れたJSONでも画面が成立する）。
 *
 * 【カルテと連動する問いの守り（204 §7）】
 * 連動する5問の `karteLevel` と `kind` は**保存データでは変えられない**（既定の値で上書きする）。
 * 文言・ヒント・注記・必須・並びは保存データのものを使う。
 * 連動する5問が保存データから消えていたら、既定のものを足し戻す（削除できない）。
 */
export function normalizePresurveyQuestions(raw: unknown): PresurveyQuestion[] {
  const out: PresurveyQuestion[] = [];
  if (Array.isArray(raw)) {
    const seen = new Set<string>();
    for (const q of raw) {
      if (!q || typeof q !== "object") continue;
      const o = q as Record<string, unknown>;
      const id = str(o.id, 64).trim();
      const text = str(o.text, 500).trim();
      if (!id || !text || seen.has(id)) continue;
      seen.add(id);
      const def = DEFAULT_BY_ID.get(id);
      const locked = def ? isKarteLinked(def) : false;
      const kind = locked ? def!.kind : isKind(o.kind) ? o.kind : "text";
      const choices = Array.isArray(o.choices)
        ? o.choices
            .map((c) => str(c, 100).trim())
            .filter((c) => !!c)
            .slice(0, CHOICES_MAX)
        : [];
      out.push({
        id,
        part: o.part === 2 ? 2 : o.part === 1 ? 1 : (def?.part ?? 2),
        text,
        required: locked ? true : o.required === true,
        kind,
        choices: locked ? [...def!.choices] : choices,
        followUpLabel: str(o.followUpLabel).trim(),
        note: str(o.note, 500).trim(),
        hint: str(o.hint, 500).trim(),
        bookHint: str(o.bookHint, 1000).trim(),
        bookSource: str(o.bookSource, 100).trim(),
        role: str(o.role).trim(),
        slot: isSlot(o.slot) ? o.slot : (def?.slot ?? "top"),
        prefill: locked ? "karte" : isPrefill(o.prefill) ? o.prefill : (def?.prefill ?? "blank"),
        // 連動の段は保存データから受け取らない（付け替え・外しを許さない）
        karteLevel: def?.karteLevel ?? "",
        hidden: locked ? undefined : o.hidden === true ? true : undefined,
      });
    }
  }
  if (out.length === 0) return defaultPresurveyQuestions();
  // 連動する5問が消えていたら足し戻す（削除できない）
  const have = new Set(out.map((q) => q.id));
  const missing = DEFAULT_PRESURVEY_QUESTIONS.filter(
    (q) => isKarteLinked(q) && !have.has(q.id)
  ).map((q) => ({ ...q, choices: [...q.choices] }));
  return missing.length > 0 ? [...missing, ...out] : out;
}

export function defaultPresurveyQuestions(): PresurveyQuestion[] {
  return DEFAULT_PRESURVEY_QUESTIONS.map((q) => ({ ...q, choices: [...q.choices] }));
}

/** 質問定義を読む（content_store → 無ければ既定） */
export async function loadPresurveyQuestions(): Promise<PresurveyQuestion[]> {
  const rows = await getContent<unknown>(PRESURVEY_CONFIG_KEY, []);
  return normalizePresurveyQuestions(rows);
}

/** 質問定義を保存（院長のみ・書き込み権限はサーバー側で強制される） */
export async function savePresurveyQuestions(
  questions: PresurveyQuestion[]
): Promise<boolean> {
  return saveContent<PresurveyQuestion>(PRESURVEY_CONFIG_KEY, questions);
}

/** 回答画面に出す質問（非表示を除く・保存された並び順のまま） */
export function visiblePresurveyQuestions(
  questions: PresurveyQuestion[]
): PresurveyQuestion[] {
  return questions.filter((q) => !q.hidden);
}

/** その部の質問だけ（並びは保存順） */
export function questionsOfPart(
  questions: PresurveyQuestion[],
  part: PresurveyPart
): PresurveyQuestion[] {
  return visiblePresurveyQuestions(questions).filter((q) => q.part === part);
}

/** カルテと連動する質問（段の順に並べる） */
export function karteLinkedQuestions(questions: PresurveyQuestion[]): PresurveyQuestion[] {
  const order = new Map(PRESURVEY_KARTE_LEVELS.map((l, i) => [l, i]));
  return visiblePresurveyQuestions(questions)
    .filter(isKarteLinked)
    .sort((a, b) => (order.get(a.karteLevel as GoalLevel) ?? 99) - (order.get(b.karteLevel as GoalLevel) ?? 99));
}

// ─── 回答 ───

export type PresurveyAnswer = {
  questionId: string;
  /** 回答した時点の質問文（後から質問を直しても過去の回答の見え方を変えないため） */
  question: string;
  /** 回答した時点の役割・置き場所・形式・部 */
  role: string;
  slot: PresurveySlot;
  kind: PresurveyKind;
  /** 204: 回答した時点の部（旧形式の回答には無い＝0） */
  part: PresurveyPart | 0;
  /** 選んだ選択肢（未選択は空） */
  choice: string;
  /** 「変わりない」を選んだ（carry_over・goal_confirm） */
  unchanged: boolean;
  /** 記述 */
  text: string;
};

export type PresurveyData = {
  /** 1on1の実施予定日 "YYYY-MM-DD" */
  heldOn: string;
  /** 197 B-2: 院長・担当幹部が登録した予定から回答したときの予定id（自分で作った回は空） */
  scheduleId: string;
  /** 1on1の相手（担当者）の userId。**閲覧の判定には使わない**（204 §5で廃止） */
  participantIds: string[];
  partnerName: string;
  /** 回答者の表示名（回答時点を保存） */
  authorName: string;
  answers: PresurveyAnswer[];
  /** 204: 2部構成の回答か（旧形式は false） */
  twoParts: boolean;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
};

export function emptyPresurveyAnswer(q: PresurveyQuestion): PresurveyAnswer {
  return {
    questionId: q.id,
    question: q.text,
    role: q.role,
    slot: q.slot,
    kind: q.kind,
    part: q.part,
    choice: "",
    unchanged: false,
    text: "",
  };
}

export function normalizePresurveyAnswer(raw: unknown): PresurveyAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const questionId = str(o.questionId, 64).trim();
  if (!questionId) return null;
  return {
    questionId,
    question: str(o.question, 500),
    role: str(o.role),
    slot: isSlot(o.slot) ? o.slot : "top",
    kind: isKind(o.kind) ? o.kind : "text",
    part: o.part === 1 ? 1 : o.part === 2 ? 2 : 0,
    choice: str(o.choice, 100),
    unchanged: o.unchanged === true,
    text: str(o.text, ANSWER_MAX),
  };
}

export function emptyPresurveyData(): PresurveyData {
  return {
    heldOn: "",
    scheduleId: "",
    participantIds: [],
    partnerName: "",
    authorName: "",
    answers: [],
    twoParts: false,
    submittedAt: "",
    createdAt: "",
    updatedAt: "",
  };
}

export function normalizePresurveyData(raw: unknown): PresurveyData {
  const base = emptyPresurveyData();
  if (!raw || typeof raw !== "object") return base;
  const g = raw as Record<string, unknown>;
  const createdAt = str(g.createdAt, 64);
  const answers = Array.isArray(g.answers)
    ? g.answers
        .map(normalizePresurveyAnswer)
        .filter((a): a is PresurveyAnswer => a !== null)
    : [];
  return {
    heldOn: /^\d{4}-\d{2}-\d{2}$/.test(str(g.heldOn, 10)) ? str(g.heldOn, 10) : "",
    scheduleId: str(g.scheduleId, 100),
    participantIds: Array.isArray(g.participantIds)
      ? g.participantIds.filter((v): v is string => typeof v === "string" && !!v)
      : [],
    partnerName: str(g.partnerName),
    authorName: str(g.authorName),
    answers,
    // 回答に部が入っていれば2部構成。入っていなければ旧形式（読み替えない・204 §7）
    twoParts: g.twoParts === true || answers.some((a) => a.part !== 0),
    submittedAt: str(g.submittedAt, 64),
    createdAt,
    updatedAt: str(g.updatedAt, 64) || createdAt,
  };
}

/** 旧形式（197の9問）の回答か（表示をそのままにする判定・204 §7） */
export function isLegacyPresurvey(d: PresurveyData): boolean {
  return d.answers.length > 0 && !d.twoParts;
}

/** 回答ID（record_key）: 日付＋ランダム6字。RECORD_KEY_RE に適合 */
export function genPresurveyKey(heldOn: string): string {
  const ymd = (heldOn || "").replaceAll("-", "") || "00000000";
  return `${ymd}-${Math.random().toString(36).slice(2, 6)}`;
}

/** その質問に答えられているか（必須の判定） */
export function isAnswered(q: PresurveyQuestion, a: PresurveyAnswer): boolean {
  switch (q.kind) {
    case "text":
      return !!a.text.trim();
    case "goal_confirm":
      // 「変わりない」だけで答えになる。「変わった」なら中身を書いてもらう
      if (a.unchanged) return true;
      return !!a.choice && (a.choice === q.choices[0] || !!a.text.trim());
    case "carry_over":
      return a.unchanged || !!a.text.trim();
    case "choice_scene":
      // 204 §2の1-2: 選ぶ・書く のどちらも必須
      return !!a.choice && !!a.text.trim();
    case "choice_text":
    case "promise_check":
      // 選択肢を選べば答えたことにする（理由・ひとことは任意＝強制しない）
      return !!a.choice;
    default:
      return !!a.text.trim() || !!a.choice;
  }
}

/** 未回答の必須質問（画面の案内に使う。空なら保存できる） */
export function unansweredRequired(
  questions: PresurveyQuestion[],
  answers: Record<string, PresurveyAnswer>
): PresurveyQuestion[] {
  return visiblePresurveyQuestions(questions).filter((q) => {
    if (!q.required) return false;
    const a = answers[q.id];
    return !a || !isAnswered(q, a);
  });
}

/** 何か書かれているか（空の回答を保存しないため） */
export function hasAnyAnswer(answers: PresurveyAnswer[]): boolean {
  return answers.some((a) => a.text.trim() || a.choice || a.unchanged);
}

/** 1on1画面用: 置き場所ごとに回答をまとめる（197-補 2.） */
export function answersBySlot(
  data: PresurveyData
): Record<PresurveySlot, PresurveyAnswer[]> {
  const out: Record<PresurveySlot, PresurveyAnswer[]> = {
    top: [],
    w: [],
    d: [],
    e: [],
    p: [],
    c: [],
  };
  for (const a of data.answers) {
    if (!a.text.trim() && !a.choice && !a.unchanged) continue;
    out[a.slot].push(a);
  }
  return out;
}

/** 1on1画面で回答の上に出す見出し（置き場所ごと・197-補 2.の役割の名前） */
export const PRESURVEY_SLOT_TITLE: Record<PresurveySlot, string> = {
  top: "📝 事前アンケート",
  w: "📝 事前アンケート｜願望",
  d: "📝 事前アンケート｜行動",
  e: "📝 事前アンケート｜自己評価",
  p: "📝 事前アンケート｜計画",
  c: "📝 事前アンケート｜支援",
};

/** 表示用: 回答の本文（「変わりない」だけのときもそれが分かるように） */
export function answerSummary(a: PresurveyAnswer): string {
  const parts: string[] = [];
  if (a.choice) parts.push(a.choice);
  else if (a.unchanged) parts.push("変わりない");
  const body = a.text.trim();
  if (body) parts.push(body);
  return parts.join("\n");
}

/**
 * 204 §4: 回答を見る人の画面で「前回から変わった項目」に印を付けるための比較。
 * 第1部の回答だけを見る（第2部は毎回新しく書くので比較しない）。
 */
export function changedPart1QuestionIds(
  current: PresurveyData,
  previous: PresurveyData | null
): Set<string> {
  const out = new Set<string>();
  if (!previous) return out;
  const prevById = new Map(previous.answers.map((a) => [a.questionId, a]));
  for (const a of current.answers) {
    if (a.part !== 1) continue;
    const p = prevById.get(a.questionId);
    if (!p) {
      if (answerSummary(a).trim()) out.add(a.questionId);
      continue;
    }
    if (answerSummary(a).trim() !== answerSummary(p).trim()) out.add(a.questionId);
  }
  return out;
}

// 表示用: 実施予定日降順（同日は更新日時降順）
export function sortPresurveys<T extends { data: unknown; updatedAt?: string }>(
  records: T[]
): T[] {
  return records.slice().sort((a, b) => {
    const da = normalizePresurveyData(a.data);
    const db = normalizePresurveyData(b.data);
    return (
      (db.heldOn || "").localeCompare(da.heldOn || "") ||
      (db.updatedAt || "").localeCompare(da.updatedAt || "")
    );
  });
}

// ─── 画面文言 ───

export const PRESURVEY_TITLE = "📝 1on1の事前アンケート";

export const PRESURVEY_LEAD =
  "次の1on1の前に答えておくと、当日の対話がぐっと深まります。回答を読めるのは、院長と、院長が指定した担当の管理者だけです。";

/** 200: 予定が登録されていないとき（回答欄は出さない） */
export const PRESURVEY_NO_SCHEDULE =
  "次回1on1が登録されると、ここに事前アンケートが届きます。";

export const PRESURVEY_EMPTY =
  "まだ回答がありません。次の1on1の前に、答えてみましょう。";

/**
 * 204 §1: 画面上部の案内（1行目）。○月○日は締切の日
 *
 * 206-補 2: 末尾の「評価には使いません。」を外した。
 *   この画面の冒頭には PRESURVEY_INTRO が常時出ており、同じ画面に2回出ていたため
 *   **冒頭の1回にまとめた**。ここは締切を伝える役に絞る。
 */
export function presurveyDeadlineNotice(deadlineLabel: string): string {
  return `1on1の3日前（${deadlineLabel}）までに回答してください。`;
}

/** 204 §1: 第1部の案内 */
export const PRESURVEY_PART1_NOTICE =
  "第1部には前回の答えが入っています。読み返して、変わったところだけ直してください。";

/** 名前を並べる（「あなた・院長・○○さん」） */
function joinViewers(names: string[]): string {
  return ["あなた", "院長", ...names.map((n) => `${n}さん`)].join("・");
}

/** 204 §1: 第1部の目的・目標を見られる人（カルテの担当） */
export function presurveyKarteViewerNotice(karteManagerNames: string[]): string {
  return `第1部の「目的」と「3年後〜1か月後」は、育成カルテの「目標」になります。見られる人：${joinViewers(
    karteManagerNames
  )}（カルテの担当）`;
}

/** 204 §1: それ以外の回答を見られる人（院長が指定した管理者） */
export function presurveyAnswerViewerNotice(designatedNames: string[]): string {
  return `それ以外の回答を見られる人：${joinViewers(designatedNames)}（院長が指定した管理者）`;
}
