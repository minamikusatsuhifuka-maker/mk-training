// 🧭 欲求の一覧（指示書276）— サーバー専用
//
// 【見られる人】院長だけ（isDirectorUser＝管理者で、かつ DIRECTOR_USER_ID と一致）。
//   ほかの管理者・委任された幹部・スタッフ・未ログインは null（呼び出し側は 404）。委任の一覧には載せない（ADMIN_ITEMS に入れない）。
// 【渡す値】
//   ・スイッチ「🧭 院長は欲求サーベイの資料とデータを見る」（277）が OFF の間：本人の公開設定どおりに削いだあと（redactSurveyForViewer）だけ。
//     非公開・未入力は同じ「診断結果がまだありません」（可能性ノートの欲求の視点と同じ＝非公開かどうかも分からない）。
//   ・ON の間（院長がスタッフへの約束の文を変え、お知らせを出したあと）：公開設定にかかわらず、5つ・15項目の「欲求」と原本。
//   ・「注力」「現況」はどちらでも渡さない（182・277 §1。原本で確かめる）。
// 【読むだけ】この画面からは何も書かない。判定も保存しない。

import type { User } from "@supabase/supabase-js";
import { getSessionUser } from "./staff-profiles-server";
import { isDirectorUser } from "./people-training-server";
import { createSupabaseAdminClient } from "./supabase-admin";
import { serverGetContentRow, serverGetContentRowsByPrefix } from "./content-store-server";
import { STAFF_PROFILES_INDEX_KEY, emptyProfile, staffProfileKey, type StaffProfile } from "./staff-profiles";
import { PROFILE_ROLE_CONFIG_KEY, normalizeProfileRoles, resolveRole } from "./profile-roles";
import { redactProfileForViewer, redactSurveyForViewer } from "./survey-visibility";
import { loadSurveyHistory } from "./survey-history-server";
import { surveyFromEntry } from "./survey-history";
import { NEED_KEYS, isPdfAsset, radarValuesOf, type NeedKey, type NeedsSurvey } from "./needs-survey";
import { loadNeedsDirectorView } from "./needs-director-view-server";
import { computeNeedsPerspective } from "./needs-guide";
import { NEEDS_GUIDE_ITEMS } from "./needs-guide-data";
import { isTestSeedUser } from "./test-seed";
import { signOne } from "./storage-signed";
import { GROWTH_TABLE, isMissingTable } from "./staff-growth-server";
import { MICHI_PROGRESS_TYPE } from "./michi-progress";
import { loadMichiContent } from "./michishirube-server";
import { MICHI_LEVEL_IDS } from "./michishirube";
import type { NeedsPersonRow, NeedsSnapshot } from "./needs-overview";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type NeedsOverviewAuth = { user: User; admin: Admin };

/** 277: ON の間だけ、公開設定にかかわらず見る。院長に渡す形（注力・現況は落とす）に固める */
export function directorFullSurvey(s: NeedsSurvey | null | undefined): NeedsSurvey | null {
  if (!s) return null;
  const details: NonNullable<NeedsSurvey["details"]> = {};
  for (const [k, d] of Object.entries(s.details ?? {})) if (typeof d?.desire === "number") details[k] = { desire: d.desire };
  const values = radarValuesOf(s);
  return {
    visibility: "public_details",
    updatedAt: s.updatedAt ?? "",
    ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}),
    ...(Object.keys(values).length > 0 ? { values } : {}),
    ...(Object.keys(details).length > 0 ? { details } : {}),
  };
}

/** 院長だけ。それ以外は null（404 にする） */
export async function authorizeNeedsOverview(): Promise<NeedsOverviewAuth | null> {
  const { user } = await getSessionUser();
  if (!user || !isDirectorUser(user)) return null;
  try {
    return { user, admin: createSupabaseAdminClient() };
  } catch {
    return null;
  }
}

function isBanned(u: User): boolean {
  const until = (u as User & { banned_until?: string | null }).banned_until;
  return !!until && new Date(until).getTime() > Date.now();
}

const surveyKeyOf = (guideKey: string) => NEEDS_GUIDE_ITEMS.find((i) => i.key === guideKey)?.surveyKey ?? "";

