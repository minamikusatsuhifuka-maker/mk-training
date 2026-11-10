// 🧭 欲求の一覧（指示書276）— 院長だけが全スタッフの5つの基本的欲求と15項目をまとめて見る画面の純関数
//
// 【守ること】
//   ・見られるのは院長だけ（判定はサーバー：needs-overview-server.ts の authorizeNeedsOverview）。
//   ・この画面は読むだけ。サーベイの値・公開設定・判定はどこにも保存しない。
//   ・値は、本人の公開設定どおりに削いだあと（survey-visibility.ts の redactSurveyForViewer）だけを使う
//     （164/182：スタッフには「非公開＝管理者にも見えません」と説明している。院長も例外にしない）。
//   ・高い欲求（上位3）・低い欲求（下位3）は、可能性ノートの「欲求の視点」と同じ関数（computeNeedsPerspective）で決める。
//   ・比べる・平均は、院長の決定（2026-11-10・指示書276）で、この画面の中だけで行う（可能性ノートの「欲求の視点」では今までどおり比べない）。
//
// 依存は needs-survey.ts だけ（"@/" を使わない）。

import { NEED_DETAIL_ITEMS, NEED_KEYS, type NeedKey } from "./needs-survey";

/** 比べるで並べられる人数 */
export const NEEDS_COMPARE_MAX = 6;
export const NEEDS_COMPARE_MIN = 2;
/** 7人目を選ぼうとしたときの知らせ（新しい言葉・報告書に載せる） */
export const NEEDS_COMPARE_LIMIT_MESSAGE = `比べられるのは${NEEDS_COMPARE_MAX}人までです。ほかの人を外してから選んでください。`;
/** 選んだ人の組み合わせを覚える場所（院長の端末の中だけ・サーバーには残さない） */
export const NEEDS_COMPARE_STORAGE_KEY = "mk_needs_compare_v1";
/** サーベイの結果が見られない人の表示（可能性ノートの「欲求の視点」と同じ言葉・非公開か未入力かを分けない） */
export const NEEDS_EMPTY_LABEL = "診断結果がまだありません";

export type NeedsPersonRow = {
  userId: string;
  name: string;
  /** 職種（プロフィールの役職id／名前）。未設定は空 */
  roleId: string;
  roleLabel: string;
  /** 今いる段（270）。"" ＝まだ決めていません */
  level: string;
  levelName: string;
  testSeed?: true;
  /** 5つの基本的欲求（見られるものだけ） */
  values: Partial<Record<NeedKey, number>>;
  /** 15項目の「欲求」（見られるものだけ・項目key → 値） */
  details: Record<string, number>;
  /** 回答日 YYYY-MM-DD（見られる結果が無ければ空） */
  answeredOn: string;
  /** 高い欲求（上位3）・低い欲求（下位3）の15項目key（needs-survey の key） */
  strong: string[];
  weak: string[];
};

export type NeedsColumn = { kind: "need"; key: NeedKey } | { kind: "item"; key: string };

export function hasNeedsResult(p: Pick<NeedsPersonRow, "values" | "details">): boolean {
  return Object.keys(p.values).length > 0 || Object.keys(p.details).length > 0;
}

/** 5つ→15項目：欲求ごとにまとめた列の並び（15項目を出すときは、それぞれの欲求の下に並べる） */
export function needsColumns(withItems: boolean): NeedsColumn[] {
  const out: NeedsColumn[] = [];
  for (const k of NEED_KEYS) {
    out.push({ kind: "need", key: k });
    if (withItems) for (const it of NEED_DETAIL_ITEMS) if (it.need === k) out.push({ kind: "item", key: it.key });
  }
  return out;
}

export function columnValue(p: Pick<NeedsPersonRow, "values" | "details">, c: NeedsColumn): number | undefined {
  const v = c.kind === "need" ? p.values[c.key] : p.details[c.key];
  return typeof v === "number" ? v : undefined;
}

export type NeedsSort = { col: "name" | "role" | "level" | "answeredOn" | NeedsColumn; dir: "asc" | "desc" };

/** 並べ替え（値の無い人はいつも下・同じ値は名前の順） */
export function sortNeedsRows<T extends NeedsPersonRow>(rows: readonly T[], sort: NeedsSort, levelOrder: readonly string[] = []): T[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "ja");
  const key = (p: T): string | number | undefined => {
    const c = sort.col;
    if (c === "name") return p.name;
    if (c === "role") return p.roleLabel || undefined;
    if (c === "answeredOn") return p.answeredOn || undefined;
    if (c === "level") {
      const i = levelOrder.indexOf(p.level);
      return p.level ? (i >= 0 ? i : levelOrder.length) : undefined;
    }
    return columnValue(p, c);
  };
  return rows.slice().sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === undefined && kb === undefined) return byName(a, b);
    if (ka === undefined) return 1;
    if (kb === undefined) return -1;
    const d = typeof ka === "number" && typeof kb === "number" ? ka - kb : String(ka).localeCompare(String(kb), "ja");
    return d !== 0 ? d * sign : byName(a, b);
  });
}

