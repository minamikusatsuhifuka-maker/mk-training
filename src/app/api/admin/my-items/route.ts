// 自分に委任された管理画面の項目（指示書183 B-3）— ログイン済みなら誰でも（**自分の情報だけ**を返す）
//   GET → { isAdmin, items: string[]（項目key）, karteAssignments: number }
// proxy.ts はこのパスだけ /api/admin の秘匿から外している（ADMIN_API_SELF_PATHS）。
// 他人の指名内容は返さない。指名の変更はできない（/api/admin/delegation・院長のみ）。

import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { isAdminUser } from "@/lib/admin-role";
import {
  isActiveAccountId,
  loadDelegatedItems,
  loadKarteAssignments,
} from "@/lib/admin-delegation-server";
import { ADMIN_ITEMS } from "@/lib/admin-items";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;
  if (isAdminUser(user)) {
    return NextResponse.json({
      isAdmin: true,
      items: ADMIN_ITEMS.map((i) => i.key),
      karteAssignments: 0,
    });
  }
  // 無効化されたアカウントには何も委任されていないことにする（即時反映）
  if (!(await isActiveAccountId(user.id))) {
    return NextResponse.json({ isAdmin: false, items: [], karteAssignments: 0 });
  }
  const [items, karte] = await Promise.all([
    loadDelegatedItems(user.id),
    loadKarteAssignments(user.id),
  ]);
  return NextResponse.json({
    isAdmin: false,
    // 項目が1つでもあれば入口（ダッシュボード）も開ける
    items: items.length > 0 && !items.includes("dashboard") ? ["dashboard", ...items] : items,
    karteAssignments: karte.length,
  });
}
