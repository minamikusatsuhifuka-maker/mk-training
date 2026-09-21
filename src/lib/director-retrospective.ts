// 院長の振り返り記録（指示書173）— 型・正規化・出力（純関数）とクライアント呼び出し
//
// 【この機能が扱うもの】
// 2022年の開業から現在までを「期」に区切り、期ごとに
//   出来事（クリニックの歴史）／施策台帳／時間管理スナップショット（四象限の配分）／権限委譲
// を記録して振り返るためのもの。**管理者（院長）専用**。赤裸々な内容を書く場所であり、
// スタッフの目に触れない前提（173-1）。
//
// 【人物評価を作らない（152の原則）】
// 権限委譲は「業務の移り変わり」の記録であって、人の評価ではない。
// 委譲先は**役割**で記録し、氏名は任意。人物評価の欄は型に存在させない。
//
// 【患者情報を入れない（154と同じ）】
// 患者氏名・カルテ番号のフィールドは存在しない。注意書き PATIENT_NOTICE を入力欄の上に常時表示する。
//
// 【当時の記録／振り返って記入の区別（173-2-4）】
// スナップショットは recordedMode を必ず持つ。既定は「振り返って記入」（後から思い出して書いたものを
// 「当時の記録」と偽らない方向に倒す）。グラフでは薄い色で区別する。
//
// このファイルは純関数とクライアント呼び出しだけ。サーバー専用の処理は director-retrospective-server.ts。
// 純関数部分はテストのため "@/..." を import しない。

// ─── 定数 ───

/** 入力欄の上に常時表示する注意書き（173-4-3・verbatim）。文言を変えない */
export const PATIENT_NOTICE =
  "患者様のお名前・カルテ番号など、患者様を特定できる情報は入力しないでください。";

export type RecordKind =
  | "period"
  | "event"
  | "initiative"
  | "snapshot"
  | "delegation";

export const RECORD_KINDS: RecordKind[] = [
  "period",
  "event",
  "initiative",
  "snapshot",
  "delegation",
];

export const KIND_LABEL: Record<RecordKind, string> = {
  period: "期",
  event: "出来事",
  initiative: "施策",
  snapshot: "時間管理スナップショット",
  delegation: "権限委譲",
};

export function isRecordKind(v: unknown): v is RecordKind {
  return typeof v === "string" && (RECORD_KINDS as string[]).includes(v);
}

// 出来事の種別（173-2-2）
export type EventKind =
  | "opening"
  | "relocation"
  | "incorporation"
  | "hiring"
  | "leaving"
  | "introduction"
  | "other";

export const EVENT_KINDS: { value: EventKind; label: string }[] = [
  { value: "opening", label: "開業" },
  { value: "relocation", label: "移転" },
  { value: "incorporation", label: "法人化" },
  { value: "hiring", label: "採用" },
  { value: "leaving", label: "退職" },
  { value: "introduction", label: "導入" },
  { value: "other", label: "その他" },
];

export function eventKindLabel(v: EventKind): string {
  return EVENT_KINDS.find((k) => k.value === v)?.label ?? "その他";
}

// 施策の状態（173-2-3）。「未完了」「中止」も同じ重さで記録できる
export type InitiativeStatus =
  | "planned"
  | "in_progress"
  | "done"
  | "incomplete"
  | "cancelled";

export const INITIATIVE_STATUSES: { value: InitiativeStatus; label: string }[] =
  [
    { value: "planned", label: "計画のみ" },
    { value: "in_progress", label: "実施中" },
    { value: "done", label: "完了" },
    { value: "incomplete", label: "未完了" },
    { value: "cancelled", label: "中止" },
  ];

export function initiativeStatusLabel(v: InitiativeStatus): string {
  return INITIATIVE_STATUSES.find((s) => s.value === v)?.label ?? v;
}

/** 四象限（1〜4）。0 = 未設定 */
export type Quadrant = 0 | 1 | 2 | 3 | 4;

export const QUADRANT_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "第1象限（緊急かつ重要）",
  2: "第2象限（緊急でないが重要）",
  3: "第3象限（緊急だが重要でない）",
  4: "第4象限（緊急でも重要でもない）",
};

export function quadrantShortLabel(q: 1 | 2 | 3 | 4): string {
  return `第${q}象限`;
}

