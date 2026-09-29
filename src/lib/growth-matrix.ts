// 成長マトリクス（指示書190）— 純粋部（画面・サーバー・テストで共用）
//
// 一次ソースは確定版 v1.0（src/data/growth-matrix-v1.json の md ＝ ~/Downloads/grade_growth_matrix_v1_20260928.md をそのまま）。
// 第4節の「必須の学び」「到達状態」の文言は、**このファイルで md を解析して取り出す**（別に書き写さない＝一字一句同じ）。
// 位置・根拠・合意・ゲートは「他人との比較・並べ替え・絞り込み」には使わない（179・152）。
// 画面に「到達の数」「割合」「点数」は出さない（確定版 第6節）。

import src from "@/data/growth-matrix-v1.json";

export const GROWTH_MATRIX_V1_MD: string = src.md;

export const S_LEVELS = ["S1", "S2", "S3", "S4", "S5"] as const;
export const M_LEVELS = ["M1", "M2", "M3", "M4", "M5"] as const;
export type SLevel = (typeof S_LEVELS)[number];
export type MLevel = (typeof M_LEVELS)[number];
export const isSLevel = (v: unknown): v is SLevel => (S_LEVELS as readonly string[]).includes(String(v));
export const isMLevel = (v: unknown): v is MLevel => (M_LEVELS as readonly string[]).includes(String(v));

export const GRADES = ["G1", "G2", "G3", "G4", "G5"] as const;
export type Grade = (typeof GRADES)[number];
export const isGrade = (v: unknown): v is Grade => (GRADES as readonly string[]).includes(String(v));

/**
 * 概念図の点（193 A-1: 確定版の目標位置どおり Gn ＝ Sn × Mn のマス目の中心）。
 * 物語（技能の時代は主に横へ、G2→G3で上へ、在り方の時代は主に上へ）は帯の見出しと「質的転換点」の注記で表す。
 * x・y は 0〜25 の座標（S1 の中心 = 2.5、S2 = 7.5 …）。
 */
export const GRADE_POINTS: { grade: Grade; s: SLevel; m: MLevel; x: number; y: number; label: string }[] = [
  { grade: "G1", s: "S1", m: "M1", x: 2.5, y: 2.5, label: "学ぶ" },
  { grade: "G2", s: "S2", m: "M2", x: 7.5, y: 7.5, label: "自走" },
  { grade: "G3", s: "S3", m: "M3", x: 12.5, y: 12.5, label: "体現・伴走" },
  { grade: "G4", s: "S4", m: "M4", x: 17.5, y: 17.5, label: "引き出す・支える" },
  { grade: "G5", s: "S5", m: "M5", x: 22.5, y: 22.5, label: "広げる・創る" },
];

// ─── 移行 ───

export const TRANSITIONS = [
  { key: "g1_g2", from: "G1", to: "G2", target: { s: "S2", m: "M2" } },
  { key: "g2_g3", from: "G2", to: "G3", target: { s: "S3", m: "M3" } },
  { key: "g3_g4", from: "G3", to: "G4", target: { s: "S4", m: "M4" } },
  { key: "g4_g5", from: "G4", to: "G5", target: { s: "S5", m: "M5" } },
] as const;
export type TransitionKey = (typeof TRANSITIONS)[number]["key"];
export const isTransitionKey = (v: unknown): v is TransitionKey => TRANSITIONS.some((t) => t.key === v);
export function transitionLabel(k: TransitionKey): string {
  const t = TRANSITIONS.find((x) => x.key === k)!;
  return `${t.from} → ${t.to}`;
}
/** 現在の等級から「次の移行」 */
export function nextTransitionOf(grade: Grade | ""): TransitionKey | null {
  if (!grade) return null;
  return TRANSITIONS.find((t) => t.from === grade)?.key ?? null;
}

// ─── 第4節の解析（必須の学び・到達状態）───

export type AttainmentItem = {
  /** 安定して保存できるキー（移行・軸・行番号） */
  key: string;
  axis: "s" | "m";
  text: string;
  /** ルール2: 「安定して」「継続して」を含む＝直近2半期の根拠を求める */
  stable: boolean;
};
export type TransitionSpec = {
  key: TransitionKey;
  /** 見出し（確定版の文言そのまま。目標位置を含む） */
  heading: string;
  gates: string[];
  s: AttainmentItem[];
  m: AttainmentItem[];
  /** 「見る重心 …」の行（確定版の文言そのまま。** は太字） */
  focus: string;
};

