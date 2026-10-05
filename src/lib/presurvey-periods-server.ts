// 年度の始まりの月を読む（指示書204 §2）— サーバー専用
//
// 「クリニックの歩み」（content_store の portal_metrics）に院長が設定した年度の始まりの月を使う。
// 読めなければ既定（6月）。事前アンケートの 1-4（1年後）・1-5（今期末）の日付表示に使う。

import { serverGetContentRow } from "./content-store-server";
import {
  DEFAULT_FISCAL_START_MONTH,
  PORTAL_METRICS_KEY,
} from "./clinic-metrics-core";

export async function loadFiscalStartMonth(): Promise<number> {
  try {
    const row = await serverGetContentRow(PORTAL_METRICS_KEY);
    const m = (row?.data as { fiscalStartMonth?: unknown } | null)?.fiscalStartMonth;
    return typeof m === "number" && m >= 1 && m <= 12 ? m : DEFAULT_FISCAL_START_MONTH;
  } catch {
    return DEFAULT_FISCAL_START_MONTH;
  }
}
