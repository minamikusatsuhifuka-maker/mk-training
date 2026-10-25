// 🏁 年間計画（指示書250で「📊 ガントチャート」として作り、268で「年間計画」に改めた）— サーバー専用
//
// 【判定（250 §3・§5）】
//   見る      … ログインしたスタッフ全員。スイッチ gantt がOFFの間は院長と検証用アカウントだけ（ほかは無いのと同じ404）
//   書く      … 院長と、委任の設定で「🏁 年間計画」（admin item "gantt"）を任された幹部（無効のアカウントは除く）
//   分類を直す … 院長だけ
// 【保存先】clinic_staff_growth（新しい表もSQLも足さない）
//   ・計画   record_type = "gantt_plan"（id = gp-…・1件1行）
//   ・分類   record_type = "gantt_categories"（id = gantt-categories・1行）
//   どちらも可能性ノート系のAPIは record_type で絞って読むので、ほかのAPIからは出てこない。
// 【四象限】院長の四象限（private_store・content_type priority_matrix）のうち data.gantt = true の項目だけを読み、
//   名前・期間・状態だけを返す（メモ・9マス・任せる相手・象限は返さない）。
// 【検証用（237）】検証用アカウントが作った計画は testSeed の印を付け、本物のスタッフには返さない。

import type { User } from "@supabase/supabase-js";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import { isTestSeedUser } from "./test-seed";
import { createSupabaseAdminClient } from "./supabase-admin";
import { GROWTH_TABLE, isMissingTable, serverFeatureEnabled } from "./staff-growth-server";
import { isActiveAccountId, loadDelegatedItems } from "./admin-delegation-server";
import { hidesTestSeedFor } from "./test-seed-hide-server";
import { serverGetContentRow } from "./content-store-server";
import { PM_CONTENT_TYPE, PM_TABLE } from "./priority-matrix-server";
import { normalizeTask } from "./priority-matrix";
import { audienceOf, loadAccounts, saveNotice, sendNewNoticeMails } from "./notices-server";
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX, genNoticeId, type Notice } from "./notices";
import { portalOrigin } from "./mail-send";
import {
  MATRIX_CATEGORY_ID,
  OTHER_CATEGORY_ID,
  matrixCategoryOf,
  migrateAssigneeText,
  normalizeCategories,
  normalizePlan,
  planFromMatrixTask,
  teamNoticeText,
  type GanttCategory,
  type GanttPlan,
} from "./gantt";
import { normalizeTask as normalizeGanttTask, type GanttTask } from "./gantt-tasks";
import { canViewGanttWith, goalBriefsOf, type ClinicGoalBrief } from "./plan-goals";

/** クリニック目標の保存先（lib/gantt-goals.ts の PORTAL_GANTT_KEY と同じ。あちらはブラウザ用なのでここでは読み込まない） */
const PORTAL_GANTT_KEY = "portal_gantt";

export const GANTT_ITEM_KEY = "gantt";
export const GANTT_FEATURE = "gantt";
export const GANTT_PLAN_TYPE = "gantt_plan";
export const GANTT_CATEGORIES_TYPE = "gantt_categories";
export const GANTT_CATEGORIES_ID = "gantt-categories";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type GanttAuth = {
  ok: true;
  user: User;
  admin: Admin;
  isAdmin: boolean;
  testSeed: boolean;
  /** 計画を足す・直す・消す・並べ替え */
  canWrite: boolean;
  /** 分類を足す・直す・消す（院長だけ） */
  canEditCategories: boolean;
  /** 253: 「📜 当院の歩みに残す」を出す（当院の歩みを書ける人＝院長と「📜 当院の歩み」を任された幹部。歩みのスイッチOFFの間は院長だけ） */
  canAyumi: boolean;
};

/** 年間計画を見られるか（院長・検証用アカウントはいつも／ほかの人はスイッチ gantt がONのときだけ。式は lib/plan-goals.ts） */
export async function canViewGantt(user: Pick<User, "app_metadata">): Promise<boolean> {
  if (canViewGanttWith(user, false)) return true;
  return canViewGanttWith(user, await serverFeatureEnabled(GANTT_FEATURE));
}