// 権限委譲の状態（173-2-5）
export type DelegationStatus = "held" | "partial" | "full";

export const DELEGATION_STATUSES: { value: DelegationStatus; label: string }[] =
  [
    { value: "held", label: "院長が抱えている" },
    { value: "partial", label: "一部委譲" },
    { value: "full", label: "完全委譲" },
  ];

export function delegationStatusLabel(v: DelegationStatus): string {
  return DELEGATION_STATUSES.find((s) => s.value === v)?.label ?? v;
}

// スナップショットの記入時期（173-2-4）
export type RecordedMode = "contemporaneous" | "retrospective";

export const RECORDED_MODES: { value: RecordedMode; label: string }[] = [
  { value: "contemporaneous", label: "当時の記録" },
  { value: "retrospective", label: "振り返って記入" },
];

export function recordedModeLabel(v: RecordedMode): string {
  return v === "contemporaneous" ? "当時の記録" : "振り返って記入";
}

// ─── 型 ───

export type Period = {
  id: string;
  name: string;
  /** YYYY-MM */
  startYm: string;
  /** YYYY-MM。進行中は空 */
  endYm: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
};

export type ClinicEvent = {
  id: string;
  periodId: string;
  ym: string;
  content: string;
  kind: EventKind;
  createdAt: string;
  updatedAt: string;
};

export type Initiative = {
  id: string;
  periodId: string;
  name: string;
  plannedYm: string;
  doneYm: string;
  status: InitiativeStatus;
  aim: string;
  result: string;
  learning: string;
  quadrant: Quadrant;
  createdAt: string;
  updatedAt: string;
};

/** 四象限の配分（%）。4つとも整数で、合計100のときだけ有効 */
export type QuadrantShares = { q1: number; q2: number; q3: number; q4: number };

export type Snapshot = {
  id: string;
  periodId: string;
  method: string;
  reality: string;
  /** 未入力は null */
  shares: QuadrantShares | null;
  timeThief: string;
  focus: string;
  wentWrong: string;
  wentWell: string;
  feeling: string;
  recordedMode: RecordedMode;
  createdAt: string;
  updatedAt: string;
};

export type Delegation = {
  id: string;
  periodId: string;
  task: string;
  status: DelegationStatus;
  /** 委譲先は役割で記録する（173-2-5） */
  toRole: string;
  /** 氏名は任意。匿名化出力では空にする */
  toName: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
};

export type RetrospectiveData = {
  periods: Period[];
  events: ClinicEvent[];
  initiatives: Initiative[];
  snapshots: Snapshot[];
  delegations: Delegation[];
};

export function emptyRetrospectiveData(): RetrospectiveData {
  return { periods: [], events: [], initiatives: [], snapshots: [], delegations: [] };
}

export type RetrospectiveRecord =
  | { kind: "period"; record: Period }
  | { kind: "event"; record: ClinicEvent }
  | { kind: "initiative"; record: Initiative }
  | { kind: "snapshot"; record: Snapshot }
  | { kind: "delegation"; record: Delegation };

// ─── 正規化 ───

export const NAME_MAX = 120;
export const SUMMARY_MAX = 400;
export const SHORT_MAX = 200;
export const LONG_MAX = 4000;
export const ROLE_MAX = 60;

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** YYYY-MM だけを通す（それ以外は空） */
export function ym(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return YM_RE.test(s) ? s : "";
}

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}

export function normalizeQuadrant(v: unknown): Quadrant {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : 0;
}

/**
 * 四象限の配分を整える。4つとも 0〜100 の整数として読めるときだけ値を返す。
 * 合計が100かどうかは quadrantSharesValid で別に見る（画面で「あと◯%」を出すため）。
 */
export function normalizeShares(raw: unknown): QuadrantShares | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const out: number[] = [];
  for (const k of ["q1", "q2", "q3", "q4"]) {
    const v = g[k];
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < 0 || n > 100) return null;
    out.push(n);
  }
  return { q1: out[0], q2: out[1], q3: out[2], q4: out[3] };
}

export function sharesSum(s: QuadrantShares): number {
  return s.q1 + s.q2 + s.q3 + s.q4;
}

/** 合計100%のときだけグラフに載せる（173-2-4「合計100%になるよう入力補助」） */
export function quadrantSharesValid(s: QuadrantShares | null): s is QuadrantShares {
  return !!s && sharesSum(s) === 100;
}

