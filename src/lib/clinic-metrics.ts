// クリニックの歩み（指示書80で新設、81で保険/自費/合算・期間つき施策に拡張）
// content_store 単一キー `portal_metrics` に { months, initiatives, updatedAt } を保存（専用テーブルなし）。
// 経営計画書・第三章「数字は鏡」の実装。売上を追わせるためではなく、質を尽くした結果を映すため。
//
// 保存は管理者のみ（76・77と同じ流儀）。UIの isAdmin と同じ isAdminUser 判定を lib 境界でも行う。
// ※ anonキー直書き設計のためサーバー側での完全な強制は構造上不可（指示書70）。
//    lib を通る経路での防止までがこの関数のスコープ。
// 読み書き両境界で正規化（ym/日付検証・数値化・重複年月の排除・不正データ破棄）する。

import { loadPortalObject, savePortalObject } from "./portal-store";
import { getSupabaseBrowserClient } from "./supabase-browser";
import { isAdminUser } from "./admin-role";

export const PORTAL_METRICS_KEY = "portal_metrics";

// 売上は万円の整数。insurance=保険売上・selfPay=自費売上（施術＋物販）。
// counseling=カウンセリング件数。すべて欠測（null）許容。
// sales は旧80データの後方互換（内訳なしの合算）。内訳（insurance/selfPay）があれば正規化で null 化する。
// 合算は保存せず表示時に計算する（二重管理しない）。
export type MonthMetric = {
  ym: string; // "YYYY-MM"
  insurance: number | null;
  selfPay: number | null;
  counseling: number | null;
  sales?: number | null; // 旧データ互換（内訳未入力の合算のみ）
};

export type Initiative = {
  id: string;
  date: string; // "YYYY-MM-DD"（開始日）
  endDate?: string; // "YYYY-MM-DD"（任意・期間つき施策の終了日。date<=endDate）
  label: string;
};

export type ClinicMetrics = {
  months: MonthMetric[];
  initiatives: Initiative[];
  updatedAt: string;
};

const YM_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function emptyClinicMetrics(): ClinicMetrics {
  return { months: [], initiatives: [], updatedAt: "" };
}