/** 未ログイン=401、使えない人=404（無いのと同じ） */
export async function authorizeGantt(): Promise<GanttAuth | { ok: false; status: 401 | 404 }> {
  const { user } = await getSessionUser();
  if (!user) return { ok: false, status: 401 };
  const isAdmin = isAdminUser(user);
  const testSeed = isTestSeedUser(user);
  if (!(await canViewGantt(user))) return { ok: false, status: 404 };
  let canWrite = isAdmin;
  let canAyumi = isAdmin;
  if (!isAdmin) {
    const items = await loadDelegatedItems(user.id);
    const active = items.length > 0 && (await isActiveAccountId(user.id));
    canWrite = active && items.includes(GANTT_ITEM_KEY);
    canAyumi = active && items.includes("ayumi") && (testSeed || (await serverFeatureEnabled("ayumi")));
  }
  return {
    ok: true,
    user,
    admin: createSupabaseAdminClient(),
    isAdmin,
    testSeed,
    canWrite,
    canEditCategories: isAdmin,
    canAyumi,
  };
}

// ─── 分類 ───

export async function loadCategories(admin: Admin): Promise<GanttCategory[]> {
  const { data, error } = await admin
    .from(GROWTH_TABLE)
    .select("data")
    .eq("id", GANTT_CATEGORIES_ID)
    .eq("record_type", GANTT_CATEGORIES_TYPE)
    .maybeSingle();
  if (error && !isMissingTable(error.message)) throw new Error(error.message);
  const raw = (data as { data?: { categories?: unknown } } | null)?.data?.categories;
  return normalizeCategories(raw);
}

