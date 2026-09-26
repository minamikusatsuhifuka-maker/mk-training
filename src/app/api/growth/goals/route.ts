// 目標API（指示書179 C → 185 A: 段階的な目標）
//   GET  [?user=] → { goals, pref（希望のペース）, tableMissing, canSupport, isOwner }
//        本人＝自分の分。他人の分は管理者、または担当の幹部（183・閲覧）だけ
//   POST / PATCH / DELETE → **本人のみ**（目標の内容は本人だけが書く・A-3）
//        PATCH で送られても「機会・支援／コメント／合意」は無視する（それらは /api/growth/goals/support）
//   「次にやること」から移すときは fromLearningId に元の学びの記録idを入れる。

import { NextResponse } from "next/server";
import {
  authorizeGrowth,
  canViewStaff,
  deleteGoal,
  fetchGoal,
  fetchGoals,
  fetchGrowthPref,
  newGrowthId,
  recordGrowthLog,
  saveGoal,
} from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import { GOAL_OWNER_FIELDS, buildGoalChanges, normalizeGoal } from "@/lib/staff-growth";

export const runtime = "nodejs";

/** 本人が書ける項目だけを取り出す（機会・支援・コメント・合意はここでは受け取らない） */
function ownerFields(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of GOAL_OWNER_FIELDS) if (k in body) out[k] = body[k];
  return out;
}

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const userParam = new URL(req.url).searchParams.get("user") ?? "";
  // 他人の目標は管理者、または担当の幹部（183・閲覧のみ）だけ
  if (userParam && userParam !== auth.userId && !canViewStaff(auth, userParam)) return hidden();
  if ((!userParam || userParam === auth.userId) && !auth.selfAllowed) return hidden();
  const userId = userParam || auth.userId;
  try {
    const [{ goals, tableMissing }, pref] = await Promise.all([fetchGoals(auth.admin, userId), fetchGrowthPref(auth.admin, userId)]);
    return NextResponse.json({
      goals,
      pref,
      tableMissing,
      isOwner: userId === auth.userId,
      // 機会・支援・コメント・合意を書けるのは院長と担当幹部（本人は書けない）
      canSupport: userId !== auth.userId && canViewStaff(auth, userId),
    });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.selfAllowed) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");
  const now = new Date().toISOString();
  const goal = normalizeGoal(newGrowthId("goal"), {
    ...ownerFields(body),
    userId: auth.userId, // 常に本人
    createdAt: now,
    updatedAt: now,
  });
  if (!goal) return badRequest("目標は必須です");
  try {
    // 上位目標は自分の目標に限る（他人の目標には紐づけない）
    if (goal.parentId) {
      const parent = await fetchGoal(auth.admin, goal.parentId);
      if (!parent || parent.userId !== auth.userId) return badRequest("つながる上位目標が見つかりません");
    }
    const by = auth.userEmail || auth.userId;
    await saveGoal(auth.admin, goal, by);
    await recordGrowthLog(auth.admin, { by, action: "登録", kind: "目標", target: "本人", changes: buildGoalChanges(null, goal) });
    return NextResponse.json({ goal });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function PATCH(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return badRequest("id は必須です");
  try {
    const prev = await fetchGoal(auth.admin, id);
    // 本人だけ（他人の目標の内容は院長・幹部も書けない）
    if (!prev || prev.userId !== auth.userId || !auth.selfAllowed) return hidden();
    const next = normalizeGoal(id, {
      ...prev,
      ...ownerFields(body),
      userId: prev.userId,
      createdAt: prev.createdAt,
      updatedAt: new Date().toISOString(),
    });
    if (!next) return badRequest("目標は必須です");
    if (next.parentId && next.parentId !== prev.parentId) {
      const parent = await fetchGoal(auth.admin, next.parentId);
      if (!parent || parent.userId !== auth.userId || parent.id === id) return badRequest("つながる上位目標が見つかりません");
    }
    const by = auth.userEmail || auth.userId;
    await saveGoal(auth.admin, next, by);
    const changes = buildGoalChanges(prev, next);
    if (changes.length > 0) {
      await recordGrowthLog(auth.admin, { by, action: "更新", kind: "目標", target: "本人", changes });
    }
    return NextResponse.json({ goal: next });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return badRequest("id は必須です");
  try {
    const prev = await fetchGoal(auth.admin, id);
    if (!prev || prev.userId !== auth.userId || !auth.selfAllowed) return hidden();
    await deleteGoal(auth.admin, id);
    await recordGrowthLog(auth.admin, {
      by: auth.userEmail || auth.userId,
      action: "削除",
      kind: "目標",
      target: "本人",
      changes: buildGoalChanges(null, prev),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
