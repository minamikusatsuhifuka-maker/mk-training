// 今月の意識目標・月間スローガン（指示書141で新設）
// content_store キー `portal_monthly_slogan` に { items: MonthlySlogan[] } を保存（専用テーブルなし）。
// 月（YYYY-MM）ごとに1件。過去月の履歴を残し、当月・翌月の事前設定ができる
// （スタッフ側は当月分のみ表示・未設定の月はカード自体を非表示）。
//
// 保存は管理者のみ（クリニックの歩み=clinic-metrics と同じ流儀で lib 境界チェック）。
// 読み書き両境界で正規化（ym検証・本文必須・重複年月は後勝ち・ym降順）する。

import { loadPortalItems, savePortalItems } from "./portal-store";
import { getSupabaseBrowserClient } from "./supabase-browser";
import { isAdminUser } from "./admin-role";
import { PORTAL_KEYS } from "@/types/portal";

export type MonthlySlogan = {
  ym: string; // "YYYY-MM"
  slogan: string; // スローガン本文（1〜2行想定・必須）
  note?: string; // 任意の補足ひとこと
  updatedAt: string;
};

const YM_RE = /^\d{4}-\d{2}$/;

// 現在の年月（端末ローカル時刻＝院内はJST運用）
export function currentYm(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// "2026-08" → "2026年8月"（表示用）
export function formatYmJa(ym: string): string {
  if (!YM_RE.test(ym)) return ym;
  const [y, mo] = ym.split("-");
  return `${y}年${Number(mo)}月`;
}

// ym検証・本文必須・重複年月は後勝ちで排除・ym降順（新しい月が先頭）
export function normalizeMonthlySlogans(raw: unknown): MonthlySlogan[] {
  const byYm = new Map<string, MonthlySlogan>();
  if (Array.isArray(raw)) {
    for (const r of raw as Record<string, unknown>[]) {
      if (!r || typeof r !== "object") continue;
      const ym = typeof r.ym === "string" ? r.ym : "";
      const slogan = typeof r.slogan === "string" ? r.slogan.trim() : "";
      if (!YM_RE.test(ym) || !slogan) continue;
      const note = typeof r.note === "string" ? r.note.trim() : "";
      const item: MonthlySlogan = {
        ym,
        slogan,
        updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : "",
      };
      if (note) item.note = note;
      byYm.set(ym, item);
    }
  }
  return Array.from(byYm.values()).sort((a, b) => b.ym.localeCompare(a.ym));
}

// 指定月の1件を返す（未設定なら null → カード非表示）
export function sloganForYm(
  items: MonthlySlogan[],
  ym: string
): MonthlySlogan | null {
  return items.find((s) => s.ym === ym) ?? null;
}

export async function loadMonthlySlogans(): Promise<MonthlySlogan[]> {
  const raw = await loadPortalItems<unknown>(PORTAL_KEYS.monthlySlogan, []);
  return normalizeMonthlySlogans(raw);
}

// 管理者のみ保存（lib 境界チェック）。非管理者・未ログインは false。
export async function saveMonthlySlogans(
  items: MonthlySlogan[]
): Promise<boolean> {
  try {
    const { data: u } = await getSupabaseBrowserClient().auth.getUser();
    if (!isAdminUser(u.user)) return false;
  } catch {
    return false;
  }
  return savePortalItems(PORTAL_KEYS.monthlySlogan, normalizeMonthlySlogans(items));
}
