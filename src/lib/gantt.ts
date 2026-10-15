// 📊 ガントチャート（指示書250・250-補）— 純関数・定義の正本（画面とサーバーの両方から使う）
//
// 【載せるもの】院の取り組み・年間の行事・採用と教育の計画など。四象限マトリクスの項目は「ガントチャートに出す」を
//   チェックしたものだけ（出すのは名前・期間・状態だけ。メモ・9マス・任せる相手・象限は出さない）。
// 【書く人】院長と、委任の設定で「📊 ガントチャート」を任された幹部。分類を直せるのは院長だけ。判定はサーバー。
// 【見る人】ログインしたスタッフ全員（スイッチ gantt がOFFの間は院長と検証用アカウントだけ）。
// 【保存先】clinic_staff_growth（record_type = gantt_plan ／ gantt_categories）。新しい表は作らない。
// 【年】年度（クリニックの歩みの「年度の始まり」＝ portal_metrics.fiscalStartMonth・既定6月）で区切る。

import { STATUS_LABEL, TASK_STATUSES, type TaskStatus } from "./priority-matrix";

export { STATUS_LABEL, TASK_STATUSES, type TaskStatus };

// ─── 色（250-補 §2。見本の値そのまま）───

export type GanttColorKey = "sakura" | "lavender" | "mint" | "greige" | "butter" | "sky";

export type GanttPalette = {
  label: string;
  /** 棒（左から右へ） */
  bar: [string, string];
  /** 中の小さな計画の棒 */
  sub: [string, string];
  /** 押して開いている棒 */
  open: [string, string];
  /** 分類の見出しの点 */
  dot: [string, string];
  /** 分類の見出しの字（白地で4.5:1以上） */
  text: string;
  /** 棒のやわらかい影 */
  shadow: string;
  /** 絞り込みのピルの枠 */
  chipBorder: string;
};

export const GANTT_PALETTES: Record<GanttColorKey, GanttPalette> = {
  sakura: {
    label: "さくら",
    bar: ["#F7C2D0", "#F1D3EE"],
    sub: ["#FBE1E8", "#F6E6F5"],
    open: ["#F2AFC2", "#D9B9EE"],
    dot: ["#E68AA0", "#B98AD8"],
    text: "#B4536A",
    shadow: "rgba(214, 120, 150, 0.22)",
    chipBorder: "rgba(240, 201, 210, 0.9)",
  },
  lavender: {
    label: "ラベンダー",
    bar: ["#DCCDF5", "#CFE0FA"],
    sub: ["#EEE6FA", "#E7EFFC"],
    open: ["#C9B4EE", "#B9CFF5"],
    dot: ["#A98AE0", "#8FB0EE"],
    text: "#7A5BB0",
    shadow: "rgba(122, 91, 176, 0.18)",
    chipBorder: "rgba(220, 207, 240, 0.9)",
  },
  mint: {
    label: "ミント",
    bar: ["#C3E8D6", "#D2EBF4"],
    sub: ["#E1F3EA", "#E8F5FA"],
    open: ["#A6DCC2", "#BADFEE"],
    dot: ["#7CC8A6", "#86C3DE"],
    text: "#337559",
    shadow: "rgba(51, 117, 89, 0.15)",
    chipBorder: "rgba(194, 227, 211, 0.9)",
  },
  greige: {
    label: "グレージュ",
    bar: ["#EDE4E2", "#E6E2EC"],
    sub: ["#F5F0EF", "#F2F0F5"],
    open: ["#E0D3D0", "#D6D0E0"],
    dot: ["#C9B8B4", "#B9B2C6"],
    text: "#6F6467",
    shadow: "rgba(111, 100, 103, 0.15)",
    chipBorder: "rgba(230, 220, 218, 0.9)",
  },
  butter: {
    label: "バター",
    bar: ["#FDF0C8", "#FBE3CF"],
    sub: ["#FEF7E2", "#FDF0E6"],
    open: ["#F8E3A0", "#F5CDAE"],
    dot: ["#E8C35A", "#E9A77A"],
    text: "#86650F",
    shadow: "rgba(134, 101, 15, 0.15)",
    chipBorder: "rgba(240, 222, 170, 0.9)",
  },
  sky: {
    label: "空色",
    bar: ["#CFE3F8", "#DDDAF6"],
    sub: ["#E6F0FB", "#EEEDFA"],
    open: ["#B5D2F2", "#C8C3F0"],
    dot: ["#7FB0E6", "#9F98E6"],
    text: "#356BA3",
    shadow: "rgba(53, 107, 163, 0.15)",
    chipBorder: "rgba(196, 218, 240, 0.9)",
  },
};

