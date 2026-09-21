// 発表の構成案とプレゼン資料作成プロンプト（指示書174）— 型・正規化・プロンプト組み立て（純関数）とクライアント呼び出し
//
// 【役割分担（174-2）】
//   AIに任せるのは「構成案2案＋推奨とその理由」の生成だけ。
//   **プレゼン資料作成プロンプト本体はAIに書かせず、テンプレートで組み立てる**（再現性のため）。
//
// 【事実性（174-3）】
//   発表は院長自身の実体験。AIが話を作ってはならない。
//   システムプロンプトに「素材にない出来事・数字を補わない／足りない幕は『記録なし：院長に確認』」を明記し、
//   受け取ったJSONは missing フラグを尊重して画面とプロンプトに反映する。
//
// 【匿名化（174-4）】
//   AIに送る素材（173の記録／貼り付けシート／条件の自由記述）は**送信前に**役割名へ置換する。
//   置換は director-retrospective.ts の buildNameReplacer（173と同じ）。ここは置換済みの文字列を受け取るだけ。
//
// このファイルは "@/..." を import しない（テストで直接実行するため）。

import {
  buildRetrospectiveMarkdown,
  recordedModeLabel,
  snapshotOfPeriod,
  sortPeriods,
  quadrantSharesValid,
  type NameReplacer,
  type RetrospectiveData,
} from "./director-retrospective";

// ─── 発表条件（STEP 1）───

export type PlanSource = "records" | "paste";

export const DEFAULT_MINUTES = 20;
export const DEFAULT_AUDIENCE = "アチーブメントのセミナー受講生";
export const DEFAULT_THEME =
  "開業から現在までの時間管理 ― 失敗からうまくいったことまで";

export type PlanConditions = {
  source: PlanSource;
  /** source=records のとき。null = 全期 */
  periodIds: string[] | null;
  minutes: number;
  audience: string;
  theme: string;
  emphasis: string;
};

export const MINUTES_MIN = 5;
export const MINUTES_MAX = 120;
const SHORT_MAX = 300;
export const PASTE_MAX = 40000;

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export function normalizeConditions(raw: unknown): PlanConditions {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const m = typeof g.minutes === "number" ? g.minutes : Number(g.minutes);
  const minutes = Number.isInteger(m) && m >= MINUTES_MIN && m <= MINUTES_MAX ? m : DEFAULT_MINUTES;
  const ids = Array.isArray(g.periodIds)
    ? g.periodIds.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : null;
  return {
    source: g.source === "paste" ? "paste" : "records",
    periodIds: ids && ids.length > 0 ? ids.slice(0, 100) : null,
    minutes,
    audience: text(g.audience, SHORT_MAX).trim() || DEFAULT_AUDIENCE,
    theme: text(g.theme, SHORT_MAX).trim() || DEFAULT_THEME,
    emphasis: text(g.emphasis, 1000).trim(),
  };
}

/** 条件の自由記述にも匿名化を通す（AIに送る前・174-4） */
export function anonymizeConditions(c: PlanConditions, r: NameReplacer | null): PlanConditions {
  if (!r) return c;
  return { ...c, audience: r(c.audience), theme: r(c.theme), emphasis: r(c.emphasis) };
}

// ─── 構成案（STEP 2）───

export type PlanAct = {
  title: string;
  minutes: number;
  content: string;
  /** どの期のどの記録を使うか */
  materials: string;
  /** 素材が足りない幕（174-3「記録なし：院長に確認」） */
  missing: boolean;
};

export type PlanOption = {
  name: string;
  /** 構造の型（例: 時系列ストーリー型／結論先出し・比較型） */
  structure: string;
  acts: PlanAct[];
  /** 核の1枚（四象限の推移グラフ）をどこで見せるか */
  corePlacement: string;
  strengths: string[];
  weaknesses: string[];
};

export type PlanResult = {
  options: [PlanOption, PlanOption];
  /** 推奨案の添字（0 = A, 1 = B） */
  recommended: 0 | 1;
  reason: string;
};

export const MISSING_LABEL = "記録なし：院長に確認";

const ACT_MAX = 12;
const LIST_MAX = 6;

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map((s) => s.trim().slice(0, 300))
    .slice(0, LIST_MAX);
}

