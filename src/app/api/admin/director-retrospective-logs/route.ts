// 院長の振り返り記録の操作ログ 取得API（指示書173-5）— **管理者のみ**
//
// /api/admin 配下に置く理由は169と同じ: proxy.ts が非管理者には「存在しないAPIと同じ応答」にする（159-D）。
// このルート自身でも管理者判定をやり直す（関門が万一無効化されても素通りさせない）。
//
// 返すのは**新しい順の時系列だけ**。集計・並び替えの口は作らない（159-B-5と同じ線）。
// 本文そのものは記録していない（どの項目が「空 → 記載あり」に変わったかまで）。

import { NextResponse } from "next/server";
import {
  authorizeDirectorRetrospective,
  fetchRetrospectiveLogsServer,
  RetrospectiveTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/director-retrospective-server";
import { RETRO_LOG_PAGE_SIZE } from "@/lib/director-retrospective";

export const runtime = "nodejs";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

export async function GET(req: Request) {
  const auth = await authorizeDirectorRetrospective();
  if (!auth.ok || !auth.isAdmin) return hidden();

  const before = new URL(req.url).searchParams.get("before") ?? undefined;
  try {
    const { logs, tableMissing } = await fetchRetrospectiveLogsServer(auth.admin, {
      limit: RETRO_LOG_PAGE_SIZE,
      before: before && !Number.isNaN(new Date(before).getTime()) ? before : undefined,
    });
    return NextResponse.json({ logs, tableMissing });
  } catch (e) {
    if (e instanceof RetrospectiveTableMissingError) {
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
