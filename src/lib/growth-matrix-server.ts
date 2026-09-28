// 成長マトリクスのサーバー共通部（指示書190・サーバー専用）
//   保存先は 179 の clinic_staff_growth（RLS全拒否・service-role のみ）。新テーブルは作らない。
//   record_type: gate（ゲートの定義）| gate_check（院長の確認）| matrix_review（院長の確認・合意した位置）| grade（等級・キャリアライン）
//   本人の自己評価（位置・根拠）は 111 の private_store（content_type self_review）の data.matrix に入る。
//   閲覧は**本人と院長のみ**（183の担当幹部には出さない）。呼び出し側（route）で強制する。

import { GROWTH_TABLE, isMissingTable, newGrowthId, type GrowthAdminClient, fetchCourses, fetchLearning } from "./staff-growth-server";
import {
  attainmentItemsOf,
  defaultGatesFromSpec,
  enforceReachRules,
  judgeGate,
  nextTransitionOf,
  normalizeGate,
  normalizeGateCheck,
  normalizeMatrixReview,
  normalizeMatrixSelf,
  normalizeStaffGrade,
  transitionSpec,
  type AttainmentItem,
  type Gate,
  type GateCheck,
  type GateResult,
  type MatrixReview,
  type MatrixSelf,
  type StaffGrade,
  type TransitionKey,
} from "./growth-matrix";

const GATE_TYPE = "gate";
const GATE_CHECK_TYPE = "gate_check";
const REVIEW_TYPE = "matrix_review";
const GRADE_TYPE = "grade";

type Row = { id: string; data: unknown };

