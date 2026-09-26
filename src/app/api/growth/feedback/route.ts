// フィードバックの記録API（指示書185 B/C/E/F）
//   GET  [?user=] → { feedback, tableMissing, mode, viewerId }
//        本人（mode=owner）: 自分についての記録すべて（ポジティブは全項目、ギャップは①②③とその後）
//        院長（mode=admin, ?user=）: その人の記録すべて
//        担当幹部（mode=delegate, ?user=）: 担当スタッフについて**自分が記録したものだけ**（E）
//   POST { userId, ...本文 } → 記録（院長、または担当の幹部。自分自身には記録できない）
//   PATCH { id, ... } → 記録した本人と院長は本文、対象の本人は reaction／progress だけ（F）
//   DELETE ?id= → 記録した本人と院長
//   本人に見えている記録の編集・削除は操作ログに残す（本文なし・F）。
//   人物評価・性格の断定の欄、本人に見せないメモ欄は型に無い（C-2）。担当外は404（存在を知らせない）。

import { NextResponse } from "next/server";
import {
  authorizeGrowth,
  canViewStaff,
  deleteFeedback,
  fetchFeedback,
  fetchFeedbackRow,
  newGrowthId,
  recordGrowthLog,
  saveFeedback,
} from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import { FEEDBACK_AUTHOR_FIELDS, FEEDBACK_OWNER_FIELDS, buildFeedbackChanges, normalizeFeedback } from "@/lib/staff-growth";

export const runtime = "nodejs";

function pick(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in body) out[k] = body[k];
  return out;
}

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const userParam = new URL(req.url).searchParams.get("user") ?? "";
  const userId = userParam || auth.userId;
  try {
    if (userId === auth.userId) {
      if (!auth.selfAllowed) return hidden(); // フラグOFFのあいだ本人には出さない（G）
      const { feedback, tableMissing } = await fetchFeedback(auth.admin, { userId });
      return NextResponse.json({ feedback, tableMissing, mode: "owner", viewerId: auth.userId });
    }
    if (!canViewStaff(auth, userId)) return hidden();
    // 院長は全件、幹部は自分が記録したものだけ
    const { feedback, tableMissing } = await fetchFeedback(auth.admin, auth.isAdmin ? { userId } : { userId, authorId: auth.userId });
    return NextResponse.json({ feedback, tableMissing, mode: auth.isAdmin ? "admin" : "delegate", viewerId: auth.userId });
  } catch (e) {
    return growthErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");
  const userId = typeof body.userId === "string" ? body.userId : "";
  // 自分自身には記録できない。担当外（幹部）は存在を知らせない
  if (!userId || userId === auth.userId || !canViewStaff(auth, userId)) return hidden();
  const now = new Date().toISOString();
  const f = normalizeFeedback(newGrowthId("fb"), {
    ...pick(body, FEEDBACK_AUTHOR_FIELDS),
    userId,
    authorId: auth.userId,
    authorName: auth.userName || auth.userEmail || (auth.isAdmin ? "院長" : "担当幹部"),
    seenAt: "",
    createdAt: now,
    updatedAt: now,
  });
  if (!f) return badRequest("記録を作れませんでした");
  if (!f.date) return badRequest("日付は必須です");
  if (f.type === "positive" && !f.whatGood.trim()) return badRequest("「何が良かったか」を書いてください");
  if (f.type === "gap" && !f.fact.trim()) return badRequest("① 現状（事実）を書いてください");
  try {
    const by = auth.userEmail || auth.userId;
    await saveFeedback(auth.admin, f, by);
    await recordGrowthLog(auth.admin, {
      by,
      action: "登録",
      kind: f.type === "positive" ? "ポジティブFB" : "ギャップFB",
      target: auth.isAdmin ? "院長" : "担当幹部",
      changes: buildFeedbackChanges(null, f),
    });
    return NextResponse.json({ feedback: f });
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
    const prev = await fetchFeedbackRow(auth.admin, id);
    if (!prev) return hidden();
    const isOwner = prev.userId === auth.userId;
    const isAuthor = prev.authorId === auth.userId;
    let patch: Record<string, unknown>;
    let role: string;
    if (isOwner) {
      // 本人: 反応・進捗だけ（本文は触れない）
      if (!auth.selfAllowed) return hidden();
      patch = pick(body, FEEDBACK_OWNER_FIELDS);
      role = "本人";
    } else if (isAuthor || auth.isAdmin) {
      if (!canViewStaff(auth, prev.userId)) return hidden();
      patch = pick(body, FEEDBACK_AUTHOR_FIELDS);
      role = auth.isAdmin ? "院長" : "担当幹部";
    } else {
      return hidden();
    }
    if (Object.keys(patch).length === 0) return badRequest("変更する項目がありません");
    const next = normalizeFeedback(id, {
      ...prev,
      ...patch,
      userId: prev.userId,
      authorId: prev.authorId,
      authorName: prev.authorName,
      createdAt: prev.createdAt,
      // 本人の記入では「新しい記録の印」を立てない（updatedAt は記録者の更新のときだけ進める）
      updatedAt: isOwner ? prev.updatedAt : new Date().toISOString(),
    });
    if (!next) return badRequest("更新できませんでした");
    const by = auth.userEmail || auth.userId;
    await saveFeedback(auth.admin, next, by);
    const changes = buildFeedbackChanges(prev, next);
    // 本人に見えている記録の編集はログに残す（F）。本人の記入も残す（本文なし）
    if (changes.length > 0) {
      await recordGrowthLog(auth.admin, {
        by,
        action: "更新",
        kind: prev.type === "positive" ? "ポジティブFB" : "ギャップFB",
        target: role,
        changes,
      });
    }
    return NextResponse.json({ feedback: next });
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
    const prev = await fetchFeedbackRow(auth.admin, id);
    if (!prev) return hidden();
    // 記録した本人と院長だけ（対象の本人は消せない）
    if (!(prev.authorId === auth.userId || auth.isAdmin) || !canViewStaff(auth, prev.userId)) return hidden();
    await deleteFeedback(auth.admin, id);
    await recordGrowthLog(auth.admin, {
      by: auth.userEmail || auth.userId,
      action: "削除",
      kind: prev.type === "positive" ? "ポジティブFB" : "ギャップFB",
      target: auth.isAdmin ? "院長" : "担当幹部",
      changes: buildFeedbackChanges(null, prev),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
