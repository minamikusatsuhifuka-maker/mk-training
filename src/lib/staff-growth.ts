// スタッフ育成カルテ 第1便（指示書179）— 型・正規化・純関数
//
// 【この便で扱うもの】
//   A 育成カルテ（管理者用の統合ビュー）: 既存データを集めて時系列に並べるだけ。ここには保存しない
//   B 学びの記録: 講座マスタ（course）＋受講の記録（learning）
//   C 本人ページ「マイ成長記録」: 自分の目標（goal）＋1on1の約束の取り組み状況（promise）
//   D 家族構成: 169のスタッフ連絡先側（lib/staff-contacts.ts）に持つ。**ここには一切持たない**
//
// 【保存先】専用テーブル clinic_staff_growth（RLS全拒否・service-role のみ）。
//   record_type = course | learning | goal | promise | config | log
//   誰のものかは data.userId。行アクセスの認可はサーバー（staff-growth-server.ts）で強制する。
//
// 【設計の要点】
//   ・再受講回数は**保存しない**。読むたびに「本人ごと・講座ごとに受講日順で数える」（attendanceCounts）。
//     講座を統合（学びの記録の courseId を付け替える）しても、数え直しが自動で正しくなる。
//   ・表記ゆれは入力時に防ぐ: 講座は候補から選ぶ。新しい講座は「未確認」として登録し、管理者が統合する。
//   ・絞り込みに使える軸は 職種・入職年・在籍/退職・受講した講座・タグ **だけ**（A-5）。
//     家族構成・適性検査・サーベイの値・評価点は、一覧の型（KarteListEntry）に**項目として存在しない**。
//
// このファイルは "@/" や DB に依存しない（node --experimental-strip-types で直接検証できる）。

import type { NeedKey } from "./needs-survey";

// ─── 講座マスタ（B-2）───

export const COURSE_CATEGORIES = [
  { value: "inhouse", label: "院内勉強会" },
  { value: "conference", label: "学会" },
  { value: "external", label: "外部セミナー" },
  { value: "online", label: "オンライン講座" },
] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number]["value"];

export type CourseStatus = "confirmed" | "unconfirmed";

export type Course = {
  id: string;
  name: string;
  organizer: string;
  category: CourseCategory;
  /**
   * unconfirmed = 179でスタッフが自由入力した講座（180からは自由入力できない）。
   * 180以降は「追加依頼」と同じ一覧に出し、管理者が追加（確認済みに）または既存講座へ統合する
   */
  status: CourseStatus;
  /** 180: 非表示（過去の記録で使われている講座は削除せず非表示にする＝記録と回数を壊さない） */
  hidden: boolean;
  /** 180: 並び順（小さい順。0=未設定は末尾） */
  order: number;
  /** 180: 標準の日数（例: 3日間）。0=未設定 */
  defaultDays: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const COURSE_NAME_MAX = 120;
export const ORGANIZER_MAX = 80;
export const DEFAULT_DAYS_MAX = 60;

// ─── 講座の追加依頼（180 1-2）───
//
// スタッフは講座を自由入力できない。一覧に無ければ**名称だけ**で依頼を出し、
// 管理者が「講座に追加」または「既存の講座に紐づけて却下」で処理する。
// 依頼の段階では学びの記録を作らない（追加後にスタッフが選んで登録する）。

export type CourseRequestStatus = "open" | "added" | "linked";

export type CourseRequest = {
  id: string;
  /** 依頼した人 */
  userId: string;
  userName: string;
  name: string;
  status: CourseRequestStatus;
  /** 処理後: 追加した講座 or 紐づけた既存講座 */
  courseId: string;
  createdAt: string;
  resolvedAt: string;
  resolvedBy: string;
};

export function normalizeCourseRequest(id: string, raw: unknown): CourseRequest | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const userId = text(g.userId, 100).trim();
  const name = text(g.name, COURSE_NAME_MAX).trim();
  if (!userId || !name) return null;
  return {
    id,
    userId,
    userName: text(g.userName, 100).trim(),
    name,
    status: g.status === "added" ? "added" : g.status === "linked" ? "linked" : "open",
    courseId: text(g.courseId, 100),
    createdAt: text(g.createdAt, 40),
    resolvedAt: text(g.resolvedAt, 40),
    resolvedBy: text(g.resolvedBy, 200),
  };
}

