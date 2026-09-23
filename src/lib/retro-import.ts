// 文章・エピソード・インタビューから振り返り記録への取り込み（指示書177）
// 型・正規化・プロンプト・根拠の照合・保存計画（純関数）とクライアント呼び出し。
//
// 【流れ】貼り付け（またはファイルから読み込んだ文章）→ サーバーで匿名化 → 区切ってAIが仕分け
//   → 根拠の照合・四象限の破棄・事実性の点検（ここ）→ 画面で院長が確認・編集・採否
//   → 採用分だけを既存の保存API（/api/director-retrospective）で保存（150と同じ「提案→承認→保存」）。
//   解析APIはデータベースに記録を書かない（操作ログの件数だけ）。原文も保存しない。
//
// 【四象限（177-2-1・最重要）】
//   AIの出力形式に配分・分類の欄を持たせない。応答に含まれていても normalize で捨てる（数を数えて報告）。
//   保存計画は shares / quadrant を一切送らない＝既存の配分・分類は変わらない。
//
// 【事実性（177-2-2）】
//   - 根拠（原文の抜粋）が原文に見つからない提案は出さない
//   - インタビューの質問者の発言だけを根拠にした提案は出さない（177-2-3）
//   - 年月は原文から確認できるときだけ残す（推測で埋めない）
//   - 原文に無い数字を含む提案には注意を付ける
//
// このファイルは "@/..." を import しない（テストで直接実行するため）。

import {
  DELEGATION_STATUSES,
  EVENT_KINDS,
  INITIATIVE_STATUSES,
  LONG_MAX,
  NAME_MAX,
  ROLE_MAX,
  SUMMARY_MAX,
  periodRangeLabel,
  sortPeriods,
  ym as normalizeYm,
  type DelegationStatus,
  type EventKind,
  type InitiativeStatus,
  type Period,
  type RecordKind,
  type RetrospectiveData,
} from "./director-retrospective";

// ─── 上限 ───

/** 1回に取り込める文字数（画面に表示する） */
export const IMPORT_MAX = 40000;
/** AIに1回で渡す長さ。長い入力はここで区切って解析し、結果を統合する */
export const CHUNK_MAX = 6000;
/** 読み込めるファイルの大きさ */
export const IMPORT_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const IMPORT_FILE_ACCEPT = ".txt,.md,.markdown,.docx,.pptx";

// ─── 行き先 ───

export const SNAPSHOT_TEXT_FIELDS = [
  { key: "method", label: "当時の方法" },
  { key: "reality", label: "当時の実情" },
  { key: "timeThief", label: "最も時間を奪われていたこと" },
  { key: "focus", label: "注力していたこと" },
  { key: "wentWrong", label: "うまくいかなかったこと" },
  { key: "wentWell", label: "うまくいったこと" },
  { key: "feeling", label: "当時の気持ち" },
] as const;

export type SnapshotTextField = (typeof SNAPSHOT_TEXT_FIELDS)[number]["key"];

export function snapshotFieldLabel(k: SnapshotTextField): string {
  return SNAPSHOT_TEXT_FIELDS.find((f) => f.key === k)?.label ?? k;
}

function isSnapshotField(v: unknown): v is SnapshotTextField {
  return typeof v === "string" && SNAPSHOT_TEXT_FIELDS.some((f) => f.key === v);
}

export type ImportDest =
  | "period_summary"
  | "event"
  | "snapshot"
  | "initiative"
  | "delegation"
  | "unclassified";

export const IMPORT_DESTS: { value: ImportDest; label: string }[] = [
  { value: "event", label: "出来事" },
  { value: "snapshot", label: "時間管理スナップショット" },
  { value: "initiative", label: "施策" },
  { value: "delegation", label: "権限委譲" },
  { value: "period_summary", label: "期の一言要約" },
  { value: "unclassified", label: "未分類" },
];

export function importDestLabel(d: ImportDest): string {
  return IMPORT_DESTS.find((x) => x.value === d)?.label ?? d;
}

/** 新しい期の候補の参照（既存の期の id と区別する） */
export const CANDIDATE_PREFIX = "cand:";

export function isCandidateRef(ref: string): boolean {
  return ref.startsWith(CANDIDATE_PREFIX);
}

export type ImportProposal = {
  id: string;
  dest: ImportDest;
  /** 行き先の期: 既存の期の id ／ 新しい期の候補 "cand:N" ／ ""（未定＝院長が選ぶ） */
  periodRef: string;
  /** dest=snapshot のときの欄 */
  snapshotField: SnapshotTextField;
  /** 期の一言要約・スナップショットの欄・出来事の内容・未分類の本文 */
  text: string;
  /** 出来事 */
  ym: string;
  eventKind: EventKind;
  /** 施策 */
  name: string;
  status: InitiativeStatus;
  plannedYm: string;
  doneYm: string;
  aim: string;
  result: string;
  learning: string;
  /** 権限委譲（委譲先は役割で。氏名は提案しない） */
  task: string;
  delegationStatus: DelegationStatus;
  toRole: string;
  /** 根拠（原文の抜粋・匿名化後の文面） */
  evidence: string;
  /** 事実性の点検で見つかった注意（原文に無い数字・年月を空にした等） */
  warnings: string[];
};

