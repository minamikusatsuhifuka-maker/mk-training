// 📜 当院の歩み（指示書253）— 純関数・定義の正本（画面とサーバーの両方から使う）
//
// 【ねらい】ガントチャートの計画を、当院の歩み・歴史として残す。これから入る仲間に、歩み・思想・考え方を伝える。
//   管理画面の売上の「📈 クリニックの歩み」とは別のもの。
// 【書く人】院長と、委任の設定で「📜 当院の歩み」を任された幹部。入口の文を直せるのは院長だけ。
//   関わった人の声は、その出来事の「関わった人」に選ばれた本人が自分の分だけ。声を消すのは院長と任された幹部も。
// 【保存先】clinic_staff_growth（record_type ayumi_entry ／ ayumi_voice ／ ayumi_intro ／ ayumi_dismissed）。新しい表は作らない。
// 【写真】228（お知らせ・イベント）と同じ置き場・同じ下ごしらえ（端末で描き直す・HEICはJPEG・サーバーで位置情報などを消す）。

import { VALUE_GROUPS } from "./ayumi-intro-text";

export { VALUE_GROUPS };

/** 選べる言葉（すべて） */
export const VALUE_WORDS: readonly string[] = VALUE_GROUPS.flatMap((g) => g.words);

// ─── 日付（年月日・年月・年のどれでもよい。期間でもよい）───

const DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** "2019" / "2019-06" / "2019-06-01" のどれかなら true（ない日付は不可） */
export function isFlexDate(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = DATE_RE.exec(v);
  if (!m) return false;
  const y = Number(m[1]);
  if (y < 1900 || y > 2200) return false;
  if (m[2]) {
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) return false;
    if (m[3]) {
      const d = new Date(`${v}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
    }
  }
  return true;
}

/** 「2019年」「2019年6月」「2019年6月1日」 */
export function flexDateLabel(v: string): string {
  const m = DATE_RE.exec(v);
  if (!m) return "";
  return `${Number(m[1])}年${m[2] ? `${Number(m[2])}月` : ""}${m[3] ? `${Number(m[3])}日` : ""}`;
}

/** 「2019年6月1日」／「2026年10月〜2027年3月」（終わりの年が同じなら年を省く） */
export function periodText(from: string, to: string): string {
  if (!to || to === from) return flexDateLabel(from);
  const a = flexDateLabel(from);
  const b = flexDateLabel(to);
  const sameYear = from.slice(0, 4) === to.slice(0, 4) && to.length > 4;
  return `${a}〜${sameYear ? b.replace(/^\d{4}年/, "") : b}`;
}

/** 並べるための鍵（年だけ＜年月＜年月日 の順で、同じ年の中では年だけのものを先に） */
export function sortKey(from: string): string {
  const m = DATE_RE.exec(from);
  if (!m) return "9999-99-99";
  return `${m[1]}-${m[2] ?? "00"}-${m[3] ?? "00"}`;
}

export function yearOf(from: string): string {
  return from.slice(0, 4);
}

/** ガントチャートの日付（YYYY-MM-DD）を歩みの日付に。そのまま使う */
export function fromGanttDate(ymd: string): string {
  return isFlexDate(ymd) ? ymd : "";
}

// ─── 1件 ───

export type AyumiPerson = { id: string; name: string };

export type AyumiPhoto = {
  path: string;
  name: string;
  size: number;
  uploadedAt: string;
  /** 見るための短い時間だけ有効なリンク（サーバーが付ける・保存しない） */
  url?: string;
};

export type AyumiEntry = {
  id: string;
  /** 必ず入れる */
  title: string;
  /** 日付（年・年月・年月日）。期間なら dateTo も */
  dateFrom: string;
  dateTo: string;
  /** ガントチャートの分類の id（空＝分類なし） */
  categoryId: string;
  /** 込めた想い・学び */
  thoughts: string;
  /** 成果・変化 */
  outcome: string;
  /** 新しく入る人へのひとこと */
  message: string;
  /** 理念とのつながり（VALUE_WORDS の中から） */
  values: string[];
  photos: AyumiPhoto[];
  /** 関わった人：チーム名 */
  teamName: string;
  /** 関わった人：スタッフの一覧から選んだ人（この人たちが「関わった人の声」を書ける） */
  people: AyumiPerson[];
  /** 関わった人：もう在籍していない人など（文字） */
  otherPeople: string;
  /** ガントチャートから写したとき（写したあとは別に残る） */
  source?: { kind: "gantt"; planId: string };
  /** 検証用アカウントが作った（本物のスタッフには出さない・237） */
  testSeed?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const TITLE_MAX = 80;
export const LONG_TEXT_MAX = 4000;
export const OTHER_PEOPLE_MAX = 300;
export const TEAM_NAME_MAX = 60;
export const PEOPLE_MAX = 60;
export const VOICE_MAX = 200;
export const PHOTO_MAX_COUNT = 10;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function normalizePeople(raw: unknown): AyumiPerson[] {
  if (!Array.isArray(raw)) return [];
  const out: AyumiPerson[] = [];
  for (const v of raw) {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.slice(0, 64) : "";
    if (!id || out.some((p) => p.id === id)) continue;
    out.push({ id, name: str(o.name, 60) });
    if (out.length >= PEOPLE_MAX) break;
  }
  return out;
}

function normalizePhotos(raw: unknown): AyumiPhoto[] {
  if (!Array.isArray(raw)) return [];
  const out: AyumiPhoto[] = [];
  for (const v of raw) {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const path = typeof o.path === "string" ? o.path : "";
    if (!path || out.some((p) => p.path === path)) continue;
    out.push({ path, name: str(o.name, 120), size: typeof o.size === "number" ? o.size : 0, uploadedAt: str(o.uploadedAt, 40) });
    if (out.length >= PHOTO_MAX_COUNT) break;
  }
  return out;
}

/** 保存値・送られてきた値を1件に整える。題名・日付が無いものは成り立たないので null */
export function normalizeEntry(id: string, raw: unknown): AyumiEntry | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const title = str(o.title, TITLE_MAX).trim();
  const dateFrom = isFlexDate(o.dateFrom) ? o.dateFrom : "";
  if (!id || !title || !dateFrom) return null;
  let dateTo = isFlexDate(o.dateTo) ? o.dateTo : "";
  if (dateTo && sortKey(dateTo) < sortKey(dateFrom)) dateTo = "";
  if (dateTo === dateFrom) dateTo = "";
  const values = Array.isArray(o.values) ? [...new Set(o.values.filter((v): v is string => typeof v === "string" && VALUE_WORDS.includes(v)))] : [];
  const src = o.source as { kind?: unknown; planId?: unknown } | undefined;
  return {
    id,
    title,
    dateFrom,
    dateTo,
    categoryId: str(o.categoryId, 40),
    thoughts: str(o.thoughts, LONG_TEXT_MAX),
    outcome: str(o.outcome, LONG_TEXT_MAX),
    message: str(o.message, LONG_TEXT_MAX),
    values: VALUE_WORDS.filter((w) => values.includes(w)), // 並びは言葉の一覧の順
    photos: normalizePhotos(o.photos),
    teamName: str(o.teamName, TEAM_NAME_MAX).trim(),
    people: normalizePeople(o.people),
    otherPeople: str(o.otherPeople, OTHER_PEOPLE_MAX),
    ...(src && src.kind === "gantt" && typeof src.planId === "string" ? { source: { kind: "gantt" as const, planId: src.planId.slice(0, 80) } } : {}),
    ...(o.testSeed === true ? { testSeed: true } : {}),
    createdBy: str(o.createdBy, 64),
    createdAt: str(o.createdAt, 40),
    updatedAt: str(o.updatedAt, 40),
  };
}

/** 書く人が送ってよい項目 */
export type EntryFields = Partial<
  Pick<AyumiEntry, "title" | "dateFrom" | "dateTo" | "categoryId" | "thoughts" | "outcome" | "message" | "values" | "teamName" | "people" | "otherPeople">
>;

export const ENTRY_FIELD_KEYS = ["title", "dateFrom", "dateTo", "categoryId", "thoughts", "outcome", "message", "values", "teamName", "people", "otherPeople"] as const;

export function genEntryId(now = Date.now(), rand = Math.random()): string {
  return `ay-${now.toString(36)}${Math.floor(rand * 1e8).toString(36)}`;
}

/** 並べる（古い順が既定） */
export function sortEntries(entries: AyumiEntry[], order: "old" | "new"): AyumiEntry[] {
  const s = [...entries].sort(
    (a, b) => sortKey(a.dateFrom).localeCompare(sortKey(b.dateFrom)) || a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title, "ja")
  );
  return order === "new" ? s.reverse() : s;
}

/** 年ごとにまとめる（並びはそのまま） */
export function groupByYear(entries: AyumiEntry[]): { year: string; entries: AyumiEntry[] }[] {
  const out: { year: string; entries: AyumiEntry[] }[] = [];
  for (const e of entries) {
    const y = yearOf(e.dateFrom);
    const last = out[out.length - 1];
    if (last && last.year === y) last.entries.push(e);
    else out.push({ year: y, entries: [e] });
  }
  return out;
}

export type AyumiFilter = { value: string; categoryId: string; year: string };

export function filterEntries(entries: AyumiEntry[], f: AyumiFilter): AyumiEntry[] {
  return entries.filter(
    (e) =>
      (!f.value || e.values.includes(f.value)) &&
      (!f.categoryId || e.categoryId === f.categoryId) &&
      (!f.year || yearOf(e.dateFrom) === f.year)
  );
}

/** カードに出す「込めた想い・学び」のはじめの数行（続きがあれば「…」） */
export function excerpt(s: string, lines = 3, chars = 120): string {
  const all = s.split(/\r?\n/).filter((l) => l.trim());
  const t = all.slice(0, lines).join("\n");
  if (t.length > chars) return `${t.slice(0, chars)}…`;
  return all.length > lines ? `${t}…` : t;
}

// ─── 関わった人の声 ───

export type AyumiVoice = {
  entryId: string;
  userId: string;
  name: string;
  /** 200字まで */
  text: string;
  testSeed?: boolean;
  updatedAt: string;
};

export function voiceId(entryId: string, userId: string): string {
  return `av-${entryId}-${userId}`;
}

export function normalizeVoice(raw: unknown): AyumiVoice | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const entryId = str(o.entryId, 80);
  const userId = str(o.userId, 64);
  const text = str(o.text, VOICE_MAX).trim();
  if (!entryId || !userId || !text) return null;
  return { entryId, userId, name: str(o.name, 60), text, ...(o.testSeed === true ? { testSeed: true } : {}), updatedAt: str(o.updatedAt, 40) };
}

/** 声を書けるのは「関わった人」に選ばれた本人だけ */
export function canWriteVoice(e: Pick<AyumiEntry, "people">, userId: string): boolean {
  return e.people.some((p) => p.id === userId);
}

// ─── 入口の文 ───

export type AyumiIntro = {
  /** コアメッセージ（院長が直したもの。null＝元の文） */
  messages: string[] | null;
  /** コアヒストリー：P.30 の前／あと（null＝元の文） */
  before: string | null;
  after: string | null;
  /** 【P.30】院長が書き足す（空のあいだはスタッフに出さない） */
  p30: string;
  updatedAt: string;
};

export const INTRO_TEXT_MAX = 12000;

export function normalizeIntro(raw: unknown): AyumiIntro {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const msgs = Array.isArray(o.messages) ? o.messages.filter((m): m is string => typeof m === "string").map((m) => m.slice(0, 200)).slice(0, 20) : null;
  return {
    messages: msgs,
    before: typeof o.before === "string" ? o.before.slice(0, INTRO_TEXT_MAX) : null,
    after: typeof o.after === "string" ? o.after.slice(0, INTRO_TEXT_MAX) : null,
    p30: str(o.p30, INTRO_TEXT_MAX),
    updatedAt: str(o.updatedAt, 40),
  };
}

// ─── ガントチャートからの候補 ───

/** 候補：状態が完了か、期間が終わった計画のうち、まだ残していない・外していないもの */
export function ganttCandidates<P extends { id: string; status: string; end: string; parentId?: string }>(
  plans: P[],
  keptPlanIds: Set<string>,
  dismissed: Set<string>,
  today: string
): P[] {
  return plans.filter((p) => (p.status === "done" || p.end < today) && !keptPlanIds.has(p.id) && !dismissed.has(p.id));
}
