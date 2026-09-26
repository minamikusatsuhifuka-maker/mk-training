// 自分の目標API（指示書179 C）
//   GET  [?user=] → { goals, tableMissing }。他人の分は **管理者のみ**（閲覧のみ）
//   POST / PATCH / DELETE → **本人のみ**追加・編集・削除（管理者も他人の目標は書かない＝「本人が追加・編集」）
//   「次にやること」から移すときは fromLearningId に元の学びの記録idを入れる。

import { NextResponse } from "next/server";
import {
  authorizeGrowth,
  deleteGoal,
  fetchGoal,
  fetchGoals,
  newGrowthId,
  recordGrowthLog,
  saveGoal,
} from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import { buildGoalChanges, normalizeGoal } from "@/lib/staff-growth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const userParam = new URL(req.url).searchParams.get("user") ?? "";
  if (userParam && userParam !== auth.userId && !auth.isAdmin) return hidden();
  try {
    const { goals, tableMissing } = await fetchGoals(auth.admin, userParam || auth.userId);
    return NextResponse.json({ goals, tableMissing });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");
  const now = new Date().toISOString();
  const goal = normalizeGoal(newGrowthId("goal"), {
    ...body,
    userId: auth.userId, // 常に本人
    createdAt: now,
    updatedAt: now,
  });
  if (!goal) return badRequest("目標は必須です");
  try {
    const by = auth.userEmail || auth.userId;
    await saveGoal(auth.admin, goal, by);
    await recordGrowthLog(auth.admin, {
      by,
      action: "登録",
      kind: "目標",
      target: "本人",
      changes: buildGoalChanges(null, goal),
    });
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
    if (!prev || prev.userId !== auth.userId) return hidden();
    const next = normalizeGoal(id, {
      ...prev,
      ...body,
      userId: prev.userId,
      createdAt: prev.createdAt,
      updatedAt: new Date().toISOString(),
    });
    if (!next) return badRequest("目標は必須です");
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
    if (!prev || prev.userId !== auth.userId) return hidden();
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