function normalizeAct(raw: unknown): PlanAct | null {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = text(g.title, 120).trim();
  if (!title) return null;
  const m = typeof g.minutes === "number" ? g.minutes : Number(g.minutes);
  const missing =
    g.missing === true ||
    text(g.materials, 1000).includes("記録なし") ||
    text(g.content, 2000).includes("記録なし");
  let materials = text(g.materials, 1000).trim();
  if (missing && !materials.includes(`【${MISSING_LABEL}】`)) {
    const rest = materials.replace(MISSING_LABEL, "").replace(/^[：:／/、,\s]+|[：:／/、,\s]+$/g, "").trim();
    materials = rest ? `【${MISSING_LABEL}】${rest}` : `【${MISSING_LABEL}】`;
  }
  return {
    title,
    minutes: Number.isFinite(m) && m >= 0 ? Math.round(m * 2) / 2 : 0,
    content: text(g.content, 2000).trim(),
    materials,
    missing,
  };
}

function normalizeOption(raw: unknown): PlanOption | null {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = text(g.name, 120).trim();
  const acts = (Array.isArray(g.acts) ? g.acts : [])
    .map(normalizeAct)
    .filter((a): a is PlanAct => a !== null)
    .slice(0, ACT_MAX);
  if (!name || acts.length === 0) return null;
  return {
    name,
    structure: text(g.structure, 120).trim(),
    acts,
    corePlacement: text(g.corePlacement, 300).trim(),
    strengths: strList(g.strengths),
    weaknesses: strList(g.weaknesses),
  };
}

export function normalizePlanResult(raw: unknown): PlanResult | null {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const opts = (Array.isArray(g.options) ? g.options : [])
    .map(normalizeOption)
    .filter((o): o is PlanOption => o !== null);
  if (opts.length < 2) return null;
  const rec = typeof g.recommended === "number" ? g.recommended : Number(g.recommended);
  const reason = text(g.reason, 1000).trim();
  if (!reason) return null;
  return {
    options: [opts[0], opts[1]],
    recommended: rec === 1 ? 1 : 0,
    reason,
  };
}

/** AIの応答からJSONを取り出す（既存routeと同じ3段階: そのまま → フェンス除去 → 最初の{〜最後の}） */
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

export function parsePlanResult(raw: string): PlanResult | null {
  return normalizePlanResult(parseJsonLoose(raw));
}

/** 2案の構造が異なるか（174-1「言い回しや順番の入れ替えだけの差は不可」の機械的な下限） */
export function optionsStructurallyDifferent(a: PlanOption, b: PlanOption): boolean {
  const sa = a.structure.trim();
  const sb = b.structure.trim();
  if (sa && sb && sa !== sb) return true;
  const titlesA = a.acts.map((x) => x.title).sort().join("|");
  const titlesB = b.acts.map((x) => x.title).sort().join("|");
  return titlesA !== titlesB || a.acts.length !== b.acts.length;
}

export function actMinutesTotal(o: PlanOption): number {
  return o.acts.reduce((s, a) => s + a.minutes, 0);
}

// ─── 素材（AIに送る＆プロンプトに載せる。匿名化済み）───

/** 期ごとの記録の量（推奨基準5「記録が薄い期に依存していないか」の判断材料） */
export function buildCoverageSummary(data: RetrospectiveData, periodIds: string[] | null): string {
  const periods = sortPeriods(data.periods).filter((p) => !periodIds || periodIds.includes(p.id));
  if (periods.length === 0) return "（期の記録なし）";
  return periods
    .map((p) => {
      const ev = data.events.filter((e) => e.periodId === p.id).length;
      const ini = data.initiatives.filter((i) => i.periodId === p.id).length;
      const del = data.delegations.filter((d) => d.periodId === p.id).length;
      const s = snapshotOfPeriod(data.snapshots, p.id);
      const snap = s
        ? `あり（${recordedModeLabel(s.recordedMode)}・四象限${quadrantSharesValid(s.shares) ? "あり" : "未入力"}）`
        : "なし";
      const thin = ev + ini + del === 0 && !s;
      return `- ${p.name}: 出来事${ev}件／スナップショット${snap}／施策${ini}件／権限委譲${del}件${thin ? " ← 記録が薄い" : ""}`;
    })
    .join("\n");
}