const STABLE_RE = /安定して|継続して/;

/** 表示用: 一次ソースの太字記法（**…**）だけ外す（保存キー・照合には使わない） */
export function plainItemText(t: string): string {
  return t.replace(/\*\*/g, "");
}

function parseTransitions(md: string): TransitionSpec[] {
  const out: TransitionSpec[] = [];
  const blocks = md.split(/\n### 【/).slice(1);
  for (const raw of blocks) {
    const block = "【" + raw;
    const heading = block.split("\n")[0].trim();
    const m = heading.match(/【G(\d) → G(\d)】/);
    if (!m) continue;
    const key = `g${m[1]}_g${m[2]}` as TransitionKey;
    if (!isTransitionKey(key)) continue;
    const lines = block.split("\n");
    // 必須の学び: 「**必須の学び（○×ゲート）**」の次の「- 」行
    const gates: string[] = [];
    const gi = lines.findIndex((l) => l.startsWith("**必須の学び"));
    if (gi >= 0) {
      for (let i = gi + 1; i < lines.length; i++) {
        const l = lines[i];
        if (l.startsWith("- ")) gates.push(l.slice(2).trim());
        else if (l.trim() === "" && gates.length > 0) break;
        else if (!l.startsWith("- ") && l.trim() !== "") break;
      }
    }
    // 到達状態の表: | 横軸 … | 縦軸 … | の見出し行の後、|---|---| の後の各行
    const s: AttainmentItem[] = [];
    const mm: AttainmentItem[] = [];
    const ti = lines.findIndex((l) => l.startsWith("| 横軸"));
    if (ti >= 0) {
      let row = 0;
      for (let i = ti + 2; i < lines.length; i++) {
        const l = lines[i];
        if (!l.startsWith("|")) break;
        const cells = l.slice(1, l.endsWith("|") ? -1 : undefined).split("|").map((c) => c.trim());
        row++;
        const st = cells[0] ?? "";
        const mt = cells[1] ?? "";
        if (st) s.push({ key: `${key}:s:${row}`, axis: "s", text: st, stable: STABLE_RE.test(st) });
        if (mt) mm.push({ key: `${key}:m:${row}`, axis: "m", text: mt, stable: STABLE_RE.test(mt) });
      }
    }
    const focus = lines.find((l) => l.startsWith("見る重心")) ?? "";
    out.push({ key, heading, gates, s, m: mm, focus });
  }
  return out;
}

export const TRANSITION_SPECS: TransitionSpec[] = parseTransitions(GROWTH_MATRIX_V1_MD);
export function transitionSpec(k: TransitionKey): TransitionSpec | undefined {
  return TRANSITION_SPECS.find((t) => t.key === k);
}
export function attainmentItemsOf(k: TransitionKey): AttainmentItem[] {
  const t = transitionSpec(k);
  return t ? [...t.s, ...t.m] : [];
}

// ─── 半期（ルール2）───

/** 半期のキー。上期=4〜9月（YYYY-H1）、下期=10〜3月（YYYY-H2。1〜3月は前年の下期） */
export function halfOf(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})/);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo >= 4 && mo <= 9) return `${y}-H1`;
  return mo >= 10 ? `${y}-H2` : `${y - 1}-H2`;
}
/** 今日を含む直近2半期のキー（新しい順） */
export function recentHalves(today: string): [string, string] {
  const cur = halfOf(today);
  const [y, h] = cur.split("-");
  const prev = h === "H1" ? `${Number(y) - 1}-H2` : `${y}-H1`;
  return [cur, prev];
}

// ─── 自己評価（C）───

export type EvidenceLinkKind = "" | "learning" | "goal" | "feedback" | "promise";
export type Evidence = {
  /** 日付（YYYY-MM-DD） */
  date: string;
  /** 場面（何があったか） */
  scene: string;
  /** 既存の記録への紐づけ（任意） */
  linkKind: EvidenceLinkKind;
  linkId: string;
  linkLabel: string;
};
export type ItemSelf = { status: "" | "reached" | "in_progress"; evidence: Evidence[] };
export type NextAxis = "" | "s" | "m" | "both";

