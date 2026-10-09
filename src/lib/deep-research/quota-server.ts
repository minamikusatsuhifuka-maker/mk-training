// ディープリサーチの回数の上限（指示書226 §3）— **サーバー専用**
//
// 【置き場所】新しい表もSQLも足さない。content_store の2つのキーに持つ。
//   deep_research_config … { monthlyLimit } 院長が /admin/delegation で決める上限
//   deep_research_usage  … { months: { "YYYY-MM": { userId: 回数 } } } 月ごと・人ごとの回数
// どちらも**サーバー専用キー**（content-store-policy）。/api/content-store からは読めも書けもしない＝
// 任された幹部が自分の上限や回数を書き換えることはできない。
//
// 【判定の順】①院長なら素通り（上限なし）②その月の回数 < 上限なら1回足して通す ③それ以外は断る。
// 数えるのは **AIを呼ぶ操作**。断るときは 429 と、226 §3 の文言をそのまま返す。
//
// 【同時に押したとき】読んで足して書くだけなので、ごく短い間に2本同時だと1回ぶん多く通ることがある。
// 院内で院長＋数名という規模なので、この取りこぼしは許容する（上限の意味＝課金の歯止めは保たれる）。

import { getContentRow, putContentRow } from "@/lib/content-store-core";
import { isAdminUser } from "@/lib/admin-role";
import type { User } from "@supabase/supabase-js";
import {
  DEEP_RESEARCH_DEFAULT_LIMIT,
  addUse,
  emptyUsage,
  exhaustedMessage,
  jstMonthKey,
  normalizeLimit,
  normalizeUsage,
  quotaState,
  usedCount,
  type DeepResearchUsage,
  type QuotaState,
} from "./quota";

const CONTENT_TYPE = "deep_research";
export const DEEP_RESEARCH_CONFIG_KEY = "deep_research_config";
export const DEEP_RESEARCH_USAGE_KEY = "deep_research_usage";

/** 上限（読めなければ初期値＝止まらないほうではなく、決まった値に倒す） */
export async function loadDeepResearchLimit(): Promise<number> {
  try {
    const row = await getContentRow(DEEP_RESEARCH_CONFIG_KEY);
    const data = row?.data as { monthlyLimit?: unknown } | null;
    if (data && data.monthlyLimit !== undefined) return normalizeLimit(data.monthlyLimit);
  } catch {
    /* 読めないときは初期値 */
  }
  return DEEP_RESEARCH_DEFAULT_LIMIT;
}

/** 上限を保存（院長のみ。呼び出し側で isAdminUser を確かめてから呼ぶ） */
export async function saveDeepResearchLimit(limit: number): Promise<number> {
  const value = normalizeLimit(limit);
  const ok = await putContentRow(DEEP_RESEARCH_CONFIG_KEY, CONTENT_TYPE, { monthlyLimit: value });
  if (!ok) throw new Error("上限の保存に失敗しました");
  return value;
}

async function loadUsage(): Promise<DeepResearchUsage> {
  try {
    const row = await getContentRow(DEEP_RESEARCH_USAGE_KEY);
    return normalizeUsage(row?.data ?? null);
  } catch {
    return emptyUsage();
  }
}

/** いまの残り回数（画面に出すため・数えない） */
export async function deepResearchQuota(user: User): Promise<QuotaState> {
  const [limit, usage] = await Promise.all([loadDeepResearchLimit(), loadUsage()]);
  return quotaState({
    isAdmin: isAdminUser(user),
    limit,
    used: usedCount(usage, jstMonthKey(), user.id),
  });
}

export type QuotaConsumeResult =
  | { ok: true; state: QuotaState }
  | { ok: false; state: QuotaState; message: string };

/**
 * 1回ぶん使う。院長は数えるだけで止めない。
 * 上限に達している幹部には ok:false と 226 §3 の文言を返す（呼び出し側が 429 で返す）。
 */
export async function consumeDeepResearchQuota(user: User): Promise<QuotaConsumeResult> {
  const month = jstMonthKey();
  const [limit, usage] = await Promise.all([loadDeepResearchLimit(), loadUsage()]);
  const isAdmin = isAdminUser(user);
  const before = quotaState({ isAdmin, limit, used: usedCount(usage, month, user.id) });

  if (!isAdmin && before.exhausted) {
    return { ok: false, state: before, message: exhaustedMessage(limit) };
  }

  const next = addUse(usage, month, user.id);
  try {
    await putContentRow(DEEP_RESEARCH_USAGE_KEY, CONTENT_TYPE, next);
  } catch {
    // 数えられなくても実行は止めない（院長の業務を止めないため）。次の実行で数え直される
  }
  return {
    ok: true,
    state: quotaState({ isAdmin, limit, used: usedCount(next, month, user.id) }),
  };
}
