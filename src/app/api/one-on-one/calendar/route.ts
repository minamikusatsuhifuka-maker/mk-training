// 🗓 1on1カレンダー（指示書240）— いつ・誰が1on1かを、ログインしたスタッフ全員に
//   GET → { entries: [{ id, date, startTime, endTime, name }], today }
//
// 【出すもの】「🗓 1on1の日程」で確定している予約の**日時と名前だけ**。取り消された予約は行ごと無いので出ない。
//   日時の変更は予約の行が付け替わるので、読むたびに今の状態になる。
// 【出さないもの】空いている枠・院長の予定がある日（枠が無い）・面談する側の名前・1on1の中身（事前アンケート・記録・まとめ）。
//   予約の行のうち、日付・時刻・本人の名前以外は応答に入れない。
// 【見られる人】ログインしたスタッフ全員。スイッチ「🗓 1on1カレンダー」がOFFの間は、院長と検証用アカウントだけ（他は404）。
//   検証用アカウントの予約は、院長と検証用アカウントにだけ出す（237の決まり）。

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";
import { isTestSeedUser } from "@/lib/test-seed";
import { serverFeatureEnabled } from "@/lib/staff-growth-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchBookings } from "@/lib/one-on-one-slots-server";
import { resolveDisplayNames } from "@/lib/display-names-server";
import { hidesTestSeedFor } from "@/lib/test-seed-hide-server";
import { loadTestSeedIds } from "@/lib/test-seed-server";
import { jstTodayYmd } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

/** 何か月前の1日から出すか（月表示で前の月へ送れるように） */
const MONTHS_BACK = 2;

function firstOfMonthsAgo(today: string, back: number): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - back;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  const { user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  // スイッチOFFの間は、院長と検証用アカウントだけ
  if (!isAdminUser(user) && !isTestSeedUser(user) && !(await serverFeatureEnabled("one_on_one_calendar"))) {
    return notFound();
  }
  try {
    const admin = createSupabaseAdminClient();
    const today = jstTodayYmd();
    const from = firstOfMonthsAgo(today, MONTHS_BACK);
    const hideIds = hidesTestSeedFor(user) ? await loadTestSeedIds() : new Set<string>();
    const bookings = (await fetchBookings(admin)).filter((b) => b.date >= from && !hideIds.has(b.userId));
    const names = await resolveDisplayNames(Array.from(new Set(bookings.map((b) => b.userId))));
    const entries = bookings
      .map((b) => ({
        id: "",
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        name: names.get(b.userId) || "名前未設定",
      }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name, "ja"))
      // 画面の目印は並び順の番号だけ（予約の行idは渡さない）
      .map((e, i) => ({ ...e, id: `e${i}` }));
    return NextResponse.json({ entries, today }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "読み込めませんでした" }, { status: 500 });
  }
}