export type MatrixSelf = {
  s: SLevel | "";
  m: MLevel | "";
  transition: TransitionKey | "";
  nextAxis: NextAxis;
  nextAxisReason: string;
  items: Record<string, ItemSelf>;
};

export const EVIDENCE_SCENE_MAX = 500;
export const EVIDENCE_MAX = 10;
export const NEXT_AXIS_LABEL: Record<NextAxis, string> = { "": "未選択", s: "横（スキル・ナレッジ）", m: "縦（マインド）", both: "両方" };

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}
export function ymdOf(v: unknown): string {
  const s = str(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? "" : s;
}

export function emptyMatrixSelf(): MatrixSelf {
  return { s: "", m: "", transition: "", nextAxis: "", nextAxisReason: "", items: {} };
}

export function normalizeEvidence(raw: unknown): Evidence | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const date = ymdOf(g.date);
  const scene = str(g.scene, EVIDENCE_SCENE_MAX).trim();
  const linkKind = (["learning", "goal", "feedback", "promise"] as const).includes(g.linkKind as never) ? (g.linkKind as EvidenceLinkKind) : "";
  if (!date && !scene && !linkKind) return null;
  return { date, scene, linkKind, linkId: linkKind ? str(g.linkId, 100) : "", linkLabel: linkKind ? str(g.linkLabel, 200) : "" };
}

/** 根拠として成立している＝日付と場面がある（紐づけがあれば場面はその記録名でよい） */
export function isValidEvidence(e: Evidence): boolean {
  return !!e.date && (!!e.scene || !!e.linkKind);
}

export function normalizeMatrixSelf(raw: unknown): MatrixSelf {
  const out = emptyMatrixSelf();
  if (!raw || typeof raw !== "object") return out;
  const g = raw as Record<string, unknown>;
  out.s = isSLevel(g.s) ? g.s : "";
  out.m = isMLevel(g.m) ? g.m : "";
  out.transition = isTransitionKey(g.transition) ? g.transition : "";
  out.nextAxis = (["s", "m", "both"] as const).includes(g.nextAxis as never) ? (g.nextAxis as NextAxis) : "";
  out.nextAxisReason = str(g.nextAxisReason, 1000);
  const items = (g.items && typeof g.items === "object" ? g.items : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(items)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const evidence = (Array.isArray(o.evidence) ? o.evidence : []).map(normalizeEvidence).filter((e): e is Evidence => e !== null).slice(0, EVIDENCE_MAX);
    const status = o.status === "reached" || o.status === "in_progress" ? o.status : "";
    out.items[k] = { status, evidence };
  }
  return out;
}

export type ReachCheck = { ok: true } | { ok: false; reason: string };

/**
 * ルール1・2: 「到達」にできるか。
 *  - 根拠（日付＋場面）が最低1つ
 *  - 「安定して」「継続して」を含む項目は、直近2半期それぞれに根拠があること
 */
export function canMarkReached(item: AttainmentItem, self: ItemSelf, today: string): ReachCheck {
  const valid = self.evidence.filter(isValidEvidence);
  if (valid.length === 0) return { ok: false, reason: "「到達」にするには、根拠となる事実（日付・場面）を最低1つ入力してください" };
  if (item.stable) {
    const [cur, prev] = recentHalves(today);
    const halves = new Set(valid.map((e) => halfOf(e.date)));
    if (!halves.has(cur) || !halves.has(prev)) {
      return { ok: false, reason: `この項目は「安定して」「継続して」を含むため、直近2半期（${prev}・${cur}）それぞれの根拠が必要です` };
    }
  }
  return { ok: true };
}

/** 保存前の整合: 根拠が足りない「到達」は「途上」に戻す（画面でも選べないが、サーバーでも守る） */
export function enforceReachRules(self: MatrixSelf, today: string): MatrixSelf {
  if (!self.transition) return self;
  const items = { ...self.items };
  for (const item of attainmentItemsOf(self.transition)) {
    const cur = items[item.key];
    if (cur && cur.status === "reached" && !canMarkReached(item, cur, today).ok) items[item.key] = { ...cur, status: "in_progress" };
  }
  return { ...self, items };
}

