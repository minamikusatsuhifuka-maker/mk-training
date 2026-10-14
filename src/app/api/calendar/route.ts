// 院内カレンダーAPI（指示書114・機能ID calendar）
// - GET のみ。閲覧はログイン済みスタッフのみ（getSessionUser・未ログイン401）。
// - env 3点のいずれか未設定 → 503。Google API 失敗 → 502。
//   詳細（detail）はサーバー側 isAdminUser 判定で管理者にのみ含める。
//   変数名は秘密ではないが、鍵の値・トークンは絶対に応答・ログへ出さない。
// - 243: 院長の予定（directorEvents・時刻と題名だけ）も一緒に返す。スイッチ「院長の予定を院内カレンダーに出す」が
//   OFFの間は院長と検証用アカウントにだけ。院長のカレンダーが読めなくても、院内の予定はふつうに返す（院長の予定だけ無し）。
// - 認証付き応答のため Cache-Control: no-store（キャッシュは lib 側の module スコープのみ）。

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";
import { isTestSeedUser } from "@/lib/test-seed";
import { serverFeatureEnabled } from "@/lib/staff-growth-server";
import { jstTodayYmd } from "@/lib/library";
import { clinicCalendarRange } from "@/lib/calendar-views";
import {
  loadCalendarConfig,
  loadDirectorCalendarId,
  fetchCalendarEvents,
  fetchDirectorEvents,
  GoogleApiError,
  DIRECTOR_CALENDAR_ENV_VAR,
  type CalendarConfig,
  type DirectorEvent,
} from "@/lib/google-calendar";

/** 243: 院長の予定。見せない人・未設定・読めないときは events を返さない（院内の予定には影響させない） */
async function directorPart(
  config: CalendarConfig,
  user: Parameters<typeof isAdminUser>[0],
  admin: boolean
): Promise<{ events?: DirectorEvent[]; detail?: string }> {
  if (!admin && !isTestSeedUser(user) && !(await serverFeatureEnabled("director_calendar"))) return {};
  const calendarId = loadDirectorCalendarId();
  if (!calendarId) return admin ? { detail: `未設定の環境変数: ${DIRECTOR_CALENDAR_ENV_VAR}` } : {};
  try {
    return { events: await fetchDirectorEvents(config, calendarId) };
  } catch (e) {
    return admin ? { detail: e instanceof Error ? e.message : "不明なエラー" } : {};
  }
}

export const runtime = "nodejs";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const { user } = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "ログインが必要です" },
      { status: 401, headers: NO_STORE }
    );
  }
  const admin = isAdminUser(user);

  const { config, missing } = loadCalendarConfig();
  if (!config) {
    return NextResponse.json(
      {
        error: "not_configured",
        ...(admin
          ? { detail: `未設定の環境変数: ${missing.join(", ")}` }
          : {}),
      },
      { status: 503, headers: NO_STORE }
    );
  }

  try {
    const events = await fetchCalendarEvents(config);
    const director = await directorPart(config, user, admin);
    return NextResponse.json(
      {
        events,
        range: clinicCalendarRange(jstTodayYmd()),
        ...(director.events ? { directorEvents: director.events } : {}),
        ...(director.detail ? { directorDetail: director.detail } : {}),
      },
      { headers: NO_STORE }
    );
  } catch (e) {
    const detail =
      e instanceof GoogleApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "不明なエラー";
    return NextResponse.json(
      { error: "unavailable", ...(admin ? { detail } : {}) },
      { status: 502, headers: NO_STORE }
    );
  }
}