/**
 * 173の記録から素材テキストを作る（匿名化は replacer で・今日の日付は呼び出し側）。
 * Markdown本体は173の出力と同じ型（期→出来事→スナップショット→施策→権限委譲）。
 */
export function buildMaterialFromRecords(
  data: RetrospectiveData,
  periodIds: string[] | null,
  replacer: NameReplacer | null,
  today: string
): string {
  const md = buildRetrospectiveMarkdown(data, {
    periodIds,
    anonymize: replacer !== null,
    replacer,
    today,
  });
  return `## 記録の量（期ごと）\n${buildCoverageSummary(data, periodIds)}\n\n${md}`;
}

/** 貼り付けた振り返りシートを素材にする（匿名化を通す） */
export function buildMaterialFromPaste(pasteText: string, replacer: NameReplacer | null): string {
  const body = text(pasteText, PASTE_MAX).trim();
  const anonymized = replacer ? replacer(body) : body;
  return `## 貼り付けた振り返りシート\n${anonymized}`;
}

// ─── AIへの指示（構成案生成だけ）───

export const PLAN_SYSTEM_PROMPT = `あなたはセミナー発表の構成作家です。発表者（クリニックの院長）の振り返り記録を素材に、発表の構成案を2案作り、推奨案を1つ選びます。

【絶対に守ること（事実性）】
- この発表は院長自身の実体験を語るものです。**素材にない出来事・数字・発言・人物・場面を作らない**でください。推測で補わないでください。
- 素材が足りない幕は、materials に「${MISSING_LABEL}」と書き、missing を true にしてください。埋めようとしないこと。
- 「振り返って記入」の四象限の数字は推定値です。数字を扱う幕では推定であることが分かる書き方にしてください。
- スタッフ・患者を特定しない。人物は役割で表す。

【2案の条件】
- **2案は構造が異なること**。言い回しや順番の入れ替えだけの差は不可。
  例: 「時系列ストーリー型（失敗→転機→試行錯誤→成果）」と「結論先出し・比較型（四象限の推移を冒頭に示し、変化の要因を3つに分けて語る）」。
- 各案に: 構成名／構造の型／幕ごとの（時間配分・語る内容・使う素材＝どの期のどの記録か）／核の1枚（四象限の推移グラフ）をどこで見せるか／強み／弱み。
- 幕の時間配分の合計は発表時間に一致させる。

【推奨の判定基準（この順で評価し、理由を2〜3行で）】
1. 発表時間に収まるか
2. 失敗からうまくいったことまで、一貫して語れるか
3. 核の1枚（四象限の推移）を活かせるか
4. 聴き手が持ち帰れる学びがあるか
5. 記録が薄い期に依存していないか（素材が足りない部分を多く使う案は不利）

【出力】次のJSONだけを返す（前後に文章を付けない）:
{
  "options": [
    {
      "name": "構成名",
      "structure": "構造の型（短く）",
      "acts": [
        { "title": "幕の名前", "minutes": 4, "content": "語る内容（素材の言葉で）", "materials": "使う素材（例: 2022 開業期／出来事「…」、スナップショット）", "missing": false }
      ],
      "corePlacement": "核の1枚を見せる位置（例: 第3幕の冒頭）",
      "strengths": ["…"],
      "weaknesses": ["…"]
    },
    { …2案目（1案目と構造が異なる）… }
  ],
  "recommended": 0,
  "reason": "推奨理由（2〜3行・上の基準の順に）"
}`;

export function buildPlanUserPrompt(c: PlanConditions, material: string): string {
  return `# 発表条件
- 発表時間: ${c.minutes}分
- 聴き手: ${c.audience}
- テーマ: ${c.theme}
- 特に伝えたいこと: ${c.emphasis || "（指定なし）"}

# 素材（事実。ここに無いことは書かない）
<素材>
${material}
</素材>

上の素材だけを使って、構造の異なる構成案を2案作り、推奨案を1つ選んで、指定のJSONで返してください。`;
}

// ─── プレゼン資料作成プロンプト（STEP 4・174-2の型。AIに書かせない）───

