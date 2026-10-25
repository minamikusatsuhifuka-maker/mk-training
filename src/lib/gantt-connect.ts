// 265: 年間計画で人と人をつなぐ（応援とありがとう・達成を称える・手伝ってほしい・院長の判断）— 純関数・定義の正本
//
// 【応援】計画・チームプロジェクト・タスクに「👏 応援」。ログインしたスタッフ全員が1人1回（もう一度で取り消し）。知らせは出さない。
//   保存は clinic_staff_growth の record_type "gantt_cheer"（1つの計画・タスクに1行）。
// 【ありがとうカード】完了した計画・タスクのくわしい内容から、今ある「💌 ありがとうカード」を書く画面を開く（宛先と書き出しを入れておく）。
// 【達成を称える】計画・チームプロジェクトを「完了」にしたとき、お知らせを1件（2回目からは出さない＝GanttPlan.celebrated）。
// 【手伝ってほしい】タスクの担当者とタスクを書ける人が出す（GanttTask.help）。ほかの人は「手伝います」（GanttTask.helpers）。
// 【院長の判断】「院長が判断」のタスクに、院長だけが書く（GanttTask.judgment）。
// 【知らせ】アプリ内の知らせは record_type "gantt_alert"（1人あて1行）。出し方は今ある「ホームの帯」と同じ（年間計画の画面の上にも出す）。
//   自分がしたことは自分に知らせない。検証用アカウントがしたことは、本物のスタッフに知らせない（237）。

import { STATUS_LABEL, periodLabel, planAssigneeLabel, type GanttPlan, type TeamMember } from "./gantt";
import type { GanttTask } from "./gantt-tasks";

// ─── 応援 ───

export type CheerKind = "plan" | "task";
export type Cheer = { id: string; name: string; at: string; testSeed?: boolean };
export const CHEER_TYPE = "gantt_cheer";
export const cheerRowId = (targetId: string) => `gch-${targetId}`;

export function normalizeCheers(raw: unknown): Cheer[] {
  if (!Array.isArray(raw)) return [];
  const out: Cheer[] = [];
  for (const v of raw) {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.slice(0, 64) : "";
    if (!id || out.some((c) => c.id === id)) continue;
    out.push({
      id,
      name: typeof o.name === "string" ? o.name.slice(0, 60) : "",
      at: typeof o.at === "string" ? o.at : "",
      ...(o.testSeed === true ? { testSeed: true } : {}),
    });
    if (out.length >= 300) break;
  }
  return out;
}

/** 押す・取り消す（1人1回） */
export function toggleCheer(list: Cheer[], me: { id: string; name: string; testSeed: boolean }, now: string): { list: Cheer[]; on: boolean } {
  if (list.some((c) => c.id === me.id)) return { list: list.filter((c) => c.id !== me.id), on: false };
  return { list: [...list, { id: me.id, name: me.name, at: now, ...(me.testSeed ? { testSeed: true } : {}) }], on: true };
}

/** 見る人に返す応援（本物のスタッフには検証用アカウントの応援を出さない） */
export function visibleCheers(list: Cheer[], hideTestSeed: boolean): TeamMember[] {
  return list.filter((c) => !(hideTestSeed && c.testSeed)).map((c) => ({ id: c.id, name: c.name }));
}

// ─── 手伝ってほしい ───

export const HELP_TEXT_MAX = 100;
export type TaskHelp = { text: string; byId: string; byName: string; at: string; open: boolean; testSeed?: boolean };
export type TaskHelper = { id: string; name: string; at: string; testSeed?: boolean };

export function normalizeHelp(raw: unknown): TaskHelp | undefined {
  const o = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!o) return undefined;
  const text = typeof o.text === "string" ? o.text.trim().slice(0, HELP_TEXT_MAX) : "";
  if (!text) return undefined;
  return {
    text,
    byId: typeof o.byId === "string" ? o.byId.slice(0, 64) : "",
    byName: typeof o.byName === "string" ? o.byName.slice(0, 60) : "",
    at: typeof o.at === "string" ? o.at : "",
    open: o.open === true,
    ...(o.testSeed === true ? { testSeed: true } : {}),
  };
}

export function normalizeHelpers(raw: unknown): TaskHelper[] {
  return normalizeCheers(raw);
}

/** 「🙋 手伝ってほしい」が出ているか（見る人から見て） */
export function helpOpen(task: Pick<GanttTask, "help">, hideTestSeed = false): boolean {
  return !!task.help?.open && !(hideTestSeed && task.help.testSeed);
}

// ─── 院長の判断 ───

export const JUDGMENT_MAX = 500;
export type TaskJudgment = { text: string; at: string; editedAt?: string };

export function normalizeJudgment(raw: unknown): TaskJudgment | undefined {
  const o = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
  if (!o) return undefined;
  const text = typeof o.text === "string" ? o.text.trim().slice(0, JUDGMENT_MAX) : "";
  if (!text) return undefined;
  return { text, at: typeof o.at === "string" ? o.at : "", ...(typeof o.editedAt === "string" && o.editedAt ? { editedAt: o.editedAt } : {}) };
}

/** 院長の「院長が判断」の一覧：判断をまだ書いていないものを上に（その中は期限の早い順） */
export function sortJudgeTasks<T extends Pick<GanttTask, "judgment" | "due">>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => Number(!!a.judgment) - Number(!!b.judgment) || (a.due || "9999").localeCompare(b.due || "9999"));
}

