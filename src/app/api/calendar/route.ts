// 院内カレンダーAPI（指示書114・機能ID calendar）
// - GET のみ。閲覧はログイン済みスタッフのみ（getSessionUser・未ログイン401）。
// - env 3点のいずれか未設定 → 503。Google API 失敗 → 502。
//   詳細（detail）はサーバー側 isAdminUser 判定で管理者にのみ含める。
//   変数名は秘密ではないが、鍵の値・トークンは絶対に応答・ログへ出さない。
// - 認証付き応答のため Cache-Control: no-store（キャッシュは lib 側の module スコープのみ）。

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";
import {
  loadCalendarConfig,
  fetchCalendarEvents,
  GoogleApiError,
} from "@/lib/google-calendar";

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
    return NextResponse.json({ events }, { headers: NO_STORE });
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