// ─── 学びの記録（B-1）───

export const VENUE_TYPES = [
  { value: "inhouse", label: "院内" },
  { value: "venue", label: "会場" },
  { value: "online", label: "オンライン" },
] as const;
export type VenueType = (typeof VENUE_TYPES)[number]["value"];

/** 証跡（受講証・メモの画像）。実体は非公開バケット。signedUrl は返すときだけ付く */
export type EvidenceFile = {
  path: string;
  name: string;
  uploadedAt: string;
  signedUrl?: string;
};

export type LearningRecord = {
  id: string;
  /** 誰の学びか（Auth の userId） */
  userId: string;
  courseId: string;
  /**
   * 180: 参加日の一覧（YYYY-MM-DD・昇順・重複なし）。**これが正**。
   * 179の記録（startDate/endDate だけ）は normalizeLearning が読み込み時に期間を展開して埋める
   * （保存データは書き換えない。編集して保存したときに dates を含む新しい形式で保存される）。
   */
  dates: string[];
  /** 最初の参加日（dates[0]）。一覧・並び順・絞り込みの基準。保存時にも持たせる（179の読み手との互換） */
  startDate: string;
  /** 最後の参加日（dates の末尾） */
  endDate: string;
  venueType: VenueType;
  venueName: string;
  learned: string;
  nextAction: string;
  tags: string[];
  evidence: EvidenceFile[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

/** 参加日の上限（1回の受講） */
export const DATES_MAX = 62;
export const LEARNED_MAX = 4000;
export const NEXT_ACTION_MAX = 2000;
export const VENUE_NAME_MAX = 100;
export const TAG_MAX = 20;
export const TAGS_MAX_COUNT = 10;
export const EVIDENCE_MAX_COUNT = 5;
export const EVIDENCE_MAX_BYTES = 8 * 1024 * 1024;

// ─── 自分の目標（C）───

export type GoalStatus = "active" | "done";

export type Goal = {
  id: string;
  userId: string;
  title: string;
  detail: string;
  status: GoalStatus;
  dueDate: string;
  /** 「次にやること」から移したときの元の学びの記録 */
  fromLearningId: string;
  createdAt: string;
  updatedAt: string;
};

export const GOAL_TITLE_MAX = 200;
export const GOAL_DETAIL_MAX = 2000;

// ─── 1on1の約束の取り組み状況（C）───
//
// 約束の本文は1on1ノート（private_store one_on_one）側にあり、ここでは変更しない。
// 本人が書けるのは「取り組み状況」だけ。行は (userId, oneOnOneKey) で1件。

export const PROMISE_STATUSES = [
  { value: "not_started", label: "これから" },
  { value: "in_progress", label: "取り組み中" },
  { value: "done", label: "できた" },
] as const;
export type PromiseStatusValue = (typeof PROMISE_STATUSES)[number]["value"];

export type PromiseStatus = {
  id: string;
  userId: string;
  /** 1on1の回ID（private_store の record_key） */
  oneOnOneKey: string;
  /** その回の記録者（private_store の owner_id）。回IDだけでは特定できないため持つ */
  ownerId: string;
  status: PromiseStatusValue;
  note: string;
  updatedAt: string;
};

export const PROMISE_NOTE_MAX = 1000;

export function promiseStatusId(userId: string, ownerId: string, oneOnOneKey: string): string {
  return `promise-${userId}-${ownerId}-${oneOnOneKey}`;
}

export function promiseStatusLabel(v: PromiseStatusValue): string {
  return PROMISE_STATUSES.find((s) => s.value === v)?.label ?? "";
}

// ─── 設定行（B-3 AI下書きの有効化）───
//
// AI下書きは「AIのAPIが有料枠で、送信内容が学習に使われない契約であること」を
// 確認できたときだけ使う（179 B-3）。コードからは契約区分を確かめられないため、
// **既定OFF**にし、院長が確認したうえで管理画面から明示的にONにする。

export const GROWTH_CONFIG_ID = "__config__";

export type GrowthConfig = {
  aiDraftEnabled: boolean;
  aiDraftConfirmedBy: string;
  aiDraftConfirmedAt: string;
};

export function emptyGrowthConfig(): GrowthConfig {
  return { aiDraftEnabled: false, aiDraftConfirmedBy: "", aiDraftConfirmedAt: "" };
}

export function normalizeGrowthConfig(raw: unknown): GrowthConfig {
  const g = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    // 明示的に true のときだけON（未設定・壊れた値はOFF）
    aiDraftEnabled: g.aiDraftEnabled === true,
    aiDraftConfirmedBy: text(g.aiDraftConfirmedBy, 200),
    aiDraftConfirmedAt: text(g.aiDraftConfirmedAt, 40),
  };
}

// ─── 共通の正規化ヘルパ ───

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** YYYY-MM-DD で、実在する日付だけを通す（2月30日などは空） */
export function ymd(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)) return "";
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? s : "";
}

