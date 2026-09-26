// 講座マスタAPI（指示書179 B-2）
//   GET    → { courses, tableMissing }（ログイン済み・フラグON or 管理者）
//   POST   → 講座を登録。スタッフが登録すると「未確認」、管理者は「確認済み」
//   PATCH  → 名称・主催・区分・状態の更新（**管理者のみ**）
//   DELETE ?id= → 削除（**管理者のみ**・学びの記録が1件でも紐づいていれば拒否＝統合を使う）
// 表記ゆれ対策: 同名（全角半角・空白・記号を無視して一致）の講座があれば、新しく作らずそれを返す。

import { NextResponse } from "next/server";
import {
  authorizeGrowth,
  deleteCourse,
  fetchCourse,
  fetchCourses,
  fetchLearning,
  newGrowthId,
  recordGrowthLog,
  saveCourse,
} from "@/lib/staff-growth-server";
import {
  badRequest,
  growthErrorResponse,
  hidden,
  readJson,
} from "@/lib/staff-growth-route";
import {
  buildCourseChanges,
  findSameCourse,
  normalizeCourse,
  type Course,
} from "@/lib/staff-growth";

export const runtime = "nodejs";

export async function GET() {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  try {
    const { courses, tableMissing } = await fetchCourses(auth.admin);
    return NextResponse.json({ courses, tableMissing, isAdmin: auth.isAdmin });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");

  try {
    const { courses } = await fetchCourses(auth.admin);
    const now = new Date().toISOString();
    const by = auth.userEmail || auth.userId;
    const course = normalizeCourse(newGrowthId("course"), {
      ...body,
      // スタッフの登録は必ず未確認（管理者が確認・統合する）。管理者は指定が無ければ確認済み
      status: auth.isAdmin ? (body.status === "unconfirmed" ? "unconfirmed" : "confirmed") : "unconfirmed",
      createdBy: by,
      createdAt: now,
      updatedAt: now,
    });
    if (!course) return badRequest("講座の名称は必須です");

    // 同じ講座は同じマスタに（B-2）
    const same = findSameCourse(courses, course.name);
    if (same) return NextResponse.json({ course: same, existed: true });

    await saveCourse(auth.admin, course, by);
    await recordGrowthLog(auth.admin, {
      by,
      action: "登録",
      kind: "講座",
      target: course.name,
      changes: buildCourseChanges(null, course),
    });
    return NextResponse.json({ course, existed: false });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function PATCH(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  if (!auth.isAdmin) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return badRequest("id は必須です");

  try {
    const prev = await fetchCourse(auth.admin, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    const next = normalizeCourse(id, {
      ...prev,
      ...body,
      createdBy: prev.createdBy,
      createdAt: prev.createdAt,
      updatedAt: new Date().toISOString(),
    });
    if (!next) return badRequest("講座の名称は必須です");

    // 別の講座と同名になるなら統合を促す（黙って2件にしない）
    const { courses } = await fetchCourses(auth.admin);
    const same = findSameCourse(courses.filter((c) => c.id !== id), next.name);
    if (same) {
      return badRequest(`同じ名称の講座「${same.name}」があります。統合してください。`);
    }

    const by = auth.userEmail || auth.userId;
    await saveCourse(auth.admin, next, by);
    const changes = buildCourseChanges(prev, next);
    if (changes.length > 0) {
      await recordGrowthLog(auth.admin, { by, action: "更新", kind: "講座", target: next.name, changes });
    }
    return NextResponse.json({ course: next satisfies Course });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  if (!auth.isAdmin) return hidden();
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return badRequest("id は必須です");

  try {
    const prev = await fetchCourse(auth.admin, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    const { records } = await fetchLearning(auth.admin);
    const used = records.filter((r) => r.courseId === id).length;
    if (used > 0) {
      return badRequest(
        `この講座には学びの記録が${used}件あります。削除ではなく、別の講座へ統合してください。`
      );
    }
    await deleteCourse(auth.admin, id);
    await recordGrowthLog(auth.admin, {
      by: auth.userEmail || auth.userId,
      action: "削除",
      kind: "講座",
      target: prev.name,
      changes: buildCourseChanges(null, prev),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
