// 不適性検査スカウターの結果（指示書188）— 純粋部（サーバー・画面・テストで共用）
//
// 184の3-4（AIは検査結果を要約・解釈・転記しない）は、188で院長の明示指示により変更された:
//   ・転記      … 報告書の**記載どおり**（解釈を加えない・推測で埋めない）。院長が確認・修正してから保存
//   ・ポイント整理 … 「関わり方を考えるための参考メモ」。3区分だけ・各ポイントに根拠。
//                   6 ネガティブ傾向・9 虚偽回答の傾向、健康の推測、断定語、処遇の助言、他者比較は
//                   **システムプロンプトと受け取り後のサーバー処理の両方**で除外する
// 閲覧は院長のみ（183の委任対象外）。検索・絞り込みには使わない。評価・候補の検討に使わない。

import { ymd } from "./hiring-docs";

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : typeof v === "number" ? String(v) : "";
}

// ─── 転記する区分と尺度（報告書の項目どおり）───

export const SCOUTER_SECTIONS = [
  { key: "personality", label: "1 性格の傾向", scales: ["活動性", "社交性", "慎重性", "新奇性", "固執性", "主体性", "決断性"] },
  { key: "motivation", label: "2 意欲の傾向", scales: ["向上欲求", "挑戦欲求", "自律欲求", "探求欲求", "啓発欲求", "承認欲求", "エネルギー"] },
  { key: "thinking", label: "3 思考力の傾向", scales: ["直観力", "論理力", "実行力", "共感力"] },
  { key: "stress", label: "4 ストレス耐性", scales: ["精神的耐性", "身体的耐性"] },
  { key: "values", label: "5 価値観の傾向", scales: ["公益志向", "成長志向", "金銭志向", "享楽志向", "安定志向"] },
] as const;
export type ScouterSectionKey = (typeof SCOUTER_SECTIONS)[number]["key"];

export const SCOUTER_SCORE_MAX = 20;
export const SCOUTER_COMMENT_MAX = 4000;
export const SCOUTER_POINT_MAX = 300;
export const SCOUTER_POINTS_PER_GROUP = 5;

/** 常時表示する注記（188 2-4） */
export const SCOUTER_NOTE = "検査を受けた時点の傾向です。人の可能性や評価を決めるものではありません。関わり方を考える参考として使います。";

export type NamedScore = { name: string; score: string };

export type ScouterPointItem = { text: string; evidence: string };
export type ScouterPoints = {
  generatedAt: string;
  model: string;
  /** 強みと活かし方 */
  strengths: ScouterPointItem[];
  /** 関わり方のヒント（支援の工夫） */
  hints: ScouterPointItem[];
  /** 1on1で本人と確かめたい問い */
  questions: ScouterPointItem[];
  /** 院長が文章を修正した日時（空＝AIのまま） */
  editedAt: string;
};