export function isCourseCategory(v: unknown): v is CourseCategory {
  return COURSE_CATEGORIES.some((c) => c.value === v);
}

export function isVenueType(v: unknown): v is VenueType {
  return VENUE_TYPES.some((c) => c.value === v);
}

export function isPromiseStatus(v: unknown): v is PromiseStatusValue {
  return PROMISE_STATUSES.some((c) => c.value === v);
}

/** YYYY-MM-DD に n 日足す */
export function addDaysYmd(base: string, n: number): string {
  if (!ymd(base)) return "";
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** 開始日〜終了日の日付をすべて並べる（不正・逆順・上限超過は切り詰め） */
export function expandDateRange(start: string, end: string, max = DATES_MAX): string[] {
  const s = ymd(start);
  if (!s) return [];
  const e = ymd(end) && end >= s ? end : s;
  const out: string[] = [];
  let cur = s;
  while (cur <= e && out.length < max) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

/** 参加日の一覧: 実在する日付だけ・重複なし・昇順・上限まで */
export function normalizeDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const set = new Set<string>();
  for (const v of raw) {
    const d = ymd(v);
    if (d) set.add(d);
  }
  return Array.from(set).sort().slice(0, DATES_MAX);
}

/** 連続した日程か（前日+1 が次の日付） */
export function isConsecutiveDates(dates: string[]): boolean {
  for (let i = 1; i < dates.length; i++) {
    if (addDaysYmd(dates[i - 1], 1) !== dates[i]) return false;
  }
  return true;
}

function md(d: string): string {
  return `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
}

/**
 * 参加日の表示（180 2-2）:
 *   連続   → 「2026/9/2〜9/4（3日間）」
 *   飛び飛び → 「2026/9/2・9/9（2日間）」
 *   1日     → 「2026/9/2」
 * 年をまたぐときは各日付に年を付ける。
 */
export function formatDates(dates: string[]): string {
  const ds = normalizeDates(dates);
  if (ds.length === 0) return "";
  const sameYear = ds.every((d) => d.slice(0, 4) === ds[0].slice(0, 4));
  const label = (d: string, first: boolean) =>
    sameYear ? (first ? `${d.slice(0, 4)}/${md(d)}` : md(d)) : `${d.slice(0, 4)}/${md(d)}`;
  if (ds.length === 1) return label(ds[0], true);
  const days = `（${ds.length}日間）`;
  if (isConsecutiveDates(ds)) return `${label(ds[0], true)}〜${label(ds[ds.length - 1], false)}${days}`;
  return ds.map((d, i) => label(d, i === 0)).join("・") + days;
}

export function courseCategoryLabel(v: CourseCategory): string {
  return COURSE_CATEGORIES.find((c) => c.value === v)?.label ?? "";
}

export function venueTypeLabel(v: VenueType): string {
  return VENUE_TYPES.find((c) => c.value === v)?.label ?? "";
}

/** タグ: 前後空白を除き・空を捨て・重複を除き・上限まで */
export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim().slice(0, TAG_MAX);
    if (!t || out.includes(t)) continue;
    out.push(t);
    if (out.length >= TAGS_MAX_COUNT) break;
  }
  return out;
}

/** 「a, b　c」のような入力を配列にする（画面用） */
export function parseTagsInput(s: string): string[] {
  return normalizeTags(s.split(/[,、，\s]+/));
}

function normalizeEvidence(raw: unknown): EvidenceFile[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, EVIDENCE_MAX_COUNT)
    .map((v) => {
      const g = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      return {
        path: text(g.path, 300),
        name: text(g.name, 200),
        uploadedAt: text(g.uploadedAt, 40),
      };
    })
    .filter((e) => e.path);
}

// ─── 正規化（クライアント値を信じない・保存前と読み出し時の両方で通す）───

export function normalizeCourse(id: string, raw: unknown): Course | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const name = text(g.name, COURSE_NAME_MAX).trim();
  if (!name) return null;
  const days = typeof g.defaultDays === "string" ? Number(g.defaultDays) : g.defaultDays;
  return {
    id,
    name,
    organizer: text(g.organizer, ORGANIZER_MAX).trim(),
    category: isCourseCategory(g.category) ? g.category : "external",
    status: g.status === "confirmed" ? "confirmed" : "unconfirmed",
    hidden: g.hidden === true,
    order: typeof g.order === "number" && Number.isFinite(g.order) && g.order > 0 ? Math.floor(g.order) : 0,
    defaultDays:
      typeof days === "number" && Number.isInteger(days) && days >= 1 && days <= DEFAULT_DAYS_MAX ? days : 0,
    createdBy: text(g.createdBy, 200),
    createdAt: text(g.createdAt, 40),
    updatedAt: text(g.updatedAt, 40),
  };
}

/** 講座の並び: order（1,2,…）→ 未設定（0）は末尾 → 名称 */
export function sortCourses(list: Course[]): Course[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        (a.order || Number.MAX_SAFE_INTEGER) - (b.order || Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name, "ja")
    );
}

/** スタッフが選べる講座（確認済み・表示中）。編集中の記録の講座は非表示でも残す */
export function selectableCourses(list: Course[], keepId = ""): Course[] {
  return sortCourses(list.filter((c) => (c.status === "confirmed" && !c.hidden) || c.id === keepId));
}

export function normalizeLearning(id: string, raw: unknown): LearningRecord | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const userId = text(g.userId, 100).trim();
  const courseId = text(g.courseId, 100).trim();
  if (!userId || !courseId) return null;
  // 180: dates があればそれが正。無ければ179の開始日〜終了日を展開する（読み込み時の読み替え）
  let dates = normalizeDates(g.dates);
  if (dates.length === 0) dates = expandDateRange(ymd(g.startDate), ymd(g.endDate));
  return {
    id,
    userId,
    courseId,
    dates,
    startDate: dates[0] ?? "",
    endDate: dates[dates.length - 1] ?? "",
    venueType: isVenueType(g.venueType) ? g.venueType : "venue",
    venueName: text(g.venueName, VENUE_NAME_MAX).trim(),
    learned: text(g.learned, LEARNED_MAX),
    nextAction: text(g.nextAction, NEXT_ACTION_MAX),
    tags: normalizeTags(g.tags),
    evidence: normalizeEvidence(g.evidence),
    createdBy: text(g.createdBy, 200),
    createdAt: text(g.createdAt, 40),
    updatedAt: text(g.updatedAt, 40),
  };
}

export function normalizeGoal(id: string, raw: unknown): Goal | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const userId = text(g.userId, 100).trim();
  const title = text(g.title, GOAL_TITLE_MAX).trim();
  if (!userId || !title) return null;
  return {
    id,
    userId,
    title,
    detail: text(g.detail, GOAL_DETAIL_MAX),
    status: g.status === "done" ? "done" : "active",
    dueDate: ymd(g.dueDate),
    fromLearningId: text(g.fromLearningId, 100),
    createdAt: text(g.createdAt, 40),
    updatedAt: text(g.updatedAt, 40),
  };
}

export function normalizePromiseStatus(id: string, raw: unknown): PromiseStatus | null {
  if (!id || !raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const userId = text(g.userId, 100).trim();
  const oneOnOneKey = text(g.oneOnOneKey, 64).trim();
  const ownerId = text(g.ownerId, 100).trim();
  if (!userId || !oneOnOneKey || !ownerId) return null;
  return {
    id,
    userId,
    oneOnOneKey,
    ownerId,
    status: isPromiseStatus(g.status) ? g.status : "not_started",
    note: text(g.note, PROMISE_NOTE_MAX),
    updatedAt: text(g.updatedAt, 40),
  };
}

// ─── 再受講回数（B-2）───
//
// 本人ごと・講座ごとに、開催日（開始日）→登録日時の順で並べて 1,2,3… と数える。
// **保存された値は無い**。講座の統合で courseId が付け替わっても、次に数えたときに正しくなる。

export function sortLearningAsc(list: LearningRecord[]): LearningRecord[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) || a.createdAt.localeCompare(b.createdAt)
    );
}

/** 新しい順（画面の既定） */
export function sortLearningDesc(list: LearningRecord[]): LearningRecord[] {
  return sortLearningAsc(list).reverse();
}

/** 記録id → 何回目か */
export function attendanceCounts(list: LearningRecord[]): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<string, LearningRecord[]>();
  for (const r of list) {
    const k = `${r.userId}\u0000${r.courseId}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  for (const g of groups.values()) {
    sortLearningAsc(g).forEach((r, i) => out.set(r.id, i + 1));
  }
  return out;
}

export function attendanceLabel(n: number | undefined): string {
  if (!n) return "";
  return n === 1 ? "初回" : `${n}回目`;
}

// ─── 講座の突合（表記ゆれ対策・入力補助）───

/** 全角英数→半角・空白除去・小文字化（比較用） */
export function normalizeCourseName(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[「」『』()（）\[\]【】・･,、。.]/g, "")
    .toLowerCase();
}