/** 削いだあとのサーベイ → 一覧の値（5つ・15項目の欲求・回答日・上位3/下位3） */
export function snapshotOf(shared: NeedsSurvey | null): NeedsSnapshot & { strong: string[]; weak: string[] } {
  const values: Partial<Record<NeedKey, number>> = {};
  const details: Record<string, number> = {};
  if (shared) {
    const radar = radarValuesOf(shared);
    for (const k of NEED_KEYS) {
      const v = radar[k];
      if (typeof v === "number") values[k] = v;
    }
    if (shared.visibility === "public_details") {
      for (const [k, d] of Object.entries(shared.details ?? {})) if (typeof d?.desire === "number") details[k] = d.desire;
    }
  }
  const has = Object.keys(values).length > 0 || Object.keys(details).length > 0;
  // 可能性ノートの「欲求の視点」と同じ関数（欲求の値だけを渡す）
  const p = computeNeedsPerspective(
    Object.fromEntries(Object.entries(details).map(([k, v]) => [k, { desire: v }])),
    NEEDS_GUIDE_ITEMS
  );
  return {
    answeredOn: has ? (shared?.updatedAt || "").slice(0, 10) : "",
    values,
    details,
    strong: p.strong.map(surveyKeyOf).filter(Boolean),
    weak: p.weak.map(surveyKeyOf).filter(Boolean),
  };
}

export type NeedsOverviewList = {
  /** 277: スイッチが ON（公開設定にかかわらず見ている）か */
  fullView: boolean;
  people: NeedsPersonRow[];
  roles: { id: string; label: string }[];
  levels: { id: string; name: string }[];
};

async function levelNames(admin: Admin): Promise<Map<string, string>> {
  const names = new Map<string, string>(MICHI_LEVEL_IDS.map((id) => [id, id]));
  try {
    const content = await loadMichiContent(admin);
    for (const lv of content.levels) if (lv.name) names.set(lv.id, lv.name);
  } catch {
    /* 段の id のまま */
  }
  return names;
}