export function genInitiativeId(): string {
  return `init-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// null | 数値へ正規化（空文字・NaN・負値は null 扱い、整数へ丸め）
function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

// 施策の date（"YYYY-MM-DD"）→ 月キー "YYYY-MM"
export function initiativeYm(date: string): string {
  return date.slice(0, 7);
}

// "2026-07" → { year:"26", month:"7" }（軸ラベル用）
export function shortYm(ym: string): { year: string; month: string } {
  if (!YM_RE.test(ym)) return { year: "", month: ym };
  const [y, mo] = ym.split("-");
  return { year: y.slice(2), month: String(Number(mo)) };
}

// ─── 合算・内訳のヘルパ（合算は保存せず表示時に計算） ───

// 保険・自費のいずれかが入力済みか（内訳あり）
export function hasBreakdown(m: MonthMetric): boolean {
  return m.insurance != null || m.selfPay != null;
}

// 内訳なしの旧データ（合算のみ）か
export function isLegacyOnly(m: MonthMetric): boolean {
  return !hasBreakdown(m) && m.sales != null;
}

// 合算（棒の高さ）。内訳ありは保険＋自費、旧データは sales、どちらも無ければ null。
export function monthTotal(m: MonthMetric): number | null {
  if (hasBreakdown(m)) return (m.insurance ?? 0) + (m.selfPay ?? 0);
  if (m.sales != null) return m.sales;
  return null;
}

// 施策の期間ラベル "2026/3/1〜5/31"（単日は "2026/7/15"）
export function formatInitiative(i: Initiative): string {
  const f = (d: string) => {
    const [y, m, dd] = d.split("-");
    return `${y}/${Number(m)}/${Number(dd)}`;
  };
  return i.endDate ? `${f(i.date)}〜${f(i.endDate)}` : f(i.date);
}

// ─── 正規化（読み書き両境界で通す） ───

export function normalizeClinicMetrics(raw: unknown): ClinicMetrics {
  const o = (raw ?? {}) as Record<string, unknown>;

  // months: ym検証・数値化・重複年月は後勝ちで排除・ym昇順
  const byYm = new Map<string, MonthMetric>();
  if (Array.isArray(o.months)) {
    for (const r of o.months as Record<string, unknown>[]) {
      if (!r || typeof r !== "object") continue;
      const ym = typeof r.ym === "string" ? r.ym : "";
      if (!YM_RE.test(ym)) continue;
      const insurance = toNumOrNull(r.insurance);
      const selfPay = toNumOrNull(r.selfPay);
      const counseling = toNumOrNull(r.counseling);
      // 旧80データ互換: sales は内訳が無いときだけ残す（二重管理しない）
      let sales = toNumOrNull(r.sales);
      if (insurance != null || selfPay != null) sales = null;
      const month: MonthMetric = { ym, insurance, selfPay, counseling };
      if (sales != null) month.sales = sales;
      byYm.set(ym, month);
    }
  }
  const months = Array.from(byYm.values()).sort((a, b) =>
    a.ym.localeCompare(b.ym)
  );

  // initiatives: 日付検証・ラベル必須・endDate任意（date<=endDate違反は破棄）・id補完・日付昇順
  const initiatives: Initiative[] = [];
  if (Array.isArray(o.initiatives)) {
    for (const r of o.initiatives as Record<string, unknown>[]) {
      if (!r || typeof r !== "object") continue;
      const date = typeof r.date === "string" ? r.date : "";
      const label = typeof r.label === "string" ? r.label.trim() : "";
      if (!DATE_RE.test(date) || !label) continue;
      let endDate =
        typeof r.endDate === "string" && DATE_RE.test(r.endDate)
          ? r.endDate
          : undefined;
      if (endDate && endDate < date) endDate = undefined; // date<=endDate を検証
      initiatives.push({
        id: typeof r.id === "string" && r.id ? r.id : genInitiativeId(),
        date,
        label,
        ...(endDate ? { endDate } : {}),
      });
    }
  }
  initiatives.sort((a, b) => a.date.localeCompare(b.date));

  return {
    months,
    initiatives,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

// ─── 読込・保存 ───

export async function loadClinicMetrics(): Promise<ClinicMetrics> {
  const raw = await loadPortalObject<unknown>(PORTAL_METRICS_KEY, null);
  return normalizeClinicMetrics(raw);
}

// 管理者のみ保存（lib 境界チェック）。非管理者・未ログインは false。
export async function saveClinicMetrics(
  data: ClinicMetrics
): Promise<boolean> {
  try {
    const { data: u } = await getSupabaseBrowserClient().auth.getUser();
    if (!isAdminUser(u.user)) return false;
  } catch {
    return false;
  }
  const clean = normalizeClinicMetrics(data);
  const payload: ClinicMetrics = { ...clean, updatedAt: new Date().toISOString() };
  return savePortalObject(PORTAL_METRICS_KEY, payload);
}

// ─── 表示用ヘルパ ───

// 表示する月軸 = months と initiatives（開始月・終了月）の和集合を昇順に。
// 施策だけで数値未入力の月・期間施策の終端月も列として出せる（欠測はグラフ側でスキップ）。
export function buildAxisYms(data: ClinicMetrics): string[] {
  const set = new Set<string>();
  for (const m of data.months) set.add(m.ym);
  for (const i of data.initiatives) {
    const s = initiativeYm(i.date);
    if (YM_RE.test(s)) set.add(s);
    if (i.endDate) {
      const e = initiativeYm(i.endDate);
      if (YM_RE.test(e)) set.add(e);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

// ─── 12か月移動平均（指示書93・整形層に集約。表示期間に依存しない全データ基準） ───

function ymToIndex(ym: string): number {
  const [y, mo] = ym.split("-").map(Number);
  return y * 12 + (mo - 1);
}
function indexToYm(idx: number): string {
  const y = Math.floor(idx / 12);
  const mo = (idx % 12) + 1;
  return `${y}-${String(mo).padStart(2, "0")}`;
}

/**
 * 合算売上（保険＋自費／旧データは sales）の12か月 trailing 移動平均を全データ基準で計算する。
 * - その月を含む過去12暦月の窓で、値がある月だけを母数に平均（完全欠測月は母数から除外）。
 * - データ開始から12か月未満の月は「ある分の平均」を返し、開業月から線が途切れないようにする。
 * - 返却は ym → 平均値（万円）の Map。データ月の範囲 [最初,最後] の全暦月に値を持つ。
 */
export function computeMovingAvg12(data: ClinicMetrics): Map<string, number> {
  const totalByYm = new Map<string, number>();
  for (const m of data.months) {
    const t = monthTotal(m);
    if (t != null) totalByYm.set(m.ym, t);
  }
  const result = new Map<string, number>();
  if (totalByYm.size === 0) return result;

  const indices = Array.from(totalByYm.keys())
    .filter((ym) => YM_RE.test(ym))
    .map(ymToIndex)
    .sort((a, b) => a - b);
  const firstIdx = indices[0];
  const lastIdx = indices[indices.length - 1];

  for (let idx = firstIdx; idx <= lastIdx; idx++) {
    let sum = 0;
    let count = 0;
    for (let w = idx - 11; w <= idx; w++) {
      const v = totalByYm.get(indexToYm(w));
      if (v != null) {
        sum += v;
        count++;
      }
    }
    if (count > 0) result.set(indexToYm(idx), sum / count);
  }
  return result;
}