/** 同名（表記ゆれを吸収した上で一致）の講座を探す */
export function findSameCourse(courses: Course[], name: string): Course | null {
  const key = normalizeCourseName(name);
  if (!key) return null;
  return courses.find((c) => normalizeCourseName(c.name) === key) ?? null;
}

/** 部分一致で候補を出す（AI下書き・入力補助）。最大 limit 件 */
export function suggestCourses(courses: Course[], name: string, limit = 5): Course[] {
  const key = normalizeCourseName(name);
  if (!key) return [];
  const exact = courses.filter((c) => normalizeCourseName(c.name) === key);
  const partial = courses.filter((c) => {
    const n = normalizeCourseName(c.name);
    return n !== key && (n.includes(key) || key.includes(n));
  });
  return [...exact, ...partial].slice(0, limit);
}

// ─── 育成カルテ（A）の型 ───
//
// 【絞り込みに使える軸だけを持つ】（A-5・機微情報で人を絞り込める状態を作らない）
// 家族構成・適性検査・サーベイの値・評価点は、この型に項目が無い。足したくなったら指示書に立ち返る。

export type KarteListEntry = {
  userId: string;
  name: string;
  /** 職種（プロフィールの役職id）。空=未設定 */
  roleId: string;
  roleLabel: string;
  /** 入職日 YYYY-MM-DD（169の連絡先から。無ければ空） */
  joinedOn: string;
  retired: boolean;
  /** 受講した講座（重複なし） */
  courseIds: string[];
  /** 学びの記録に付いたタグ（重複なし） */
  tags: string[];
  learningCount: number;
  /** 最新の学びの開始日 */
  lastLearningOn: string;
};