export async function loadNeedsOverviewList(a: NeedsOverviewAuth): Promise<NeedsOverviewList> {
  const { admin, user: viewer } = a;

  // 今いる人（無効化＝退職した人は出さない）
  const people = new Map<string, NeedsPersonRow>();
  const { data: usersData, error: usersErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersErr) throw new Error(usersErr.message);
  for (const u of usersData.users) {
    if (isBanned(u)) continue;
    const meta = u.user_metadata as Record<string, unknown> | null;
    const name = typeof meta?.display_name === "string" ? meta.display_name.trim() : "";
    people.set(u.id, {
      userId: u.id,
      name: name || u.email || "名前未設定",
      roleId: "",
      roleLabel: "",
      level: "",
      levelName: "",
      ...(isTestSeedUser(u) ? { testSeed: true as const } : {}),
      values: {},
      details: {},
      answeredOn: "",
      strong: [],
      weak: [],
    });
  }

  // 職種（プロフィールの役職）
  let roleDefs = normalizeProfileRoles(null);
  try {
    const row = await serverGetContentRow(PROFILE_ROLE_CONFIG_KEY);
    roleDefs = normalizeProfileRoles((row?.data as { roles?: unknown } | null)?.roles);
  } catch {
    /* 既定で続ける */
  }
  try {
    const row = await serverGetContentRow(STAFF_PROFILES_INDEX_KEY);
    const items = (row?.data as { items?: unknown } | null)?.items;
    if (Array.isArray(items)) {
      for (const it of items) {
        const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
        const cur = typeof o.userId === "string" ? people.get(o.userId) : undefined;
        if (!cur) continue;
        const name = typeof o.name === "string" ? o.name.trim() : "";
        const roleId = typeof o.role === "string" ? o.role : "";
        if (name) cur.name = name;
        cur.roleId = roleId;
        cur.roleLabel = resolveRole(roleDefs, roleId).label;
      }
    }
  } catch {
    /* 名前は Auth のまま */
  }

  // サーベイ（OFF：本人の公開設定どおりに削ぐ／ON：277 のとおり全部・注力と現況は落とす）
  const fullView = (await loadNeedsDirectorView()).on;
  const rows = await serverGetContentRowsByPrefix("staff_profile:");
  for (const row of rows) {
    const p = row.data as StaffProfile | null;
    if (!p || typeof p.userId !== "string") continue;
    const cur = people.get(p.userId);
    if (!cur) continue;
    const full = { ...emptyProfile(p.userId), ...p };
    // 院長自身の行は本人なので削がない（それでも使うのは「欲求」の値だけ）
    const shared =
      fullView || p.userId === viewer.id
        ? directorFullSurvey(full.needsSurvey)
        : redactProfileForViewer(full, viewer.id).needsSurvey ?? null;
    const snap = snapshotOf(shared);
    Object.assign(cur, snap);
  }

  // 今いる段（270・院長が決めたもの）
  const names = await levelNames(admin);
  try {
    const { data, error } = await admin.from(GROWTH_TABLE).select("data").eq("record_type", MICHI_PROGRESS_TYPE);
    if (error && !isMissingTable(error.message)) throw new Error(error.message);
    for (const r of (data ?? []) as { data?: { userId?: unknown; level?: unknown } }[]) {
      const uid = typeof r.data?.userId === "string" ? r.data.userId : "";
      const lv = typeof r.data?.level === "string" ? r.data.level : "";
      const cur = people.get(uid);
      if (cur && lv) {
        cur.level = lv;
        cur.levelName = names.get(lv) ?? lv;
      }
    }
  } catch {
    /* 段なしで続ける */
  }

  const list = Array.from(people.values()).sort((x, y) => x.name.localeCompare(y.name, "ja"));
  const usedRoles = new Set(list.map((p) => p.roleId).filter(Boolean));
  return {
    fullView,
    people: list,
    roles: roleDefs.filter((r) => usedRoles.has(r.id)).map((r) => ({ id: r.id, label: resolveRole(roleDefs, r.id).label })),
    levels: MICHI_LEVEL_IDS.map((id) => ({ id, name: names.get(id) ?? id })),
  };
}

export type NeedsSnapshotView = NeedsSnapshot & { strong: string[]; weak: string[]; imageUrl: string; isPdf: boolean };

/** 一人ずつ：今の結果と前の結果（新しい順・公開設定どおり）。見られる結果が無ければ空の配列 */
export async function loadNeedsOverviewPerson(a: NeedsOverviewAuth, userId: string): Promise<NeedsSnapshotView[] | null> {
  const { admin, user: viewer } = a;
  const { data: u } = await admin.auth.admin.getUserById(userId);
  if (!u?.user || isBanned(u.user)) return null;
  const row = await serverGetContentRow(staffProfileKey(userId));
  const profile = (row?.data ?? null) as StaffProfile | null;
  const survey = profile?.needsSurvey ?? null;
  const full = userId === viewer.id || (await loadNeedsDirectorView()).on;
  const visibility = full ? "public_details" : survey?.visibility ?? "private";
  const cut = (s: NeedsSurvey | null): NeedsSurvey | null => (full ? directorFullSurvey(s) : redactSurveyForViewer(s));

  const out: NeedsSnapshotView[] = [];
  const push = async (s: NeedsSurvey | null) => {
    const shared = cut(s);
    if (!shared) return;
    const snap = snapshotOf(shared);
    if (!snap.answeredOn && Object.keys(snap.values).length === 0) return;
    let imageUrl = "";
    if (shared.imageUrl) {
      try {
        imageUrl = await signOne(admin, shared.imageUrl);
      } catch {
        imageUrl = "";
      }
    }
    out.push({ ...snap, imageUrl, isPdf: isPdfAsset(shared.imageUrl) });
  };
  if (survey) await push({ ...survey, updatedAt: survey.updatedAt || profile?.updatedAt || "" });
  if (survey || full) {
    for (const entry of await loadSurveyHistory(userId)) await push(surveyFromEntry(entry, visibility));
  }
  return out.sort((x, y) => y.answeredOn.localeCompare(x.answeredOn));
}
