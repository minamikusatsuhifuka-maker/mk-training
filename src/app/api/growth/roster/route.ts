// スタッフ名簿 → スタッフ個人シート（指示書 mk_training_staff_sheet_1 §2）
//   GET → { members: [{ name, link: "open" | "unlinked" | "ambiguous" | "none", userId?, next? }], isAdmin }
//
// - 名簿（content_store `staff_members`＝名前だけ）と、名簿の軽量読み取り（staff_profiles_index の userId・氏名）を
//   **正規化した名前**（NFKC＋空白除去）で突き合わせる。1人に決まらない名前は紐付けない。
// - userId と概要（次の1on1・事前アンケートの状態）を返すのは、見ている人が **canViewStaff** でその人を見られるときだけ
//   （院長＝全員／担当の幹部＝担当スタッフだけ）。それ以外の名前は名前だけ（link: "none"）。
// - 「未連携」「同名で決められない」と分かるのは院長だけ（幹部には none と同じに見せる）。
// - 名簿の管理を任されているだけの人（可能性ノートの権限なし）は 404＝画面は名前だけの名簿のまま。
// - 回答の本文は返さない（「答えたか」だけ）。

import { NextResponse } from "next/server";
import { authorizeGrowth, canViewStaff } from "@/lib/staff-growth-server";
import { growthErrorResponse, hidden } from "@/lib/staff-growth-route";
import { serverGetContentRow } from "@/lib/content-store-server";
import { loadProfilesIndexServer } from "@/lib/staff-growth-roster-server";
import { matchRosterNames } from "@/lib/staff-sheet";
import { jstTodayYmd } from "@/lib/library";
import { fetchSchedules, withAnswerState } from "@/lib/one-on-one-schedule-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** lib/staff-tasks.ts の STAFF_MEMBERS_KEY と同じ値（あちらはクライアント用の content-store を読み込むので、ここでは写す） */
const STAFF_MEMBERS_KEY = "staff_members";

export type RosterMemberView = {
  name: string;
  link: "open" | "unlinked" | "ambiguous" | "none";
  userId?: string;
  next?: { date: string; time: string; answered: boolean; state: string } | null;
};

export async function GET() {
  const auth = await authorizeGrowth();
  // 院長、または担当スタッフを指定された幹部（183）だけ。本人としての権限だけの人・委任だけの人は 404
  if (!auth.ok || (!auth.isAdmin && auth.assignedStaffIds.length === 0)) return hidden();
  try {
    const row = await serverGetContentRow(STAFF_MEMBERS_KEY);
    const names = Array.isArray(row?.data) ? (row.data as unknown[]).filter((n): n is string => typeof n === "string") : [];
    const people = await loadProfilesIndexServer();
    const matches = matchRosterNames(names, people);

    const viewable = matches.filter((m) => m.userId && canViewStaff(auth, m.userId)).map((m) => m.userId);
    const today = jstTodayYmd();
    const nextByUser = new Map<string, RosterMemberView["next"]>();
    if (viewable.length > 0) {
      const { schedules } = await fetchSchedules(auth.admin, {});
      const mine = schedules.filter((s) => viewable.includes(s.userId));
      const views = await withAnswerState(auth.admin, mine, today);
      for (const v of views) {
        if (nextByUser.has(v.userId)) continue; // withAnswerState は日付の早い順
        nextByUser.set(v.userId, { date: v.date, time: v.time, answered: v.answered, state: v.state });
      }
    }

    const members: RosterMemberView[] = matches.map((m) => {
      if (m.userId && canViewStaff(auth, m.userId)) {
        return { name: m.name, link: "open", userId: m.userId, next: nextByUser.get(m.userId) ?? null };
      }
      if (auth.isAdmin && m.ambiguous) return { name: m.name, link: "ambiguous" };
      if (auth.isAdmin && !m.userId) return { name: m.name, link: "unlinked" };
      return { name: m.name, link: "none" };
    });
    return NextResponse.json({ members, isAdmin: auth.isAdmin });
  } catch (e) {
    return growthErrorResponse(e);
  }
}
