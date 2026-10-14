// 📣 イベントの参加記録（指示書228 §3）— 院長＋「📣 イベントの出欠・参加記録」を任された幹部
//   GET              … 確定した参加の記録すべて（期間の絞り込み・人ごとの見方・CSVは画面側）
//   DELETE ?noticeId= … 記録を消す（院長だけ）
// 検証用アカウントの記録は、院長と検証用アカウントにだけ出す（一般スタッフ＝任された幹部にも出さない・228 §6）。

import { NextRequest, NextResponse } from "next/server";
import { requireAdminItem } from "@/lib/admin-delegation-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isTestSeedUser } from "@/lib/test-seed";
import {
  NOTICE_ATTENDANCE_ITEM,
  deleteAttendance,
  fetchAllAttendance,
  fetchNotices,
  loadAccounts,
} from "@/lib/notices-server";
import { isNoticeId, type AttendanceRecordView } from "@/lib/notices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireAdminItem(NOTICE_ATTENDANCE_ITEM);
  if (gate.response) return gate.response;
  try {
    const admin = createSupabaseAdminClient();
    const showTest = gate.isAdmin || isTestSeedUser(gate.user);
    const [records, notices, accounts] = await Promise.all([
      fetchAllAttendance(admin),
      fetchNotices(admin),
      loadAccounts(admin),
    ]);
    const exists = new Set(notices.map((n) => n.id));
    const nameOf = new Map(accounts.map((a) => [a.id, a.name]));
    const rows: AttendanceRecordView[] = records
      .filter((r) => showTest || !r.testSeed)
      .map((r) => ({
        noticeId: r.noticeId,
        title: r.title,
        heldOn: r.heldOn,
        heldTime: r.heldTime,
        participants: r.userIds
          // 237: 古い記録に残っていても、院長と検証用アカウント以外には検証用アカウントを出さない
          .filter((id) => showTest || !accounts.find((a) => a.id === id)?.testSeed)
          .map((id) => ({ userId: id, name: nameOf.get(id) || r.names[id] || "（名前不明）" }))
          .sort((a, b) => a.name.localeCompare(b.name, "ja")),
        testSeed: r.testSeed,
        confirmedAt: r.confirmedAt,
        noticeExists: exists.has(r.noticeId),
      }))
      .sort((a, b) => b.heldOn.localeCompare(a.heldOn) || a.title.localeCompare(b.title, "ja"));
    return NextResponse.json({ records: rows, isAdmin: gate.isAdmin });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込めませんでした" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdminItem(NOTICE_ATTENDANCE_ITEM);
  if (gate.response) return gate.response;
  if (!gate.isAdmin) return NextResponse.json({ error: "記録を消せるのは院長だけです" }, { status: 403 });
  const noticeId = new URL(req.url).searchParams.get("noticeId") ?? "";
  if (!isNoticeId(noticeId)) return NextResponse.json({ error: "見つかりません" }, { status: 404 });
  try {
    await deleteAttendance(createSupabaseAdminClient(), noticeId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "消せませんでした" }, { status: 500 });
  }
}
