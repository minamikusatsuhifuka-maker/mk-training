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
import {
  PORTAL_METRICS_KEY,
  normalizeClinicMetrics,
  type ClinicMetrics,
} from "./clinic-metrics-core";

// 型・純粋関数は clinic-metrics-core.ts（196: サーバーからも使うため分離）
export * from "./clinic-metrics-core";

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