export async function saveCategories(admin: Admin, categories: GanttCategory[], by: string): Promise<GanttCategory[]> {
  const next = normalizeCategories(categories);
  const now = new Date().toISOString();
  const { error } = await admin.from(GROWTH_TABLE).upsert({
    id: GANTT_CATEGORIES_ID,
    record_type: GANTT_CATEGORIES_TYPE,
    data: { categories: next, updatedAt: now },
    updated_by: by,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
  return next;
}

// ─── 計画 ───

export async function loadPlans(admin: Admin): Promise<GanttPlan[]> {
  const { data, error } = await admin.from(GROWTH_TABLE).select("id, data").eq("record_type", GANTT_PLAN_TYPE);
  if (error) {
    if (isMissingTable(error.message)) return [];
    throw new Error(error.message);
  }
  const plans = ((data ?? []) as { id: string; data: unknown }[])
    .map((r) => normalizePlan(r.id, r.data))
    .filter((p): p is GanttPlan => p !== null);
  return migrateAssignees(admin, plans);
}

/**
 * 264: まだ「担当を一覧から選ぶ形」で保存していない院の計画は、文字の担当を一覧の表示名と照らして移す（migrateAssigneeText）。
 *   データは書き換えない（読むたびに同じ結果になる）。その計画を次に保存したときに、移した形で保存される（savePlan）。
 *   一覧は、本物の計画には本物のスタッフ、検証用の計画には検証用アカウント（237）。一覧が読めないときは移さない（文字のまま）。
 */
async function migrateAssignees(admin: Admin, plans: GanttPlan[]): Promise<GanttPlan[]> {
  const targets = plans.filter((p) => p.kind !== "team" && !p.assigneesSet && p.assignee.trim());
  if (targets.length === 0) return plans;
  let accounts: Awaited<ReturnType<typeof loadAccounts>>;
  try {
    accounts = await loadAccounts(admin);
  } catch {
    return plans;
  }
  return plans.map((p) => {
    if (!targets.includes(p)) return p;
    const m = migrateAssigneeText(p.assignee, audienceOf(p.testSeed === true, accounts).map((a) => ({ id: a.id, name: a.name })));
    if (m.assignees.length === 0) return p;
    const have = p.assignees ?? [];
    return { ...p, assignee: m.rest, assignees: [...have, ...m.assignees.filter((a) => !have.some((h) => h.id === a.id))] };
  });
}

export async function loadPlan(admin: Admin, id: string): Promise<GanttPlan | null> {
  const { data, error } = await admin
    .from(GROWTH_TABLE)
    .select("id, data")
    .eq("id", id)
    .eq("record_type", GANTT_PLAN_TYPE)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { id: string; data: unknown } | null;
  return row ? normalizePlan(row.id, row.data) : null;
}

export async function savePlan(admin: Admin, plan: GanttPlan, by: string): Promise<GanttPlan> {
  const now = new Date().toISOString();
  // 264: 院の計画は、担当を一覧から選ぶ形で保存したことにする（読むときの移し替えは、これ以後しない）
  const next: GanttPlan = { ...plan, ...(plan.kind !== "team" ? { assigneesSet: true } : {}), updatedAt: now };
  // 検証用の印は、作ったときのまま（直した人で変えない）
  const { error } = await admin.from(GROWTH_TABLE).upsert({
    id: next.id,
    record_type: GANTT_PLAN_TYPE,
    data: { ...next, ...(next.testSeed ? { seed191: true } : {}) },
    updated_by: by,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
  return next;
}

export async function deletePlans(admin: Admin, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin.from(GROWTH_TABLE).delete().in("id", ids).eq("record_type", GANTT_PLAN_TYPE);
  if (error) throw new Error(error.message);
}

/** 分類を消したとき、中の計画を「その他」へ移す */
export async function movePlansToOther(admin: Admin, removedIds: string[], by: string): Promise<number> {
  if (removedIds.length === 0) return 0;
  const plans = await loadPlans(admin);
  const targets = plans.filter((p) => removedIds.includes(p.categoryId));
  for (const p of targets) await savePlan(admin, { ...p, categoryId: OTHER_CATEGORY_ID }, by);
  return targets.length;
}

// ─── 四象限の項目（チェックしたものだけ） ───

export async function loadMatrixPlans(admin: Admin, categories: GanttCategory[]): Promise<GanttPlan[]> {
  const { data, error } = await admin
    .from(PM_TABLE)
    .select("owner_id, record_key, data")
    .eq("content_type", PM_CONTENT_TYPE)
    .eq("data->>gantt", "true");
  if (error) {
    if (isMissingTable(error.message)) return [];
    throw new Error(error.message);
  }
  const out: GanttPlan[] = [];
  for (const r of (data ?? []) as { owner_id: string; record_key: string; data: unknown }[]) {
    // 四象限を書けるのは院長だけ（requireAdmin）。念のため、院長の行だけを使う
    const director = (process.env.DIRECTOR_USER_ID ?? "").trim();
    if (director && r.owner_id !== director) continue;
    const t = normalizeTask(r.record_key, r.data);
    if (!t) continue;
    // 251: 四象限の編集欄で選んだ分類（選んでいなければ「院の取り組み・プロジェクト」・消した分類なら「その他」）
    const p = planFromMatrixTask(t, matrixCategoryOf(t.ganttCategory, categories));
    if (p) out.push(p);
  }
  return out;
}

/**
 * 251: 分類を消したとき、その分類を選んでいた四象限の項目も「その他」にする（四象限の欄も「その他」になる）。
 *   選んでいない項目（空＝既定の「院の取り組み・プロジェクト」）は、その既定の分類を消したときだけ移す。
 *   直すのは data.ganttCategory だけ（名前・メモ・9マスなどには触れない）。
 */
export async function moveMatrixToOther(admin: Admin, removedIds: string[]): Promise<number> {
  if (removedIds.length === 0) return 0;
  const { data, error } = await admin
    .from(PM_TABLE)
    .select("owner_id, record_key, data")
    .eq("content_type", PM_CONTENT_TYPE);
  if (error) {
    if (isMissingTable(error.message)) return 0;
    throw new Error(error.message);
  }
  let moved = 0;
  for (const r of (data ?? []) as { owner_id: string; record_key: string; data: Record<string, unknown> | null }[]) {
    const d = r.data ?? {};
    if (d.kind === "book") continue;
    const chosen = typeof d.ganttCategory === "string" && d.ganttCategory ? d.ganttCategory : MATRIX_CATEGORY_ID;
    if (!removedIds.includes(chosen)) continue;
    const now = new Date().toISOString();
    const { error: e2 } = await admin
      .from(PM_TABLE)
      .update({ data: { ...d, ganttCategory: OTHER_CATEGORY_ID, updatedAt: now }, updated_at: now })
      .eq("owner_id", r.owner_id)
      .eq("content_type", PM_CONTENT_TYPE)
      .eq("record_key", r.record_key);
    if (e2) throw new Error(e2.message);
    moved += 1;
  }
  return moved;
}

// ─── 268: クリニック目標（content_store の portal_gantt）。年間計画の側では id・名前・目的だけを使う ───

export async function loadClinicGoalBriefs(): Promise<ClinicGoalBrief[]> {
  const row = await serverGetContentRow(PORTAL_GANTT_KEY);
  return goalBriefsOf(row?.data ?? null);
}

// ─── 252: チームプロジェクト ───

/**
 * メンバーに選べる人（有効なアカウント）。本物のスタッフには本物のスタッフだけ、
 * 検証用アカウントには検証用アカウントだけ（237：検証用の中身を本物に混ぜない）。
 */
export async function teamCandidates(admin: Admin, testSeed: boolean): Promise<{ id: string; name: string }[]> {
  const accounts = await loadAccounts(admin);
  return audienceOf(testSeed, accounts).map((a) => ({ id: a.id, name: a.name }));
}

/** 送られてきたメンバーを、選べる人の中だけに絞り、名前を付け直す */
export function pickMembers(raw: unknown, candidates: { id: string; name: string }[]): { id: string; name: string }[] {
  const ids = Array.isArray(raw)
    ? raw.map((v) => (typeof v === "string" ? v : v && typeof v === "object" ? (v as { id?: unknown }).id : null)).filter((v): v is string => typeof v === "string")
    : [];
  const out: { id: string; name: string }[] = [];
  for (const id of ids) {
    const c = candidates.find((x) => x.id === id);
    if (c && !out.some((m) => m.id === id)) out.push({ id: c.id, name: c.name });
  }
  return out;
}

/**
 * 252 §5: チームプロジェクトを足したとき、「📣 お知らせ・イベント」に1件出す（出す人＝作った人）。
 * 中身はお知らせとして保存し、アプリ内の知らせ・メールはふつうのお知らせと同じ（メールはスイッチに従う・検証用は送らない）。
 */
export async function postTeamNotice(admin: Admin, plan: GanttPlan, author: { id: string; name: string; testSeed: boolean }, today: string): Promise<Notice> {
  const now = new Date().toISOString();
  const text = teamNoticeText(plan, today, `${portalOrigin()}/gantt`);
  const notice: Notice = {
    id: genNoticeId(),
    kind: "notice",
    title: text.title.slice(0, NOTICE_TITLE_MAX),
    body: text.body.slice(0, NOTICE_BODY_MAX),
    heldOn: "",
    heldTime: "",
    place: "",
    rsvpDeadline: "",
    attachments: [],
    authorId: author.id,
    authorName: author.name,
    testSeed: author.testSeed,
    createdAt: now,
    updatedAt: now,
  };
  await saveNotice(admin, notice, true);
  return notice;
}

export { sendNewNoticeMails };

/** 見る人に返す計画（本物のスタッフには検証用の計画を出さない） */
export function visiblePlans(plans: GanttPlan[], user: Pick<User, "app_metadata">): GanttPlan[] {
  if (!hidesTestSeedFor(user)) return plans;
  const hidden = new Set(plans.filter((p) => p.testSeed).map((p) => p.id));
  return plans.filter((p) => !hidden.has(p.id) && !hidden.has(p.parentId));
}

// ─── 263: 計画の中のタスク ───

export const GANTT_TASK_TYPE = "gantt_task";

export async function loadTasks(admin: Admin): Promise<GanttTask[]> {
  const { data, error } = await admin.from(GROWTH_TABLE).select("id, data").eq("record_type", GANTT_TASK_TYPE);
  if (error) {
    if (isMissingTable(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as { id: string; data: unknown }[])
    .map((r) => normalizeGanttTask(r.id, r.data))
    .filter((t): t is GanttTask => t !== null);
}

export async function loadTask(admin: Admin, id: string): Promise<GanttTask | null> {
  const { data, error } = await admin
    .from(GROWTH_TABLE)
    .select("id, data")
    .eq("id", id)
    .eq("record_type", GANTT_TASK_TYPE)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { id: string; data: unknown } | null;
  return row ? normalizeGanttTask(row.id, row.data) : null;
}

export async function saveTask(admin: Admin, task: GanttTask, by: string): Promise<GanttTask> {
  const now = new Date().toISOString();
  const next: GanttTask = { ...task, updatedAt: now };
  // 検証用の印は、作ったときのまま（直した人で変えない）
  const { error } = await admin.from(GROWTH_TABLE).upsert({
    id: next.id,
    record_type: GANTT_TASK_TYPE,
    data: { ...next, ...(next.testSeed ? { seed191: true } : {}) },
    updated_by: by,
    updated_at: now,
  });
  if (error) throw new Error(error.message);
  return next;
}

export async function deleteTasks(admin: Admin, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin.from(GROWTH_TABLE).delete().in("id", ids).eq("record_type", GANTT_TASK_TYPE);
  if (error) throw new Error(error.message);
}

/** 計画を消したとき、中のタスクも消す */
export async function deleteTasksOfPlans(admin: Admin, planIds: string[]): Promise<void> {
  if (planIds.length === 0) return;
  const tasks = await loadTasks(admin);
  await deleteTasks(admin, tasks.filter((t) => planIds.includes(t.planId)).map((t) => t.id));
}

/** 見ている人の表示名（計画の「担当」と比べる・ひとことに付ける） */
export async function myDisplayName(admin: Admin, user: Pick<User, "id" | "email">): Promise<string> {
  try {
    const accounts = await loadAccounts(admin);
    return accounts.find((a) => a.id === user.id)?.name || user.email || "";
  } catch {
    return user.email ?? "";
  }
}
