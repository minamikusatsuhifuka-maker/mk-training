// クリニックの歩み（指示書80）: 月別売上×カウンセリング数×施策マーカー
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

// 売上は万円の整数、カウンセリングは件数。どちらか未入力（null）を許容＝欠測。
export type MonthMetric = {
  ym: string; // "YYYY-MM"
  sales: number | null;
  counseling: number | null;
};

export type Initiative = {
  id: string;
  date: string; // "YYYY-MM-DD"
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

// "2026-07" → "26/7"（軸ラベル用）
export function shortYm(ym: string): { year: string; month: string } {
  const m = YM_RE.exec(ym);
  if (!m) return { year: "", month: ym };
  const [y, mo] = ym.split("-");
  return { year: y.slice(2), month: String(Number(mo)) };
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
      byYm.set(ym, {
        ym,
        sales: toNumOrNull(r.sales),
        counseling: toNumOrNull(r.counseling),
      });
    }
  }
  const months = Array.from(byYm.values()).sort((a, b) =>
    a.ym.localeCompare(b.ym)
  );

  // initiatives: 日付検証・ラベル必須・id補完・日付昇順
  const initiatives: Initiative[] = [];
  if (Array.isArray(o.initiatives)) {
    for (const r of o.initiatives as Record<string, unknown>[]) {
      if (!r || typeof r !== "object") continue;
      const date = typeof r.date === "string" ? r.date : "";
      const label = typeof r.label === "string" ? r.label.trim() : "";
      if (!DATE_RE.test(date) || !label) continue;
      initiatives.push({
        id: typeof r.id === "string" && r.id ? r.id : genInitiativeId(),
        date,
        label,
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

// 表示する月軸 = months と initiatives（施策のあるym）の和集合を昇順に。
// これにより「施策だけあって数値未入力の月」も列として出せる（欠測はグラフ側でスキップ）。
export function buildAxisYms(data: ClinicMetrics): string[] {
  const set = new Set<string>();
  for (const m of data.months) set.add(m.ym);
  for (const i of data.initiatives) {
    const ym = initiativeYm(i.date);
    if (YM_RE.test(ym)) set.add(ym);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
