// 学びの記録API（指示書179 B）
//   GET  [?user=<userId>] → { records（証跡は署名URL付き）, courses, tableMissing, bucketMissing }
//        user を省略すると自分の分。他人の分は **管理者のみ**（それ以外は404）
//   POST → 追加。userId は本人なら自分固定（送られてきても無視）。管理者は任意の人へ追加できる
//   PATCH → 更新（送られた項目だけ差し替え・169と同じ）。本人の記録 or 管理者
//   DELETE ?id= → 削除（証跡の実体も消す）。本人の記録 or 管理者
//
// 【権限（B-4）】本人＝自分の記録の追加・編集・削除／管理者＝全員分。他人の学びは読めない。
// 証跡の追加・削除は /api/growth/learning/evidence（multipart）。

import { NextResponse } from "next/server";
import {
  attachEvidenceUrls,
  authorizeGrowth,
  deleteLearning,
  fetchCourse,
  fetchCourses,
  fetchGrowthConfig,
  fetchLearning,
  fetchLearningRow,
  newGrowthId,
  recordGrowthLog,
  saveLearning,
} from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import { buildLearningChanges, normalizeLearning } from "@/lib/staff-growth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const userParam = new URL(req.url).searchParams.get("user") ?? "";
  // 他人の記録は管理者だけ（存在も知らせない）
  if (userParam && userParam !== auth.userId && !auth.isAdmin) return hidden();
  const userId = userParam || auth.userId;

  try {
    const [{ records, tableMissing }, { courses }, config] = await Promise.all([
      fetchLearning(auth.admin, userId),
      fetchCourses(auth.admin),
      fetchGrowthConfig(auth.admin),
    ]);
    const signed = await attachEvidenceUrls(auth.admin, records);
    return NextResponse.json({
      records: signed.records,
      courses,
      tableMissing,
      bucketMissing: signed.bucketMissing,
      isAdmin: auth.isAdmin,
      userId,
      // AI下書きのボタンを出すかどうか（ON/OFF の事実だけ・設定の中身は返さない）
      aiDraftEnabled: config.aiDraftEnabled,
    });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");

  // 本人は自分の分だけ（body.userId は無視）。管理者は指定があればその人へ
  const targetUserId =
    auth.isAdmin && typeof body.userId === "string" && body.userId ? body.userId : auth.userId;
  const now = new Date().toISOString();
  const by = auth.userEmail || auth.userId;
  const rec = normalizeLearning(newGrowthId("learning"), {
    ...body,
    userId: targetUserId,
    evidence: [], // 証跡は専用APIでだけ増える
    createdBy: by,
    createdAt: now,
    updatedAt: now,
  });
  if (!rec) return badRequest("講座は必須です");
  if (rec.dates.length === 0) return badRequest("参加日を1日以上入れてください");

  try {
    const course = await fetchCourse(auth.admin, rec.courseId);
    if (!course) return badRequest("講座が見つかりません（一覧に無い講座は「追加を依頼」してください）");
    // 180: スタッフが選べるのは確認済み・表示中の講座だけ（管理者は非表示の講座にも記録できる）
    if (!auth.isAdmin && (course.status !== "confirmed" || course.hidden)) {
      return badRequest("この講座は選べません（一覧に無い講座は「追加を依頼」してください）");
    }
    await saveLearning(auth.admin, rec, by);
    await recordGrowthLog(auth.admin, {
      by,
      action: "登録",
      kind: "学びの記録",
      target: targetUserId === auth.userId ? "本人" : "管理者による追加",
      changes: buildLearningChanges(null, rec, () => course.name),
    });
    return NextResponse.json({ record: rec });
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
    const prev = await fetchLearningRow(auth.admin, id);
    // 他人の記録は「無い」のと同じ応答（存在を知らせない）
    if (!prev || (prev.userId !== auth.userId && !auth.isAdmin)) return hidden();

    const next = normalizeLearning(id, {
      ...prev,
      ...body,
      // 持ち主・証跡・作成情報はこのAPIでは変えない
      userId: prev.userId,
      evidence: prev.evidence,
      createdBy: prev.createdBy,
      createdAt: prev.createdAt,
      updatedAt: new Date().toISOString(),
    });
    if (!next) return badRequest("講座は必須です");
    if (next.dates.length === 0) return badRequest("参加日を1日以上入れてください");

    if (next.courseId !== prev.courseId) {
      const course = await fetchCourse(auth.admin, next.courseId);
      if (!course) return badRequest("講座が見つかりません");
      if (!auth.isAdmin && (course.status !== "confirmed" || course.hidden)) {
        return badRequest("この講座は選べません（一覧に無い講座は「追加を依頼」してください）");
      }
    }
    const { courses } = await fetchCourses(auth.admin);
    const nameOf = (cid: string) => courses.find((c) => c.id === cid)?.name ?? "（講座不明）";

    const by = auth.userEmail || auth.userId;
    await saveLearning(auth.admin, next, by);
    const changes = buildLearningChanges(prev, next, nameOf);
    if (changes.length > 0) {
      await recordGrowthLog(auth.admin, {
        by,
        action: "更新",
        kind: "学びの記録",
        target: prev.userId === auth.userId ? "本人" : "管理者による更新",
        changes,
      });
    }
    const signed = await attachEvidenceUrls(auth.admin, [next]);
    return NextResponse.json({ record: signed.records[0] });
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
    const prev = await fetchLearningRow(auth.admin, id);
    if (!prev || (prev.userId !== auth.userId && !auth.isAdmin)) return hidden();
    const { courses } = await fetchCourses(auth.admin);
    const nameOf = (cid: string) => courses.find((c) => c.id === cid)?.name ?? "（講座不明）";
    await deleteLearning(auth.admin, prev);
    await recordGrowthLog(auth.admin, {
      by: auth.userEmail || auth.userId,
      action: "削除",
      kind: "学びの記録",
      target: prev.userId === auth.userId ? "本人" : "管理者による削除",
      changes: buildLearningChanges(null, prev, nameOf),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
