// 1on1の「ウェルネスの視点」のサーバー側（サーバー専用）
//
// 保存先は clinic_staff_growth の record_type = "wellness"（RLS全拒否＋service-role。SQL不要）。
// 認可（誰の分を読めるか・書けるか）はルート側で authorizeGrowth + canViewStaff を通してから呼ぶ。
// ここでは表の読み書きと「その1on1が本当にあって、その人が関わっているか」の確かめだけを行う。

import {
  GROWTH_TABLE,
  isMissingTable,
  GrowthTableMissingError,
  type GrowthAdminClient,
} from "./staff-growth-server";
import { normalizeOneOnOneData } from "./one-on-one";
import { normalizeWellnessEntry, type WellnessEntry } from "./wellness";

const WELLNESS_TYPE = "wellness";

function throwDb(message: string): never {
  if (isMissingTable(message)) throw new GrowthTableMissingError();
  throw new Error(message);
}

type OneOnOneRow = { owner_id: string; record_key: string; data: unknown };

/** 1on1の回の「誰が関わっているか」と実施日（本文は返さない） */
export type OneOnOneRef = { ownerId: string; oneOnOneKey: string; heldOn: string; involved: string[] };

function refOf(r: OneOnOneRow): OneOnOneRef {
  const d = normalizeOneOnOneData(r.data);
  return {
    ownerId: r.owner_id,
    oneOnOneKey: r.record_key,
    heldOn: d.heldOn,
    involved: [r.owner_id, ...d.participantIds],
  };
}

export async function fetchOneOnOneRef(
  admin: GrowthAdminClient,
  ownerId: string,
  oneOnOneKey: string
): Promise<OneOnOneRef | null> {
  const { data, error } = await admin
    .from("private_store")
    .select("owner_id, record_key, data")
    .eq("content_type", "one_on_one")
    .eq("owner_id", ownerId)
    .eq("record_key", oneOnOneKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? refOf(data as OneOnOneRow) : null;
}

/** 今ある1on1の回（消された回の視点は出さないため）。キーは `${ownerId}/${record_key}` */
export async function fetchOneOnOneRefs(admin: GrowthAdminClient): Promise<Map<string, OneOnOneRef>> {
  const { data, error } = await admin
    .from("private_store")
    .select("owner_id, record_key, data")
    .eq("content_type", "one_on_one");
  if (error) throw new Error(error.message);
  const out = new Map<string, OneOnOneRef>();
  for (const r of (data ?? []) as OneOnOneRow[]) out.set(`${r.owner_id}/${r.record_key}`, refOf(r));
  return out;
}

export async function fetchWellnessEntries(
  admin: GrowthAdminClient,
  userIds?: readonly string[]
): Promise<WellnessEntry[]> {
  if (userIds && userIds.length === 0) return [];
  let q = admin.from(GROWTH_TABLE).select("id, data").eq("record_type", WELLNESS_TYPE);
  if (userIds) q = q.in("data->>userId", [...userIds]);
  const { data, error } = await q;
  if (error) throwDb(error.message);
  return ((data ?? []) as { id: unknown; data: unknown }[])
    .map((r) => normalizeWellnessEntry(String(r.id), r.data))
    .filter((e): e is WellnessEntry => e !== null);
}

export async function saveWellnessEntry(
  admin: GrowthAdminClient,
  entry: WellnessEntry,
  updatedBy: string
): Promise<void> {
  const { id, ...data } = entry;
  const { error } = await admin.from(GROWTH_TABLE).upsert({
    id,
    record_type: WELLNESS_TYPE,
    data,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throwDb(error.message);
}

export async function deleteWellnessEntry(admin: GrowthAdminClient, id: string): Promise<void> {
  const { error } = await admin.from(GROWTH_TABLE).delete().eq("id", id).eq("record_type", WELLNESS_TYPE);
  if (error) throwDb(error.message);
}
