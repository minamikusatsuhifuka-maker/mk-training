// 講座の追加依頼API（指示書180 1-2）
//   GET   → { requests, tableMissing }。管理者＝全員分、本人＝自分の依頼だけ
//   POST  { name } → 依頼を出す（名称だけ。**学びの記録は作らない**）
//   PATCH { id, action: "add" | "link", courseId?, organizer?, category?, defaultDays? } → **管理者のみ**
//           add  = 講座として追加（確認済み・表示）。同名の講座が既にあればそれに紐づける
//           link = 既存の講座に紐づけて却下（依頼者には「この講座を使ってください」と案内する）
// 依頼の段階では講座も記録も作らない。追加後にスタッフが一覧から選んで登録する。

import { NextResponse } from "next/server";
import {
  authorizeGrowth,
  fetchCourse,
  fetchCourseRequest,
  fetchCourseRequests,
  fetchCourses,
  newGrowthId,
  recordGrowthLog,
  saveCourse,
  saveCourseRequest,
} from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import {
  buildCourseChanges,
  findSameCourse,
  normalizeCourse,
  normalizeCourseRequest,
  type Course,
} from "@/lib/staff-growth";

export const runtime = "nodejs";

export async function GET() {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  try {
    const { requests, tableMissing } = await fetchCourseRequests(
      auth.admin,
      auth.isAdmin ? undefined : auth.userId
    );
    return NextResponse.json({ requests, tableMissing });
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
  const request = normalizeCourseRequest(newGrowthId("request"), {
    name: body.name,
    userId: auth.userId, // 常に本人
    userName: auth.userName,
    status: "open",
    courseId: "",
    createdAt: now,
    resolvedAt: "",
    resolvedBy: "",
  });
  if (!request) return badRequest("講座の名称を入力してください");
  try {
    // 既にある講座なら依頼にせず、その講座を案内する
    const { courses } = await fetchCourses(auth.admin);
    const same = findSameCourse(courses, request.name);
    if (same && same.status === "confirmed" && !same.hidden) {
      return NextResponse.json({ request: null, existing: same });
    }
    const by = auth.userEmail || auth.userId;
    await saveCourseRequest(auth.admin, request, by);
    await recordGrowthLog(auth.admin, {
      by,
      action: "依頼",
      kind: "講座の追加依頼",
      target: request.name,
      changes: [],
    });
    return NextResponse.json({ request, existing: null });
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
  const action = body.action === "add" ? "add" : body.action === "link" ? "link" : "";
  if (!id || !action) return badRequest("id と action は必須です");

  try {
    const prev = await fetchCourseRequest(auth.admin, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    if (prev.status !== "open") return badRequest("この依頼は処理済みです");

    const by = auth.userEmail || auth.userId;
    const now = new Date().toISOString();
    let course: Course | null = null;

    if (action === "link") {
      const courseId = typeof body.courseId === "string" ? body.courseId : "";
      course = courseId ? await fetchCourse(auth.admin, courseId) : null;
      if (!course) return badRequest("紐づける講座を選んでください");
    } else {
      const { courses } = await fetchCourses(auth.admin);
      const same = findSameCourse(courses, prev.name);
      if (same) {
        // 同じ講座が既にある（非表示・未確認を含む）→ 確認済み・表示に戻して紐づける
        course = { ...same, status: "confirmed", hidden: false, updatedAt: now };
        if (same.status !== course.status || same.hidden !== course.hidden) {
          await saveCourse(auth.admin, course, by);
          await recordGrowthLog(auth.admin, {
            by,
            action: "更新",
            kind: "講座",
            target: course.name,
            changes: buildCourseChanges(same, course),
          });
        }
      } else {
        course = normalizeCourse(newGrowthId("course"), {
          name: prev.name,
          organizer: typeof body.organizer === "string" ? body.organizer : "",
          category: body.category,
          defaultDays: body.defaultDays,
          status: "confirmed",
          hidden: false,
          order: 0,
          createdBy: by,
          createdAt: now,
          updatedAt: now,
        });
        if (!course) return badRequest("講座の名称が不正です");
        await saveCourse(auth.admin, course, by);
        await recordGrowthLog(auth.admin, {
          by,
          action: "登録",
          kind: "講座",
          target: course.name,
          changes: buildCourseChanges(null, course),
        });
      }
    }

    const next = {
      ...prev,
      status: action === "add" ? ("added" as const) : ("linked" as const),
      courseId: course.id,
      resolvedAt: now,
      resolvedBy: by,
    };
    await saveCourseRequest(auth.admin, next, by);
    await recordGrowthLog(auth.admin, {
      by,
      action: action === "add" ? "追加" : "既存に紐づけ",
      kind: "講座の追加依頼",
      target: `${prev.name} → ${course.name}`,
      changes: [],
    });
    return NextResponse.json({ request: next, course });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