export type PeriodCandidate = {
  ref: string;
  name: string;
  startYm: string;
  endYm: string;
  evidence: string;
  warnings: string[];
};

export type ImportStats = {
  /** 区切って解析した数 */
  chunks: number;
  /** 解析できなかった区切り（1始まりの番号） */
  failedChunks: number[];
  /** AIが返した提案の数 */
  received: number;
  /** 根拠が原文に見つからず出さなかった数 */
  droppedNoEvidence: number;
  /** 質問者の発言だけが根拠だったため出さなかった数 */
  droppedQuestioner: number;
  /** 四象限の配分・分類として破棄した値の数（キー・数値） */
  quadrantDiscarded: number;
};

export type ImportResult = {
  proposals: ImportProposal[];
  candidates: PeriodCandidate[];
  stats: ImportStats;
  provider: string;
  model: string;
};

// ─── 区切り ───

/** 段落（空行）→行→文字数 の順で区切る。どの区切りも max を超えない */
export function splitIntoChunks(text: string, max = CHUNK_MAX): string[] {
  const src = text.replace(/\r\n?/g, "\n").trim();
  if (!src) return [];
  if (src.length <= max) return [src];
  const pieces: string[] = [];
  for (const para of src.split(/\n{2,}/)) {
    if (para.length <= max) {
      pieces.push(para);
      continue;
    }
    for (const line of para.split("\n")) {
      if (line.length <= max) pieces.push(line);
      else for (let i = 0; i < line.length; i += max) pieces.push(line.slice(i, i + max));
    }
  }
  const chunks: string[] = [];
  let cur = "";
  for (const p of pieces) {
    if (!cur) cur = p;
    else if (cur.length + 2 + p.length <= max) cur = `${cur}\n\n${p}`;
    else {
      chunks.push(cur);
      cur = p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ─── 根拠の照合 ───

/** 照合用の正規化: 全角半角をそろえ、空白・句読点・括弧・記号を落とす（両側に同じ処理をする） */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s　]/g, "")
    .replace(/[、。，．,.・…‥「」『』（）()［］\[\]【】〈〉《》!！?？:：;；"'“”‘’`〜~\-‐―─ー]/g, "");
}

/** 省略記号・スラッシュで区切られた抜粋は、それぞれの断片が原文にあること */
function evidenceFragments(evidence: string): string[] {
  return evidence
    .split(/…|\.{3}|‥|／|\s\/\s|\n/)
    .map((s) => normalizeForMatch(s))
    .filter((s) => s.length > 0);
}

const MIN_EVIDENCE_CHARS = 4;

export function evidenceFoundIn(evidence: string, source: string): boolean {
  const frags = evidenceFragments(evidence);
  if (frags.length === 0) return false;
  if (frags.reduce((n, f) => n + f.length, 0) < MIN_EVIDENCE_CHARS) return false;
  const src = normalizeForMatch(source);
  return frags.every((f) => src.includes(f));
}

/** インタビューの質問者の行（「Q:」「質問：」「聞き手：」「インタビュアー：」など） */
const QUESTIONER_LINE_RE =
  /^\s*(?:Q\d*|Ｑ\d*|質問者?|聞き手|インタビュアー|司会|記者|ライター)\s*[:：.．)）]/i;

export function isQuestionerLine(line: string): boolean {
  return QUESTIONER_LINE_RE.test(line.normalize("NFKC"));
}

/** 質問者の行を除いた原文（院長の回答・地の文だけ） */
export function withoutQuestionerLines(source: string): string {
  return source
    .split("\n")
    .filter((l) => !isQuestionerLine(l))
    .join("\n");
}

// ─── 事実性の点検 ───

function nfkc(s: string): string {
  return s.normalize("NFKC");
}

/** 年月が原文から確認できるか（年と月の両方）。確認できなければ空にする */
export function ymSupportedBySource(value: string, source: string): boolean {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const src = nfkc(source);
  const reiwa = y - 2018;
  const heisei = y - 1988;
  const yearForms = [
    String(y),
    `${String(y % 100).padStart(2, "0")}年`,
    reiwa >= 1 ? (reiwa === 1 ? "令和元年" : `令和${reiwa}年`) : "",
    reiwa >= 1 ? `R${reiwa}` : "",
    heisei >= 1 && heisei <= 31 ? (heisei === 1 ? "平成元年" : `平成${heisei}年`) : "",
  ].filter(Boolean);
  if (!yearForms.some((f) => src.includes(f))) return false;
  // 月は前後が数字でないこと（「12月」を「2月」と読まない）
  const monthRes = [
    new RegExp(`(?<!\\d)0?${mo}月`),
    new RegExp(`${y}\\s*[-/.]\\s*0?${mo}(?!\\d)`),
  ];
  return monthRes.some((re) => re.test(src));
}

/** 提案の文章に含まれる数字のうち、原文に無いもの */
export function numbersNotInSource(texts: string[], source: string): string[] {
  const src = nfkc(source);
  const out = new Set<string>();
  for (const t of texts) {
    for (const n of nfkc(t).match(/\d+(?:\.\d+)?/g) ?? []) {
      if (!src.includes(n)) out.add(n);
    }
  }
  return Array.from(out);
}

/** 四象限の配分・分類に当たるキー（AIの応答に含まれていたら捨てる） */
const QUADRANT_KEY_RE = /quadrant|shares?$|^q[1-4]$|象限|配分/i;

/** 四象限の配分（◯象限 ◯% など）を述べた文章 */
const QUADRANT_SHARE_TEXT_RE =
  /(第?\s*[1-4１-４一二三四]\s*象限|緊急[^。\n]{0,12}重要)[^。\n]{0,24}\d+\s*[%％]|\d+\s*[%％][^。\n]{0,24}(第?\s*[1-4１-４一二三四]\s*象限)/;

function countQuadrantKeys(obj: Record<string, unknown>): number {
  let n = 0;
  for (const k of Object.keys(obj)) if (QUADRANT_KEY_RE.test(k)) n += 1;
  return n;
}

// ─── AIの応答の正規化（区切り1つ分）───

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function pickValue<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function emptyProposal(id: string): ImportProposal {
  return {
    id,
    dest: "unclassified",
    periodRef: "",
    snapshotField: "reality",
    text: "",
    ym: "",
    eventKind: "other",
    name: "",
    status: "planned",
    plannedYm: "",
    doneYm: "",
    aim: "",
    result: "",
    learning: "",
    task: "",
    delegationStatus: "held",
    toRole: "",
    evidence: "",
    warnings: [],
  };
}

const DESTS = IMPORT_DESTS.map((d) => d.value);

/** 提案の本文（数字の点検・空判定に使う） */
export function proposalTexts(p: ImportProposal): string[] {
  switch (p.dest) {
    case "initiative":
      return [p.name, p.aim, p.result, p.learning];
    case "delegation":
      return [p.task, p.toRole];
    default:
      return [p.text];
  }
}

export type ChunkContext = {
  /** 匿名化済みの区切り本文（根拠の照合に使う） */
  source: string;
  /** 区切りの番号（0始まり・id に使う） */
  index: number;
  /** 既存の期の id */
  periodIds: Set<string>;
  /** 期を指定して取り込むとき、その期の id（すべてこの期に入れる・新しい期の候補は出さない） */
  forcedPeriodId: string | null;
};

export type ChunkOutcome = {
  proposals: ImportProposal[];
  /** この区切りでの新しい期の候補（ref はまだ区切り内のキー "N1" など） */
  candidates: (PeriodCandidate & { key: string })[];
  received: number;
  droppedNoEvidence: number;
  droppedQuestioner: number;
  quadrantDiscarded: number;
};

/** 根拠の照合（原文にあるか・質問者の発言だけではないか） */
function checkEvidence(
  evidence: string,
  source: string,
  answerOnly: string
): "ok" | "missing" | "questioner" {
  if (!evidenceFoundIn(evidence, source)) return "missing";
  if (!evidenceFoundIn(evidence, answerOnly)) return "questioner";
  return "ok";
}

export function normalizeChunkResult(raw: unknown, ctx: ChunkContext): ChunkOutcome {
  const out: ChunkOutcome = {
    proposals: [],
    candidates: [],
    received: 0,
    droppedNoEvidence: 0,
    droppedQuestioner: 0,
    quadrantDiscarded: 0,
  };
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  out.quadrantDiscarded += countQuadrantKeys(g);
  const answerOnly = withoutQuestionerLines(ctx.source);

  // 新しい期の候補（期を指定した取り込みでは出さない）
  const candKeys = new Set<string>();
  if (!ctx.forcedPeriodId && Array.isArray(g.newPeriods)) {
    for (const c of g.newPeriods.slice(0, 10)) {
      const o = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      out.quadrantDiscarded += countQuadrantKeys(o);
      const key = str(o.key, 20);
      const name = str(o.name, NAME_MAX);
      const evidence = str(o.evidence, 1000);
      if (!key || !name) continue;
      const ev = checkEvidence(evidence, ctx.source, answerOnly);
      if (ev !== "ok") continue; // 根拠の無い期は作らせない（その期を指す提案は「期は未定」になる）
      const warnings: string[] = [];
      let startYm = normalizeYm(o.startYm);
      let endYm = normalizeYm(o.endYm);
      if (startYm && !ymSupportedBySource(startYm, answerOnly)) {
        startYm = "";
        warnings.push("開始年月を元の文章から確認できないため空欄にしました");
      }
      if (endYm && !ymSupportedBySource(endYm, answerOnly)) {
        endYm = "";
        warnings.push("終了年月を元の文章から確認できないため空欄にしました");
      }
      candKeys.add(key);
      out.candidates.push({ key, ref: key, name, startYm, endYm, evidence, warnings });
    }
  }

  const items = Array.isArray(g.items) ? g.items.slice(0, 200) : [];
  items.forEach((it, i) => {
    const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
    out.received += 1;
    out.quadrantDiscarded += countQuadrantKeys(o);

    const p = emptyProposal(`p${ctx.index + 1}-${i + 1}`);
    p.dest = pickValue(o.dest, DESTS, "unclassified");
    if (p.dest === "snapshot") {
      if (isSnapshotField(o.field)) p.snapshotField = o.field;
      else p.dest = "unclassified"; // 欄の分からないスナップショットは未分類へ（捨てない）
    }
    p.text = str(o.content, LONG_MAX);
    p.evidence = str(o.evidence, 1500);
    p.ym = normalizeYm(o.ym);
    p.eventKind = pickValue(
      o.eventKind,
      EVENT_KINDS.map((k) => k.value),
      "other"
    );
    p.name = str(o.name, NAME_MAX);
    p.status = pickValue(
      o.status,
      INITIATIVE_STATUSES.map((s) => s.value),
      "planned"
    );
    p.plannedYm = normalizeYm(o.plannedYm);
    p.doneYm = normalizeYm(o.doneYm);
    p.aim = str(o.aim, LONG_MAX);
    p.result = str(o.result, LONG_MAX);
    p.learning = str(o.learning, LONG_MAX);
    p.task = str(o.task, NAME_MAX);
    p.delegationStatus = pickValue(
      o.status,
      DELEGATION_STATUSES.map((s) => s.value),
      "held"
    );
    p.toRole = str(o.toRole, ROLE_MAX);

    // 行き先の期（実在する期／この区切りの候補だけ。それ以外は未定＝院長が選ぶ）
    const period = str(o.period, 100);
    if (ctx.forcedPeriodId) p.periodRef = ctx.forcedPeriodId;
    else if (ctx.periodIds.has(period)) p.periodRef = period;
    else if (candKeys.has(period)) p.periodRef = period;
    else p.periodRef = "";

    // 本文が空の提案は出さない（施策は名前、権限委譲は業務が必要）
    if (p.dest === "initiative" && !p.name) {
      if (p.text) p.dest = "unclassified";
      else return;
    }
    if (p.dest === "delegation" && !p.task) {
      if (p.text) p.dest = "unclassified";
      else return;
    }
    if (proposalTexts(p).every((t) => !t.trim())) return;

    // 根拠（177-2-2）: 原文に無い → 出さない／質問者の発言だけ → 出さない（177-2-3）
    const ev = checkEvidence(p.evidence, ctx.source, answerOnly);
    if (ev === "missing") {
      out.droppedNoEvidence += 1;
      return;
    }
    if (ev === "questioner") {
      out.droppedQuestioner += 1;
      return;
    }

    // 四象限の配分を述べた文章は、スナップショット・施策に入れず未分類へ（配分は院長が自分で入れる）
    if (
      (p.dest === "snapshot" || p.dest === "initiative") &&
      proposalTexts(p).some((t) => QUADRANT_SHARE_TEXT_RE.test(nfkc(t)))
    ) {
      p.dest = "unclassified";
      p.text = p.text || [p.name, p.aim, p.result, p.learning].filter(Boolean).join("\n");
      p.warnings.push("四象限の配分に触れた記述のため、配分欄には入れず未分類にしました（配分は院長が入力します）");
      out.quadrantDiscarded += 1;
    }

    // 年月・数字は原文（質問者の発言を除いた部分）から確認できるときだけ（177-2-2・2-3）
    for (const k of ["ym", "plannedYm", "doneYm"] as const) {
      if (p[k] && !ymSupportedBySource(p[k], answerOnly)) {
        p[k] = "";
        p.warnings.push("年月を元の文章から確認できないため空欄にしました");
      }
    }
    const extra = numbersNotInSource(proposalTexts(p), answerOnly);
    if (extra.length > 0) {
      p.warnings.push(`元の文章に無い数字があります（${extra.join("・")}）。確認してください`);
    }
    p.warnings = Array.from(new Set(p.warnings));
    out.proposals.push(p);
  });
  return out;
}

/** 区切りごとの結果を1つにまとめる（新しい期の候補は名前で束ね、ref を "cand:N" に振り直す） */
export function mergeChunkOutcomes(
  outcomes: { index: number; outcome: ChunkOutcome }[],
  chunks: number,
  failedChunks: number[]
): Omit<ImportResult, "provider" | "model"> {
  const candidates: PeriodCandidate[] = [];
  const byName = new Map<string, string>();
  const proposals: ImportProposal[] = [];
  const stats: ImportStats = {
    chunks,
    failedChunks,
    received: 0,
    droppedNoEvidence: 0,
    droppedQuestioner: 0,
    quadrantDiscarded: 0,
  };
  const seen = new Set<string>();
  for (const { outcome } of [...outcomes].sort((a, b) => a.index - b.index)) {
    stats.received += outcome.received;
    stats.droppedNoEvidence += outcome.droppedNoEvidence;
    stats.droppedQuestioner += outcome.droppedQuestioner;
    stats.quadrantDiscarded += outcome.quadrantDiscarded;
    const localToGlobal = new Map<string, string>();
    for (const c of outcome.candidates) {
      const nameKey = normalizeForMatch(c.name);
      let ref = byName.get(nameKey);
      if (!ref) {
        ref = `${CANDIDATE_PREFIX}${candidates.length + 1}`;
        byName.set(nameKey, ref);
        candidates.push({ ref, name: c.name, startYm: c.startYm, endYm: c.endYm, evidence: c.evidence, warnings: c.warnings });
      } else {
        const cur = candidates.find((x) => x.ref === ref)!;
        if (!cur.startYm && c.startYm) cur.startYm = c.startYm;
        if (!cur.endYm && c.endYm) cur.endYm = c.endYm;
      }
      localToGlobal.set(c.key, ref);
    }
    for (const p of outcome.proposals) {
      const q = { ...p, periodRef: localToGlobal.get(p.periodRef) ?? p.periodRef };
      // 区切りの境目で同じ提案が重なったら1つにする
      const sig = `${q.dest}|${q.snapshotField}|${normalizeForMatch(proposalTexts(q).join("|"))}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      proposals.push(q);
    }
  }
  // 未分類は一覧の末尾（177-1 STEP 2）
  proposals.sort((a, b) => Number(a.dest === "unclassified") - Number(b.dest === "unclassified"));
  return { proposals, candidates, stats };
}

/** AIの応答からJSONを取り出す（既存routeと同じ3段階） */
export function parseJsonLoose(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fallthrough */
  }
  const s = cleaned.indexOf("{");
  const e = cleaned.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(cleaned.slice(s, e + 1));
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

// ─── AIへの指示 ───

const EVENT_KIND_LIST = EVENT_KINDS.map((k) => `${k.value}（${k.label}）`).join(" / ");
const INITIATIVE_STATUS_LIST = INITIATIVE_STATUSES.map((s) => `${s.value}（${s.label}）`).join(" / ");
const DELEGATION_STATUS_LIST = DELEGATION_STATUSES.map((s) => `${s.value}（${s.label}）`).join(" / ");
const SNAPSHOT_FIELD_LIST = SNAPSHOT_TEXT_FIELDS.map((f) => `${f.key}（${f.label}）`).join(" / ");

export const IMPORT_SYSTEM_PROMPT = `あなたはクリニックの院長の「振り返り記録」の整理係です。院長がまとめて書いた文章・エピソード・インタビューの書き起こしを読み、記録の各項目に仕分けた提案をJSONで返します。院長が確認して採用したものだけが保存されます。

【絶対に守ること（事実性）】
- これは院長自身の実体験の記録です。**元の文章に無い出来事・数字・発言・感情を補わない**でください。推測・一般論・創作をしないこと。
- **院長の言い回しをできるだけそのまま使う**。要約しすぎない。感情や率直な表現を丸めない・きれいに言い換えない。
- すべての提案に evidence（根拠）として**元の文章からそのまま抜き出した一節**を付ける。一字一句変えずに抜き出すこと。根拠を示せない提案は出さない。
- 年月は元の文章に年と月が書かれているときだけ YYYY-MM で入れる。読み取れなければ空文字 ""。推測で埋めない。
- 人物は役割で表す（例: 主任、受付）。氏名は書かない。

【インタビュー形式のとき】
- 質問者（Q・質問・聞き手・インタビュアーなど）の発言は文脈として読むだけ。**院長の回答部分だけ**を素材・根拠にする。

【四象限について（厳守）】
- 四象限の配分（%）や、施策がどの象限の仕事かの分類は**一切出力しない**。院長が自分で決めます。出力形式にもその欄はありません。

【行き先（dest）】
- event（出来事）: 開業・移転・採用・退職・導入などの出来事。ym, eventKind, content
- snapshot（時間管理スナップショット）: その期の時間の使い方の振り返り。field に欄名、content に文章
  欄: ${SNAPSHOT_FIELD_LIST}
- initiative（施策）: 院長が取り組んだこと。name（施策名）, status, aim（狙い）, result（結果）, learning（学び）, plannedYm, doneYm
- delegation（権限委譲）: 院長の業務を誰（役割）に任せたか。task（業務）, status, toRole（委譲先の役割）
- period_summary（期の一言要約）: その期全体を表す院長の言葉。content
- unclassified（未分類）: どこにも当てはまらないが記録に残す価値のある内容。content。**当てはまらない内容も捨てずにここへ**
- eventKind: ${EVENT_KIND_LIST}
- 施策の status: ${INITIATIVE_STATUS_LIST}（文章から分からなければ planned）
- 権限委譲の status: ${DELEGATION_STATUS_LIST}

【期（period）】
- 既存の期の一覧から、話の時期に合う期の id を入れる。
- 既存のどの期にも当てはまらない時期の話は、newPeriods に「新しい期の候補」（key は N1, N2…、名称・期間・根拠）を出し、その提案の period にその key を入れる。
- どの期か判断できなければ period は空文字 ""。

【出力】次のJSONだけを返す（前後に文章を付けない）:
{
  "newPeriods": [
    { "key": "N1", "name": "期の名称の案", "startYm": "YYYY-MM または空", "endYm": "YYYY-MM または空", "evidence": "元の文章からの抜き出し" }
  ],
  "items": [
    { "dest": "event", "period": "期のid または N1 または空", "ym": "", "eventKind": "other", "content": "…", "evidence": "…" },
    { "dest": "snapshot", "period": "…", "field": "feeling", "content": "…", "evidence": "…" },
    { "dest": "initiative", "period": "…", "name": "…", "status": "done", "aim": "", "result": "", "learning": "", "plannedYm": "", "doneYm": "", "evidence": "…" },
    { "dest": "delegation", "period": "…", "task": "…", "status": "partial", "toRole": "…", "evidence": "…" },
    { "dest": "period_summary", "period": "…", "content": "…", "evidence": "…" },
    { "dest": "unclassified", "period": "", "content": "…", "evidence": "…" }
  ]
}`;

export function buildPeriodListForPrompt(periods: Period[], replacer: ((s: string) => string) | null): string {
  const rep = replacer ?? ((s: string) => s);
  const list = sortPeriods(periods);
  if (list.length === 0) return "（既存の期はまだありません）";
  return list.map((p) => `- id: ${p.id} ／ 名称: ${rep(p.name)} ／ 期間: ${periodRangeLabel(p) || "未設定"}`).join("\n");
}

export function buildImportUserPrompt(input: {
  periodList: string;
  forcedPeriod: { id: string; label: string } | null;
  chunk: string;
  index: number;
  total: number;
}): string {
  const periodRule = input.forcedPeriod
    ? `# 期の指定\nこの文章はすべて期「${input.forcedPeriod.label}」（id: ${input.forcedPeriod.id}）の話として扱ってください。period にはこの id を入れ、newPeriods は空配列にしてください。`
    : `# 既存の期\n${input.periodList}`;
  const part =
    input.total > 1
      ? `\n（長い文章を区切って渡しています。これは ${input.total} 個中 ${input.index + 1} 個目です。この区切りの中から仕分けてください）`
      : "";
  return `${periodRule}

# 院長の文章（事実。ここに無いことは書かない）${part}
<文章>
${input.chunk}
</文章>

上の文章だけを使って仕分けし、指定のJSONで返してください。evidence は上の文章からの一字一句そのままの抜き出しにしてください。`;
}

// ─── 保存計画（STEP 3）───

export type MergeMode = "append" | "replace" | "skip";

export type SaveOp =
  | {
      op: "createPeriod";
      candidateRef: string;
      fields: Record<string, unknown>;
      proposalIds: string[];
      label: string;
    }
  | {
      op: "create";
      kind: Exclude<RecordKind, "period">;
      /** 既存の期 id か候補の ref（実行時に作った期の id に置き換える） */
      periodRef: string;
      fields: Record<string, unknown>;
      proposalIds: string[];
      label: string;
    }
  | {
      op: "patch";
      kind: RecordKind;
      id: string;
      fields: Record<string, unknown>;
      proposalIds: string[];
      label: string;
    };

export type SavePlanInput = {
  proposals: ImportProposal[];
  /** 採用する提案の id */
  adopted: Set<string>;
  /** 既存の内容がある欄への反映方法（提案 id → 追記/置き換え/採用しない。既定は追記） */
  merge: Record<string, MergeMode>;
  candidates: PeriodCandidate[];
  /** 作成を承認した候補の ref */
  approvedCandidates: Set<string>;
  /** 新しく作るスナップショットの記入時期（既定: 振り返って記入） */
  recordedMode: "retrospective" | "contemporaneous";
  data: RetrospectiveData;
};

export type SavePlan = {
  ops: SaveOp[];
  /** 保存できない提案（id → 理由）。採用されていても保存しない */
  blocked: Record<string, string>;
};

function mergeText(existing: string, add: string, mode: MergeMode): string {
  if (mode === "skip") return existing;
  if (mode === "replace") return add;
  const e = existing.trim();
  return e ? `${existing.replace(/\s+$/, "")}\n\n${add}` : add;
}

export function proposalLabel(p: ImportProposal): string {
  switch (p.dest) {
    case "event":
      return `出来事「${p.text.split("\n")[0].slice(0, 20)}」`;
    case "snapshot":
      return `スナップショット「${snapshotFieldLabel(p.snapshotField)}」`;
    case "initiative":
      return `施策「${p.name}」`;
    case "delegation":
      return `権限委譲「${p.task}」`;
    case "period_summary":
      return "期の一言要約";
    default:
      return "未分類";
  }
}

/**
 * 採用した提案を、既存の保存APIに送る操作の列にする。
 * - 四象限の配分（shares）・施策の分類（quadrant）は**どの操作にも入れない**
 * - 既存の欄は既定で追記（置き換えは明示したときだけ）
 * - 新しい期は承認したものだけ作る。承認していない候補を指す提案は保存しない
 */
export function buildSavePlan(input: SavePlanInput): SavePlan {
  const ops: SaveOp[] = [];
  const blocked: Record<string, string> = {};
  const periods = new Map(input.data.periods.map((p) => [p.id, p]));
  const cands = new Map(input.candidates.map((c) => [c.ref, c]));
  const adopted = input.proposals.filter((p) => input.adopted.has(p.id));
  const modeOf = (id: string): MergeMode => input.merge[id] ?? "append";

  const periodOk = (p: ImportProposal): boolean => {
    if (!p.periodRef) {
      blocked[p.id] = "行き先の期を選んでください";
      return false;
    }
    if (isCandidateRef(p.periodRef)) {
      if (!cands.has(p.periodRef)) {
        blocked[p.id] = "行き先の期が見つかりません";
        return false;
      }
      if (!input.approvedCandidates.has(p.periodRef)) {
        blocked[p.id] = "新しい期の候補を「作成する」にしてください";
        return false;
      }
      return true;
    }
    if (!periods.has(p.periodRef)) {
      blocked[p.id] = "行き先の期が見つかりません";
      return false;
    }
    return true;
  };

  // 1) 承認した新しい期（要約の提案はここに入れる）
  for (const c of input.candidates) {
    if (!input.approvedCandidates.has(c.ref)) continue;
    if (!c.name.trim()) continue;
    const summaries = adopted.filter((p) => p.dest === "period_summary" && p.periodRef === c.ref);
    let summary = "";
    for (const s of summaries) summary = mergeText(summary, s.text, "append");
    if (summary.length > SUMMARY_MAX) {
      for (const s of summaries) blocked[s.id] = `期の一言要約は${SUMMARY_MAX}字までです（合計${summary.length}字）`;
      summary = "";
    }
    if (!c.startYm) {
      blocked[`candidate:${c.ref}`] = "新しい期の開始年月を入れてください";
      for (const p of adopted) if (p.periodRef === c.ref) blocked[p.id] = "新しい期の開始年月を入れてください";
      continue;
    }
    ops.push({
      op: "createPeriod",
      candidateRef: c.ref,
      fields: { name: c.name, startYm: c.startYm, endYm: c.endYm, summary },
      proposalIds: summaries.filter((s) => !blocked[s.id]).map((s) => s.id),
      label: `新しい期「${c.name}」`,
    });
  }

  // 2) 既存の期の一言要約（追記が既定）
  const summaryByPeriod = new Map<string, ImportProposal[]>();
  for (const p of adopted) {
    if (p.dest !== "period_summary" || isCandidateRef(p.periodRef)) continue;
    if (!periodOk(p)) continue;
    if (!p.text.trim()) {
      blocked[p.id] = "内容が空です";
      continue;
    }
    summaryByPeriod.set(p.periodRef, [...(summaryByPeriod.get(p.periodRef) ?? []), p]);
  }
  for (const [pid, list] of summaryByPeriod) {
    const period = periods.get(pid)!;
    let value = period.summary;
    const used: string[] = [];
    for (const p of list) {
      if (modeOf(p.id) === "skip") continue;
      value = mergeText(value, p.text, modeOf(p.id));
      used.push(p.id);
    }
    if (used.length === 0 || value === period.summary) continue;
    if (value.length > SUMMARY_MAX) {
      for (const id of used) blocked[id] = `期の一言要約は${SUMMARY_MAX}字までです（反映後${value.length}字）`;
      continue;
    }
    ops.push({ op: "patch", kind: "period", id: pid, fields: { summary: value }, proposalIds: used, label: `期「${period.name}」の一言要約` });
  }

  // 3) スナップショット（1期1件。既存があれば欄ごとに追記、無ければ作る。配分は送らない）
  const snapByPeriod = new Map<string, ImportProposal[]>();
  for (const p of adopted) {
    if (p.dest !== "snapshot") continue;
    if (!periodOk(p)) continue;
    if (!p.text.trim()) {
      blocked[p.id] = "内容が空です";
      continue;
    }
    snapByPeriod.set(p.periodRef, [...(snapByPeriod.get(p.periodRef) ?? []), p]);
  }
  for (const [ref, list] of snapByPeriod) {
    const existing = isCandidateRef(ref) ? null : input.data.snapshots.find((s) => s.periodId === ref) ?? null;
    const values: Partial<Record<SnapshotTextField, string>> = {};
    const used: string[] = [];
    for (const p of list) {
      const mode = existing ? modeOf(p.id) : "append";
      if (mode === "skip") continue;
      const cur = values[p.snapshotField] ?? (existing ? existing[p.snapshotField] : "");
      values[p.snapshotField] = mergeText(cur, p.text, mode);
      used.push(p.id);
    }
    if (used.length === 0) continue;
    const tooLong = (Object.entries(values) as [SnapshotTextField, string][]).find(([, v]) => v.length > LONG_MAX);
    if (tooLong) {
      for (const id of used) blocked[id] = `「${snapshotFieldLabel(tooLong[0])}」は${LONG_MAX}字までです`;
      continue;
    }
    if (existing) {
      const changed = (Object.entries(values) as [SnapshotTextField, string][]).filter(
        ([k, v]) => v !== existing[k]
      );
      if (changed.length === 0) continue;
      ops.push({
        op: "patch",
        kind: "snapshot",
        id: existing.id,
        fields: Object.fromEntries(changed),
        proposalIds: used,
        label: "時間管理スナップショット（既存に反映）",
      });
    } else {
      ops.push({
        op: "create",
        kind: "snapshot",
        periodRef: ref,
        fields: { ...values, recordedMode: input.recordedMode, shares: null },
        proposalIds: used,
        label: "時間管理スナップショット（新規）",
      });
    }
  }

  // 4) 出来事・施策・権限委譲は新しい記録として作る（既存の記録は変えない）
  for (const p of adopted) {
    if (p.dest === "event") {
      if (!periodOk(p)) continue;
      if (!p.text.trim()) blocked[p.id] = "内容が空です";
      else if (!p.ym) blocked[p.id] = "年月を入れてください（文章から読み取れなかったため空欄です）";
      else
        ops.push({ op: "create", kind: "event", periodRef: p.periodRef, fields: { ym: p.ym, kind: p.eventKind, content: p.text }, proposalIds: [p.id], label: proposalLabel(p) });
    } else if (p.dest === "initiative") {
      if (!periodOk(p)) continue;
      if (!p.name.trim()) blocked[p.id] = "施策名を入れてください";
      else
        ops.push({
          op: "create",
          kind: "initiative",
          periodRef: p.periodRef,
          // quadrant は送らない（177-2-1: 分類は院長が自分で付ける）
          fields: { name: p.name, status: p.status, plannedYm: p.plannedYm, doneYm: p.doneYm, aim: p.aim, result: p.result, learning: p.learning },
          proposalIds: [p.id],
          label: proposalLabel(p),
        });
    } else if (p.dest === "delegation") {
      if (!periodOk(p)) continue;
      if (!p.task.trim()) blocked[p.id] = "業務を入れてください";
      else
        ops.push({ op: "create", kind: "delegation", periodRef: p.periodRef, fields: { task: p.task, status: p.delegationStatus, toRole: p.toRole }, proposalIds: [p.id], label: proposalLabel(p) });
    } else if (p.dest === "unclassified") {
      blocked[p.id] = "未分類のままでは保存できません（行き先を選んでください）";
    }
  }
  return { ops, blocked };
}

/** 既存の内容がある欄か（画面で「追記／置き換え／採用しない」を出す） */
export function existingTextFor(p: ImportProposal, data: RetrospectiveData): string {
  if (!p.periodRef || isCandidateRef(p.periodRef)) return "";
  if (p.dest === "period_summary") return data.periods.find((x) => x.id === p.periodRef)?.summary ?? "";
  if (p.dest === "snapshot") {
    const s = data.snapshots.find((x) => x.periodId === p.periodRef);
    return s ? s[p.snapshotField] : "";
  }
  return "";
}

// ─── クライアント → /api/director-retrospective/import ───

const API = "/api/director-retrospective/import";

export async function analyzeImport(input: { text: string; periodId: string | null }): Promise<ImportResult> {
  const res = await fetch(API, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const j = (await res.json().catch(() => ({}))) as ImportResult & { error?: string };
  if (!res.ok) throw new Error(j.error || `解析に失敗しました (${res.status})`);
  return j;
}

export async function extractImportFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API}?action=extract`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    body: fd,
  });
  const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok || typeof j.text !== "string") throw new Error(j.error || `読み込みに失敗しました (${res.status})`);
  return j.text;
}
