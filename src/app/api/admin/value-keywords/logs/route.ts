// 価値観キーワードの操作ログ 取得API（指示書172-4）— **管理者のみ**
//
// 159-B（書類進捗ボードの操作ログ）と同じ考え方:
// - 返すのは**新しい順の時系列だけ**。人別の集計・ランキング・比較・並び替えは提供しない
// - /api/admin 配下に置き、proxy.ts の関門（159-D）で非管理者には存在しないAPIと同じ応答にする。
//   このルート自身でも requireAdmin で判定をやり直す
// - 保存先は content_store `value_keywords_log`（サーバー専用キー。/api/content-store からは読めない）

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { fetchValueKeywordLogsServer } from "@/lib/value-keywords-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const logs = await fetchValueKeywordLogsServer();
  return NextResponse.json({ logs });
}
