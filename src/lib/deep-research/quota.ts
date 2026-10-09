// ディープリサーチの回数の上限（指示書226 §3）— 純関数・"@/" や DB に依存しない
//
// 【決まり（226 §0-2・§3）】
//   ・院長（管理者）は上限なし。委任された幹部は **1人あたり月◯回まで**（初期値30）
//   ・上限の数は院長が /admin/delegation で変えられる
//   ・数えるのは **AIを呼ぶ操作**（リサーチの実行、まとめ・クイズなどの生成それぞれで1回）
//   ・毎月1日（日本時間）に0に戻る＝「その月に何回呼んだか」を月ごとに持つだけ
//   ・判定はサーバー（実行のAPI）で行う。画面の表示は目安

/** 上限の初期値（226 §0-2） */
export const DEEP_RESEARCH_DEFAULT_LIMIT = 30;
/** 設定で置ける上限の範囲（0＝使わせない。極端な値を保存させない） */
export const DEEP_RESEARCH_LIMIT_MIN = 0;
export const DEEP_RESEARCH_LIMIT_MAX = 1000;
/** 回数を残しておく月数（これより古い月は保存のたびに捨てる） */
export const DEEP_RESEARCH_USAGE_KEEP_MONTHS = 6;

/** 日本時間の「その月」（"YYYY-MM"）。回数はこの単位で数える */
export function jstMonthKey(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 保存された上限を読む（壊れていたら初期値） */
export function normalizeLimit(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return DEEP_RESEARCH_DEFAULT_LIMIT;
  const i = Math.floor(n);
  if (i < DEEP_RESEARCH_LIMIT_MIN) return DEEP_RESEARCH_LIMIT_MIN;
  if (i > DEEP_RESEARCH_LIMIT_MAX) return DEEP_RESEARCH_LIMIT_MAX;
  return i;
}

export type DeepResearchUsage = {
  /** "YYYY-MM" → { userId: 回数 } */
  months: Record<string, Record<string, number>>;
};

export function emptyUsage(): DeepResearchUsage {
  return { months: {} };
}

/** 保存されたものを整える（知らない形・負の数は捨てる） */
export function normalizeUsage(raw: unknown): DeepResearchUsage {
  const out = emptyUsage();
  const src = (raw as { months?: unknown } | null)?.months;
  if (!src || typeof src !== "object") return out;
  for (const [month, perUser] of Object.entries(src as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}$/.test(month) || !perUser || typeof perUser !== "object") continue;
    const m: Record<string, number> = {};
    for (const [userId, n] of Object.entries(perUser as Record<string, unknown>)) {
      const v = typeof n === "number" ? n : Number(n);
      if (userId && Number.isFinite(v) && v > 0) m[userId] = Math.floor(v);
    }
    if (Object.keys(m).length > 0) out.months[month] = m;
  }
  return out;
}

/** その人のその月の回数 */
export function usedCount(usage: DeepResearchUsage, month: string, userId: string): number {
  return usage.months[month]?.[userId] ?? 0;
}

/** 1回ぶん足した新しい記録を返す（元は変えない）。古い月は捨てる */
export function addUse(
  usage: DeepResearchUsage,
  month: string,
  userId: string,
  keepMonths: number = DEEP_RESEARCH_USAGE_KEEP_MONTHS
): DeepResearchUsage {
  const months: DeepResearchUsage["months"] = {};
  const keep = Object.keys({ ...usage.months, [month]: {} })
    .sort()
    .slice(-Math.max(1, keepMonths));
  for (const m of keep) months[m] = { ...(usage.months[m] ?? {}) };
  months[month] = { ...(months[month] ?? {}) };
  months[month][userId] = (months[month][userId] ?? 0) + 1;
  return { months };
}

export type QuotaState = {
  /** 上限なし（院長） */
  unlimited: boolean;
  limit: number;
  used: number;
  /** 残り（上限なしのときは null） */
  remaining: number | null;
  /** これ以上できない */
  exhausted: boolean;
};

export function quotaState(opts: {
  isAdmin: boolean;
  limit: number;
  used: number;
}): QuotaState {
  if (opts.isAdmin) {
    return { unlimited: true, limit: opts.limit, used: opts.used, remaining: null, exhausted: false };
  }
  const remaining = Math.max(0, opts.limit - opts.used);
  return { unlimited: false, limit: opts.limit, used: opts.used, remaining, exhausted: remaining <= 0 };
}

/** 画面に出す残りの文（226 §3「例：今月あと12回」） */
export function remainingLabel(s: QuotaState): string {
  if (s.unlimited) return "回数の上限はありません";
  return `今月あと${s.remaining}回`;
}

/** 上限に達したときの文（226 §3・文言を変えないこと） */
export function exhaustedMessage(limit: number): string {
  return `今月の上限（${limit}回）に達しました。`;
}

/** 委任の画面に出す説明（226 §1・数字は設定の値） */
export function deepResearchDelegationReason(limit: number): string {
  return `AIの利用（課金）。任された人は1人 月${limit}回まで`;
}