export function normalizePeriod(id: string, raw: unknown): Period | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const name = text(g.name, NAME_MAX).trim();
  if (!name) return null;
  return {
    id,
    name,
    startYm: ym(g.startYm),
    endYm: ym(g.endYm),
    summary: text(g.summary, SUMMARY_MAX),
    createdAt: text(g.createdAt, 40),
    updatedAt: text(g.updatedAt, 40),
  };
}

export function normalizeEvent(id: string, raw: unknown): ClinicEvent | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const periodId = text(g.periodId, 100).trim();
  const content = text(g.content, LONG_MAX).trim();
  if (!periodId || !content) return null;
  return {
    id,
    periodId,
    ym: ym(g.ym),
    content,
    kind: pick(
      g.kind,
      EVENT_KINDS.map((k) => k.value),
      "other"
    ),
    createdAt: text(g.createdAt, 40),
    updatedAt: text(g.updatedAt, 40),
  };
}

export function normalizeInitiative(id: string, raw: unknown): Initiative | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const periodId = text(g.periodId, 100).trim();
  const name = text(g.name, NAME_MAX).trim();
  if (!periodId || !name) return null;
  return {
    id,
    periodId,
    name,
    plannedYm: ym(g.plannedYm),
    doneYm: ym(g.doneYm),
    status: pick(
      g.status,
      INITIATIVE_STATUSES.map((s) => s.value),
      "planned"
    ),
    aim: text(g.aim, LONG_MAX),
    result: text(g.result, LONG_MAX),
    learning: text(g.learning, LONG_MAX),
    quadrant: normalizeQuadrant(g.quadrant),
    createdAt: text(g.createdAt, 40),
    updatedAt: text(g.updatedAt, 40),
  };
}

export function normalizeSnapshot(id: string, raw: unknown): Snapshot | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const periodId = text(g.periodId, 100).trim();
  if (!periodId) return null;
  return {
    id,
    periodId,
    method: text(g.method, LONG_MAX),
    reality: text(g.reality, LONG_MAX),
    shares: normalizeShares(g.shares),
    timeThief: text(g.timeThief, LONG_MAX),
    focus: text(g.focus, LONG_MAX),
    wentWrong: text(g.wentWrong, LONG_MAX),
    wentWell: text(g.wentWell, LONG_MAX),
    feeling: text(g.feeling, LONG_MAX),
    // 既定は「振り返って記入」。後から書いたものを「当時の記録」と偽らない方向に倒す
    recordedMode: g.recordedMode === "contemporaneous" ? "contemporaneous" : "retrospective",
    createdAt: text(g.createdAt, 40),
    updatedAt: text(g.updatedAt, 40),
  };
}

export function normalizeDelegation(id: string, raw: unknown): Delegation | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const periodId = text(g.periodId, 100).trim();
  const task = text(g.task, NAME_MAX).trim();
  if (!periodId || !task) return null;
  return {
    id,
    periodId,
    task,
    status: pick(
      g.status,
      DELEGATION_STATUSES.map((s) => s.value),
      "held"
    ),
    toRole: text(g.toRole, ROLE_MAX).trim(),
    toName: text(g.toName, ROLE_MAX).trim(),
    memo: text(g.memo, LONG_MAX),
    createdAt: text(g.createdAt, 40),
    updatedAt: text(g.updatedAt, 40),
  };
}

export function normalizeRecord(
  kind: RecordKind,
  id: string,
  raw: unknown
): RetrospectiveRecord | null {
  switch (kind) {
    case "period": {
      const r = normalizePeriod(id, raw);
      return r ? { kind, record: r } : null;
    }
    case "event": {
      const r = normalizeEvent(id, raw);
      return r ? { kind, record: r } : null;
    }
    case "initiative": {
      const r = normalizeInitiative(id, raw);
      return r ? { kind, record: r } : null;
    }
    case "snapshot": {
      const r = normalizeSnapshot(id, raw);
      return r ? { kind, record: r } : null;
    }
    case "delegation": {
      const r = normalizeDelegation(id, raw);
      return r ? { kind, record: r } : null;
    }
  }
}

