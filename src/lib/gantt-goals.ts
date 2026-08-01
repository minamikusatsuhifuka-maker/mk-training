// クリニック目標のガントチャート（指示書77で移植、78で日単位化＋詳細5項目を追加）
// content_store 単一キー `portal_gantt` に { goals, updatedAt } を保存する（専用テーブルなし）。
// 期間は日単位（start/end = "YYYY-MM-DD"）。カテゴリ・milestones の概念は task-matrix から保持
// （milestones の編集UIは無し＝概念のみ・スコープ外）。task-matrix に無い概念（order 等）は新設しない。
//
// 【既存データ互換（指示書78・lazy migration）】
//   77時点の年・月形式（startYear/startMonth/endYear/endMonth）は normalizeGoals で
//   start=その月の1日 / end=その月の末日 に自動変換する（読み込み境界で必ず通す）。
//   保存も同じ正規化済みデータ（新形式）を書くので、次回以降は新形式で読める。
//   → 既存目標が消えたり位置がずれたりしない。
//
// 保存は管理者のみ（77と同じ。UIの isAdmin と同じ isAdminUser 判定を lib 境界でも行う）。
// ※ anonキー直書き設計のためサーバー側での完全な強制は構造上不可（指示書70）。
//    lib を通る経路での防止までがこの関数のスコープ。

import { loadPortalObject, savePortalObject } from "./portal-store";
import { getSupabaseBrowserClient } from "./supabase-browser";
import { isAdminUser } from "./admin-role";

export const PORTAL_GANTT_KEY = "portal_gantt";

// milestones の month は 0=1月 … 11=12月（task-matrix と同一・概念保持）
export type Milestone = { year: number; month: number; label: string };

// 期間の分類（指示書126）
export type GanttHorizon = "short" | "mid" | "long";

export type GanttGoal = {
  id: string;
  title: string;
  category: string;
  start: string; // "YYYY-MM-DD"
  end: string; // "YYYY-MM-DD"
  progress: number; // 0〜100
  color: string; // GANTT_COLOR_OPTIONS の value
  milestones: Milestone[];
  // 詳細5項目（指示書78。すべて任意）
  purpose?: string; // 🎯 目的
  background?: string; // 📖 背景
  significance?: string; // 💡 意義
  achievedState?: string; // 🌟 達成イメージ
  memo?: string; // 📝 自由メモ
  // 期間の分類の手動上書き（指示書126・任意）。未上書きの目標には保存しない。
  // 表示分類は常に resolveHorizon(start, end, horizonOverride) で計算する
  horizonOverride?: GanttHorizon;
};

export type GanttData = { goals: GanttGoal[]; updatedAt: string };

// ─── 定数 ───

export const MONTH_LABELS = [
  "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月",
];

// カテゴリの「概念」は task-matrix から保持。既定値はクリニック目標向けに自然な語へ。
export const GANTT_CATEGORIES = [
  "診療",
  "業務改善",
  "教育・研修",
  "設備・環境",
  "採用",
  "広報・集患",
  "経営",
];

export const GANTT_COLOR_OPTIONS = [
  { value: "gantt-pink", label: "ピンク" },
  { value: "gantt-purple", label: "パープル" },
  { value: "gantt-blue", label: "ブルー" },
  { value: "gantt-green", label: "グリーン" },
  { value: "gantt-orange", label: "オレンジ" },
  { value: "gantt-red", label: "レッド" },
  { value: "gantt-teal", label: "ティール" },
  { value: "gantt-indigo", label: "インディゴ" },
];

export const GANTT_GRADIENT: Record<
  string,
  { from: string; to: string; ring: string; dot: string }
> = {
  "gantt-pink":   { from: "from-pink-400",    to: "to-rose-500",   ring: "ring-pink-300",    dot: "bg-stone-600" },
  "gantt-purple": { from: "from-purple-400",  to: "to-violet-600", ring: "ring-purple-300",  dot: "bg-gray-500" },
  "gantt-blue":   { from: "from-blue-400",    to: "to-cyan-500",   ring: "ring-blue-300",    dot: "bg-blue-500" },
  "gantt-green":  { from: "from-emerald-400", to: "to-green-600",  ring: "ring-emerald-300", dot: "bg-emerald-500" },
  "gantt-orange": { from: "from-orange-400",  to: "to-amber-500",  ring: "ring-orange-300",  dot: "bg-orange-500" },
  "gantt-red":    { from: "from-red-400",     to: "to-rose-600",   ring: "ring-red-300",     dot: "bg-red-500" },
  "gantt-teal":   { from: "from-teal-400",    to: "to-cyan-600",   ring: "ring-teal-300",    dot: "bg-teal-500" },
  "gantt-indigo": { from: "from-indigo-400",  to: "to-violet-500", ring: "ring-indigo-300",  dot: "bg-indigo-500" },
};