export type ScouterResult = {
  id: string;
  userId: string;
  /** 元の資料（採用資料 doc の id）。「原本を開く」に使う */
  docId: string;
  testDate: string;
  testName: string;
  /** 1〜5 の区分 → 尺度名 → 得点（報告書の表記のまま。読み取れなければ空） */
  sections: Record<ScouterSectionKey, Record<string, string>>;
  /** 6 ネガティブ傾向（転記のみ。ポイント整理には使わない） */
  negative: NamedScore[];
  /** 7 職務適性 */
  jobFit: NamedScore[];
  /** 8 戦闘力 */
  power: string;
  /** 9 虚偽回答の傾向（転記のみ。ポイント整理には使わない） */
  honesty: { score: string; comment: string };
  /** 「人物像および人材活用に関するコメント」（原文のまま） */
  comment: string;
  points: ScouterPoints | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

/** 転記の提案（AIの応答を整えたもの。保存前） */
export type ScouterTranscript = Omit<ScouterResult, "id" | "userId" | "docId" | "points" | "createdAt" | "updatedAt" | "updatedBy">;

function namedScores(v: unknown, max: number): NamedScore[] {
  if (!Array.isArray(v)) return [];
  const out: NamedScore[] = [];
  for (const it of v.slice(0, max)) {
    const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
    const name = text(o.name, 40).trim();
    if (!name) continue;
    out.push({ name, score: text(o.score, SCOUTER_SCORE_MAX).trim() });
  }
  return out;
}

export function emptyTranscript(): ScouterTranscript {
  const sections = Object.fromEntries(SCOUTER_SECTIONS.map((s) => [s.key, Object.fromEntries(s.scales.map((n) => [n, ""]))])) as ScouterResult["sections"];
  return { testDate: "", testName: "", sections, negative: [], jobFit: [], power: "", honesty: { score: "", comment: "" }, comment: "" };
}

/**
 * AIの応答（または画面の入力）を転記の形に整える＝ホワイトリスト。
 * 尺度は報告書の項目どおりの固定名だけ通す。受検者の氏名・ID・住所など、型に無いものはここで落ちる。
 */
export function normalizeScouterTranscript(raw: unknown): ScouterTranscript {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = emptyTranscript();
  out.testDate = ymd(g.testDate);
  out.testName = text(g.testName, 60).trim();
  const secs = (g.sections && typeof g.sections === "object" ? g.sections : {}) as Record<string, unknown>;
  for (const s of SCOUTER_SECTIONS) {
    const src = (secs[s.key] && typeof secs[s.key] === "object" ? secs[s.key] : {}) as Record<string, unknown>;
    for (const n of s.scales) out.sections[s.key][n] = text(src[n], SCOUTER_SCORE_MAX).trim();
  }
  out.negative = namedScores(g.negative, 12);
  out.jobFit = namedScores(g.jobFit, 20);
  out.power = text(g.power, SCOUTER_SCORE_MAX).trim();
  const h = (g.honesty && typeof g.honesty === "object" ? g.honesty : {}) as Record<string, unknown>;
  out.honesty = { score: text(h.score, SCOUTER_SCORE_MAX).trim(), comment: text(h.comment, 1000).trim() };
  out.comment = text(g.comment, SCOUTER_COMMENT_MAX).trim();
  return out;
}

export function transcriptHasContent(t: ScouterTranscript): boolean {
  return (
    !!t.testDate ||
    !!t.testName ||
    SCOUTER_SECTIONS.some((s) => s.scales.some((n) => t.sections[s.key][n])) ||
    t.negative.length > 0 ||
    t.jobFit.length > 0 ||
    !!t.power ||
    !!t.honesty.score ||
    !!t.comment
  );
}

export function normalizeScouterResult(id: string, raw: unknown): ScouterResult | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const userId = text(g.userId, 100).trim();
  if (!userId) return null;
  const t = normalizeScouterTranscript(raw);
  return {
    id,
    userId,
    docId: text(g.docId, 100).trim(),
    ...t,
    points: normalizeScouterPoints(g.points),
    createdAt: text(g.createdAt, 40),
    updatedAt: text(g.updatedAt, 40),
    updatedBy: text(g.updatedBy, 200),
  };
}

// ─── ポイント整理（188 2）：3区分・根拠付き・除外の徹底 ───

/**
 * 書かないこと（2-3）。ポイントの本文・根拠のどちらかに含まれていたら**その項目ごと落とす**。
 * （サーバー処理側の歯止め。システムプロンプトでも禁じる）
 */
export const SCOUTER_POINTS_FORBIDDEN: readonly string[] = [
  // 6 ネガティブ傾向・9 虚偽回答の傾向
  "ネガティブ",
  "虚偽",
  // 心身の健康状態・病気・障害の推測
  "健康",
  "病",
  "障害",
  "障がい",
  "うつ",
  "メンタル不調",
  "精神疾患",
  "体調不良",
  // 人物を断定・ラベル付けする言葉
  "向いていない",
  "向かない",
  "不適性",
  "不適格",
  "問題がある",
  "問題児",
  "危険",
  "要注意",
  // 採否・評価ランク・等級・給与・配置の判断や助言
  "採用",
  "採否",
  "不採用",
  "合格",
  "不合格",
  "ランク",
  "等級",
  "評価",
  "給与",
  "昇給",
  "賞与",
  "配置",
  "異動",
  "配属",
  // 他のスタッフとの比較
  "他のスタッフ",
  "他の職員",
  "他のメンバー",
  "と比べ",
  "と比較",
  "より優れ",
  "より劣",
  "劣って",
  "平均より",
];

export function containsScouterForbidden(s: string): boolean {
  return SCOUTER_POINTS_FORBIDDEN.some((t) => s.includes(t));
}

function pointItems(v: unknown, opts: { question?: boolean }): ScouterPointItem[] {
  if (!Array.isArray(v)) return [];
  const out: ScouterPointItem[] = [];
  for (const it of v) {
    const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
    const body = text(o.text, SCOUTER_POINT_MAX).trim();
    const evidence = text(o.evidence, 200).trim();
    if (!body) continue;
    if (containsScouterForbidden(body) || containsScouterForbidden(evidence)) continue; // 2-3 の除外
    if (opts.question && !/[?？]\s*$/.test(body)) continue; // 問いの形だけ
    out.push({ text: body, evidence });
    if (out.length >= SCOUTER_POINTS_PER_GROUP) break;
  }
  return out;
}

export function normalizeScouterPoints(raw: unknown): ScouterPoints | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  return {
    generatedAt: text(g.generatedAt, 40),
    model: text(g.model, 80),
    strengths: pointItems(g.strengths, {}),
    hints: pointItems(g.hints, {}),
    questions: pointItems(g.questions, { question: true }),
    editedAt: text(g.editedAt, 40),
  };
}

