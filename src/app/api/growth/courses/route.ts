// 講座マスタAPI（指示書179 B-2／180 1-1）
//   GET    → { courses, tableMissing, isAdmin }（ログイン済み・フラグON or 管理者。非表示の講座も返す＝
//             編集中の古い記録の講座名を表示するため。選べるかどうかは画面と POST /learning 側で絞る）
//   POST   → 講座を登録（**管理者のみ**・180: スタッフは自由入力できない→「追加を依頼」）
//   PATCH  → 名称・主催・区分・状態・非表示・標準の日数の更新（**管理者のみ**）
//   PUT    → 並び順の保存 { ids }（**管理者のみ**）
//   削除の口は無い（180 歯止め: 講座は削除せず非表示のみ＝記録と再受講回数を壊さない）
// 表記ゆれ対策: 同名（全角半角・空白・記号を無視して一致）の講座があれば、新しく作らずそれを返す。

import { NextResponse } from "next/server";
import {
  authorizeGrowth,
  fetchCourse,
  fetchCourses,
  newGrowthId,
  recordGrowthLog,
  saveCourse,
  saveCourseOrder,
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
  // 180: 講座を作れるのは管理者だけ（スタッフには作れない口すら見せない）
  if (!auth.isAdmin) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");

  try {
    const { courses } = await fetchCourses(auth.admin);
    const now = new Date().toISOString();
    const by = auth.userEmail || auth.userId;
    const course = normalizeCourse(newGrowthId("course"), {
      ...body,
      status: body.status === "unconfirmed" ? "unconfirmed" : "confirmed",
      // 新しい講座は末尾（order 未設定）
      order: 0,
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
      order: prev.order, // 並び順は PUT でだけ変える
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
    return NextResponse.json({ course: next });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function PUT(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  if (!auth.isAdmin) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string" && v !== "")
    : [];
  if (ids.length === 0) return badRequest("並び順が空です");
  try {
    const by = auth.userEmail || auth.userId;
    await saveCourseOrder(auth.admin, Array.from(new Set(ids)), by);
    await recordGrowthLog(auth.admin, {
      by,
      action: "並び替え",
      kind: "講座",
      target: "",
      changes: [{ field: "並び順", before: "", after: `${ids.length}件` }],
    });
    const { courses } = await fetchCourses(auth.admin);
    return NextResponse.json({ ok: true, courses });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