export function getGanttGradient(color: string) {
  return GANTT_GRADIENT[color] ?? GANTT_GRADIENT["gantt-blue"];
}

// 表示する年度タブ（今年から5年）。module 読込時に new Date() しないよう関数化。
export function ganttYears(now: Date = new Date()): number[] {
  const y = now.getFullYear();
  return Array.from({ length: 5 }, (_, i) => y + i);
}

// ─── 日付ユーティリティ（日単位のバー座標系。すべてローカル暦日） ───

const DAY_MS = 86400 * 1000;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// "YYYY-MM-DD" → ローカル0時の Date（不正なら null）
export function parseYmd(s: string | undefined | null): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 年の境界（元日0時ms 〜 翌年元日0時ms）
function yearBounds(year: number): { startMs: number; endMs: number } {
  return {
    startMs: new Date(year, 0, 1).getTime(),
    endMs: new Date(year + 1, 0, 1).getTime(),
  };
}

// goal の開始ms／終了ms（終了日を含めるため翌日0時を排他終端にする）
function goalStartMs(goal: GanttGoal): number {
  return (parseYmd(goal.start) ?? new Date()).getTime();
}
function goalEndMsExclusive(goal: GanttGoal): number {
  const d = parseYmd(goal.end) ?? parseYmd(goal.start) ?? new Date();
  return d.getTime() + DAY_MS;
}

// 選択年に表示すべきか（期間が年に重なるか）
export function goalOverlapsYear(goal: GanttGoal, year: number): boolean {
  const { startMs, endMs } = yearBounds(year);
  return goalStartMs(goal) < endMs && goalEndMsExclusive(goal) > startMs;
}

// 選択年内でのバー位置（%）。年の日数（365/366）に対する日単位の正確な割合。
export function barFractions(
  goal: GanttGoal,
  year: number
): { left: number; width: number } {
  const { startMs, endMs } = yearBounds(year);
  const span = endMs - startMs;
  const clampStart = Math.max(goalStartMs(goal), startMs);
  const clampEnd = Math.min(goalEndMsExclusive(goal), endMs);
  const left = ((clampStart - startMs) / span) * 100;
  const width = (Math.max(0, clampEnd - clampStart) / span) * 100;
  return { left, width };
}

// 「今日」の年内位置（0〜1）。選択年と今年が違えば null。
export function todayFractionInYear(
  year: number,
  now: Date = new Date()
): number | null {
  if (now.getFullYear() !== year) return null;
  const { startMs, endMs } = yearBounds(year);
  const todayMid = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  return (todayMid - startMs) / (endMs - startMs);
}

// マイルストーンの年内位置（月ベース・概念保持のため現行方式のまま）
export function milestonePosInYear(month: number): number {
  return (month + 0.5) / 12;
}

