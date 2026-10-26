// 🧭 成長の道しるべ 第2部（指示書270 §3）— サーバー専用
//
// 【見られる人・書ける人】可能性ノートの今の決まりのまま（authorizeGrowth）：本人、院長、その人の1on1を担当する幹部（183 のカルテの担当）。
//   そのうえで、スイッチ michishirube がOFFの間は院長と検証用アカウントだけ（ほかは404）。
// 【保存】clinic_staff_growth の michi_progress（1人1行・id = mp-<userId>）。
// 【検証用（237）】検証用アカウントの行には印を付ける。本物の幹部の担当には検証用が入らない（loadKarteAssignments）ので、本物のスタッフには出ない。

import { getSessionUser } from "./staff-profiles-server";
import { isTestSeedUser } from "./test-seed";
import {
  GROWTH_TABLE,
  authorizeGrowth,
  canViewStaff,
  isMissingTable,
  serverFeatureEnabled,
  type GrowthAdminClient,
  type GrowthAuth,
} from "./staff-growth-server";
import { fetchStaffGrade } from "./growth-matrix-server";
import { loadMichiContent } from "./michishirube-server";
import { MICHI_LEVEL_IDS, stripFixMarks, type MichiContent, type MichiLevel, type MichiSkillLine } from "./michishirube";
import {
  MICHI_PROGRESS_TYPE,
  confirmedCount,
  emptyProgress,
  nextLevelOf,
  normalizeProgress,
  pendingCount,
  skillLineIdsFor,
  type MichiActor,
  type MichiCatalog,
  type MichiProgress,
} from "./michi-progress";

export const MICHI_FEATURE_ID = "michishirube";

export type MichiProgressAuth = {
  auth: Extract<GrowthAuth, { ok: true }>;
  userId: string;
  actor: MichiActor;
};

/**
 * その人の道しるべを見てよいか。見てよくなければ null（呼び出し側は404）。
 * userParam が空なら自分。
 */
export async function authorizeMichiProgress(userParam: string): Promise<MichiProgressAuth | null> {
  const auth = await authorizeGrowth();
  if (!auth.ok) return null;
  if (!auth.isAdmin) {
    const { user } = await getSessionUser();
    if (!isTestSeedUser(user) && !(await serverFeatureEnabled(MICHI_FEATURE_ID))) return null;
  }
  const userId = userParam || auth.userId;
  const isSelf = userId === auth.userId;
  if (isSelf ? !auth.selfAllowed : !canViewStaff(auth, userId)) return null;
  return {
    auth,
    userId,
    actor: {
      id: auth.userId,
      name: auth.userName || auth.userEmail || "",
      isSelf,
      canConfirm: !isSelf && canViewStaff(auth, userId),
      canSetLevel: auth.isAdmin,
    },
  };
}

export const progressRowId = (userId: string) => `mp-${userId}`;

export async function loadProgress(admin: GrowthAdminClient, userId: string): Promise<MichiProgress> {
  const { data, error } = await admin
    .from(GROWTH_TABLE)
    .select("data")
    .eq("id", progressRowId(userId))
    .eq("record_type", MICHI_PROGRESS_TYPE)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) return emptyProgress(userId);
    throw new Error(error.message);
  }
  return normalizeProgress((data as { data?: unknown } | null)?.data, userId);
}

export async function saveProgress(admin: GrowthAdminClient, p: MichiProgress, by: string): Promise<void> {
  // 検証用アカウントの行には印を付ける（一括の片付け・本物のスタッフから隠すため）
  let testSeed = p.testSeed === true;
  if (!testSeed) {
    try {
      const { data } = await admin.auth.admin.getUserById(p.userId);
      testSeed = isTestSeedUser(data?.user ?? null);
    } catch {
      /* 読めなければ印なし */
    }
  }
  const data = { ...p, ...(testSeed ? { testSeed: true, seed191: true } : {}) };
  const { error } = await admin
    .from(GROWTH_TABLE)
    .upsert({ id: progressRowId(p.userId), record_type: MICHI_PROGRESS_TYPE, data, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export function catalogOf(content: MichiContent): MichiCatalog {
  return {
    levels: MICHI_LEVEL_IDS,
    stepsOf: (lv) => content.levels.find((l) => l.id === lv)?.steps.map((s) => s.id) ?? [],
    learnsOf: (lv) => content.levels.find((l) => l.id === lv)?.learnings.map((s) => s.id) ?? [],
    skillIds: content.skillLines.flatMap((l) => l.items.map((i) => i.id)),
  };
}

export type MichiProgressView = {
  userId: string;
  isSelf: boolean;
  canConfirm: boolean;
  canSetLevel: boolean;
  levels: readonly string[];
  progress: MichiProgress;
  current: MichiLevel | null;
  next: MichiLevel | null;
  /** 技能の到達を見る段（今いる段の次の段。例 G1 → "G1+"） */
  reachLevel: string;
  skillLines: MichiSkillLine[];
  confirmed: number;
  total: number;
  pending: number;
};

export async function buildMichiView(a: MichiProgressAuth, progress?: MichiProgress): Promise<MichiProgressView> {
  const admin = a.auth.admin;
  const [contentRaw, p, grade] = await Promise.all([
    loadMichiContent(admin),
    progress ? Promise.resolve(progress) : loadProgress(admin, a.userId),
    fetchStaffGrade(admin, a.userId).catch(() => ({ careerLine: "" })),
  ]);
  const content = stripFixMarks(contentRaw);
  const current = content.levels.find((l) => l.id === p.level) ?? null;
  const nextId = p.level ? nextLevelOf(MICHI_LEVEL_IDS, p.level) : "";
  const next = content.levels.find((l) => l.id === nextId) ?? null;
  const lineIds = skillLineIdsFor(grade.careerLine);
  const ids = current ? current.steps.map((s) => s.id) : [];
  const { confirmed, total } = confirmedCount(p, ids);
  const { testSeed: _t, ...progressOut } = p;
  void _t;
  return {
    userId: a.userId,
    isSelf: a.actor.isSelf,
    canConfirm: a.actor.canConfirm,
    canSetLevel: a.actor.canSetLevel,
    levels: MICHI_LEVEL_IDS,
    progress: progressOut,
    current,
    next,
    reachLevel: nextId,
    skillLines: content.skillLines.filter((l) => lineIds.includes(l.id)),
    confirmed,
    total,
    pending: pendingCount(p, ids),
  };
}
