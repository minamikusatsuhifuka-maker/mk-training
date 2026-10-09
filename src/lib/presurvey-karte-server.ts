// 事前アンケートの第1部と育成カルテの「目標」の連動（指示書204 §4）— サーバー専用
//
// 【考え方】
// 第1部の 1-1（目的）・1-3（3年）・1-4（年）・1-5（半期）・1-6（月）は
// **育成カルテの目標そのもの**。事前アンケートを提出すると、
//   ・変わった段だけ目標を更新する（変わっていなければ**更新日も変えない**）
//   ・「週」は聞かないし変えない
//   ・書き込むのは**本人のカルテの目標だけ**。本人が自分の目標を直すときと同じ範囲（title だけ）
//   ・開いたあとに他の画面で目標が変わっていたら**上書きせず止める**（版の照合）
// 保存の口は /api/one-on-one/presurvey のまま（汎用の保存口に種類を足さない）。
//
// 【片方だけ保存された状態を残さない（204 §4）】
// 1つのトランザクションにはできないので、
//   1) 版を照合 → 2) 目標を書く → 3) 事前アンケートを書く → 失敗したら 2) を元に戻す
// の順で行い、どちらも入っていない／どちらも入っている のどちらかになるようにする。
//
// クライアントから import しないこと。

import {
  fetchGoals,
  newGrowthId,
  saveGoal,
  type GrowthAdminClient,
} from "./staff-growth-server";
import { normalizeGoal, type Goal, type GoalLevel } from "./staff-growth";
import {
  PRESURVEY_KARTE_LEVELS,
  isKarteLinked,
  type PresurveyAnswer,
  type PresurveyQuestion,
} from "./one-on-one-presurvey";

/** 第1部の1段ぶんの、いまのカルテの値（画面の初期値と版の照合に使う） */
export type KarteGoalSlot = {
  level: GoalLevel;
  /** いまの目標の行id（まだ無ければ空） */
  goalId: string;
  /** いまの目標の本文 */
  title: string;
  /** 版（照合に使う。無ければ空） */
  updatedAt: string;
};

export type KarteGoalMap = Partial<Record<GoalLevel, KarteGoalSlot>>;

/** 版の食い違い（204 §4） */
export class KarteGoalConflictError extends Error {
  constructor() {
    super("可能性ノートの目標が更新されています。読み込み直してください");
    this.name = "KarteGoalConflictError";
  }
}

/**
 * その段の「いまの目標」を1つ選ぶ。
 * 同じ段に複数あれば、**まだ終わっていないもののうち更新が新しいもの**を使う
 * （終わったものしか無ければ、その中で新しいもの）。
 */
export function pickGoalOfLevel(goals: Goal[], level: GoalLevel): Goal | null {
  const same = goals.filter((g) => g.level === level);
  if (same.length === 0) return null;
  const active = same.filter((g) => g.status !== "done");
  const pool = active.length > 0 ? active : same;
  return [...pool].sort(
    (a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "") || (b.createdAt || "").localeCompare(a.createdAt || "")
  )[0];
}

/** 第1部に入れる、いまのカルテの値をまとめて読む */
export async function loadKarteGoalSlots(
  admin: GrowthAdminClient,
  userId: string
): Promise<{ slots: KarteGoalMap; tableMissing: boolean }> {
  const { goals, tableMissing } = await fetchGoals(admin, userId);
  const slots: KarteGoalMap = {};
  for (const level of PRESURVEY_KARTE_LEVELS) {
    const g = pickGoalOfLevel(goals, level);
    slots[level] = {
      level,
      goalId: g?.id ?? "",
      title: g?.title ?? "",
      updatedAt: g?.updatedAt ?? "",
    };
  }
  return { slots, tableMissing };
}

/** 画面から送られてくる版（段 → updatedAt） */
export type KarteBaseline = Partial<Record<GoalLevel, string>>;

export function normalizeKarteBaseline(raw: unknown): KarteBaseline {
  const out: KarteBaseline = {};
  if (!raw || typeof raw !== "object") return out;
  const o = raw as Record<string, unknown>;
  for (const level of PRESURVEY_KARTE_LEVELS) {
    const v = o[level];
    if (typeof v === "string") out[level] = v.slice(0, 64);
  }
  return out;
}

export type KarteGoalPlanItem = {
  level: GoalLevel;
  /** 書き換える目標（無ければ新しく作る） */
  goal: Goal;
  /** 元に戻すための前の姿（新規なら null） */
  before: Goal | null;
  /** 新しく作るのか */
  created: boolean;
};