// ─── 院長側（C-2）: 項目の確認と、合意した位置 ───

export type ItemReview = "" | "confirmed" | "dialogue";
export const ITEM_REVIEW_LABEL: Record<ItemReview, string> = { "": "未確認", confirmed: "確認", dialogue: "対話で確かめる" };
export type MeetingType = "half" | "annual";
export const MEETING_LABEL: Record<MeetingType, string> = { half: "半期面談（夏）", annual: "年次対話（冬）" };

export type AgreedPosition = { s: SLevel; m: MLevel; meeting: MeetingType; date: string; by: string; note: string };

export type MatrixReview = {
  userId: string;
  /** 項目キー → 確認／対話で確かめる */
  itemReviews: Record<string, ItemReview>;
  /** 合意した位置の履歴（新しい順） */
  agreed: AgreedPosition[];
  updatedAt: string;
  updatedBy: string;
};

export function normalizeMatrixReview(raw: unknown, userId: string): MatrixReview {
  const out: MatrixReview = { userId, itemReviews: {}, agreed: [], updatedAt: "", updatedBy: "" };
  if (!raw || typeof raw !== "object") return out;
  const g = raw as Record<string, unknown>;
  const ir = (g.itemReviews && typeof g.itemReviews === "object" ? g.itemReviews : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(ir)) if (v === "confirmed" || v === "dialogue") out.itemReviews[k] = v;
  if (Array.isArray(g.agreed)) {
    for (const a of g.agreed.slice(0, 50)) {
      const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
      if (!isSLevel(o.s) || !isMLevel(o.m)) continue;
      out.agreed.push({ s: o.s, m: o.m, meeting: o.meeting === "annual" ? "annual" : "half", date: ymdOf(o.date), by: str(o.by, 200), note: str(o.note, 500) });
    }
    out.agreed.sort((a, b) => b.date.localeCompare(a.date));
  }
  out.updatedAt = str(g.updatedAt, 40);
  out.updatedBy = str(g.updatedBy, 200);
  return out;
}

// ─── 等級・キャリアライン（D-1・院長が設定）───

export const CAREER_LINES = ["看護師", "マルチタスク医療事務", "その他"] as const;
export type StaffGrade = { userId: string; grade: Grade | ""; careerLine: string; updatedAt: string; updatedBy: string };
export function normalizeStaffGrade(raw: unknown, userId: string): StaffGrade {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { userId, grade: isGrade(g.grade) ? g.grade : "", careerLine: str(g.careerLine, 40), updatedAt: str(g.updatedAt, 40), updatedBy: str(g.updatedBy, 200) };
}

// ─── ゲート（B）───

export const GATE_KINDS = [
  { value: "course", label: "受講", hint: "紐づけた講座の学びの記録が1件以上あれば○" },
  { value: "per_year", label: "年あたり回数", hint: "直近1年の、紐づけた講座の受講回数が回数以上なら○" },
  { value: "license", label: "資格", hint: "紐づけた講座（資格）の学びの記録、または院長の確認で○" },
  { value: "director", label: "院長の確認", hint: "院長が確認日と根拠を記入して○" },
] as const;
export type GateKind = (typeof GATE_KINDS)[number]["value"];
export const isGateKind = (v: unknown): v is GateKind => GATE_KINDS.some((k) => k.value === v);
export const gateKindLabel = (k: GateKind) => GATE_KINDS.find((x) => x.value === k)?.label ?? k;

export type Gate = {
  id: string;
  transition: TransitionKey;
  label: string;
  kind: GateKind;
  /** 紐づけた講座（180の講座マスタ）。複数可 */
  courseIds: string[];
  /** 年あたり回数（kind=per_year） */
  perYearMin: number;
  order: number;
  createdAt: string;
  updatedAt: string;
};

export function normalizeGate(id: string, raw: unknown): Gate | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const label = str(g.label, 200).trim();
  if (!label || !isTransitionKey(g.transition)) return null;
  const kind = isGateKind(g.kind) ? g.kind : "director";
  const perYear = typeof g.perYearMin === "number" ? g.perYearMin : Number(g.perYearMin);
  return {
    id,
    transition: g.transition,
    label,
    kind,
    courseIds: Array.isArray(g.courseIds) ? g.courseIds.filter((x): x is string => typeof x === "string" && !!x).slice(0, 20) : [],
    perYearMin: kind === "per_year" ? Math.max(1, Math.min(99, Number.isFinite(perYear) && perYear > 0 ? Math.floor(perYear) : 1)) : 0,
    order: typeof g.order === "number" ? g.order : 0,
    createdAt: str(g.createdAt, 40),
    updatedAt: str(g.updatedAt, 40),
  };
}

