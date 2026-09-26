// 目標への「機会・支援」「コメント」「合意」（指示書185 A-3）— **院長、または担当の幹部**
//   PUT { id, support?: string, comment?: string, agree?: boolean } → その項目だけを更新
//   本人は呼べない（本人は目標の内容を書く側）。担当外のスタッフの目標は404（存在を知らせない）。
//   目標の内容（題名・詳細・なぜ・7つの実・3軸・達成した状態・期限・進捗）はここでは一切触らない。
//   合意（agree）は年間・半期の目標だけ。合意した日＝今日、相手＝操作した院長／幹部。

import { NextResponse } from "next/server";
import { authorizeGrowth, canViewStaff, fetchGoal, recordGrowthLog, saveGoal } from "@/lib/staff-growth-server";
import { badRequest, growthErrorResponse, hidden, readJson } from "@/lib/staff-growth-route";
import { GOAL_COMMENT_MAX, GOAL_TEXT_MAX, buildGoalChanges, levelNeedsAgreement, normalizeGoal } from "@/lib/staff-growth";
import { jstTodayYmd } from "@/lib/library";

export const runtime = "nodejs";

export async function PUT(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok) return hidden();
  const body = await readJson(req);
  if (!body) return badRequest("不正なリクエストです");
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return badRequest("id は必須です");
  try {
    const prev = await fetchGoal(auth.admin, id);
    // 自分の目標には書けない／担当外は存在を知らせない
    if (!prev || prev.userId === auth.userId || !canViewStaff(auth, prev.userId)) return hidden();

    const by = auth.userEmail || auth.userId;
    const name = auth.userName || auth.userEmail || "院長・幹部";
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    if (typeof body.support === "string") {
      patch.support = body.support.slice(0, GOAL_TEXT_MAX);
      patch.supportBy = name;
    }
    if (typeof body.comment === "string" && body.comment.trim()) {
      patch.comments = [...prev.comments, { by: auth.userId, name, text: body.comment.trim().slice(0, GOAL_COMMENT_MAX), at: now }];
    }
    if (body.agree === true) {
      if (!levelNeedsAgreement(prev.level)) return badRequest("合意の記録は年間目標・半期目標だけです");
      patch.agreedOn = jstTodayYmd();
      patch.agreedBy = auth.userId;
      patch.agreedByName = name;
    }
    if (body.agree === false) {
      patch.agreedOn = "";
      patch.agreedBy = "";
      patch.agreedByName = "";
    }
    if (Object.keys(patch).length === 0) return badRequest("変更する項目がありません");

    const next = normalizeGoal(id, { ...prev, ...patch, updatedAt: now });
    if (!next) return badRequest("更新できませんでした");
    await saveGoal(auth.admin, next, by);
    const changes = buildGoalChanges(prev, next);
    if (changes.length > 0) {
      await recordGrowthLog(auth.admin, { by, action: "支援・合意", kind: "目標", target: auth.isAdmin ? "院長" : "担当幹部", changes });
    }
    return NextResponse.json({ goal: next });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
