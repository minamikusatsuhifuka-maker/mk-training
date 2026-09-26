// スカウター結果のサーバー共通部（指示書188・サーバー専用）— **院長のみ**
//   保存先は 184 の clinic_hiring_docs（record_type = "scouter"）。新しいテーブルは作らない。
//   閲覧は authorizeHiring（院長のみ・委任は見ない）。検索・絞り込みには使わない（179/183の検索対象に入れない）。

import { HIRING_TABLE, type HiringAdminClient, HiringTableMissingError } from "./hiring-docs-server";
import { normalizeScouterResult, type ScouterResult } from "./scouter";

const SCOUTER_TYPE = "scouter";

function isMissingTable(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("could not find the table") || m.includes("schema cache");
}
function throwDb(message: string): never {
  if (isMissingTable(message)) throw new HiringTableMissingError();
  throw new Error(message);
}

export async function fetchScouterResults(admin: HiringAdminClient, userId: string): Promise<{ results: ScouterResult[]; tableMissing: boolean }> {
  const { data, error } = await admin.from(HIRING_TABLE).select("id, data").eq("record_type", SCOUTER_TYPE).eq("data->>userId", userId);
  if (error) {
    if (isMissingTable(error.message)) return { results: [], tableMissing: true };
    throw new Error(error.message);
  }
  const results = (data ?? [])
    .map((r) => normalizeScouterResult(String(r.id), r.data))
    .filter((r): r is ScouterResult => r !== null)
    .sort((a, b) => (b.testDate || b.createdAt).localeCompare(a.testDate || a.createdAt));
  return { results, tableMissing: false };
}

export async function fetchScouterResult(admin: HiringAdminClient, id: string): Promise<ScouterResult | null> {
  const { data, error } = await admin.from(HIRING_TABLE).select("id, data").eq("id", id).eq("record_type", SCOUTER_TYPE).maybeSingle();
  if (error) throwDb(error.message);
  return data ? normalizeScouterResult(String(data.id), data.data) : null;
}

export async function saveScouterResult(admin: HiringAdminClient, r: ScouterResult, updatedBy: string): Promise<void> {
  const { id, ...data } = r;
  const { error } = await admin.from(HIRING_TABLE).upsert({ id, record_type: SCOUTER_TYPE, data, updated_by: updatedBy, updated_at: new Date().toISOString() });
  if (error) throwDb(error.message);
}

export async function deleteScouterResult(admin: HiringAdminClient, id: string): Promise<void> {
  const { error } = await admin.from(HIRING_TABLE).delete().eq("id", id).eq("record_type", SCOUTER_TYPE);
  if (error) throwDb(error.message);
}

/** 入職予定者 → アカウントの紐づけ（187）で userId を付け替える */
export async function moveScouterResultsToUser(admin: HiringAdminClient, fromUserId: string, toUserId: string, by: string): Promise<number> {
  const { results } = await fetchScouterResults(admin, fromUserId);
  for (const r of results) await saveScouterResult(admin, { ...r, userId: toUserId }, by);
  return results.length;
}

export async function deleteScouterResultsOfUser(admin: HiringAdminClient, userId: string): Promise<number> {
  const { results } = await fetchScouterResults(admin, userId);
  for (const r of results) await deleteScouterResult(admin, r.id);
  return results.length;
}