export const GANTT_COLOR_KEYS = Object.keys(GANTT_PALETTES) as GanttColorKey[];

export function isColorKey(v: unknown): v is GanttColorKey {
  return typeof v === "string" && (GANTT_COLOR_KEYS as string[]).includes(v);
}

export const grad = (pair: [string, string], deg = 90) => `linear-gradient(${deg}deg, ${pair[0]} 0%, ${pair[1]} 100%)`;

// ─── 分類 ───

export type GanttCategory = { id: string; name: string; color: GanttColorKey };

/** 消せない分類（消した分類の計画はここへ移る） */
export const OTHER_CATEGORY_ID = "other";

/** はじめの4つ（院長の言葉のまま） */
export const DEFAULT_CATEGORIES: GanttCategory[] = [
  { id: "project", name: "院の取り組み・プロジェクト", color: "sakura" },
  { id: "event", name: "年間の行事・研修", color: "lavender" },
  { id: "hiring", name: "採用・教育の計画", color: "mint" },
  { id: OTHER_CATEGORY_ID, name: "その他", color: "greige" },
];

/** 四象限から出す項目を入れる分類（無ければ「その他」） */
export const MATRIX_CATEGORY_ID = "project";

export const CATEGORY_NAME_MAX = 30;
export const CATEGORY_MAX = 12;

/** 保存値を整える。「その他」は必ず最後に1つ残す。名前の空・重複idは捨てる */
export function normalizeCategories(raw: unknown): GanttCategory[] {
  const arr = Array.isArray(raw) ? raw : null;
  if (!arr) return DEFAULT_CATEGORIES.map((c) => ({ ...c }));
  const out: GanttCategory[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim().slice(0, 40) : "";
    const name = typeof o.name === "string" ? o.name.trim().slice(0, CATEGORY_NAME_MAX) : "";
    if (!id || !/^[\w-]+$/.test(id) || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, color: isColorKey(o.color) ? o.color : "greige" });
    if (out.length >= CATEGORY_MAX) break;
  }
  if (!seen.has(OTHER_CATEGORY_ID)) out.push({ ...DEFAULT_CATEGORIES[3] });
  // 「その他」はいつもいちばん下
  const other = out.find((c) => c.id === OTHER_CATEGORY_ID)!;
  return [...out.filter((c) => c.id !== OTHER_CATEGORY_ID), other];
}

export function categoryOf(categories: GanttCategory[], id: string): GanttCategory {
  return (
    categories.find((c) => c.id === id) ??
    categories.find((c) => c.id === OTHER_CATEGORY_ID) ??
    DEFAULT_CATEGORIES[3]
  );
}

// ─── 計画 ───

export type GanttPlan = {
  id: string;
  name: string;
  categoryId: string;
  /** YYYY-MM-DD。1日だけなら start === end */
  start: string;
  end: string;
  /** 担当（氏名または役割。任意） */
  assignee: string;
  status: TaskStatus;
  memo: string;
  /** 1段だけの入れ子。上の計画の id（空＝いちばん上の計画） */
  parentId: string;
  /** 並び（小さいほど上） */
  order: number;
  /** 検証用アカウントが作った計画（本物のスタッフには出さない・237） */
  testSeed?: boolean;
  /** 出どころ。"matrix" は四象限の項目（ガントチャート側では直せない） */
  source?: "matrix";
  updatedAt: string;
};

