// 今週の質問（指示書46-A/47、46Rでプール自動ローテーション追加）
// content_store `weekly_questions` に単一オブジェクトで保存:
//   {
//     question: string,                                  // 現在の質問文
//     answers: { [weekKey]: [{ id, name, text, at }] },  // id = ログインuserId / 匿名ID
//     questionByWeek: { [weekKey]: string },             // 週→質問文（アーカイブ復元用）
//     reactions: { [weekKey]: { [answerId]: { like|thanks: Reactor[] } } },
//     pool: string[],                                    // 質問プール（管理画面で編集）
//     currentIndex: number                               // プール内の現在位置
//   }
// weekKey = その週の月曜日のJST日付（"YYYY-MM-DD"）。
// identity（userId/匿名ID/名前）は news-reactions の getReactorIdentity を共用する。
// 週切替: questionByWeek[今週] が未記録ならプールを1つ進めて記録（withWeeklyRotation）。
// 管理者の手動上書き（✏️質問を編集）は questionByWeek[今週] を書くので、その週はそれが優先。

import { loadPortalObject, savePortalObject } from "./portal-store";
import type { Reactor } from "./news-reactions";

export const WEEKLY_QUESTIONS_KEY = "weekly_questions";

export type WeeklyAnswer = {
  id: string; // ログインuserId または 匿名ID（端末単位）
  name: string;
  text: string;
  at: string; // ISO日時
};

export type WeeklyReactionKey = "like" | "thanks";

export const WEEKLY_REACTION_META: {
  key: WeeklyReactionKey;
  emoji: string;
  label: string;
}[] = [
  { key: "like", emoji: "👍", label: "いいね" },
  { key: "thanks", emoji: "🙏", label: "ありがとう" },
];

export type WeeklyAnswerReactions = Partial<Record<WeeklyReactionKey, Reactor[]>>;

export type WeeklyQuestionsData = {
  question: string;
  answers: Record<string, WeeklyAnswer[]>;
  questionByWeek: Record<string, string>;
  reactions: Record<string, Record<string, WeeklyAnswerReactions>>;
  pool: string[];
  currentIndex: number;
};

// 初期プール10問（指示書46R）。管理画面「⚙ 機能」タブで編集可能。
export const DEFAULT_QUESTION_POOL: string[] = [
  "最近のプチ幸せは？",
  "子どもの頃の夢は？",
  "おすすめのお店・スポットは？",
  "今ハマっている食べ物は？",
  "休日の理想の過ごし方は？",
  "最近ちょっと頑張ったことは？",
  "好きな季節とその理由は？",
  "学生時代の部活・習い事は？",
  "行ってみたい場所は？",
  "最近観た/読んだおすすめは？",
];

export function emptyWeeklyQuestions(): WeeklyQuestionsData {
  return {
    question: "",
    answers: {},
    questionByWeek: {},
    reactions: {},
    pool: [...DEFAULT_QUESTION_POOL],
    currentIndex: 0,
  };
}

// ─── 週キー ───