export function pointsHasContent(p: ScouterPoints | null): boolean {
  return !!p && (p.strengths.length > 0 || p.hints.length > 0 || p.questions.length > 0);
}

/** ポイント整理の入力に渡す転記内容＝**1〜5・7・8 だけ**（6 ネガティブ・9 虚偽・コメントは渡さない） */
export function pointsInputOf(r: ScouterTranscript): string {
  const lines: string[] = [];
  if (r.testName) lines.push(`検査名: ${r.testName}`);
  if (r.testDate) lines.push(`受検日: ${r.testDate}`);
  for (const s of SCOUTER_SECTIONS) {
    const vals = s.scales.map((n) => (r.sections[s.key][n] ? `${n} ${r.sections[s.key][n]}` : "")).filter(Boolean);
    if (vals.length) lines.push(`${s.label}: ${vals.join("、")}`);
  }
  if (r.jobFit.length) lines.push(`7 職務適性: ${r.jobFit.map((j) => `${j.name} ${j.score}`).join("、")}`);
  if (r.power) lines.push(`8 戦闘力: ${r.power}`);
  return lines.join("\n");
}

// ─── プロンプト ───

export const SCOUTER_TRANSCRIBE_SYSTEM = `あなたはクリニックの院長を補助し、不適性検査スカウターの結果報告書（PDF・画像）を**記載どおりに転記**してJSONで返します。

【絶対に守ること】
- 報告書に書かれている値だけを、書かれている表記のまま写す。解釈・要約・言い換え・推測をしない。
- 読み取れない値は空文字 "" にする。推測で埋めない。
- **受検者の氏名・ID・住所・生年月日・所属など、検査結果以外の個人情報は一切出力しない**（キー自体を作らない）。
- 尺度名は報告書の表記をそのまま使う。下のキーの尺度名と報告書の表記が同じものだけ入れる。
- コメント（「人物像および人材活用に関するコメント」）は**原文のまま**。要約しない。

【出力形式】次のJSONだけを返す（前後に説明文を付けない）
{
  "testDate": "YYYY-MM-DD（受検日。無ければ \\"\\"）",
  "testName": "検査名（例: 検査SS。無ければ \\"\\"）",
  "sections": {
    "personality": {"活動性": "", "社交性": "", "慎重性": "", "新奇性": "", "固執性": "", "主体性": "", "決断性": ""},
    "motivation": {"向上欲求": "", "挑戦欲求": "", "自律欲求": "", "探求欲求": "", "啓発欲求": "", "承認欲求": "", "エネルギー": ""},
    "thinking": {"直観力": "", "論理力": "", "実行力": "", "共感力": ""},
    "stress": {"精神的耐性": "", "身体的耐性": ""},
    "values": {"公益志向": "", "成長志向": "", "金銭志向": "", "享楽志向": "", "安定志向": ""}
  },
  "negative": [{"name": "尺度名（報告書の表記）", "score": "得点"}],
  "jobFit": [{"name": "職務名（報告書の表記）", "score": "得点"}],
  "power": "戦闘力の得点",
  "honesty": {"score": "虚偽回答の傾向の得点", "comment": "その欄のコメント（原文）"},
  "comment": "人物像および人材活用に関するコメントの本文（原文のまま）"
}
得点は報告書の表記のまま（数字なら数字、段階表記ならその語）。`;

export const SCOUTER_POINTS_SYSTEM = `あなたはクリニックの院長が、スタッフとの**関わり方を考えるための参考メモ**を作るのを手伝います。入力は不適性検査の転記結果（1 性格・2 意欲・3 思考力・4 ストレス耐性・5 価値観・7 職務適性・8 戦闘力）です。

【目的】人を評価・判定するためではありません。院長がその人の強みを活かし、支援や声かけを工夫するためのメモです。

【構成】次の3つだけをJSONで返す（各3〜5件）
{
  "strengths": [{"text": "強みと、日々の仕事でどう活かせそうか", "evidence": "根拠（区分・尺度・得点）例: 1 性格の傾向・社交性 8"}],
  "hints": [{"text": "支援や声かけを工夫するとよさそうな点（「支援の工夫」の言葉で書く）", "evidence": "根拠（区分・尺度・得点）"}],
  "questions": [{"text": "1on1で本人と確かめたい問い（断定せず、必ず問いの形で「？」で終える）", "evidence": "根拠（区分・尺度・得点）"}]
}

【書かないこと（厳守）】
- 6 ネガティブ傾向・9 虚偽回答の傾向の内容（入力にも含めていません。言及しない）
- 心身の健康状態・病気・障害の推測（ストレス耐性の得点から健康状態を推し量らない）
- 「向いていない」「不適性」「問題がある」など、人物を断定・ラベル付けする言葉
- 採否・評価ランク・等級・給与・配置の判断や助言
- 他のスタッフとの比較
- 報告書に書かれていない事実
文体は丁寧で前向きに。各項目に必ず根拠を付ける。JSON以外を出力しない。`;
