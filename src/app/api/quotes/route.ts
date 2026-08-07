// 格言の配信API（quotes_port・ログイン必須）
//
// 【著作権配慮】格言本文はここでしか配らない。クライアントJSにバンドルすると
// 未ログインでもJSチャンクを直接取得すれば読めてしまうため、
// lib/quotes-data.ts はサーバー専用にしてこのAPI経由でのみ返す。
// 外部共有・SNS書き出しの口は作らない（社内閲覧のみ）。

import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { QUOTES } from "@/lib/quotes-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** その日の1件（全員に同じものが出る。日付が変われば変わる） */
function todayIndex(now: Date): number {
  const days = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000
  );
  return ((days % QUOTES.length) + QUOTES.length) % QUOTES.length;
}

export async function GET() {
  const { user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  return NextResponse.json({
    quotes: QUOTES,
    todayId: QUOTES[todayIndex(new Date())].id,
  });
}
