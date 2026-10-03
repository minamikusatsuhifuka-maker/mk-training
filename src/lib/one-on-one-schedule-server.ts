// 次回1on1の予定（指示書197 B-2・C）— サーバー専用
//
// 保存は clinic_staff_growth の record_type = "schedule"（179のテーブル・RLS全拒否＋service-role。SQL不要）。
// 回答済みかどうかは private_store（one_on_one_presurvey）をサーバーで読んで判定する。
// 回答の本文はここから外へ出さない（「答えたか」だけを返す）。
//
// クライアントから import しないこと。

import { createSupabaseAdminClient } from "./supabase-admin";
import { serverGetContentRow } from "./content-store-server";
import { STAFF_PROFILES_INDEX_KEY } from "./staff-profiles";
import { isAdminUser } from "./admin-role";
import { loadDelegationSnapshot } from "./admin-delegation-server";
import {
  GROWTH_TABLE,
  GrowthTableMissingError,
  isMissingTable,
  type GrowthAdminClient,
} from "./staff-growth-server";
import { normalizePresurveyData } from "./one-on-one-presurvey";
import {
  SCHEDULE_RECORD_TYPE,
  isScheduleAnswered,
  normalizeSchedule,
  presurveyAlertFor,
  scheduleAnswerState,
  upcomingSchedules,
  type OneOnOneSchedule,
  type ScheduleView,
} from "./one-on-one-schedule";

type Row = { id: unknown; data: unknown };

export async function fetchSchedules(
  admin: GrowthAdminClient,
  filter: { userId?: string; partnerId?: string } = {}
): Promise<{ schedules: OneOnOneSchedule[]; tableMissing: boolean }> {
  let q = admin.from(GROWTH_TABLE).select("id, data").eq("record_type", SCHEDULE_RECORD_TYPE);
  if (filter.userId) q = q.eq("data->>userId", filter.userId);
  if (filter.partnerId) q = q.eq("data->>partnerId", filter.partnerId);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error.message)) return { schedules: [], tableMissing: true };
    throw new Error(error.message);
  }
  const schedules = ((data ?? []) as Row[])
    .map((r) => normalizeSchedule(String(r.id), r.data))
    .filter((s): s is OneOnOneSchedule => s !== null);
  return { schedules, tableMissing: false };
}

export async function fetchSchedule(admin: GrowthAdminClient, id: string): Promise<OneOnOneSchedule | null> {
  const { data, error } = await admin
    .from(GROWTH_TABLE)
    .select("id, data")
    .eq("id", id)
    .eq("record_type", SCHEDULE_RECORD_TYPE)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) throw new GrowthTableMissingError();
    throw new Error(error.message);
  }
  return data ? normalizeSchedule(String((data as Row).id), (data as Row).data) : null;
}

export async function saveSchedule(admin: GrowthAdminClient, s: OneOnOneSchedule, updatedBy: string): Promise<void> {
  const { id, ...data } = s;
  const { error } = await admin.from(GROWTH_TABLE).upsert({
    id,
    record_type: SCHEDULE_RECORD_TYPE,
    data,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (isMissingTable(error.message)) throw new GrowthTableMissingError();
    throw new Error(error.message);
  }
}

export async function deleteSchedule(admin: GrowthAdminClient, id: string): Promise<void> {
  const { error } = await admin
    .from(GROWTH_TABLE)
    .delete()
    .eq("id", id)
    .eq("record_type", SCHEDULE_RECORD_TYPE);
  if (error) {
    if (isMissingTable(error.message)) throw new GrowthTableMissingError();
    throw new Error(error.message);
  }
}

/** 本人たちの事前アンケートの「回答したか」の材料だけを読む（本文は使わない） */
async function presurveyMarkers(
  admin: GrowthAdminClient,
  ownerIds: string[]
): Promise<Map<string, { scheduleId: string; heldOn: string; participantIds: string[]; submittedAt: string }[]>> {
  const out = new Map<string, { scheduleId: string; heldOn: string; participantIds: string[]; submittedAt: string }[]>();
  const ids = Array.from(new Set(ownerIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const { data, error } = await admin
    .from("private_store")
    .select("owner_id, data")
    .eq("content_type", "one_on_one_presurvey")
    .in("owner_id", ids);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as { owner_id: string; data: unknown }[]) {
    const d = normalizePresurveyData(row.data);
    const list = out.get(row.owner_id) ?? [];
    list.push({ scheduleId: d.scheduleId, heldOn: d.heldOn, participantIds: d.participantIds, submittedAt: d.submittedAt });
    out.set(row.owner_id, list);
  }
  return out;
}


/** これからの予定に、回答の状態と知らせを付ける */
export async function withAnswerState(
  admin: GrowthAdminClient,
  schedules: OneOnOneSchedule[],
  today: string
): Promise<ScheduleView[]> {
  const upcoming = upcomingSchedules(schedules, today);
  const markers = await presurveyMarkers(admin, upcoming.map((s) => s.userId));
  return upcoming.map((s) => {
    const answered = isScheduleAnswered(s, markers.get(s.userId) ?? []);
    return {
      ...s,
      answered,
      state: scheduleAnswerState(s, today, answered),
      alert: presurveyAlertFor(s, today, answered),
    };
  });
}

// ─── 名前・担当者の候補 ───

export type PersonName = { userId: string; name: string; isDirector: boolean };

/** 有効なアカウントの名前（プロフィール → Auth の display_name → メール）と院長かどうか */
export async function loadPeople(admin: GrowthAdminClient): Promise<Map<string, PersonName>> {
  const byId = new Map<string, PersonName>();
  try {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of data?.users ?? []) {
      const until = (u as { banned_until?: string | null }).banned_until;
      if (until && new Date(until).getTime() > Date.now()) continue; // 無効化済みは候補に出さない
      const meta = u.user_metadata as Record<string, unknown> | null;
      const name = typeof meta?.display_name === "string" ? meta.display_name.trim() : "";
      byId.set(u.id, { userId: u.id, name: name || u.email || "名前未設定", isDirector: isAdminUser(u) });
    }
  } catch {
    /* 取れないときはプロフィールだけ */
  }
  try {
    const row = await serverGetContentRow(STAFF_PROFILES_INDEX_KEY);
    const items = (row?.data as { items?: unknown } | null)?.items;
    if (Array.isArray(items)) {
      for (const it of items) {
        const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
        const userId = typeof o.userId === "string" ? o.userId : "";
        const name = typeof o.name === "string" ? o.name.trim() : "";
        const p = byId.get(userId);
        if (p && name) p.name = name;
      }
    }
  } catch {
    /* 飛ばす */
  }
  return byId;
}

/**
 * その人の1on1の担当者になれる人 = 院長（管理者）＋ そのスタッフの担当幹部（183）。本人は除く。
 */
export async function partnerCandidates(
  admin: GrowthAdminClient,
  staffUserId: string,
  people?: Map<string, PersonName>
): Promise<PersonName[]> {
  const byId = people ?? (await loadPeople(admin));
  const snap = await loadDelegationSnapshot().catch(() => ({ karte: {} as Record<string, string[]> }));
  const managers = new Set(
    Object.entries(snap.karte)
      .filter(([, staff]) => staff.includes(staffUserId))
      .map(([managerId]) => managerId)
  );
  return Array.from(byId.values())
    .filter((p) => p.userId !== staffUserId && (p.isDirector || managers.has(p.userId)))
    .sort((a, b) => Number(b.isDirector) - Number(a.isDirector) || a.name.localeCompare(b.name, "ja"));
}

export function newScheduleId(): string {
  return `schedule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export { createSupabaseAdminClient };