export type TimelineKind =
  | "joined"
  | "one_on_one"
  | "learning"
  | "member_note"
  | "self_review"
  | "survey"
  | "delegation"
  | "hiring_doc";

export const TIMELINE_KIND_LABEL: Record<TimelineKind, string> = {
  joined: "入職",
  one_on_one: "1on1",
  learning: "学び",
  member_note: "メンバーノート",
  self_review: "自己評価",
  survey: "サーベイ公開",
  delegation: "権限委譲",
  hiring_doc: "採用資料",
};

/**
 * サーベイ（5つの基本的欲求）の年表用の中身（指示書181）。
 * **本人が公開したものだけ**が入る（164の判定を通した後にしか作らない）。
 * 中身は「公開時にメンバー紹介で見える範囲」かつ「本人への説明（レーダーチャートと画像）」に揃える。
 * 15項目の詳細（details）は本人への説明に含まれていないため**入れない**（181 2-1・院長判断待ち）。
 */
export type SurveyView = {
  /** 回答日（needsSurvey.updatedAt。無ければプロフィールの更新日） */
  answeredOn: string;
  /** 5欲求の点数（生存／愛・所属／力／自由／楽しみ の順に並べる。無い項目は undefined） */
  values: Partial<Record<NeedKey, number>>;
  /** 結果画像（署名付きURL・163の方式）。無ければ空 */
  imageUrl: string;
  isPdf: boolean;
  /** 前回の記録があるときだけ: 項目ごとの差（増減の数値のみ・良し悪しの判定はしない） */
  diff?: Partial<Record<NeedKey, number>>;
  /** 182: 「詳細も公開」の人だけ: 詳細15項目の「欲求」（項目key → 値）。注力・現況は含めない */
  details?: Record<string, number>;
  /** 182: 詳細の前回との差（「詳細も公開」の人だけ・数値のみ） */
  detailsDiff?: Record<string, number>;
  /** 何回目の記録か（古い順・1始まり） */
  seq?: number;
  total?: number;
};