export type KarteGoalPlan = {
  items: KarteGoalPlanItem[];
  /** 変わらなかった段（更新しない＝更新日も変えない） */
  unchanged: GoalLevel[];
};

/**
 * 回答から「どの段を更新するか」を決める。
 * ・答えが空の段は触らない（消さない）
 * ・いまの値と同じ段は触らない（**更新日も変えない**）
 * ・開いたときの版と食い違っていたら KarteGoalConflictError
 */
export function planKarteGoalUpdates(args: {
  userId: string;
  questions: PresurveyQuestion[];
  answers: PresurveyAnswer[];
  slots: KarteGoalMap;
  baseline: KarteBaseline;
  goals: Goal[];
  now: string;
}): KarteGoalPlan {
  const { userId, questions, answers, slots, baseline, goals, now } = args;
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const items: KarteGoalPlanItem[] = [];
  const unchanged: GoalLevel[] = [];

  for (const q of questions) {
    if (!isKarteLinked(q)) continue;
    const level = q.karteLevel as GoalLevel;
    const a = byId.get(q.id);
    const next = (a?.text ?? "").trim();
    const slot = slots[level];
    const current = (slot?.title ?? "").trim();

    // 版の照合: 開いたときの版と、いまのカルテの版が違えば止める
    const base = baseline[level];
    if (base !== undefined && base !== (slot?.updatedAt ?? "")) {
      throw new KarteGoalConflictError();
    }

    if (!next || next === current) {
      unchanged.push(level);
      continue;
    }

    const existing = slot?.goalId ? goals.find((g) => g.id === slot.goalId) ?? null : null;
    if (existing) {
      const updated = normalizeGoal(existing.id, {
        ...(existing as unknown as Record<string, unknown>),
        title: next,
        updatedAt: now,
      });
      if (!updated) continue;
      items.push({ level, goal: updated, before: existing, created: false });
    } else {
      // まだ無い段は新しく作る（本人の目標として・上位の段につなぐ）
      const parent = parentGoalIdOf(level, slots);
      const created = normalizeGoal(newGrowthId("goal"), {
        userId,
        level,
        parentId: parent,
        title: next,
        detail: "",
        why: "",
        jitsu: [],
        axes: [],
        achievedState: "",
        status: "active",
        dueDate: "",
        support: "",
        supportBy: "",
        comments: [],
        review: "",
        agreedOn: "",
        agreedBy: "",
        agreedByName: "",
        fromLearningId: "",
        createdAt: now,
        updatedAt: now,
      });
      if (!created) continue;
      items.push({ level, goal: created, before: null, created: true });
    }
  }
  return { items, unchanged };
}

/** 1つ上の段の目標id（つながりを作る。無ければ空） */
function parentGoalIdOf(level: GoalLevel, slots: KarteGoalMap): string {
  const i = PRESURVEY_KARTE_LEVELS.indexOf(level);
  for (let k = i - 1; k >= 0; k--) {
    const up = slots[PRESURVEY_KARTE_LEVELS[k]];
    if (up?.goalId) return up.goalId;
  }
  return "";
}

/** 計画どおりに書く。途中で失敗したら、書けた分を元に戻してから投げる */
export async function applyKarteGoalPlan(
  admin: GrowthAdminClient,
  plan: KarteGoalPlan,
  updatedBy: string
): Promise<{ rollback: () => Promise<void> }> {
  const done: KarteGoalPlanItem[] = [];
  const rollback = async () => {
    for (const it of done.reverse()) {
      try {
        if (it.before) await saveGoal(admin, it.before, updatedBy);
        else await saveGoal(admin, { ...it.goal, title: "", status: "done" }, updatedBy);
      } catch (e) {
        console.error(
          "[presurvey-karte] 目標を元に戻せませんでした:",
          e instanceof Error ? e.message : e
        );
      }
    }
  };
  try {
    for (const it of plan.items) {
      await saveGoal(admin, it.goal, updatedBy);
      done.push(it);
    }
  } catch (e) {
    await rollback();
    throw e;
  }
  return { rollback };
}

/** 操作ログに残す言い方（本文は残さない） */
export function karteGoalLogChanges(plan: KarteGoalPlan): { field: string; before: string; after: string }[] {
  return plan.items.map((it) => ({
    field: `目標（${it.level}）`,
    before: it.created ? "（未登録）" : "記載あり",
    after: "記載あり（事前アンケートから更新）",
  }));
}