/** 確定版 第4節の必須の学びから、初期登録用のゲート案（種類は文言から推定。講座の紐づけは院長） */
export function defaultGatesFromSpec(): Omit<Gate, "id" | "createdAt" | "updatedAt">[] {
  const out: Omit<Gate, "id" | "createdAt" | "updatedAt">[] = [];
  for (const t of TRANSITION_SPECS) {
    t.gates.forEach((label, i) => {
      const perYear = label.match(/年(\d)(?:〜\d)?回/);
      const kind: GateKind = /MBS|理解|院内講師|JPSA|会員|活動/.test(label) ? "director" : /検定|認定試験/.test(label) ? "license" : perYear ? "per_year" : "course";
      out.push({ transition: t.key, label, kind, courseIds: [], perYearMin: kind === "per_year" && perYear ? Number(perYear[1]) : 0, order: i + 1 });
    });
  }
  return out;
}

/** 院長の確認（kind=license/director）。1人×1ゲートに1件 */
export type GateCheck = { id: string; userId: string; gateId: string; ok: boolean; checkedOn: string; note: string; by: string; updatedAt: string };
export function normalizeGateCheck(id: string, raw: unknown): GateCheck | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const userId = str(g.userId, 100);
  const gateId = str(g.gateId, 100);
  if (!userId || !gateId) return null;
  return { id, userId, gateId, ok: g.ok === true, checkedOn: ymdOf(g.checkedOn), note: str(g.note, 500), by: str(g.by, 200), updatedAt: str(g.updatedAt, 40) };
}

export type GateResult = {
  gate: Gate;
  ok: boolean;
  /** 判定の元（本文ではなく、何で○×にしたか） */
  basis: string;
  /** ×のときに次に受けるべき講座名 */
  courseNames: string[];
  /** 直近1年の受講回数（per_year） */
  countLastYear: number;
  check: GateCheck | null;
};

type LearningLike = { courseId: string; dates: string[]; startDate: string };

/** ○×の判定（割合・点数にしない） */
export function judgeGate(gate: Gate, learning: LearningLike[], checks: GateCheck[], courseNameOf: (id: string) => string, today: string): GateResult {
  const mine = learning.filter((l) => gate.courseIds.includes(l.courseId));
  const check = checks.find((c) => c.gateId === gate.id) ?? null;
  const courseNames = gate.courseIds.map(courseNameOf).filter(Boolean);
  const since = new Date(`${today}T00:00:00Z`);
  since.setUTCFullYear(since.getUTCFullYear() - 1);
  const sinceYmd = since.toISOString().slice(0, 10);
  // 直近1年の受講回数＝参加日ごと（複数日の講座は1回として startDate で数える）
  const countLastYear = mine.filter((l) => (l.startDate || l.dates[0] || "") >= sinceYmd).length;
  if (gate.kind === "course") return { gate, ok: mine.length > 0, basis: mine.length > 0 ? `学びの記録 ${mine.length}件` : gate.courseIds.length ? "学びの記録なし" : "講座が紐づいていません", courseNames, countLastYear, check };
  if (gate.kind === "per_year") return { gate, ok: countLastYear >= gate.perYearMin, basis: `直近1年 ${countLastYear}回（必要 ${gate.perYearMin}回）`, courseNames, countLastYear, check };
  if (gate.kind === "license") {
    const ok = mine.length > 0 || !!check?.ok;
    return { gate, ok, basis: check?.ok ? `院長の確認 ${check.checkedOn}` : mine.length > 0 ? `学びの記録 ${mine.length}件` : "記録・確認なし", courseNames, countLastYear, check };
  }
  return { gate, ok: !!check?.ok, basis: check?.ok ? `院長の確認 ${check.checkedOn}` : "院長の確認待ち", courseNames, countLastYear, check };
}