export const PLAN_NAME_MAX = 80;
export const PLAN_ASSIGNEE_MAX = 60;
export const PLAN_MEMO_MAX = 2000;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isYmd(v: unknown): v is string {
  if (typeof v !== "string" || !YMD.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function isStatus(v: unknown): v is TaskStatus {
  return TASK_STATUSES.some((s) => s.value === v);
}

/** 保存値・送られてきた値を計画に整える。名前・開始日が無いものは成り立たないので null */
export function normalizePlan(id: string, raw: unknown): GanttPlan | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim().slice(0, PLAN_NAME_MAX) : "";
  const start = isYmd(o.start) ? o.start : "";
  if (!id || !name || !start) return null;
  let end = isYmd(o.end) ? o.end : start;
  if (end < start) end = start;
  return {
    id,
    name,
    categoryId: typeof o.categoryId === "string" && o.categoryId ? o.categoryId.slice(0, 40) : OTHER_CATEGORY_ID,
    start,
    end,
    assignee: typeof o.assignee === "string" ? o.assignee.trim().slice(0, PLAN_ASSIGNEE_MAX) : "",
    status: isStatus(o.status) ? o.status : "todo",
    memo: typeof o.memo === "string" ? o.memo.slice(0, PLAN_MEMO_MAX) : "",
    parentId: typeof o.parentId === "string" ? o.parentId.slice(0, 64) : "",
    order: typeof o.order === "number" && Number.isFinite(o.order) ? o.order : 0,
    ...(o.testSeed === true ? { testSeed: true } : {}),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

/** 書く人が送ってよい項目 */
export type PlanFields = Partial<
  Pick<GanttPlan, "name" | "categoryId" | "start" | "end" | "assignee" | "status" | "memo" | "parentId">
>;

export function genPlanId(now = Date.now(), rand = Math.random()): string {
  return `gp-${now.toString(36)}${Math.floor(rand * 1e8).toString(36)}`;
}

/** 四象限の項目 → ガントチャートの行（名前・期間・状態だけ） */
export function planFromMatrixTask(
  t: { id: string; title: string; due: string; status: TaskStatus; gantt?: boolean; ganttStart?: string; order: number; updatedAt: string },
  categoryId: string
): GanttPlan | null {
  if (!t.gantt) return null;
  const start = isYmd(t.ganttStart) ? t.ganttStart : isYmd(t.due) ? t.due : "";
  if (!start) return null;
  const end = isYmd(t.due) && t.due >= start ? t.due : start;
  return {
    id: `pm:${t.id}`,
    name: t.title,
    categoryId,
    start,
    end,
    assignee: "",
    status: t.status,
    memo: "",
    parentId: "",
    order: 1_000_000 + t.order,
    source: "matrix",
    updatedAt: t.updatedAt,
  };
}

/** 並べる：分類の順 → 上の計画の order → その下に小さな計画 */
export type PlanRow = { plan: GanttPlan; depth: 0 | 1; childCount: number };

export function groupPlans(
  plans: GanttPlan[],
  categories: GanttCategory[],
  visibleCategoryIds?: Set<string>
): { category: GanttCategory; rows: PlanRow[] }[] {
  const known = new Set(categories.map((c) => c.id));
  const byOrder = (a: GanttPlan, b: GanttPlan) => a.order - b.order || a.start.localeCompare(b.start) || a.name.localeCompare(b.name, "ja");
  const tops = plans.filter((p) => !p.parentId || !plans.some((q) => q.id === p.parentId && !q.parentId));
  const childrenOf = (id: string) => plans.filter((p) => p.parentId === id).sort(byOrder);
  return categories
    .filter((c) => !visibleCategoryIds || visibleCategoryIds.has(c.id))
    .map((category) => {
      const mine = tops
        .filter((p) => (known.has(p.categoryId) ? p.categoryId : OTHER_CATEGORY_ID) === category.id)
        .sort(byOrder);
      const rows: PlanRow[] = [];
      for (const p of mine) {
        const kids = childrenOf(p.id);
        rows.push({ plan: { ...p, parentId: "" }, depth: 0, childCount: kids.length });
        for (const k of kids) rows.push({ plan: k, depth: 1, childCount: 0 });
      }
      return { category, rows };
    })
    .filter((g) => g.rows.length > 0);
}

/** ↑↓：同じ並び（同じ分類のいちばん上の計画どうし／同じ上の計画の中）で入れ替えた並びを返す */
export function swapOrder(plans: GanttPlan[], categories: GanttCategory[], id: string, dir: -1 | 1): { id: string; order: number }[] | null {
  const me = plans.find((p) => p.id === id);
  if (!me || me.source === "matrix") return null;
  const known = new Set(categories.map((c) => c.id));
  const cat = (p: GanttPlan) => (known.has(p.categoryId) ? p.categoryId : OTHER_CATEGORY_ID);
  const siblings = plans
    .filter((p) => p.source !== "matrix" && (me.parentId ? p.parentId === me.parentId : !p.parentId && cat(p) === cat(me)))
    .sort((a, b) => a.order - b.order || a.start.localeCompare(b.start) || a.name.localeCompare(b.name, "ja"));
  const i = siblings.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) return null;
  const next = [...siblings];
  [next[i], next[j]] = [next[j], next[i]];
  return next.map((p, k) => ({ id: p.id, order: k }));
}

// ─── 表示の単位と期間 ───

export type GanttView = "month" | "quarter" | "year";

export const VIEW_LABEL: Record<GanttView, string> = { month: "月", quarter: "四半期", year: "年" };

/** 日付の計算は UTC の日で行う（タイムゾーンでずれないように） */
export function ymdToDay(ymd: string): number {
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);
}

export function dayToYmd(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

function ymOf(ymd: string): { y: number; m: number } {
  return { y: Number(ymd.slice(0, 4)), m: Number(ymd.slice(5, 7)) };
}

function firstOf(y: number, m: number): string {
  const yy = y + Math.floor((m - 1) / 12);
  const mm = ((((m - 1) % 12) + 12) % 12) + 1;
  return `${yy}-${String(mm).padStart(2, "0")}-01`;
}

/** 年度の始まりの月（1〜12・それ以外は6月） */
export function normalizeFiscalStart(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 12 ? v : 6;
}

/** ある日を含む年度の始まり（年・月） */
export function fiscalYearOf(ymd: string, startMonth: number): number {
  const { y, m } = ymOf(ymd);
  return m >= startMonth ? y : y - 1;
}

export type GanttRange = {
  view: GanttView;
  /** 期間の最初の日（含む）と最後の次の日（含まない） */
  from: string;
  until: string;
  /** 画面の見出し（例：2026年度（2026年6月〜2027年5月）） */
  title: string;
  /** ◀ ▶ の読み上げ */
  prevLabel: string;
  nextLabel: string;
  /** 列（年＝月ごと・四半期＝週ごと・月＝日ごと） */
  columns: GanttColumn[];
};

export type GanttColumn = {
  from: string;
  until: string;
  label: string;
  /** 年が変わる列の上に小さく出す年 */
  yearMark?: string;
  /** 今日を含む列 */
  current: boolean;
  /** 土日（月表示だけ） */
  weekend?: boolean;
};

/** offset＝今日のある期間からいくつ前後に送ったか */
export function rangeFor(view: GanttView, today: string, offset: number, fiscalStart: number): GanttRange {
  const t = ymOf(today);
  if (view === "month") {
    const from = firstOf(t.y, t.m + offset);
    const { y, m } = ymOf(from);
    const until = firstOf(y, m + 1);
    const columns: GanttColumn[] = [];
    for (let d = ymdToDay(from); d < ymdToDay(until); d++) {
      const ymd = dayToYmd(d);
      const dow = new Date(d * 86_400_000).getUTCDay();
      columns.push({
        from: ymd,
        until: dayToYmd(d + 1),
        label: String(Number(ymd.slice(8, 10))),
        current: ymd === today,
        weekend: dow === 0 || dow === 6,
      });
    }
    return { view, from, until, title: `${y}年${m}月`, prevLabel: "前の月", nextLabel: "次の月", columns };
  }
  const fy = fiscalYearOf(today, fiscalStart);
  if (view === "year") {
    const from = firstOf(fy + offset, fiscalStart);
    const { y } = ymOf(from);
    const until = firstOf(y, fiscalStart + 12);
    const last = ymOf(dayToYmd(ymdToDay(until) - 1));
    const columns: GanttColumn[] = [];
    for (let i = 0; i < 12; i++) {
      const cf = firstOf(y, fiscalStart + i);
      const c = ymOf(cf);
      columns.push({
        from: cf,
        until: firstOf(c.y, c.m + 1),
        label: `${c.m}月`,
        yearMark: i > 0 && c.m === 1 ? String(c.y) : undefined,
        current: today >= cf && today < firstOf(c.y, c.m + 1),
      });
    }
    return {
      view,
      from,
      until,
      title: `${y}年度（${y}年${fiscalStart}月〜${last.y}年${last.m}月）`,
      prevLabel: "前の年度",
      nextLabel: "次の年度",
      columns,
    };
  }
  // 四半期（年度の始まりから3か月ずつ）。列は週（日曜はじまり・院内カレンダーと同じ）
  const monthsFromFy = (t.y - fy) * 12 + (t.m - fiscalStart);
  const q = Math.floor(monthsFromFy / 3) + offset;
  const from = firstOf(fy, fiscalStart + q * 3);
  const { y, m } = ymOf(from);
  const until = firstOf(y, m + 3);
  const qFy = fiscalYearOf(from, fiscalStart);
  const qNo = ((((y - qFy) * 12 + (m - fiscalStart)) / 3) % 4) + 1;
  const last = ymOf(dayToYmd(ymdToDay(until) - 1));
  const columns: GanttColumn[] = [];
  const startDay = ymdToDay(from);
  const endDay = ymdToDay(until);
  // 最初の列は期間の初日から次の日曜の前日まで
  let d = startDay;
  let prevMonth = 0;
  while (d < endDay) {
    const dow = new Date(d * 86_400_000).getUTCDay();
    const next = Math.min(endDay, d + (7 - dow));
    const ymd = dayToYmd(d);
    const cm = Number(ymd.slice(5, 7));
    const todayDay = ymdToDay(today);
    columns.push({
      from: ymd,
      until: dayToYmd(next),
      label: cm !== prevMonth ? `${cm}/${Number(ymd.slice(8, 10))}` : String(Number(ymd.slice(8, 10))),
      yearMark: prevMonth !== 0 && cm === 1 && cm !== prevMonth ? ymd.slice(0, 4) : undefined,
      current: todayDay >= d && todayDay < next,
    });
    prevMonth = cm;
    d = next;
  }
  return {
    view,
    from,
    until,
    title: `${qFy}年度 第${qNo}四半期（${y}年${m}月〜${last.y === y ? "" : `${last.y}年`}${last.m}月）`,
    prevLabel: "前の四半期",
    nextLabel: "次の四半期",
    columns,
  };
}

/** 期間の中の位置（0〜1）。範囲の外は切る。重ならなければ null */
export function spanIn(range: Pick<GanttRange, "from" | "until">, start: string, end: string): { left: number; width: number; cutStart: boolean; cutEnd: boolean } | null {
  const a = ymdToDay(range.from);
  const b = ymdToDay(range.until);
  const s = ymdToDay(start);
  const e = ymdToDay(end) + 1; // 終了日を含む
  if (e <= a || s >= b) return null;
  const total = b - a;
  const cs = Math.max(s, a);
  const ce = Math.min(e, b);
  return { left: (cs - a) / total, width: (ce - cs) / total, cutStart: s < a, cutEnd: e > b };
}

/** 今日の線の位置（0〜1・期間の外なら null）。その日のまん中に引く */
export function todayIn(range: Pick<GanttRange, "from" | "until">, today: string): number | null {
  const a = ymdToDay(range.from);
  const b = ymdToDay(range.until);
  const t = ymdToDay(today);
  if (t < a || t >= b) return null;
  return (t - a + 0.5) / (b - a);
}

/** 列の幅（0〜1） */
export function columnSpan(range: Pick<GanttRange, "from" | "until">, col: Pick<GanttColumn, "from" | "until">): { left: number; width: number } {
  const a = ymdToDay(range.from);
  const total = ymdToDay(range.until) - a;
  return { left: (ymdToDay(col.from) - a) / total, width: (ymdToDay(col.until) - ymdToDay(col.from)) / total };
}

/** 「11月4日〜12月10日」（年が違えば年も）。1日だけなら「10月26日」 */
export function periodLabel(start: string, end: string, today: string): string {
  const f = (ymd: string, withYear: boolean) =>
    `${withYear ? `${Number(ymd.slice(0, 4))}年` : ""}${Number(ymd.slice(5, 7))}月${Number(ymd.slice(8, 10))}日`;
  const thisYear = today.slice(0, 4);
  const wy = start.slice(0, 4) !== thisYear || end.slice(0, 4) !== start.slice(0, 4);
  if (start === end) return f(start, wy);
  return `${f(start, wy)}〜${f(end, wy || end.slice(0, 4) !== start.slice(0, 4))}`;
}

/** 棒の横に出す短い日付（◆の横） */
export function shortDate(ymd: string): string {
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`;
}