async function rows(admin: GrowthAdminClient, type: string, userId?: string): Promise<{ rows: Row[]; tableMissing: boolean }> {
  let q = admin.from(GROWTH_TABLE).select("id, data").eq("record_type", type);
  if (userId) q = q.eq("data->>userId", userId);
  const { data, error } = await q;
  if (error) {
    if (isMissingTable(error.message)) return { rows: [], tableMissing: true };
    throw new Error(error.message);
  }
  return { rows: (data ?? []) as Row[], tableMissing: false };
}
async function upsert(admin: GrowthAdminClient, type: string, id: string, data: Record<string, unknown>, by: string): Promise<void> {
  const { error } = await admin.from(GROWTH_TABLE).upsert({ id, record_type: type, data, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

// ─── ゲート ───

export async function fetchGates(admin: GrowthAdminClient): Promise<{ gates: Gate[]; tableMissing: boolean }> {
  const r = await rows(admin, GATE_TYPE);
  const gates = r.rows
    .map((x) => normalizeGate(String(x.id), x.data))
    .filter((g): g is Gate => g !== null)
    .sort((a, b) => a.transition.localeCompare(b.transition) || a.order - b.order || a.createdAt.localeCompare(b.createdAt));
  return { gates, tableMissing: r.tableMissing };
}
export async function saveGate(admin: GrowthAdminClient, g: Gate, by: string): Promise<void> {
  const { id, ...data } = g;
  await upsert(admin, GATE_TYPE, id, data, by);
}
export async function deleteGate(admin: GrowthAdminClient, id: string): Promise<void> {
  const { error } = await admin.from(GROWTH_TABLE).delete().eq("id", id).eq("record_type", GATE_TYPE);
  if (error) throw new Error(error.message);
}
/** 確定版 第4節の必須の学びを初期登録（同じ移行・同じ文言があれば飛ばす）。講座の紐づけは院長が行う */
export async function seedGates(admin: GrowthAdminClient, by: string): Promise<number> {
  const { gates } = await fetchGates(admin);
  const now = new Date().toISOString();
  let n = 0;
  for (const d of defaultGatesFromSpec()) {
    if (gates.some((g) => g.transition === d.transition && g.label === d.label)) continue;
    await saveGate(admin, { ...d, id: newGrowthId("gate"), createdAt: now, updatedAt: now }, by);
    n++;
  }
  return n;
}

export async function fetchGateChecks(admin: GrowthAdminClient, userId: string): Promise<GateCheck[]> {
  const r = await rows(admin, GATE_CHECK_TYPE, userId);
  return r.rows.map((x) => normalizeGateCheck(String(x.id), x.data)).filter((c): c is GateCheck => c !== null);
}
export async function saveGateCheck(admin: GrowthAdminClient, c: Omit<GateCheck, "id" | "updatedAt">): Promise<GateCheck> {
  const existing = (await fetchGateChecks(admin, c.userId)).find((x) => x.gateId === c.gateId);
  const id = existing?.id ?? newGrowthId("gchk");
  const next: GateCheck = { ...c, id, updatedAt: new Date().toISOString() };
  const { id: _i, ...data } = next;
  void _i;
  await upsert(admin, GATE_CHECK_TYPE, id, data, c.by);
  return next;
}

// ─── 院長の確認・合意した位置 ───

export function reviewId(userId: string): string {
  return `mrev-${userId}`;
}
export async function fetchMatrixReview(admin: GrowthAdminClient, userId: string): Promise<MatrixReview> {
  const { data, error } = await admin.from(GROWTH_TABLE).select("id, data").eq("id", reviewId(userId)).eq("record_type", REVIEW_TYPE).maybeSingle();
  if (error && !isMissingTable(error.message)) throw new Error(error.message);
  return normalizeMatrixReview(data?.data ?? null, userId);
}
export async function saveMatrixReview(admin: GrowthAdminClient, r: MatrixReview, by: string): Promise<void> {
  await upsert(admin, REVIEW_TYPE, reviewId(r.userId), { ...r, updatedAt: new Date().toISOString(), updatedBy: by }, by);
}

// ─── 等級・キャリアライン ───

export function gradeId(userId: string): string {
  return `grade-${userId}`;
}
export async function fetchStaffGrade(admin: GrowthAdminClient, userId: string): Promise<StaffGrade> {
  const { data, error } = await admin.from(GROWTH_TABLE).select("id, data").eq("id", gradeId(userId)).eq("record_type", GRADE_TYPE).maybeSingle();
  if (error && !isMissingTable(error.message)) throw new Error(error.message);
  return normalizeStaffGrade(data?.data ?? null, userId);
}
export async function saveStaffGrade(admin: GrowthAdminClient, g: StaffGrade, by: string): Promise<void> {
  await upsert(admin, GRADE_TYPE, gradeId(g.userId), { ...g, updatedAt: new Date().toISOString(), updatedBy: by }, by);
}

// ─── 本人の自己評価（private_store の self_review）を読む（本人 or 院長の範囲でだけ呼ぶ）───

export type SelfMatrixSnapshot = { matrix: MatrixSelf; periodLabel: string; recordKey: string; status: string; updatedAt: string } | null;

export async function readSelfMatrix(admin: GrowthAdminClient, userId: string, today: string): Promise<SelfMatrixSnapshot> {
  const { data, error } = await admin
    .from("private_store")
    .select("record_key, data, updated_at")
    .eq("content_type", "self_review")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingTable(error.message)) return null;
    throw new Error(error.message);
  }
  const row = (data ?? [])[0] as { record_key: string; data: Record<string, unknown> | null; updated_at: string } | undefined;
  if (!row) return null;
  const d = row.data ?? {};
  // ルール1・2 はサーバーでも守る（根拠が足りない「到達」は「途上」として扱う）
  const matrix = enforceReachRules(normalizeMatrixSelf(d.matrix), today);
  return { matrix, periodLabel: typeof d.period_label === "string" ? d.period_label : "", recordKey: row.record_key, status: typeof d.status === "string" ? d.status : "", updatedAt: row.updated_at ?? "" };
}

// ─── 現在地（D）───

export type PositionView = {
  userId: string;
  grade: StaffGrade;
  self: SelfMatrixSnapshot;
  review: MatrixReview;
  /** 次の移行（本人の自己評価の選択 → 等級から。どちらも無ければ null） */
  transition: TransitionKey | null;
  items: AttainmentItem[];
  gates: GateResult[];
  gatesTableMissing: boolean;
  today: string;
};

export async function buildPosition(admin: GrowthAdminClient, userId: string, today: string): Promise<PositionView> {
  const [grade, self, review, { gates, tableMissing }, checks, { records }, { courses }] = await Promise.all([
    fetchStaffGrade(admin, userId),
    readSelfMatrix(admin, userId, today),
    fetchMatrixReview(admin, userId),
    fetchGates(admin),
    fetchGateChecks(admin, userId),
    fetchLearning(admin, userId),
    fetchCourses(admin),
  ]);
  const transition = self?.matrix.transition || nextTransitionOf(grade.grade) || null;
  const courseNameOf = (id: string) => courses.find((c) => c.id === id)?.name ?? "";
  const gateResults = transition ? gates.filter((g) => g.transition === transition).map((g) => judgeGate(g, records, checks, courseNameOf, today)) : [];
  const items = transition && transitionSpec(transition) ? attainmentItemsOf(transition) : [];
  return { userId, grade, self, review, transition, items, gates: gateResults, gatesTableMissing: tableMissing, today };
}