export type TimelineItem = {
  kind: TimelineKind;
  /** 並べ替えに使う日付 YYYY-MM-DD（無ければ ISO の先頭10文字） */
  date: string;
  title: string;
  body: string;
  /** 元の画面 */
  href: string;
  /** 学びの記録なら記録id（編集導線用） */
  learningId?: string;
  /** サーベイ公開の項目だけ（展開表示用） */
  survey?: SurveyView;
};

/**
 * サーベイの回ごとの差（181 2）。古い順に並べ、2回目以降に「前回との差」を付ける。
 * 差は増減の数値だけ（順位付け・良し悪しの判定はしない）。片方に値が無い項目は差を出さない。
 * 現状のデータは1人1件（上書き保存）なので差が付くことは無いが、履歴を持つようになったときのための純関数。
 */
export function attachSurveyDiffs(
  list: SurveyView[],
  keys: readonly NeedKey[]
): SurveyView[] {
  const sorted = list.slice().sort((a, b) => a.answeredOn.localeCompare(b.answeredOn));
  return sorted.map((cur, i) => {
    const seq = { seq: i + 1, total: sorted.length };
    if (i === 0) return { ...cur, ...seq, diff: undefined, detailsDiff: undefined };
    const prev = sorted[i - 1];
    const diff: Partial<Record<NeedKey, number>> = {};
    for (const k of keys) {
      const a = prev.values[k];
      const b = cur.values[k];
      if (typeof a === "number" && typeof b === "number") diff[k] = b - a;
    }
    // 182 B-5: 詳細の差は両方に詳細があるときだけ（「詳細も公開」の人しか details を持たない）
    let detailsDiff: Record<string, number> | undefined;
    if (cur.details && prev.details) {
      detailsDiff = {};
      for (const [key, b] of Object.entries(cur.details)) {
        const a = prev.details[key];
        if (typeof a === "number") detailsDiff[key] = b - a;
      }
    }
    return { ...cur, ...seq, diff, detailsDiff };
  });
}

/** 差の表示（+3 / −2 / ±0）。数値だけ・評価語は付けない */
export function formatDiff(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return "±0";
}

export type PromiseSummary = {
  date: string;
  partnerName: string;
  text: string;
  status: PromiseStatusValue | null;
  note: string;
};

export type KarteDetail = {
  entry: KarteListEntry;
  latestPromise: PromiseSummary | null;
  recentLearning: LearningRecord[];
  /** 次回1on1の予定（この便では予定を持つデータが無いため常に null。第3便で扱う） */
  nextOneOnOne: string | null;
  timeline: TimelineItem[];
  goals: Goal[];
};