/** 保存できない理由（空なら保存可）。サーバーの書き込み前に必ず通す */
export function validateRecord(rec: RetrospectiveRecord): string {
  switch (rec.kind) {
    case "period":
      if (!rec.record.startYm) return "開始年月（YYYY-MM）を入力してください";
      if (rec.record.endYm && rec.record.endYm < rec.record.startYm) {
        return "終了年月は開始年月より後にしてください";
      }
      return "";
    case "event":
      if (!rec.record.ym) return "年月（YYYY-MM）を入力してください";
      return "";
    case "snapshot":
      if (rec.record.shares && !quadrantSharesValid(rec.record.shares)) {
        return `四象限の配分は合計100%にしてください（現在 ${sharesSum(rec.record.shares)}%）`;
      }
      return "";
    default:
      return "";
  }
}

// ─── 並び替え・集計（純関数）───

/** 期は開始年月の昇順（同じなら作成順） */
export function sortPeriods(list: Period[]): Period[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        a.startYm.localeCompare(b.startYm) || a.createdAt.localeCompare(b.createdAt)
    );
}

export function sortEvents(list: ClinicEvent[]): ClinicEvent[] {
  return list
    .slice()
    .sort((a, b) => a.ym.localeCompare(b.ym) || a.createdAt.localeCompare(b.createdAt));
}

/** 施策は「計画した時期 → 実施した時期 → 作成順」 */
export function sortInitiatives(list: Initiative[]): Initiative[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        (a.plannedYm || a.doneYm).localeCompare(b.plannedYm || b.doneYm) ||
        a.createdAt.localeCompare(b.createdAt)
    );
}

export function sortDelegations(list: Delegation[]): Delegation[] {
  return list
    .slice()
    .sort((a, b) => a.task.localeCompare(b.task, "ja") || a.createdAt.localeCompare(b.createdAt));
}

export function periodRangeLabel(p: Period): string {
  if (!p.startYm) return "";
  return `${p.startYm} 〜 ${p.endYm || "現在"}`;
}

