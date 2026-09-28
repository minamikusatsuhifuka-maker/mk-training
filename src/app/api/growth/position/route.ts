// 現在地API（指示書190 D）— **本人と院長のみ**（183の担当幹部には出さない）
//   GET   [?user=<userId>] → PositionView（等級・キャリアライン／本人の位置と根拠／院長の確認・合意した位置／次の移行のゲート○×）
//         本人: フラグ growth_record がON（selfAllowed）のときだけ自分の分。院長: 誰でも。幹部: 404
//   PATCH（院長のみ）{ userId, grade?, careerLine?, itemReviews?: {key: "confirmed"|"dialogue"|""}, agreed?: {s, m, meeting, date, note} }
// 位置・等級は他人との比較・一覧の並べ替え・絞り込みに使わない。画面に到達の数・割合・点数を出さない。

import { NextResponse } from "next/server";
import { authorizeGrowth, recordGrowthLog } from "@/lib/staff-growth-server";
import { growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import { buildPosition, fetchMatrixReview, fetchStaffGrade, saveMatrixReview, saveStaffGrade } from "@/lib/growth-matrix-server";
import { CAREER_LINES, isGrade, isMLevel, isSLevel, ymdOf, type AgreedPosition, type ItemReview } from "@/lib/growth-matrix";
import { jstTodayYmd } from "@/lib/library";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const userParam = new URL(req.url).searchParams.get("user") ?? "";
  const userId = userParam || auth.userId;
  // 本人 or 院長だけ（担当幹部は自分以外も自分も不可＝404）
  if (userId === auth.userId) {
    if (!auth.isAdmin && !auth.selfAllowed) return hidden();
  } else if (!auth.isAdmin) {
    return hidden();
  }
  try {
    const view = await buildPosition(auth.admin, userId, jstTodayYmd());
    return NextResponse.json({ ...view, isAdmin: auth.isAdmin, isOwner: userId === auth.userId });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function PATCH(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) return hidden();
  const body = await readJson(req);
  const userId = body && typeof body.userId === "string" ? body.userId : "";
  if (!body || !userId) return NextResponse.json({ error: "対象が不明です" }, { status: 400 });
  const by = auth.userEmail || auth.userId;
  try {
    const changes: { field: string; before: string; after: string }[] = [];
    if ("grade" in body || "careerLine" in body) {
      const prev = await fetchStaffGrade(auth.admin, userId);
      const grade = "grade" in body ? (isGrade(body.grade) ? body.grade : "") : prev.grade;
      const careerLineRaw = "careerLine" in body ? (typeof body.careerLine === "string" ? body.careerLine.slice(0, 40) : "") : prev.careerLine;
      const careerLine = (CAREER_LINES as readonly string[]).includes(careerLineRaw) || careerLineRaw === "" ? careerLineRaw : careerLineRaw;
      await saveStaffGrade(auth.admin, { userId, grade, careerLine, updatedAt: "", updatedBy: by }, by);
      if (prev.grade !== grade) changes.push({ field: "等級", before: prev.grade || "—", after: grade || "—" });
      if (prev.careerLine !== careerLine) changes.push({ field: "キャリアライン", before: prev.careerLine || "—", after: careerLine || "—" });
    }
    if ("itemReviews" in body || "agreed" in body) {
      const review = await fetchMatrixReview(auth.admin, userId);
      if (body.itemReviews && typeof body.itemReviews === "object") {
        const next = { ...review.itemReviews };
        let n = 0;
        for (const [k, v] of Object.entries(body.itemReviews as Record<string, unknown>)) {
          const val: ItemReview = v === "confirmed" || v === "dialogue" ? v : "";
          if (val) next[k] = val;
          else delete next[k];
          n++;
        }
        review.itemReviews = next;
        changes.push({ field: "項目の確認", before: "", after: `${n}件を更新` });
      }
      if (body.agreed && typeof body.agreed === "object") {
        const a = body.agreed as Record<string, unknown>;
        if (!isSLevel(a.s) || !isMLevel(a.m)) return NextResponse.json({ error: "位置（S・M）を選んでください" }, { status: 400 });
        const date = ymdOf(a.date);
        if (!date) return NextResponse.json({ error: "面談の日付を入れてください" }, { status: 400 });
        const item: AgreedPosition = { s: a.s, m: a.m, meeting: a.meeting === "annual" ? "annual" : "half", date, by, note: typeof a.note === "string" ? a.note.slice(0, 500) : "" };
        review.agreed = [item, ...review.agreed.filter((x) => !(x.date === date && x.meeting === item.meeting))].sort((x, y) => y.date.localeCompare(x.date)).slice(0, 50);
        changes.push({ field: "合意した位置", before: "", after: `${item.s}×${item.m}（${item.meeting === "annual" ? "年次対話" : "半期面談"} ${date}）` });
      }
      await saveMatrixReview(auth.admin, review, by);
    }
    if (changes.length > 0) await recordGrowthLog(auth.admin, { by, action: "更新", kind: "現在地", target: userId, changes });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
