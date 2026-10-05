// 自分に関係する1on1の予定（指示書197 B-2・C）— ログイン必須
//   GET → {
//     mine:    自分の次回以降の1on1（予定・回答済みか・本人向けの知らせ）,
//     partner: 自分が担当者の1on1（院長は全員分）の回答の状態（締切後の「未回答」表示・C-3）,
//     alertsEnabled: 本人への知らせを出してよいか（事前アンケートの機能フラグがONのときだけ。
//                    OFFのときに知らせると、開けないページへ案内してしまうため）,
//     today
//   }
// - 本人は自分の予定だけ、担当者は自分が担当の予定だけ（院長は全員分）。他人の予定は返さない。
// - 返すのは「答えたか」だけ。回答の本文は返さない。

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { isAdminUser } from "@/lib/admin-role";
import { isTestSeedUser } from "@/lib/test-seed";
import { jstTodayYmd } from "@/lib/library";
import { serverFeatureEnabled, GrowthTableMissingError } from "@/lib/staff-growth-server";
import { scheduleReminderFor } from "@/lib/one-on-one-schedule";
import { fetchRebookRequests } from "@/lib/one-on-one-slots-server";
import {
  createSupabaseAdminClient,
  fetchSchedules,
  loadPeople,
  withAnswerState,
} from "@/lib/one-on-one-schedule-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;
  const isAdmin = isAdminUser(user);
  const today = jstTodayYmd();

  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return NextResponse.json({ mine: [], partner: [], alertsEnabled: false, today });
  }

  try {
    const alertsEnabled = isAdmin || isTestSeedUser(user) || (await serverFeatureEnabled("one_on_one_presurvey"));
    // 205 §4: 1on1の予定の知らせは「1on1の日程調整」がONのときだけ（院長・検証用は203のプレビューと同じ扱い）
    const remindersEnabled = isAdmin || isTestSeedUser(user) || (await serverFeatureEnabled("one_on_one_booking"));
    const [mineRes, partnerRes] = await Promise.all([
      fetchSchedules(admin, { userId: user.id }),
      fetchSchedules(admin, isAdmin ? {} : { partnerId: user.id }),
    ]);
    const mine = await withAnswerState(admin, mineRes.schedules, today);
    const partnerOnly = partnerRes.schedules.filter((s) => s.userId !== user.id);
    const partnerViews = await withAnswerState(admin, partnerOnly, today);
    const people = partnerViews.length > 0 ? await loadPeople(admin) : new Map();
    // 205 §1-2: 院長が枠を消した・ブロックしたことで予約が外れた人に、取り直しをお願いする
    const rebooks = remindersEnabled
      ? await fetchRebookRequests(admin, user.id).catch(() => [])
      : [];
    return NextResponse.json({
      mine: mine.map((v) => ({
        ...v,
        alert: alertsEnabled ? v.alert : null,
        reminder: remindersEnabled ? scheduleReminderFor(v, today) : null,
      })),
      partner: partnerViews.map((v) => ({
        ...v,
        alert: null,
        reminder: null,
        staffName: people.get(v.userId)?.name ?? "名前未設定",
      })),
      alertsEnabled,
      rebooks: rebooks.map((r) => ({ periodId: r.periodId, date: r.date, startTime: r.startTime })),
      today,
    });
  } catch (e) {
    if (e instanceof GrowthTableMissingError) {
      return NextResponse.json({ mine: [], partner: [], alertsEnabled: false, today, tableMissing: true });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込みに失敗しました" }, { status: 500 });
  }
}
