// 1on1の事前アンケート（指示書197・197-補）— 質問定義と回答の型・正規化
//
// 【並びの意味（197-補）】
// 選択理論の面談の流れ（願望 → 行動 → 自己評価 → 計画・約束）に沿って質問を並べる。
// 197の初期の質問には「自己評価を促す」問い（他者評価ではなく、本人が理想と現実の差に気づく）が
// 無かったため、197-補で質問7（自己評価）を加え、全体を上の流れに並べ替えた。
//
// 【保存先】
// - 質問の定義 … content_store `one_on_one_presurvey_config`（院長が編集・並べ替え）。
//   読みはログイン済み全員（スタッフが回答するため）・書きは管理者のみ（content-store-policy）。
// - 回答 … private_store `one_on_one_presurvey`（本人＝owner・1on1の相手＝participantIds）。
//   閲覧できるのは本人・選んだ相手・院長だけ（基盤110／112と同じ規則）。
//
// 【原則】
// - 回答は評価に使わない（冒頭に常時表示する PRESURVEY_INTRO）。
// - 質問5の注記は「情報として伝える文」とし、強く迫る言い回しにしない（リードマネジメントの
//   基本原則「強制しない」）。文言は指示書197-補のまま。
// - 回答には**その時点の質問文**を一緒に保存する（院長が後で質問を直しても、過去の回答の
//   見え方が変わらない。152・153と同じ考え方）。

import { getContent, saveContent } from "./content-store";

export const PRESURVEY_CONFIG_KEY = "one_on_one_presurvey_config";

/** 冒頭に常時表示する文（197・文言を変えないこと） */
export const PRESURVEY_INTRO =
  "回答は評価には使いません。あなたの成長を支え、1on1の対話を深めるために使います。";

/** 回答のしかた（自動表示の有無で分かれる） */
export type PresurveyKind =
  /** 自由記述だけ */
  | "text"
  /** 本人の目標を自動表示＋「変わりない／変わった」＋記述 */
  | "goal_confirm"
  /** 前回の自分の回答を表示＋「変わりない」を選べる＋記述 */
  | "carry_over"
  /** 選択肢＋記述（質問5・7） */
  | "choice_text"
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
  { value: "choice_text", label: "選択肢＋記述" },
  { value: "goal_confirm", label: "目標の確認（本人の目標を自動表示）" },
  { value: "carry_over", label: "前回の回答を引き継ぐ" },
  { value: "promise_check", label: "前回の約束の振り返り（約束を自動表示）" },
];

export type PresurveyQuestion = {
  /** 安定id（回答と結びつく。既定の9問は q1〜q9・追加は pq_xxx） */
  id: string;
  /** 質問文 */
  text: string;
  required: boolean;
  kind: PresurveyKind;
  /** 選択肢（choice系のみ） */
  choices: string[];
  /** 選択肢のあとの記述欄のラベル（空なら「ひとこと」扱いにしない＝記述欄を出さない） */
  followUpLabel: string;
  /** 常時表示の注記（質問5の「＊…」） */
  note: string;
  /** 補足表示（質問4の「もし制約がなかったら…」） */
  hint: string;
  /** リードマネジメントでの役割（画面に小さく出す・院長が編集できる） */
  role: string;
  /** 1on1画面での置き場所 */
  slot: PresurveySlot;
  /** 使わない質問は削除せず非表示にする（過去の回答を壊さないため） */
  hidden?: boolean;
};

/**
 * 初期の質問（197-補 1.・差し替え後の9問）。
 * 質問文・選択肢・注記・補足は指示書の表のまま（創作・言い換え禁止）。
 */
