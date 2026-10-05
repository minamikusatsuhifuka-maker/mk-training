// 1on1の事前アンケートの閲覧範囲（指示書200 → 204 §5で置き換え）— サーバー専用
//
// 【見られるのは3者だけ（204 §5-1）】
//   1. 本人（owner）
//   2. 院長（app_metadata.role === "admin"）
//   3. **院長が指定した管理者** ＝ 次の**両方**を満たす人
//        (a) 183の委任で「📝 1on1の事前アンケートの回答」を任されている
//        (b) 183の担当指定で、そのスタッフが自分の担当になっている
//
// 【200からの変更】
//   200は「回答の相手（participantIds）に入っていて、かつ担当に指定された幹部」で判定していた。
//   204でこれを**廃止**し、上の (a)＋(b) に置き換える。
//   → **1on1の相手であっても、指定されていなければ見られない**。
//   委任を外す・担当から外す・アカウントを無効化すると、その時点から見られなくなる（閉じる方向）。
//
// 【既存の回答は消さない】
//   判定は読み取り時に行う。回答そのものは残る（本人と院長は読める）。
//
// 判定は渡す前にサーバーで行う（164の原則）。見られない人には、回答の有無も件数も分からない応答にする。
// クライアントから import しないこと。

import type { User } from "@supabase/supabase-js";
import type { createSupabaseAdminClient } from "./supabase-admin";
import { isAdminUser } from "./admin-role";
import {
  isActiveAccountId,
  loadDelegatedItems,
  loadDelegationSnapshot,
  loadKarteAssignments,
} from "./admin-delegation-server";

export const PRESURVEY_CONTENT_TYPE = "one_on_one_presurvey";

/** 183の委任の項目key（admin-items.ts と同じ値。回答の**閲覧だけ**を任せる） */
export const PRESURVEY_VIEW_ITEM_KEY = "presurvey-answers";

export type PresurveyViewerScope = {
  userId: string;
  isAdmin: boolean;
  /** 183の委任で回答の閲覧を任されているか */
  delegated: boolean;
  /** その人の担当に指定されているスタッフ */
  assignedStaffIds: Set<string>;
};

export async function presurveyViewerScope(user: User): Promise<PresurveyViewerScope> {
  const isAdmin = isAdminUser(user);
  if (isAdmin) {
    return { userId: user.id, isAdmin: true, delegated: true, assignedStaffIds: new Set() };
  }
  // 無効化されたアカウントは何も見られない（fail-close）
  const active = await isActiveAccountId(user.id).catch(() => false);
  if (!active) {
    return { userId: user.id, isAdmin: false, delegated: false, assignedStaffIds: new Set() };
  }
  const [items, assigned] = await Promise.all([
    loadDelegatedItems(user.id).catch(() => [] as string[]),
    loadKarteAssignments(user.id).catch(() => [] as string[]),
  ]);
  return {
    userId: user.id,
    isAdmin: false,
    delegated: items.includes(PRESURVEY_VIEW_ITEM_KEY),
    assignedStaffIds: new Set(assigned),
  };
}

/** その回答を、この人が読んでよいか（204 §5-1） */
export function canViewPresurvey(
  row: { owner_id: string; data?: unknown },
  scope: PresurveyViewerScope
): boolean {
  if (row.owner_id === scope.userId) return true;
  if (scope.isAdmin) return true;
  // 委任と担当の**両方**がそろって初めて読める。1on1の相手かどうかは見ない（200の判定は廃止）
  return scope.delegated && scope.assignedStaffIds.has(row.owner_id);
}

/** その人が回答を見られるスタッフの userId（管理画面の一覧の絞り込みに使う） */
export function viewableStaffIds(scope: PresurveyViewerScope): Set<string> | "all" {
  if (scope.isAdmin) return "all";
  return scope.delegated ? new Set(scope.assignedStaffIds) : new Set<string>();
}

/**
 * 204 §5-1: 既存の回答のうち、**相手として記録されているが新しい判定では読めない人**がいる件数。
 * 200の「読めなくなった件数」を新しい判定（委任＋担当）に合わせたもの。数えるだけ。
 * 本文・誰の回答かは返さない。
 */
export async function auditPresurveyPartners(
  db: ReturnType<typeof createSupabaseAdminClient>
): Promise<{ total: number; withPartner: number; revoked: number }> {
  const { data, error } = await db
    .from("private_store")
    .select("owner_id, data")
    .eq("content_type", PRESURVEY_CONTENT_TYPE);
  if (error) throw new Error(error.message);

  const admins = new Set<string>();
  const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of users?.users ?? []) if (isAdminUser(u)) admins.add(u.id);
  const snap = await loadDelegationSnapshot();
  const delegated = new Set(snap.items[PRESURVEY_VIEW_ITEM_KEY] ?? []);

  return countRevokedPartners(
    (data ?? []) as { owner_id: string; data: unknown }[],
    admins,
    snap.karte,
    delegated
  );
}

function participantIdsOf(data: unknown): string[] {
  const ids = (data as { participantIds?: unknown } | null)?.participantIds;
  return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === "string") : [];
}

/**
 * 数え方（純関数・204 §5-1）: 相手として記録されている人のうち、
 * 院長でもなく、「委任あり＋その本人が担当」でもない人がいる回答の件数。
 */
export function countRevokedPartners(
  rows: { owner_id: string; data: unknown }[],
  admins: Set<string>,
  karte: Record<string, string[]>,
  delegated: Set<string>
): { total: number; withPartner: number; revoked: number } {
  let withPartner = 0;
  let revoked = 0;
  for (const r of rows) {
    const partners = participantIdsOf(r.data).filter((p) => p !== r.owner_id);
    if (partners.length === 0) continue;
    withPartner++;
    const invalid = partners.some(
      (p) => !admins.has(p) && !(delegated.has(p) && (karte[p] ?? []).includes(r.owner_id))
    );
    if (invalid) revoked++;
  }
  return { total: rows.length, withPartner, revoked };
}