// その週の月曜日（JST）を "YYYY-MM-DD" で返す
export function currentWeekKey(now: Date = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const day = jst.getUTCDay(); // 0=日
  jst.setUTCDate(jst.getUTCDate() - ((day + 6) % 7)); // 月曜まで戻す
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// "2026-07-06" → "7/6〜7/12"（月〜日）
export function weekRangeLabel(weekKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekKey);
  if (!m) return weekKey;
  const start = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const end = new Date(start.getTime() + 6 * 86400 * 1000);
  return `${start.getUTCMonth() + 1}/${start.getUTCDate()}〜${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
}

// ─── 読込・保存 ───

export function normalizeWeeklyQuestions(raw: unknown): WeeklyQuestionsData {
  if (!raw || typeof raw !== "object") return emptyWeeklyQuestions();
  const o = raw as Record<string, unknown>;

  const answers: Record<string, WeeklyAnswer[]> = {};
  if (o.answers && typeof o.answers === "object") {
    for (const [wk, list] of Object.entries(o.answers as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const valid = list
        .filter(
          (a): a is Record<string, unknown> =>
            !!a &&
            typeof a === "object" &&
            typeof (a as Record<string, unknown>).id === "string" &&
            typeof (a as Record<string, unknown>).text === "string"
        )
        .map((a) => ({
          id: a.id as string,
          name: typeof a.name === "string" ? a.name : "",
          text: a.text as string,
          at: typeof a.at === "string" ? a.at : "",
        }));
      if (valid.length > 0) answers[wk] = valid;
    }
  }

  const questionByWeek: Record<string, string> = {};
  if (o.questionByWeek && typeof o.questionByWeek === "object") {
    for (const [wk, q] of Object.entries(
      o.questionByWeek as Record<string, unknown>
    )) {
      if (typeof q === "string" && q.trim()) questionByWeek[wk] = q;
    }
  }

  const reactions =
    o.reactions && typeof o.reactions === "object"
      ? (o.reactions as WeeklyQuestionsData["reactions"])
      : {};

  // pool: 未保存（46R以前のデータ）は既定10問。保存済みなら空配列でも尊重（自動ローテ停止の意思）。
  const pool = Array.isArray(o.pool)
    ? o.pool
        .filter((q): q is string => typeof q === "string" && !!q.trim())
        .map((q) => q.trim())
    : [...DEFAULT_QUESTION_POOL];

  const currentIndex =
    typeof o.currentIndex === "number" &&
    Number.isFinite(o.currentIndex) &&
    o.currentIndex >= 0
      ? Math.floor(o.currentIndex)
      : 0;

  return {
    question: typeof o.question === "string" ? o.question : "",
    answers,
    questionByWeek,
    reactions,
    pool,
    currentIndex,
  };
}

export async function loadWeeklyQuestions(): Promise<WeeklyQuestionsData> {
  const raw = await loadPortalObject<unknown>(WEEKLY_QUESTIONS_KEY, null);
  return normalizeWeeklyQuestions(raw);
}

export async function saveWeeklyQuestions(
  data: WeeklyQuestionsData
): Promise<boolean> {
  return savePortalObject(WEEKLY_QUESTIONS_KEY, data);
}

// ─── 純関数（履歴・回答・リアクション） ───

// 週次ローテーション＋今週の質問の確定（指示書46R。変更不要なら null）。
// ホーム表示のたびに呼ばれても差分がある時だけ保存される（冪等）。
// - questionByWeek[今週] が記録済み → その質問が正（手動上書き含む）。question フィールドだけ同期。
// - 未記録＋プールあり → currentIndex を循環で進めて今週の質問を確定・記録。
// - 未記録＋プール空 → 現行 question をそのまま記録（47までの挙動）。
export function withWeeklyRotation(
  data: WeeklyQuestionsData,
  weekKey: string = currentWeekKey()
): WeeklyQuestionsData | null {
  const recorded = data.questionByWeek[weekKey]?.trim();
  if (recorded) {
    if (data.question !== recorded) return { ...data, question: recorded };
    return null;
  }
  if (data.pool.length === 0) {
    const q = data.question.trim();
    if (!q) return null;
    return {
      ...data,
      questionByWeek: { ...data.questionByWeek, [weekKey]: q },
    };
  }
  // 過去に一度でも週が確定していれば1つ進め、初回は現在位置から開始する
  const advance = Object.keys(data.questionByWeek).length > 0 ? 1 : 0;
  const idx = (data.currentIndex + advance) % data.pool.length;
  const q = data.pool[idx];
  return {
    ...data,
    question: q,
    currentIndex: idx,
    questionByWeek: { ...data.questionByWeek, [weekKey]: q },
  };
}

// 同一IDの回答は週内で1件（上書き）。投稿順は維持し、既存の位置を置き換える。
export function upsertWeeklyAnswer(
  data: WeeklyQuestionsData,
  weekKey: string,
  answer: WeeklyAnswer
): WeeklyQuestionsData {
  const list = data.answers[weekKey] ?? [];
  const idx = list.findIndex((a) => a.id === answer.id);
  const next =
    idx >= 0
      ? list.map((a, i) => (i === idx ? answer : a))
      : [...list, answer];
  return { ...data, answers: { ...data.answers, [weekKey]: next } };
}

export function removeWeeklyAnswer(
  data: WeeklyQuestionsData,
  weekKey: string,
  answerId: string
): WeeklyQuestionsData {
  const list = (data.answers[weekKey] ?? []).filter((a) => a.id !== answerId);
  const answers = { ...data.answers };
  if (list.length > 0) answers[weekKey] = list;
  else delete answers[weekKey];

  // 対象回答のリアクションも掃除する
  const weekEntry = { ...(data.reactions[weekKey] ?? {}) };
  delete weekEntry[answerId];
  const reactions = { ...data.reactions };
  if (Object.keys(weekEntry).length > 0) reactions[weekKey] = weekEntry;
  else delete reactions[weekKey];

  return { ...data, answers, reactions };
}

// news-reactions の setReaction と同じ「最終状態を強制設定」方式（並行更新での反転防止）
export function setWeeklyReaction(
  data: WeeklyQuestionsData,
  weekKey: string,
  answerId: string,
  key: WeeklyReactionKey,
  reactor: Reactor,
  active: boolean
): WeeklyQuestionsData {
  const weekEntry = { ...(data.reactions[weekKey] ?? {}) };
  const ansEntry = { ...(weekEntry[answerId] ?? {}) };
  const list = (ansEntry[key] ?? []).filter((r) => r.id !== reactor.id);
  const nextList = active
    ? [...list, { id: reactor.id, name: reactor.name }]
    : list;
  if (nextList.length > 0) ansEntry[key] = nextList;
  else delete ansEntry[key];
  if (Object.keys(ansEntry).length > 0) weekEntry[answerId] = ansEntry;
  else delete weekEntry[answerId];
  const reactions = { ...data.reactions };
  if (Object.keys(weekEntry).length > 0) reactions[weekKey] = weekEntry;
  else delete reactions[weekKey];
  return { ...data, reactions };
}

export function hasWeeklyReacted(
  data: WeeklyQuestionsData,
  weekKey: string,
  answerId: string,
  key: WeeklyReactionKey,
  reactorId: string
): boolean {
  return (data.reactions[weekKey]?.[answerId]?.[key] ?? []).some(
    (r) => r.id === reactorId
  );
}

export function weeklyReactionCount(
  data: WeeklyQuestionsData,
  weekKey: string,
  answerId: string,
  key: WeeklyReactionKey
): number {
  return data.reactions[weekKey]?.[answerId]?.[key]?.length ?? 0;
}

// ─── 個人の回答履歴（指示書47 ■1） ───

export type WeeklyHistoryItem = {
  weekKey: string;
  question: string | null; // null = 質問文が記録されていない週（「（当時の質問）」表示）
  text: string;
  at: string;
};

// その人の回答を全週から収集する。週ごとに id 一致を優先し、無ければ name 一致。
// 新しい週が先頭。
export function collectMemberAnswers(
  data: WeeklyQuestionsData,
  userId: string,
  name: string
): WeeklyHistoryItem[] {
  const nm = (name ?? "").trim();
  const items: WeeklyHistoryItem[] = [];
  for (const [weekKey, list] of Object.entries(data.answers)) {
    let mine = list.filter((a) => a.id === userId);
    if (mine.length === 0 && nm) {
      mine = list.filter((a) => a.name.trim() === nm);
    }
    for (const a of mine) {
      items.push({
        weekKey,
        question: data.questionByWeek[weekKey]?.trim() || null,
        text: a.text,
        at: a.at,
      });
    }
  }
  items.sort((x, y) =>
    x.weekKey === y.weekKey
      ? y.at.localeCompare(x.at)
      : y.weekKey.localeCompare(x.weekKey)
  );
  return items;
}