/** 絞り込み。role/level が "" なら絞らない。level の NOT_DECIDED は「まだ決めていません」 */
export const LEVEL_NOT_DECIDED = "__none__";
export function filterNeedsRows<T extends NeedsPersonRow>(
  rows: readonly T[],
  f: { role: string; level: string; showTest: boolean }
): T[] {
  return rows.filter((p) => {
    if (p.testSeed && !f.showTest) return false;
    if (f.role && p.roleId !== f.role) return false;
    if (f.level === LEVEL_NOT_DECIDED) return !p.level;
    if (f.level && p.level !== f.level) return false;
    return true;
  });
}

// ─── 比べる ───

/** 選ぶ・外す。7人目は選ばずに limited:true を返す（画面が短く知らせる） */
export function toggleCompare(selected: readonly string[], userId: string): { next: string[]; limited: boolean } {
  if (selected.includes(userId)) return { next: selected.filter((x) => x !== userId), limited: false };
  if (selected.length >= NEEDS_COMPARE_MAX) return { next: [...selected], limited: true };
  return { next: [...selected, userId], limited: false };
}

/** 列を左右に入れ替える（dir: -1=左へ / 1=右へ） */
export function moveCompare(selected: readonly string[], userId: string, dir: -1 | 1): string[] {
  const i = selected.indexOf(userId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= selected.length) return [...selected];
  const next = [...selected];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 覚えていた組み合わせを読み直す（壊れた値・いなくなった人・7人目以降は捨てる） */
export function normalizeCompareSelection(raw: unknown, knownIds: ReadonlySet<string> | null = null): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !v || out.includes(v)) continue;
    if (knownIds && !knownIds.has(v)) continue;
    out.push(v);
    if (out.length >= NEEDS_COMPARE_MAX) break;
  }
  return out;
}

/** 行ごとの、選んだ人の中のいちばん高い値・いちばん低い値（値が2人以上そろい、差があるときだけ） */
export function rowExtremes(values: readonly (number | undefined)[]): { max: number; min: number } | null {
  const nums = values.filter((v): v is number => typeof v === "number");
  if (nums.length < 2) return null;
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  return max === min ? null : { max, min };
}

// ─── チーム全体の傾向 ───

/** 値ごとの人数の区切り（0〜100 を 5つに分ける） */
export const NEEDS_BINS: readonly { from: number; to: number; label: string }[] = [
  { from: 0, to: 19, label: "0〜19" },
  { from: 20, to: 39, label: "20〜39" },
  { from: 40, to: 59, label: "40〜59" },
  { from: 60, to: 79, label: "60〜79" },
  { from: 80, to: 100, label: "80〜100" },
];

export type NeedTrend = { key: NeedKey; count: number; average: number | null; bins: number[] };

export function teamTrends(rows: readonly Pick<NeedsPersonRow, "values">[]): NeedTrend[] {
  return NEED_KEYS.map((key) => {
    const nums = rows.map((r) => r.values[key]).filter((v): v is number => typeof v === "number");
    const bins = NEEDS_BINS.map((b) => nums.filter((v) => v >= b.from && v <= b.to).length);
    const average = nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : null;
    return { key, count: nums.length, average, bins };
  });
}

// ─── 前回との比較 ───

export type NeedsSnapshot = {
  answeredOn: string;
  values: Partial<Record<NeedKey, number>>;
  details: Record<string, number>;
};

/** 前回 → 今回の差（両方に値がある所だけ）。数値だけ・良し悪しは付けない */
export function snapshotDiff(prev: NeedsSnapshot, cur: NeedsSnapshot): { values: Partial<Record<NeedKey, number>>; details: Record<string, number> } {
  const values: Partial<Record<NeedKey, number>> = {};
  for (const k of NEED_KEYS) {
    const a = prev.values[k];
    const b = cur.values[k];
    if (typeof a === "number" && typeof b === "number") values[k] = b - a;
  }
  const details: Record<string, number> = {};
  for (const it of NEED_DETAIL_ITEMS) {
    const a = prev.details[it.key];
    const b = cur.details[it.key];
    if (typeof a === "number" && typeof b === "number") details[it.key] = b - a;
  }
  return { values, details };
}