export function genGanttId(): string {
  return `gantt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 期間の分類（指示書126・短期/中期/長期） ───

// 表示メタ（バッジ・フィルタ・編集モーダルで共用）
export const GANTT_HORIZONS: {
  value: GanttHorizon;
  label: string; // 絵文字込みの表示名
  desc: string;
  badgeClass: string;
}[] = [
  { value: "short", label: "🌱短期", desc: "〜6ヶ月", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  { value: "mid", label: "🌿中期", desc: "〜3年", badgeClass: "bg-teal-50 text-teal-700 border-teal-100" },
  { value: "long", label: "🌳長期", desc: "3年超", badgeClass: "bg-amber-50 text-amber-800 border-amber-100" },
];

export function ganttHorizonMeta(h: GanttHorizon) {
  return GANTT_HORIZONS.find((x) => x.value === h) ?? GANTT_HORIZONS[1];
}

// 開始日に n ヶ月加算。月末の繰り上がり（例: 8/31+6ヶ月）は対象月の末日にクランプ
function addMonthsClamped(d: Date, months: number): Date {
  const y = d.getFullYear();
  const m = d.getMonth() + months;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), lastDay));
}

// 分類の解決（共有1本・指示書126）: override ?? 期間からの自動判定。
// 自動判定は「月加算比較方式」: 終了日が 開始+6ヶ月 の日付より前（=期間がちょうど
// 6ヶ月以内）なら短期、開始+36ヶ月より前なら中期、それ以外（3年超）は長期。
// 1日でも超えたら次の区分。日付不正時は中期に倒す（表示が壊れない安全網）。
export function resolveHorizon(
  start: string,
  end: string,
  override?: GanttHorizon
): GanttHorizon {
  if (override === "short" || override === "mid" || override === "long") {
    return override;
  }
  const s = parseYmd(start);
  const e = parseYmd(end) ?? s;
  if (!s || !e) return "mid";
  if (e.getTime() < addMonthsClamped(s, 6).getTime()) return "short";
  if (e.getTime() < addMonthsClamped(s, 36).getTime()) return "mid";
  return "long";
}

// 「今日が期間内」の判定（ホーム要約・進行中の目標に使う）。日単位・終了日を含む。
export function isGoalActive(goal: GanttGoal, now: Date = new Date()): boolean {
  const todayMid = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  return goalStartMs(goal) <= todayMid && todayMid < goalEndMsExclusive(goal);
}

// 期間ラベル "2026/1/15〜2026/7/31"
export function formatGoalRange(goal: GanttGoal): string {
  const s = parseYmd(goal.start);
  const e = parseYmd(goal.end);
  const f = (d: Date | null) =>
    d ? `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}` : "";
  return `${f(s)}〜${f(e)}`;
}

// 詳細5項目のいずれかが記入済みか
export function hasAnyDetail(goal: GanttGoal): boolean {
  return [
    goal.purpose,
    goal.background,
    goal.significance,
    goal.achievedState,
    goal.memo,
  ].some((v) => typeof v === "string" && v.trim() !== "");
}

// ─── 読込・保存（正規化＝月→日 lazy migration をここに集約） ───

function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function normalizeGoals(raw: unknown): GanttGoal[] {
  const data = raw as { goals?: unknown } | null;
  const list = Array.isArray(data?.goals) ? data!.goals : [];
  const out: GanttGoal[] = [];
  for (const g of list as Record<string, unknown>[]) {
    if (!g || typeof g !== "object") continue;
    if (typeof g.id !== "string" || typeof g.title !== "string") continue;

    // 期間: 新形式(start/end)を優先。無ければ旧・年月形式から変換（start=月初/end=月末）。
    let start = optStr(g.start);
    let end = optStr(g.end);
    if (!start || !parseYmd(start)) {
      const sy = Number(g.startYear);
      const sm = Number(g.startMonth);
      if (Number.isFinite(sy) && Number.isFinite(sm)) {
        start = `${sy}-${pad2(sm + 1)}-01`;
      }
    }
    if (!end || !parseYmd(end)) {
      const ey = Number(g.endYear);
      const em = Number(g.endMonth);
      if (Number.isFinite(ey) && Number.isFinite(em)) {
        const lastDay = new Date(ey, em + 1, 0).getDate();
        end = `${ey}-${pad2(em + 1)}-${pad2(lastDay)}`;
      }
    }
    // どちらも決まらなければこの目標はスキップ（壊れたデータの安全網）
    if (!start || !parseYmd(start)) continue;
    if (!end || !parseYmd(end)) end = start;
    // 終了 < 開始 の逆転は開始に揃える
    if (end < start) end = start;

    const ms = Array.isArray(g.milestones)
      ? (g.milestones as Record<string, unknown>[])
          .filter(
            (m) =>
              m &&
              typeof m.year === "number" &&
              typeof m.month === "number" &&
              typeof m.label === "string"
          )
          .map((m) => ({
            year: m.year as number,
            month: m.month as number,
            label: m.label as string,
          }))
      : [];

    out.push({
      id: g.id,
      title: g.title,
      category:
        typeof g.category === "string" ? g.category : GANTT_CATEGORIES[0],
      start,
      end,
      progress:
        typeof g.progress === "number"
          ? Math.max(0, Math.min(100, g.progress))
          : 0,
      color: typeof g.color === "string" ? g.color : "gantt-blue",
      milestones: ms,
      purpose: optStr(g.purpose),
      background: optStr(g.background),
      significance: optStr(g.significance),
      achievedState: optStr(g.achievedState),
      memo: optStr(g.memo),
      // 上書き値はホワイトリスト検証して素通し（保存経路は全件正規化→丸ごと保存の
      // ため、ここで通さないと次の保存で上書きが消える・指示書126）
      horizonOverride:
        g.horizonOverride === "short" ||
        g.horizonOverride === "mid" ||
        g.horizonOverride === "long"
          ? g.horizonOverride
          : undefined,
    });
  }
  return out;
}

export async function loadGanttGoals(): Promise<GanttGoal[]> {
  const raw = await loadPortalObject<unknown>(PORTAL_GANTT_KEY, null);
  return normalizeGoals(raw);
}

// 管理者のみ保存（lib 境界チェック）。非管理者・未ログインは false。
// 保存前に normalizeGoals を通し、新形式（start/end）で書き出す（lazy migration の確定）。
export async function saveGanttGoals(goals: GanttGoal[]): Promise<boolean> {
  try {
    const { data } = await getSupabaseBrowserClient().auth.getUser();
    if (!isAdminUser(data.user)) return false;
  } catch {
    return false;
  }
  const clean = normalizeGoals({ goals });
  const payload: GanttData = { goals: clean, updatedAt: new Date().toISOString() };
  return savePortalObject(PORTAL_GANTT_KEY, payload);
}
