// 1on1の事前アンケートの閲覧範囲（指示書200）— サーバー専用
//
// 回答を見られるのは **本人・院長・その1on1の担当者** だけ。
// 担当者として読めるのは、回答の相手（participantIds）に入っていて、かつ
// **いま院長がそのスタッフの担当に指定している幹部（183）** のときだけ（院長はもともと全件）。
//   - 本人が「相手」を自由に選べた197の回答で、相手が院長でも担当幹部でもない場合は、ここで読めなくなる（200 1-4）。
//     回答そのものは消さない（本人と院長は読める）。
//   - 担当の指定を外された幹部も、その時点から読めなくなる（閉じる方向）。
// 判定は渡す前にサーバーで行う（164の原則）。
//
// クライアントから import しないこと。

import type { User } from "@supabase/supabase-js";
import type { createSupabaseAdminClient } from "./supabase-admin";
import { isAdminUser } from "./admin-role";
import { loadDelegationSnapshot, loadKarteAssignments } from "./admin-delegation-server";

export const PRESURVEY_CONTENT_TYPE = "one_on_one_presurvey";

export type PresurveyViewerScope = {
  userId: string;
  isAdmin: boolean;
  /** この人が担当に指定されているスタッフ */
  assignedStaffIds: Set<string>;
};

export async function presurveyViewerScope(user: User): Promise<PresurveyViewerScope> {
  const isAdmin = isAdminUser(user);
  const assigned = isAdmin ? [] : await loadKarteAssignments(user.id).catch(() => [] as string[]);
  return { userId: user.id, isAdmin, assignedStaffIds: new Set(assigned) };
}

function participantIdsOf(data: unknown): string[] {
  const ids = (data as { participantIds?: unknown } | null)?.participantIds;
  return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === "string") : [];
}

/** その回答を、この人が読んでよいか */
export function canViewPresurvey(
  row: { owner_id: string; data: unknown },
  scope: PresurveyViewerScope
): boolean {
  if (row.owner_id === scope.userId) return true;
  if (scope.isAdmin) return true;
  return participantIdsOf(row.data).includes(scope.userId) && scope.assignedStaffIds.has(row.owner_id);
}

/**
 * 200 1-4: 既存の回答のうち、相手が院長でも担当幹部でもないもの（＝相手の閲覧権をなくした件数）。
 * 数えるだけ。本文・誰の回答かは返さない。
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

  return countRevokedPartners((data ?? []) as { owner_id: string; data: unknown }[], admins, snap.karte);
}

/** 数え方（純関数）: 相手が院長でも、その本人の担当幹部でもない回答 */
export function countRevokedPartners(
  rows: { owner_id: string; data: unknown }[],
  admins: Set<string>,
  karte: Record<string, string[]>
): { total: number; withPartner: number; revoked: number } {
  let withPartner = 0;
  let revoked = 0;
  for (const r of rows) {
    const partners = participantIdsOf(r.data).filter((p) => p !== r.owner_id);
    if (partners.length === 0) continue;
    withPartner++;
    const invalid = partners.some((p) => !admins.has(p) && !(karte[p] ?? []).includes(r.owner_id));
    if (invalid) revoked++;
  }
  return { total: rows.length, withPartner, revoked };
}
