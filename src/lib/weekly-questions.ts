// みんなへの質問（指示書46-A/47、46Rでプール自動ローテーション、75で配信間隔設定）
// content_store `weekly_questions` に単一オブジェクトで保存:
//   {
//     question: string,                                  // 現在の質問文
//     answers: { [weekKey]: [{ id, name, text, at }] },  // id = ログインuserId / 匿名ID
//     questionByWeek: { [weekKey]: string },             // 期間→質問文（アーカイブ復元用）
//     reactions: { [weekKey]: { [answerId]: { like|thanks: Reactor[] } } },
//     pool: string[],                                    // 質問プール（管理画面で編集）
//     currentIndex: number                               // プール内の現在位置
//   }
// weekKey = 期間開始日のJST日付（"YYYY-MM-DD"）。指示書74までは「その週の月曜日」、
// 75以降は配信間隔設定（portal_question_schedule）のアンカーから算出した期間開始日。
// どちらも同じ形式なので過去データはそのまま読める（キー・保存形式は変更しない）。
// identity（userId/匿名ID/名前）は news-reactions の getReactorIdentity を共用する。
// 期間切替: questionByWeek[現期間] が未記録ならプールを1つ進めて記録（withWeeklyRotation）。
// 管理者の手動上書き（✏️質問を編集）は questionByWeek[現期間] を書くので、その期間はそれが優先。

import { loadPortalObject, savePortalObject } from "./portal-store";
import type { Reactor } from "./news-reactions";
import { getSupabaseBrowserClient } from "./supabase-browser";
import { isAdminUser } from "./admin-role";

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

// ─── 配信間隔（指示書75） ───
// content_store `portal_question_schedule` に単一オブジェクトで保存:
//   { interval: "weekly"|"biweekly"|"monthly"|"off", anchorAt: "ISO8601" }
// anchorAt = 管理画面で間隔を変更した時刻（アンカー）。そこから周期を刻む。
// 未設定（null）= 従来どおり「その週の月曜日」起点の毎週（デプロイ起因で質問を変えない）。

export type QuestionScheduleInterval = "weekly" | "biweekly" | "monthly" | "off";

export type QuestionSchedule = {
  interval: QuestionScheduleInterval;
  anchorAt: string; // ISO8601
};

export const QUESTION_SCHEDULE_KEY = "portal_question_schedule";

export const QUESTION_INTERVAL_META: {
  key: QuestionScheduleInterval;
  label: string;
}[] = [
  { key: "weekly", label: "毎週" },
  { key: "biweekly", label: "隔週" },
  { key: "monthly", label: "月1回" },
  { key: "off", label: "停止" },
];

export function normalizeQuestionSchedule(
  raw: unknown
): QuestionSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const interval = QUESTION_INTERVAL_META.find((m) => m.key === o.interval)?.key;
  if (!interval) return null;
  if (typeof o.anchorAt !== "string" || Number.isNaN(Date.parse(o.anchorAt)))
    return null;
  return { interval, anchorAt: o.anchorAt };
}

export async function loadQuestionSchedule(): Promise<QuestionSchedule | null> {
  const raw = await loadPortalObject<unknown>(QUESTION_SCHEDULE_KEY, null);
  return normalizeQuestionSchedule(raw);
}

export async function saveQuestionSchedule(
  schedule: QuestionSchedule
): Promise<boolean> {
  return savePortalObject(QUESTION_SCHEDULE_KEY, schedule);
}

// ─── 期間計算（JST暦日ベース・決定的） ───
// 期間キーは従来の weekKey と同じ "YYYY-MM-DD"（期間開始日のJST日付）。

const DAY_MS = 86400 * 1000;
const JST_OFFSET_MS = 9 * 3600 * 1000;
const JP_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

// Date → そのJST暦日を表す UTC 0時のミリ秒（日単位の比較・加減算に使う）
function jstDayMs(date: Date): number {
  return Math.floor((date.getTime() + JST_OFFSET_MS) / DAY_MS) * DAY_MS;
}

function keyFromDayMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function dayMsFromKey(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// 月1回用: y年m月（0始まり）の「アンカーと同じ日」。存在しない日はその月の末日。
function monthlyStartMs(y: number, m0: number, anchorDay: number): number {
  const lastDay = new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
  return Date.UTC(y, m0, Math.min(anchorDay, lastDay));
}

// 現在の期間の開始日（UTC 0時ms）。off はアンカー日で固定（切替なし）。
function currentPeriodStartDayMs(schedule: QuestionSchedule, now: Date): number {
  const anchor = jstDayMs(new Date(schedule.anchorAt));
  const today = jstDayMs(now);
  if (today <= anchor) return anchor;
  if (schedule.interval === "weekly" || schedule.interval === "biweekly") {
    const span = (schedule.interval === "weekly" ? 7 : 14) * DAY_MS;
    return anchor + Math.floor((today - anchor) / span) * span;
  }
  if (schedule.interval === "monthly") {
    const anchorDay = new Date(anchor).getUTCDate();
    const t = new Date(today);
    let y = t.getUTCFullYear();
    let m0 = t.getUTCMonth();
    let start = monthlyStartMs(y, m0, anchorDay);
    if (start > today) {
      m0 -= 1;
      if (m0 < 0) {
        m0 = 11;
        y -= 1;
      }
      start = monthlyStartMs(y, m0, anchorDay);
    }
    return Math.max(start, anchor);
  }
  return anchor; // off
}

// 現在の期間キー。未設定（schedule=null）は従来の週キー（月曜起点）をそのまま使う。
export function currentPeriodKey(
  schedule: QuestionSchedule | null,
  now: Date = new Date()
): string {
  if (!schedule) return currentWeekKey(now);
  return keyFromDayMs(currentPeriodStartDayMs(schedule, now));
}

// 次回切替日（UTC 0時ms）。off は切替なし（null）。未設定は次の月曜。
export function nextSwitchDayMs(
  schedule: QuestionSchedule | null,
  now: Date = new Date()
): number | null {
  if (!schedule) {
    const wk = dayMsFromKey(currentWeekKey(now));
    return wk === null ? null : wk + 7 * DAY_MS;
  }
  if (schedule.interval === "off") return null;
  const start = currentPeriodStartDayMs(schedule, now);
  if (schedule.interval === "weekly") return start + 7 * DAY_MS;
  if (schedule.interval === "biweekly") return start + 14 * DAY_MS;
  // monthly: 翌月の同日（存在しない日は末日）
  const anchorDay = new Date(
    jstDayMs(new Date(schedule.anchorAt))
  ).getUTCDate();
  const s = new Date(start);
  let y = s.getUTCFullYear();
  let m0 = s.getUTCMonth() + 1;
  if (m0 > 11) {
    m0 = 0;
    y += 1;
  }
  return monthlyStartMs(y, m0, anchorDay);
}

// 管理画面表示用: "7/23（水）"
export function formatSwitchDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${JP_WEEKDAYS[d.getUTCDay()]}）`;
}

function shortDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// ホーム表示用: 現在の期間の日付範囲（"7/16〜8/15"。切替なしなら "7/16〜"）
export function currentPeriodRangeLabel(
  schedule: QuestionSchedule | null,
  now: Date = new Date()
): string {
  const startMs = dayMsFromKey(currentPeriodKey(schedule, now));
  if (startMs === null) return "";
  const next = nextSwitchDayMs(schedule, now);
  if (next === null || next - DAY_MS <= startMs) return shortDate(startMs);
  return `${shortDate(startMs)}〜${shortDate(next - DAY_MS)}`;
}

// アーカイブ・回答履歴用: 期間キー→日付範囲ラベルの一覧。
// 終了日は「次に存在する期間キーの前日」から決める（間隔変更をまたいでも正確）。
// 最新キーの終了日は設定から算出（未設定=従来週次は開始+6日）。判定できなければ "7/16〜"。
export function buildPeriodRangeLabels(
  data: WeeklyQuestionsData,
  schedule: QuestionSchedule | null,
  now: Date = new Date()
): Record<string, string> {
  const keys = Array.from(
    new Set([...Object.keys(data.answers), ...Object.keys(data.questionByWeek)])
  ).sort();
  const labels: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const startMs = dayMsFromKey(key);
    if (startMs === null) {
      labels[key] = key;
      continue;
    }
    let endMs: number | null = null;
    const nextKeyMs = i + 1 < keys.length ? dayMsFromKey(keys[i + 1]) : null;
    if (nextKeyMs !== null) {
      endMs = nextKeyMs - DAY_MS;
    } else if (!schedule) {
      endMs = startMs + 6 * DAY_MS; // 従来の週次
    } else if (schedule.interval !== "off") {
      const cur = dayMsFromKey(currentPeriodKey(schedule, now));
      if (cur !== null && cur === startMs) {
        const next = nextSwitchDayMs(schedule, now);
        if (next !== null) endMs = next - DAY_MS;
      } else if (cur !== null && cur > startMs) {
        endMs = cur - DAY_MS;
      }
    }
    labels[key] =
      endMs !== null && endMs > startMs
        ? `${shortDate(startMs)}〜${shortDate(endMs)}`
        : endMs === startMs
          ? shortDate(startMs)
          : `${shortDate(startMs)}〜`;
  }
  return labels;
}

// 未設定環境で「毎週」をそのまま保存するとき用のアンカー（今週の月曜 JST 0時）。
// これで期間キーが従来の週キーと完全一致し、保存起因で質問が切り替わらない。
export function legacyWeeklyAnchorIso(now: Date = new Date()): string {
  const ms = dayMsFromKey(currentWeekKey(now));
  return new Date((ms ?? jstDayMs(now)) - JST_OFFSET_MS).toISOString();
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

// 期間切替の実体（記録済みチェックなし）。withWeeklyRotation と、間隔変更時の
// 強制切替（advanceToNewPeriod）の両方から使う。
// - プールあり → currentIndex を循環で進めて質問を確定・記録。
// - プール空 → 現行 question をそのまま記録（47までの挙動）。
function rotateIntoPeriod(
  data: WeeklyQuestionsData,
  periodKey: string
): WeeklyQuestionsData | null {
  if (data.pool.length === 0) {
    const q = data.question.trim();
    if (!q) return null;
    return {
      ...data,
      questionByWeek: { ...data.questionByWeek, [periodKey]: q },
    };
  }
  // 過去に一度でも期間が確定していれば1つ進め、初回は現在位置から開始する
  const advance = Object.keys(data.questionByWeek).length > 0 ? 1 : 0;
  const idx = (data.currentIndex + advance) % data.pool.length;
  const q = data.pool[idx];
  return {
    ...data,
    question: q,
    currentIndex: idx,
    questionByWeek: { ...data.questionByWeek, [periodKey]: q },
  };
}

// 期間ローテーション＋現期間の質問の確定（指示書46R。変更不要なら null）。
// ホーム表示のたびに呼ばれても差分がある時だけ保存される（冪等）。
// - questionByWeek[現期間] が記録済み → その質問が正（手動上書き含む）。question フィールドだけ同期。
export function withWeeklyRotation(
  data: WeeklyQuestionsData,
  weekKey: string = currentWeekKey()
): WeeklyQuestionsData | null {
  const recorded = data.questionByWeek[weekKey]?.trim();
  if (recorded) {
    if (data.question !== recorded) return { ...data, question: recorded };
    return null;
  }
  return rotateIntoPeriod(data, weekKey);
}

// 間隔変更時の即時切替（指示書75）。記録済みでも新しい質問で上書きして
// 「保存と同時に切り替わる」を保証する（同日切替の衝突時も含む）。
export function advanceToNewPeriod(
  data: WeeklyQuestionsData,
  periodKey: string
): WeeklyQuestionsData | null {
  return rotateIntoPeriod(data, periodKey);
}

// 質問の手動上書き（✏️質問を編集）を管理者確認つきで保存する（指示書76）。
// UIの AdminOnly と同じ isAdminUser 判定を lib 境界でも行い、非管理者なら保存せず null。
// 自動ローテーション（withWeeklyRotation）は全員が通る正常経路なので対象外。
// ※ anonキー直書き設計のためサーバー側での完全な強制は構造上不可（指示書70）。
//    lib を通る経路での防止までがこの関数のスコープ。
// 保存成功時は保存後データを返す（呼び出し側の setData 用）。
export async function saveQuestionOverride(
  periodKey: string,
  question: string
): Promise<WeeklyQuestionsData | null> {
  const q = question.trim();
  try {
    const { data } = await getSupabaseBrowserClient().auth.getUser();
    if (!isAdminUser(data.user)) return null;
  } catch {
    return null;
  }
  const fresh = await loadWeeklyQuestions().catch(() => null);
  if (!fresh) return null;
  const next: WeeklyQuestionsData = {
    ...fresh,
    question: q,
    questionByWeek: q
      ? { ...fresh.questionByWeek, [periodKey]: q }
      : fresh.questionByWeek,
  };
  return (await saveWeeklyQuestions(next)) ? next : null;
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