export function renderOptionFlow(o: PlanOption): string {
  const lines: string[] = [];
  lines.push(`構成名: ${o.name}${o.structure ? `（${o.structure}）` : ""}`);
  o.acts.forEach((a, i) => {
    lines.push(`${i + 1}. ${a.title}（${a.minutes}分）`);
    if (a.content) lines.push(`   語る内容: ${a.content}`);
    lines.push(`   使う素材: ${a.materials || (a.missing ? `【${MISSING_LABEL}】` : "（指定なし）")}`);
  });
  lines.push(`核の1枚（四象限の推移グラフ）を見せる位置: ${o.corePlacement || `【${MISSING_LABEL}】`}`);
  return lines.join("\n");
}

export function buildPresentationPrompt(
  c: PlanConditions,
  option: PlanOption,
  material: string
): string {
  const core = option.corePlacement || "【要確認：核の1枚の位置】";
  return `# 依頼
あなたはセミナー発表の構成作家です。以下の素材と構成に基づき、
${c.minutes}分の発表スライドと台本を作成してください。

# 発表条件
- 聴き手: ${c.audience}
- テーマ: ${c.theme}
- 特に伝えたいこと: ${c.emphasis || "（指定なし）"}

# 採用する構成
<構成>
${renderOptionFlow(option)}
</構成>

# 素材（事実）
<素材>
${material}
</素材>

# 守ること
1. 素材にない出来事・数字・発言を作らない。足りない箇所は【要確認：◯◯】と書いて空けておく
2. 失敗は発表者自身の選択として語る。環境や他人のせいにしない
3. 数字で示す。「振り返って記入」の数字は「振り返ると、おそらく◯割」と推定であることを明示する
4. スタッフ・患者を特定しない。人物は役割で表す
5. 各幕に、情景が浮かぶ具体的な場面を1つ入れる（素材にある場面から選ぶ）
6. 四象限の推移グラフを${core}で見せる

# 出力形式
スライドごとに以下を出力してください。
- スライド番号／タイトル
- 画面に載せる要点（3行以内）
- 話す台本（話し言葉）
- 目安時間
最後に、合計時間と【要確認】の一覧を付けてください。
`;
}

// ─── 保存する生成結果（STEP 4「開き直しても再生成しない」）───

export type PresentationPlanSaved = {
  conditions: PlanConditions;
  /** AIに送った素材（匿名化済み・そのまま保存。送信内容の確認とプロンプト組み立てに使う） */
  material: string;
  result: PlanResult;
  /** 確定した案（既定は推奨案） */
  chosen: 0 | 1;
  provider: string;
  model: string;
  generatedAt: string;
  updatedAt: string;
};

export function normalizePresentationPlanSaved(raw: unknown): PresentationPlanSaved | null {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = normalizePlanResult(g.result);
  if (!result) return null;
  return {
    conditions: normalizeConditions(g.conditions),
    material: text(g.material, 200000),
    result,
    chosen: g.chosen === 1 ? 1 : g.chosen === 0 ? 0 : result.recommended,
    provider: text(g.provider, 40),
    model: text(g.model, 80),
    generatedAt: text(g.generatedAt, 40),
    updatedAt: text(g.updatedAt, 40),
  };
}

export function promptFromSaved(s: PresentationPlanSaved): string {
  return buildPresentationPrompt(s.conditions, s.result.options[s.chosen], s.material);
}

// ─── クライアント → /api/director-retrospective/presentation ───

const API = "/api/director-retrospective/presentation";

async function call<T>(init: RequestInit): Promise<T> {
  const res = await fetch(API, {
    cache: "no-store",
    credentials: "same-origin",
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `通信に失敗しました (${res.status})`);
  return j;
}

export async function fetchPresentationPlan(): Promise<{
  saved: PresentationPlanSaved | null;
  tableMissing: boolean;
}> {
  return call({ method: "GET" });
}

export async function generatePresentationPlan(input: {
  conditions: PlanConditions;
  pasteText: string;
}): Promise<{ saved: PresentationPlanSaved }> {
  return call({ method: "POST", body: JSON.stringify(input) });
}

export async function choosePresentationPlan(chosen: 0 | 1): Promise<{
  saved: PresentationPlanSaved;
}> {
  return call({ method: "PATCH", body: JSON.stringify({ chosen }) });
}