// ─── ありがとうカード ───

/** 宛先（担当者・チームプロジェクトはメンバー。自分は入れない）と本文の書き出し */
export function thanksPrefill(
  target: { kind: "plan"; plan: Pick<GanttPlan, "name" | "kind" | "members" | "assignees"> } | { kind: "task"; task: Pick<GanttTask, "title" | "assignees"> },
  myId: string
): { to: string[]; message: string } {
  const people = target.kind === "task" ? target.task.assignees : target.plan.kind === "team" ? target.plan.members ?? [] : target.plan.assignees ?? [];
  const to = people.filter((p) => p.id !== myId && p.name.trim()).map((p) => p.name.trim());
  const title = target.kind === "task" ? target.task.title : target.plan.name;
  return { to: [...new Set(to)], message: `「${title}」\n` };
}

// ─── 達成を称えるお知らせ（252の文の形にそろえる） ───

export function achievementNoticeText(
  p: Pick<GanttPlan, "name" | "kind" | "start" | "end" | "members" | "assignee" | "assignees">,
  tasks: Pick<GanttTask, "status">[],
  actorName: string,
  today: string,
  url: string
): { title: string; body: string } {
  const team = p.kind === "team";
  const people = team ? (p.members ?? []).map((m) => m.name || "名前未設定").join("、") || "（なし）" : planAssigneeLabel(p) || "（なし）";
  const done = tasks.filter((t) => t.status === "done").length;
  return {
    title: team ? `🎉 チームプロジェクト「${p.name}」が${STATUS_LABEL.done}しました` : `🎉 「${p.name}」が${STATUS_LABEL.done}しました`,
    body: [
      `${actorName || "スタッフ"}さんが、${team ? "チームプロジェクト" : ""}「${p.name}」を「${STATUS_LABEL.done}」にしました。`,
      "",
      team ? `チーム名：${p.name}` : `計画：${p.name}`,
      team ? `メンバー：${people}` : `担当：${people}`,
      `${team ? "目標の達成期間" : "期間"}：${periodLabel(p.start, p.end, today)}`,
      ...(tasks.length ? [`タスク：タスク ${done}/${tasks.length} ${STATUS_LABEL.done}`] : []),
      "",
      "🏁 年間計画で見る：",
      url,
    ].join("\n"),
  };
}

// ─── アプリ内の知らせ ───

export const ALERT_TYPE = "gantt_alert";
/** 1人あてに残す知らせの数（古いものから捨てる） */
export const ALERTS_PER_USER_MAX = 50;

export type AlertKind = "help_offer" | "judgment" | "judgment_edit";

export type GanttAlert = {
  id: string;
  /** あて先 */
  userId: string;
  kind: AlertKind;
  planId: string;
  taskId: string;
  /** 知らせの文 */
  text: string;
  at: string;
  readAt?: string;
  testSeed?: boolean;
};

export function genAlertId(now = Date.now(), rand = Math.random()): string {
  return `ga-${now.toString(36)}${Math.floor(rand * 1e8).toString(36)}`;
}

export function normalizeAlert(id: string, raw: unknown): GanttAlert | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const userId = typeof o.userId === "string" ? o.userId : "";
  const text = typeof o.text === "string" ? o.text.slice(0, 300) : "";
  if (!id || !userId || !text) return null;
  return {
    id,
    userId,
    kind: (typeof o.kind === "string" ? o.kind : "help_offer") as AlertKind,
    planId: typeof o.planId === "string" ? o.planId : "",
    taskId: typeof o.taskId === "string" ? o.taskId : "",
    text,
    at: typeof o.at === "string" ? o.at : "",
    ...(typeof o.readAt === "string" && o.readAt ? { readAt: o.readAt } : {}),
    ...(o.testSeed === true ? { testSeed: true } : {}),
  };
}

/** 知らせの文（院長が確かめる文の形） */
export function alertText(kind: AlertKind, a: { actorName: string; taskTitle: string; planName: string }): string {
  const who = a.actorName || "スタッフ";
  if (kind === "help_offer") return `🙋 ${who}さんが、タスク「${a.taskTitle}」（${a.planName}）を「手伝います」と名乗り出ました`;
  if (kind === "judgment") return `🧭 タスク「${a.taskTitle}」（${a.planName}）に、院長の判断が書かれました`;
  return `🧭 タスク「${a.taskTitle}」（${a.planName}）の院長の判断が直されました`;
}

/**
 * 知らせるあて先：タスクの担当者と、計画の担当（院の計画は一覧から選んだ担当・チームプロジェクトはメンバー）。
 *   自分は除く。検証用アカウントがしたことは、検証用アカウントにだけ知らせる。
 */
export function alertRecipients(
  task: Pick<GanttTask, "assignees">,
  plan: Pick<GanttPlan, "kind" | "members" | "assignees">,
  actorId: string,
  actorIsTest: boolean,
  testIds: ReadonlySet<string>
): string[] {
  const planPeople = plan.kind === "team" ? plan.members ?? [] : plan.assignees ?? [];
  const ids = [...task.assignees, ...planPeople].map((p) => p.id).filter((id) => id && id !== actorId);
  return [...new Set(ids)].filter((id) => !actorIsTest || testIds.has(id));
}

/** 「10/26 14:05」 */
export function timeLabel(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