/** 期ごとのスナップショット（1期1件。複数あれば更新日時が新しいもの） */
export function snapshotOfPeriod(
  snapshots: Snapshot[],
  periodId: string
): Snapshot | null {
  const list = snapshots
    .filter((s) => s.periodId === periodId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return list[0] ?? null;
}

/** 四象限の推移グラフ用（173-3-1）。期の順に、配分と記入時期を並べる */
export type QuadrantChartRow = {
  periodId: string;
  label: string;
  shares: QuadrantShares | null;
  recordedMode: RecordedMode | null;
};

export function buildQuadrantChartRows(data: RetrospectiveData): QuadrantChartRow[] {
  return sortPeriods(data.periods).map((p) => {
    const s = snapshotOfPeriod(data.snapshots, p.id);
    return {
      periodId: p.id,
      label: p.name,
      shares: s && quadrantSharesValid(s.shares) ? s.shares : null,
      recordedMode: s ? s.recordedMode : null,
    };
  });
}

/** 権限委譲の推移用（173-3-2）。期ごとの状態別件数 */
export type DelegationChartRow = {
  periodId: string;
  label: string;
  counts: Record<DelegationStatus, number>;
};

export function buildDelegationChartRows(data: RetrospectiveData): DelegationChartRow[] {
  return sortPeriods(data.periods).map((p) => {
    const counts: Record<DelegationStatus, number> = { held: 0, partial: 0, full: 0 };
    for (const d of data.delegations) {
      if (d.periodId === p.id) counts[d.status] += 1;
    }
    return { periodId: p.id, label: p.name, counts };
  });
}

/** 施策の状態一覧用（173-3-3）。期ごとの状態別件数 */
export type InitiativeStatusRow = {
  periodId: string;
  label: string;
  counts: Record<InitiativeStatus, number>;
};

export function buildInitiativeStatusRows(data: RetrospectiveData): InitiativeStatusRow[] {
  return sortPeriods(data.periods).map((p) => {
    const counts: Record<InitiativeStatus, number> = {
      planned: 0,
      in_progress: 0,
      done: 0,
      incomplete: 0,
      cancelled: 0,
    };
    for (const i of data.initiatives) {
      if (i.periodId === p.id) counts[i.status] += 1;
    }
    return { periodId: p.id, label: p.name, counts };
  });
}

// ─── 匿名化（173-4-2）───
//
// 登録済みスタッフの氏名を役割名に置き換える。対象は出力するすべての文章
//（委譲先・出来事・自由記述）。委譲先の「氏名」欄は丸ごと空にする（役割欄が残る）。
//
// 置換の単位: 氏名そのもの／空白を除いた氏名／姓（氏名が空白で分かれていて、姓が2文字以上のとき）。
// 長い候補から順に置き換える（「山田 太郎」を先に処理してから「山田」を処理する）。
// 1文字の姓・名は対象にしない（無関係な語を壊すため）。

export type RosterEntry = {
  name: string;
  /** 役割名。空なら「スタッフ」 */
  roleLabel: string;
};

const DEFAULT_ROLE_LABEL = "スタッフ";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 氏名から置換候補（長い順・重複なし）を作る */
export function nameVariants(name: string): string[] {
  const full = name.trim().replace(/\s+/g, " ");
  if (!full) return [];
  const out = new Set<string>();
  if (full.length >= 2) out.add(full);
  const compact = full.replace(/[\s　]/g, "");
  if (compact.length >= 2) out.add(compact);
  // 全角空白でも区切れるようにしてから姓を取り出す
  const parts = full.replace(/　/g, " ").split(" ").filter(Boolean);
  if (parts.length >= 2 && parts[0].length >= 2) out.add(parts[0]);
  return Array.from(out).sort((a, b) => b.length - a.length);
}

export type NameReplacer = (text: string) => string;

export function buildNameReplacer(roster: RosterEntry[]): NameReplacer {
  const rules: { pattern: RegExp; to: string }[] = [];
  const seen = new Set<string>();
  const entries = roster
    .map((r) => ({ name: r.name.trim(), roleLabel: r.roleLabel.trim() || DEFAULT_ROLE_LABEL }))
    .filter((r) => r.name);
  // 候補を集めて長い順に並べる（姓だけの候補が先に当たって氏名が半端に残らないように）
  const candidates: { variant: string; to: string }[] = [];
  for (const e of entries) {
    for (const v of nameVariants(e.name)) {
      if (seen.has(v)) continue;
      seen.add(v);
      candidates.push({ variant: v, to: e.roleLabel });
    }
  }
  candidates.sort((a, b) => b.variant.length - a.variant.length);
  for (const c of candidates) {
    rules.push({ pattern: new RegExp(escapeRegExp(c.variant), "g"), to: c.to });
  }
  return (text: string) => {
    if (!text) return text;
    let out = text;
    for (const r of rules) out = out.replace(r.pattern, r.to);
    return out;
  };
}

// ─── Markdown 出力（173-4-1）───
//
// 選んだ期を時系列に、期ごとに 出来事 → 時間管理スナップショット → 施策 → 権限委譲 の順で1本にする。
// 表は使わない（自由記述に改行が入るため。箇条書きと見出しだけで組む）。

export type ExportOptions = {
  periodIds: string[] | null; // null = 全期
  anonymize: boolean;
  replacer: NameReplacer | null;
  /** 出力日（YYYY-MM-DD）。テストで固定できるよう引数にする */
  today: string;
};

function block(label: string, value: string, r: NameReplacer | null): string[] {
  const v = (r ? r(value) : value).trim();
  if (!v) return [`- ${label}: （未記入）`];
  if (!v.includes("\n")) return [`- ${label}: ${v}`];
  return [`- ${label}:`, ...v.split("\n").map((line) => `  ${line}`)];
}

export function buildRetrospectiveMarkdown(
  data: RetrospectiveData,
  opts: ExportOptions
): string {
  const r = opts.anonymize ? opts.replacer : null;
  const rep = (s: string) => (r ? r(s) : s);
  const periods = sortPeriods(data.periods).filter(
    (p) => !opts.periodIds || opts.periodIds.includes(p.id)
  );
  const lines: string[] = [];
  lines.push("# 院長の振り返り記録");
  lines.push("");
  lines.push(`- 出力日: ${opts.today}`);
  lines.push(
    `- 対象: ${opts.periodIds ? `${periods.length}期を選択` : `全期（${periods.length}期）`}`
  );
  lines.push(
    `- スタッフ氏名の匿名化: ${opts.anonymize ? "ON（登録済みスタッフの氏名を役割に置換）" : "OFF"}`
  );
  lines.push("");

  for (const p of periods) {
    lines.push(`## ${rep(p.name)}${p.startYm ? `（${periodRangeLabel(p)}）` : ""}`);
    lines.push("");
    if (p.summary.trim()) {
      lines.push(rep(p.summary.trim()));
      lines.push("");
    }

    // 出来事
    lines.push("### 出来事");
    const events = sortEvents(data.events.filter((e) => e.periodId === p.id));
    if (events.length === 0) lines.push("- （記録なし）");
    for (const e of events) {
      const body = rep(e.content.trim());
      const first = body.split("\n")[0];
      const rest = body.split("\n").slice(1);
      lines.push(`- ${e.ym} 【${eventKindLabel(e.kind)}】 ${first}`);
      for (const l of rest) lines.push(`  ${l}`);
    }
    lines.push("");

    // 時間管理スナップショット
    const s = snapshotOfPeriod(data.snapshots, p.id);
    lines.push(
      `### 時間管理スナップショット${s ? `（${recordedModeLabel(s.recordedMode)}）` : ""}`
    );
    if (!s) {
      lines.push("- （記録なし）");
    } else {
      lines.push(...block("当時の方法", s.method, r));
      lines.push(...block("当時の実情", s.reality, r));
      if (quadrantSharesValid(s.shares)) {
        lines.push(
          `- 四象限の配分: 第1 ${s.shares.q1}% ／ 第2 ${s.shares.q2}% ／ 第3 ${s.shares.q3}% ／ 第4 ${s.shares.q4}%`
        );
      } else {
        lines.push("- 四象限の配分: （未入力）");
      }
      lines.push(...block("最も時間を奪われていたこと", s.timeThief, r));
      lines.push(...block("注力していたこと", s.focus, r));
      lines.push(...block("うまくいかなかったこと", s.wentWrong, r));
      lines.push(...block("うまくいったこと", s.wentWell, r));
      lines.push(...block("当時の気持ち", s.feeling, r));
    }
    lines.push("");

    // 施策
    lines.push("### 施策");
    const inits = sortInitiatives(data.initiatives.filter((i) => i.periodId === p.id));
    if (inits.length === 0) lines.push("- （記録なし）");
    for (const i of inits) {
      const q = i.quadrant ? ` ／ ${quadrantShortLabel(i.quadrant)}` : "";
      lines.push(`#### ${rep(i.name)} ［${initiativeStatusLabel(i.status)}］${q}`);
      lines.push(
        `- 計画した時期: ${i.plannedYm || "—"} ／ 実施した時期: ${i.doneYm || "—"}`
      );
      lines.push(...block("狙い", i.aim, r));
      lines.push(...block("結果", i.result, r));
      lines.push(...block("学び", i.learning, r));
      lines.push("");
    }
    if (inits.length === 0) lines.push("");

    // 権限委譲
    lines.push("### 権限委譲");
    const dels = sortDelegations(data.delegations.filter((d) => d.periodId === p.id));
    if (dels.length === 0) lines.push("- （記録なし）");
    for (const d of dels) {
      const to = [
        d.toRole ? rep(d.toRole) : "",
        // 匿名化ONでは氏名欄を丸ごと落とす（役割で語る）
        !opts.anonymize && d.toName ? `（${d.toName}）` : "",
      ]
        .filter(Boolean)
        .join("");
      lines.push(
        `- ${rep(d.task)} — ${delegationStatusLabel(d.status)}${to ? ` → ${to}` : ""}`
      );
      const memo = rep(d.memo).trim();
      if (memo) for (const l of memo.split("\n")) lines.push(`  ${l}`);
    }
    lines.push("");
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

// ─── 操作ログ（159/169と同じ仕組み）───
//
// 記録するのは「誰が・いつ・どの種類の・どの記録を・登録／更新／削除／出力したか」と、
// どの項目が「空 ⇄ 記載あり」または「変更された」か。**本文そのものは残さない**
//（赤裸々な内容がログという第二の台帳に残り続けないように）。対象の名前だけは識別のために残す。

export type RetrospectiveLogChange = { field: string; before: string; after: string };

export type RetrospectiveLog = {
  id: string;
  at: string;
  by: string;
  /** 登録／更新／削除／出力 */
  action: string;
  kind: string;
  target: string;
  changes: RetrospectiveLogChange[];
};

export const RETRO_LOG_PAGE_SIZE = 100;

export function normalizeRetrospectiveLog(id: string, raw: unknown): RetrospectiveLog | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const rawChanges = Array.isArray(g.changes) ? g.changes : [];
  return {
    id,
    at: text(g.at, 40),
    by: text(g.by, 200),
    action: text(g.action, 40),
    kind: text(g.kind, 40),
    target: text(g.target, NAME_MAX),
    changes: rawChanges.slice(0, 40).map((c) => {
      const e = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return {
        field: text(e.field, 60),
        before: text(e.before, 200),
        after: text(e.after, 200),
      };
    }),
  };
}

function presence(v: string): string {
  return v.trim() ? "記載あり" : "空";
}

function presenceChange(
  changes: RetrospectiveLogChange[],
  field: string,
  before: string,
  after: string
): void {
  if (before === after) return;
  changes.push({
    field,
    before: presence(before),
    after: before.trim() && after.trim() ? "記載あり（変更）" : presence(after),
  });
}

function valueChange(
  changes: RetrospectiveLogChange[],
  field: string,
  before: string,
  after: string
): void {
  if (before === after) return;
  changes.push({ field, before: before || "—", after: after || "—" });
}

/** 記録の表示名（ログの対象欄） */
export function recordTitle(rec: RetrospectiveRecord): string {
  switch (rec.kind) {
    case "period":
      return rec.record.name;
    case "event":
      return `${rec.record.ym} ${rec.record.content.split("\n")[0].slice(0, 40)}`;
    case "initiative":
      return rec.record.name;
    case "snapshot":
      return "時間管理スナップショット";
    case "delegation":
      return rec.record.task;
  }
}

/** 変更前後の差分（本文は残さない） */
export function buildRecordChanges(
  prev: RetrospectiveRecord | null,
  next: RetrospectiveRecord
): RetrospectiveLogChange[] {
  const c: RetrospectiveLogChange[] = [];
  switch (next.kind) {
    case "period": {
      const a = prev?.kind === "period" ? prev.record : null;
      valueChange(c, "名称", a?.name ?? "", next.record.name);
      valueChange(c, "開始年月", a?.startYm ?? "", next.record.startYm);
      valueChange(c, "終了年月", a?.endYm ?? "", next.record.endYm);
      presenceChange(c, "一言要約", a?.summary ?? "", next.record.summary);
      break;
    }
    case "event": {
      const a = prev?.kind === "event" ? prev.record : null;
      valueChange(c, "年月", a?.ym ?? "", next.record.ym);
      valueChange(
        c,
        "種別",
        a ? eventKindLabel(a.kind) : "",
        eventKindLabel(next.record.kind)
      );
      presenceChange(c, "内容", a?.content ?? "", next.record.content);
      break;
    }
    case "initiative": {
      const a = prev?.kind === "initiative" ? prev.record : null;
      valueChange(c, "施策名", a?.name ?? "", next.record.name);
      valueChange(c, "計画した時期", a?.plannedYm ?? "", next.record.plannedYm);
      valueChange(c, "実施した時期", a?.doneYm ?? "", next.record.doneYm);
      valueChange(
        c,
        "状態",
        a ? initiativeStatusLabel(a.status) : "",
        initiativeStatusLabel(next.record.status)
      );
      valueChange(
        c,
        "四象限",
        a?.quadrant ? quadrantShortLabel(a.quadrant) : "",
        next.record.quadrant ? quadrantShortLabel(next.record.quadrant) : ""
      );
      presenceChange(c, "狙い", a?.aim ?? "", next.record.aim);
      presenceChange(c, "結果", a?.result ?? "", next.record.result);
      presenceChange(c, "学び", a?.learning ?? "", next.record.learning);
      break;
    }
    case "snapshot": {
      const a = prev?.kind === "snapshot" ? prev.record : null;
      valueChange(
        c,
        "記入時期",
        a ? recordedModeLabel(a.recordedMode) : "",
        recordedModeLabel(next.record.recordedMode)
      );
      const fmt = (s: QuadrantShares | null) =>
        s ? `${s.q1}/${s.q2}/${s.q3}/${s.q4}` : "";
      valueChange(c, "四象限の配分", fmt(a?.shares ?? null), fmt(next.record.shares));
      presenceChange(c, "当時の方法", a?.method ?? "", next.record.method);
      presenceChange(c, "当時の実情", a?.reality ?? "", next.record.reality);
      presenceChange(c, "最も時間を奪われていたこと", a?.timeThief ?? "", next.record.timeThief);
      presenceChange(c, "注力していたこと", a?.focus ?? "", next.record.focus);
      presenceChange(c, "うまくいかなかったこと", a?.wentWrong ?? "", next.record.wentWrong);
      presenceChange(c, "うまくいったこと", a?.wentWell ?? "", next.record.wentWell);
      presenceChange(c, "当時の気持ち", a?.feeling ?? "", next.record.feeling);
      break;
    }
    case "delegation": {
      const a = prev?.kind === "delegation" ? prev.record : null;
      valueChange(c, "業務", a?.task ?? "", next.record.task);
      valueChange(
        c,
        "状態",
        a ? delegationStatusLabel(a.status) : "",
        delegationStatusLabel(next.record.status)
      );
      valueChange(c, "委譲先（役割）", a?.toRole ?? "", next.record.toRole);
      // 氏名はログに残さない（記載の有無だけ）
      presenceChange(c, "委譲先（氏名）", a?.toName ?? "", next.record.toName);
      presenceChange(c, "備考", a?.memo ?? "", next.record.memo);
      break;
    }
  }
  return c;
}

// ─── クライアント → /api/director-retrospective 呼び出しヘルパ ───

export type RetrospectiveListResponse = RetrospectiveData & {
  isAdmin: boolean;
  tableMissing: boolean;
};

async function callApi<T>(
  init: RequestInit & { path?: string; query?: string }
): Promise<T> {
  const { path = "", query = "", ...rest } = init;
  const res = await fetch(`/api/director-retrospective${path}${query}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: rest.body ? { "Content-Type": "application/json" } : undefined,
    ...rest,
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(j.error || `通信に失敗しました (${res.status})`);
  }
  return j;
}

export async function fetchRetrospective(): Promise<RetrospectiveListResponse> {
  return callApi<RetrospectiveListResponse>({ method: "GET" });
}

export type RecordInput = Record<string, unknown>;

export async function createRetrospectiveRecord(
  kind: RecordKind,
  input: RecordInput
): Promise<RetrospectiveRecord> {
  return callApi<RetrospectiveRecord>({
    method: "POST",
    body: JSON.stringify({ kind, ...input }),
  });
}

export async function patchRetrospectiveRecord(
  kind: RecordKind,
  id: string,
  input: RecordInput
): Promise<RetrospectiveRecord> {
  return callApi<RetrospectiveRecord>({
    method: "PATCH",
    body: JSON.stringify({ kind, id, ...input }),
  });
}

export async function deleteRetrospectiveRecord(
  kind: RecordKind,
  id: string
): Promise<{ ok: true; deleted: number }> {
  return callApi<{ ok: true; deleted: number }>({
    method: "DELETE",
    query: `?kind=${encodeURIComponent(kind)}&id=${encodeURIComponent(id)}`,
  });
}

/** Markdown出力（管理者のみ）。ダウンロードは呼び出し側が開始する */
export async function fetchRetrospectiveMarkdown(opts: {
  periodIds: string[] | null;
  anonymize: boolean;
}): Promise<{ text: string; filename: string }> {
  const params = new URLSearchParams();
  if (opts.periodIds) params.set("periods", opts.periodIds.join(","));
  params.set("anonymize", opts.anonymize ? "1" : "0");
  const res = await fetch(`/api/director-retrospective/export?${params.toString()}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || `出力に失敗しました (${res.status})`);
  }
  const text = await res.text();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const filename = m ? decodeURIComponent(m[1]) : "director-retrospective.md";
  return { text, filename };
}

export async function fetchRetrospectiveLogs(before?: string): Promise<{
  logs: RetrospectiveLog[];
  tableMissing: boolean;
}> {
  const qs = before ? `?before=${encodeURIComponent(before)}` : "";
  const res = await fetch(`/api/admin/director-retrospective-logs${qs}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("操作ログを取得できませんでした");
  return (await res.json()) as { logs: RetrospectiveLog[]; tableMissing: boolean };
}
