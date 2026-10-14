// 価値観キーワードの操作ログ 取得API（指示書172-4）— **管理者のみ**
//
// 159-B（書類進捗ボードの操作ログ）と同じ考え方:
// - 返すのは**新しい順の時系列だけ**。人別の集計・ランキング・比較・並び替えは提供しない
// - /api/admin 配下に置き、proxy.ts の関門（159-D）で非管理者には存在しないAPIと同じ応答にする。
//   このルート自身でも requireAdmin で判定をやり直す
// - 保存先は content_store `value_keywords_log`（サーバー専用キー。/api/content-store からは読めない）

import { NextResponse } from "next/server";
import { requireAdminItem } from "@/lib/admin-delegation-server";
import { fetchValueKeywordLogsServer } from "@/lib/value-keywords-server";
import { hideContextFor } from "@/lib/test-seed-hide-server";
import { TEST_ACCOUNTS } from "@/lib/test-seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminItem("profile-fields"); // 183: プロフィール項目管理を委任された幹部も可
  if (auth.response) return auth.response;
  const all = await fetchValueKeywordLogsServer();
  // 237: 任された本物の幹部には、検証用アカウントが操作した記録を出さない（by はメールか名前）
  const ctx = await hideContextFor(auth.user);
  const testEmails = new Set<string>(ctx.ids.size > 0 ? TEST_ACCOUNTS.map((a) => a.email) : []);
  const logs = all.filter((l) => !testEmails.has(String(l.by ?? "")) && !ctx.names.has(String(l.by ?? "")));
  return NextResponse.json({ logs });
}