export const DEFAULT_PRESURVEY_QUESTIONS: PresurveyQuestion[] = [
  {
    id: "q1",
    text: "今日の1on1でいちばん話したいことは何ですか？",
    required: true,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: "",
    role: "本人の関心から始める（主体性・信頼関係）",
    slot: "top",
  },
  {
    id: "q2",
    text: "前回から今日までで、うまくいったこと・自分を褒めたいことは何ですか？",
    required: false,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: "",
    role: "承認の材料（ポジティブフィードバック・自己有能感）",
    slot: "top",
  },
  {
    id: "q3",
    text: "現在の目標を教えてください。",
    required: true,
    kind: "goal_confirm",
    choices: ["変わりない", "変わった"],
    followUpLabel: "いまの目標（変わった場合は書き換えてください）",
    note: "",
    hint: "",
    role: "願望",
    slot: "w",
  },
  {
    id: "q4",
    text: "キャリアにおいて、3年後どうなっていたいですか？",
    required: true,
    kind: "carry_over",
    choices: ["変わりない"],
    followUpLabel: "3年後のありたい姿",
    note: "",
    hint: "もし制約がなかったら、どんな姿を描きますか？",
    role: "願望（理想の姿を引き出す）",
    slot: "w",
  },
  {
    id: "q5",
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
    role: "願望と環境の確認・期待を情報として伝える",
    slot: "w",
  },
  {
    id: "q6",
    text: "前回の1on1の約束は、どうでしたか？",
    required: true,
    kind: "promise_check",
    choices: ["できた", "一部できた", "まだ"],
    followUpLabel: "ひとこと",
    note: "",
    hint: "",
    role: "行動（事実の確認）",
    slot: "d",
  },
  {
    id: "q7",
    text: "いまの取り組み方は、目標に近づく助けになっていると思いますか？",
    required: true,
    kind: "choice_text",
    choices: ["なっている", "一部なっている", "なっていない"],
    followUpLabel: "その理由",
    note: "",
    hint: "",
    role: "自己評価",
    slot: "e",
  },
  {
    id: "q8",
    text: "次の1on1までに、自分で決めてやってみたいことを1つ挙げるとしたら？",
    required: true,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: "",
    role: "計画・約束（本人が決める）",
    slot: "p",
  },
  {
    id: "q9",
    text: "それを実現するために、院長やチームからどんな支援があると助かりますか？",
    required: false,
    kind: "text",
    choices: [],
    followUpLabel: "",
    note: "",
    hint: "",
    role: "支援（身に付けたい習慣「支援する」・185の機会・支援）",
    slot: "c",
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

/** 追加する質問のid（既定の q1〜q9 と衝突しない接頭辞） */
export function genPresurveyQuestionId(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `pq_${rnd}`;
}

/** 保存データを検証（1件も残らなければ既定の9問に倒す＝設定未保存・壊れたJSONでも画面が成立する） */
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
      const kind = isKind(o.kind) ? o.kind : "text";
      const choices = Array.isArray(o.choices)
        ? o.choices
            .map((c) => str(c, 100).trim())
            .filter((c) => !!c)
            .slice(0, CHOICES_MAX)
        : [];
      out.push({
        id,
        text,
        required: o.required === true,
        kind,
        choices,
        followUpLabel: str(o.followUpLabel).trim(),
        note: str(o.note, 500).trim(),
        hint: str(o.hint, 500).trim(),
        role: str(o.role).trim(),
        slot: isSlot(o.slot) ? o.slot : "top",
        hidden: o.hidden === true ? true : undefined,
      });
    }
  }
  return out.length > 0
    ? out
    : DEFAULT_PRESURVEY_QUESTIONS.map((q) => ({ ...q, choices: [...q.choices] }));
}

/** 質問定義を読む（content_store → 無ければ既定の9問） */
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

// ─── 回答 ───

export type PresurveyAnswer = {
  questionId: string;
  /** 回答した時点の質問文（後から質問を直しても過去の回答の見え方を変えないため） */
  question: string;
  /** 回答した時点の役割・置き場所・形式 */
  role: string;
  slot: PresurveySlot;
  kind: PresurveyKind;
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
  /** 1on1の相手（担当者）の userId。これで相手も読める（基盤の participantIds） */
  participantIds: string[];
  partnerName: string;
  /** 回答者の表示名（回答時点を保存） */
  authorName: string;
  answers: PresurveyAnswer[];
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
  return {
    heldOn: /^\d{4}-\d{2}-\d{2}$/.test(str(g.heldOn, 10)) ? str(g.heldOn, 10) : "",
    scheduleId: str(g.scheduleId, 100),
    participantIds: Array.isArray(g.participantIds)
      ? g.participantIds.filter((v): v is string => typeof v === "string" && !!v)
      : [],
    partnerName: str(g.partnerName),
    authorName: str(g.authorName),
    answers: Array.isArray(g.answers)
      ? g.answers
          .map(normalizePresurveyAnswer)
          .filter((a): a is PresurveyAnswer => a !== null)
      : [],
    submittedAt: str(g.submittedAt, 64),
    createdAt,
    updatedAt: str(g.updatedAt, 64) || createdAt,
  };
}

/** 回答ID（record_key）: 日付＋ランダム6字。RECORD_KEY_RE に適合 */
export function genPresurveyKey(heldOn: string): string {
  const ymd = (heldOn || "").replaceAll("-", "") || "00000000";
  return `${ymd}-${Math.random().toString(36).slice(2, 8)}`;
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
  "次の1on1の前に答えておくと、当日の対話がぐっと深まります。回答を読めるのは、院長と、院長が指定したその1on1の担当者だけです。";

/** 200: 予定が登録されていないとき（回答欄は出さない） */
export const PRESURVEY_NO_SCHEDULE =
  "次回1on1が登録されると、ここに事前アンケートが届きます。";

export const PRESURVEY_EMPTY =
  "まだ回答がありません。次の1on1の前に、答えてみましょう。";

