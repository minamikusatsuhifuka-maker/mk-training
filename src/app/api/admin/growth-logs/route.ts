// スタッフ育成カルテ系の操作ログ 取得API（指示書179 §2）— **管理者のみ**
//
// /api/admin 配下に置く理由は169と同じ: proxy.ts が管理者以外には「存在しないAPIと同じ応答」にする（159-D）。
// このルート自身でも管理者判定をやり直す。
// 返すのは新しい順の時系列だけ。人別の集計・ランキング・並び替えは提供しない（159-B-5）。
// ログには本文を残していない（「空 → 記載あり」の粒度・159/173と同じ）。

import { NextResponse } from "next/server";
import {
  authorizeGrowth,
  fetchGrowthLogs,
  GrowthTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/staff-growth-server";
import { GROWTH_LOG_PAGE_SIZE } from "@/lib/staff-growth";

export const runtime = "nodejs";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

export async function GET(req: Request) {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) return hidden();

  const before = new URL(req.url).searchParams.get("before") ?? undefined;
  try {
    const { logs, tableMissing } = await fetchGrowthLogs(auth.admin, {
      limit: GROWTH_LOG_PAGE_SIZE,
      before: before && !Number.isNaN(new Date(before).getTime()) ? before : undefined,
    });
    return NextResponse.json({ logs, tableMissing });
  } catch (e) {
    if (e instanceof GrowthTableMissingError) {
      return NextResponse.json({ logs: [], tableMissing: true });
    }
    if (e instanceof ServiceRoleMissingError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗しました" },
      { status: 500 }
    );
  }
}