/** 新しい順（同日は種類の定義順）に並べる */
export function sortTimeline(items: TimelineItem[]): TimelineItem[] {
  const order = Object.keys(TIMELINE_KIND_LABEL);
  return items
    .slice()
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || order.indexOf(a.kind) - order.indexOf(b.kind)
    );
}

// ─── 在籍年数 ───

/** 入職日から今日までを「N年Mか月」に。入職日が無い・不正なら空 */
export function tenureLabel(joinedOn: string, today: string): string {
  if (!ymd(joinedOn) || !ymd(today) || joinedOn > today) return "";
  const [jy, jm, jd] = joinedOn.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let months = (ty - jy) * 12 + (tm - jm);
  if (td < jd) months -= 1;
  if (months < 0) return "";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}か月`;
  return m === 0 ? `${y}年` : `${y}年${m}か月`;
}

/** 入職年（絞り込み用） */
export function joinedYearOf(joinedOn: string): string {
  return ymd(joinedOn) ? joinedOn.slice(0, 4) : "";
}

// ─── 1on1の約束（本文は1on1側・ここでは取り出すだけ）───

/**
 * 1on1の1回分から「約束」の本文を取り出す。
 * RWDEPC対話なら C（実行の約束）、クイックメモなら「次の一歩」。
 */
export function promiseTextOf(d: {
  mode: string;
  rwdepc: { c: string };
  sections: { nextStep: string };
}): string {
  return (d.mode === "rwdepc" ? d.rwdepc.c : d.sections.nextStep).trim();
}

// ─── 一覧の絞り込み（A-5・クライアント側の純関数）───

export type KarteFilter = {
  roleId: string;
  joinedYear: string;
  /** "active" | "retired" | "all" */
  employment: "active" | "retired" | "all";
  courseId: string;
  tag: string;
};

export const EMPTY_KARTE_FILTER: KarteFilter = {
  roleId: "",
  joinedYear: "",
  employment: "active",
  courseId: "",
  tag: "",
};

export function filterKarteEntries(
  entries: KarteListEntry[],
  f: KarteFilter
): KarteListEntry[] {
  return entries.filter((e) => {
    if (f.employment === "active" && e.retired) return false;
    if (f.employment === "retired" && !e.retired) return false;
    if (f.roleId && e.roleId !== f.roleId) return false;
    if (f.joinedYear && joinedYearOf(e.joinedOn) !== f.joinedYear) return false;
    if (f.courseId && !e.courseIds.includes(f.courseId)) return false;
    if (f.tag && !e.tags.includes(f.tag)) return false;
    return true;
  });
}

// ─── 検索（A-5・管理者のみ・サーバー側）───

export type SearchHit = {
  userId: string;
  /** どの記録に当たったか（種類ラベル → 件数） */
  hits: Partial<Record<TimelineKind, number>>;
};

/** 検索語を空白で分けて AND で当てる。すべての語を含む本文だけが一致 */
export function matchesAllTerms(body: string, q: string): boolean {
  const terms = q
    .normalize("NFKC")
    .toLowerCase()
    .split(/[\s　]+/)
    .filter(Boolean);
  if (terms.length === 0) return false;
  const hay = body.normalize("NFKC").toLowerCase();
  return terms.every((t) => hay.includes(t));
}

/** 年表の項目群を横断して検索し、人ごとの当たり件数にまとめる */
export function searchTimeline(
  byUser: Map<string, TimelineItem[]>,
  q: string
): SearchHit[] {
  const out: SearchHit[] = [];
  for (const [userId, items] of byUser) {
    const hits: Partial<Record<TimelineKind, number>> = {};
    for (const it of items) {
      if (matchesAllTerms(`${it.title}\n${it.body}`, q)) {
        hits[it.kind] = (hits[it.kind] ?? 0) + 1;
      }
    }
    if (Object.keys(hits).length > 0) out.push({ userId, hits });
  }
  return out;
}

// ─── 操作ログ（本文を残さない・159/169/173と同じ）───

export type GrowthLogChange = { field: string; before: string; after: string };

export type GrowthLog = {
  id: string;
  at: string;
  by: string;
  action: string;
  kind: string;
  target: string;
  changes: GrowthLogChange[];
};

export const GROWTH_LOG_PAGE_SIZE = 100;

export function normalizeGrowthLog(id: string, raw: unknown): GrowthLog | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const rawChanges = Array.isArray(g.changes) ? g.changes : [];
  return {
    id,
    at: text(g.at, 40),
    by: text(g.by, 200),
    action: text(g.action, 40),
    kind: text(g.kind, 40),
    target: text(g.target, 200),
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

/** 値の状態を「空 / 記載あり」に丸める（本文を残さない） */
export function presence(v: string): string {
  return v.trim() ? "記載あり" : "空";
}

function presenceChange(
  changes: GrowthLogChange[],
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
  changes: GrowthLogChange[],
  field: string,
  before: string,
  after: string
): void {
  if (before === after) return;
  changes.push({ field, before, after });
}

/** 学びの記録の差分（本文は「空⇄記載あり」・講座と日付は値そのまま＝機微ではない） */
export function buildLearningChanges(
  prev: LearningRecord | null,
  next: LearningRecord,
  courseNameOf: (id: string) => string
): GrowthLogChange[] {
  const c: GrowthLogChange[] = [];
  valueChange(c, "講座", prev ? courseNameOf(prev.courseId) : "", courseNameOf(next.courseId));
  valueChange(c, "参加日", prev ? formatDates(prev.dates) : "", formatDates(next.dates));
  valueChange(
    c,
    "場所",
    prev ? venueTypeLabel(prev.venueType) : "",
    venueTypeLabel(next.venueType)
  );
  presenceChange(c, "会場名", prev?.venueName ?? "", next.venueName);
  presenceChange(c, "学んだこと", prev?.learned ?? "", next.learned);
  presenceChange(c, "次にやること", prev?.nextAction ?? "", next.nextAction);
  valueChange(c, "タグ", `${prev?.tags.length ?? 0}件`, `${next.tags.length}件`);
  valueChange(c, "証跡", `${prev?.evidence.length ?? 0}件`, `${next.evidence.length}件`);
  return c;
}

export function buildCourseChanges(prev: Course | null, next: Course): GrowthLogChange[] {
  const c: GrowthLogChange[] = [];
  valueChange(c, "名称", prev?.name ?? "", next.name);
  valueChange(c, "主催", prev?.organizer ?? "", next.organizer);
  valueChange(
    c,
    "区分",
    prev ? courseCategoryLabel(prev.category) : "",
    courseCategoryLabel(next.category)
  );
  valueChange(
    c,
    "状態",
    prev ? (prev.status === "confirmed" ? "確認済み" : "未確認") : "",
    next.status === "confirmed" ? "確認済み" : "未確認"
  );
  valueChange(c, "表示", prev ? (prev.hidden ? "非表示" : "表示") : "", next.hidden ? "非表示" : "表示");
  valueChange(
    c,
    "標準の日数",
    prev ? (prev.defaultDays ? `${prev.defaultDays}日` : "") : "",
    next.defaultDays ? `${next.defaultDays}日` : ""
  );
  return c;
}

export function buildGoalChanges(prev: Goal | null, next: Goal): GrowthLogChange[] {
  const c: GrowthLogChange[] = [];
  presenceChange(c, "目標", prev?.title ?? "", next.title);
  presenceChange(c, "詳細", prev?.detail ?? "", next.detail);
  valueChange(
    c,
    "状態",
    prev ? (prev.status === "done" ? "達成" : "取り組み中") : "",
    next.status === "done" ? "達成" : "取り組み中"
  );
  valueChange(c, "期限", prev?.dueDate ?? "", next.dueDate);
  return c;
}

// ─── 家族構成（D）の文言 ───
//
// 169のスタッフ連絡先に置く欄の、入力欄の上に常時表示する文（179 D・一言一句そのまま）。

export const FAMILY_NOTICE =
  "本人が申告した範囲で記録します。勤務の配慮・労務のためにのみ使い、評価には使いません";
