// スタッフ個人シート（指示書 mk_training_staff_sheet_1）— 純関数
//
// 「わたしの可能性ノート」（本人）と「可能性ノート」（院長・担当の幹部）を、同じ人の同じシートとして
// 「スタッフ個人シート」に組み直す。最初に出す3つ（次の1on1と今する操作／今月取り組みたいこと／
// 前回の面談で決めたこと）を、**今あるデータから選ぶだけ**の関数をここに置く。
// シートは新しく何も保存しない（予約・事前アンケート・目標・1on1記録の表示だけ）。
//
// "@/" や DB に依存しない（node --experimental-strip-types で直接確かめられるように）。

/** 名前の正規化（名簿の名前 ↔ アカウントの表示名の突き合わせ用）。NFKC＋空白（全角・半角）を除く */
export function normalizePersonName(name: string): string {
  return (name ?? "").normalize("NFKC").replace(/[\s　]+/g, "");
}

type GoalLike = {
  level: string;
  status: string;
  dueDate: string;
  updatedAt: string;
};

/**
 * 「今月取り組みたいこと」= 段 monthly で status=active の目標。
 * 2件以上なら 期限が近い順（期限なしは後ろ）→ 更新が新しい順 で1件目。残りの件数も返す。
 */
export function pickMonthlyGoal<G extends GoalLike>(goals: readonly G[]): { goal: G | null; others: number } {
  const list = goals.filter((g) => g.level === "monthly" && g.status === "active");
  const sorted = [...list].sort((a, b) => {
    const ad = a.dueDate || "9999-99-99";
    const bd = b.dueDate || "9999-99-99";
    if (ad !== bd) return ad.localeCompare(bd);
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });
  return { goal: sorted[0] ?? null, others: Math.max(0, sorted.length - 1) };
}

type PromiseLike = { heldOn: string };

/** 「前回の面談で決めたこと」= 実施日が今日より前でいちばん新しい回の約束（今日の回は「今回」なので含めない） */
export function pickLastPromise<P extends PromiseLike>(promises: readonly P[], today: string): P | null {
  const past = promises.filter((p) => p.heldOn && p.heldOn < today);
  past.sort((a, b) => b.heldOn.localeCompare(a.heldOn));
  return past[0] ?? null;
}

export type SheetScheduleState = "none" | "waiting" | "overdue" | "answered";

/** 予定と回答の状態から、最初に出す「今する操作」の種類を決める */
export function sheetActionKind(s: { answered: boolean; state: string } | null): SheetScheduleState {
  if (!s) return "none";
  if (s.answered || s.state === "answered") return "answered";
  if (s.state === "overdue") return "overdue";
  return "waiting";
}

/** "YYYY-MM-DD" 同士の日数差（b - a） */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return 0;
  return Math.round((db - da) / 86_400_000);
}

export type RosterMatch = {
  name: string;
  /** 1人に決まったときだけ */
  userId: string;
  /** 同じ名前の人が2人以上いて決められない */
  ambiguous: boolean;
};

/**
 * スタッフ名簿（名前だけ）とアカウント（userId・表示名）を、正規化した名前で突き合わせる。
 * 1人に決まらないときは紐付けない（ambiguous）。空の名前は除く。
 */
export function matchRosterNames(
  names: readonly string[],
  people: readonly { userId: string; name: string }[]
): RosterMatch[] {
  const byName = new Map<string, Set<string>>();
  for (const p of people) {
    const k = normalizePersonName(p.name);
    if (!k || !p.userId) continue;
    const set = byName.get(k) ?? new Set<string>();
    set.add(p.userId);
    byName.set(k, set);
  }
  return names
    .filter((n) => typeof n === "string" && n.trim())
    .map((name) => {
      const ids = byName.get(normalizePersonName(name));
      if (!ids || ids.size === 0) return { name, userId: "", ambiguous: false };
      if (ids.size > 1) return { name, userId: "", ambiguous: true };
      return { name, userId: [...ids][0], ambiguous: false };
    });
}
