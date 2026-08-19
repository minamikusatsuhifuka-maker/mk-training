// スタッフ連絡先の操作ログ 取得API（指示書169-3-5）— **管理者のみ**
//
// 【置き場所を /api/admin にした理由】
// proxy.ts が /api/admin 配下を「管理者以外には存在しないAPIと同じ応答」にしている（159-D）。
// ここに置けば、非管理者・未ログインに対する秘匿が関門1か所で保証される。
// このルート自身でも管理者判定をやり直す（関門が万一無効化されても素通りさせない）。
//
// 【作らないもの（159-B-5と同じ線）】
// 人別の集計・ランキング・比較・期間別グラフ・「多い順」の並び替えは提供しない。
// 返すのは**新しい順の時系列だけ**。絞り込みも日付（before）だけに限る。

import { NextResponse } from "next/server";
import {
  authorizeStaffContacts,
  fetchStaffContactLogs,
  StaffContactsTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/staff-contacts-server";
import { STAFF_CONTACT_LOG_PAGE_SIZE } from "@/lib/staff-contacts";

export const runtime = "nodejs";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

export async function GET(req: Request) {
  const auth = await authorizeStaffContacts();
  if (!auth.ok || !auth.isAdmin) return hidden();

  const params = new URL(req.url).searchParams;
  // before: この日時より古いものを続けて読む（時系列の続き読みだけに使う）
  const before = params.get("before") ?? undefined;

  try {
    const { logs, tableMissing } = await fetchStaffContactLogs(auth.admin, {
      limit: STAFF_CONTACT_LOG_PAGE_SIZE,
      before:
        before && !Number.isNaN(new Date(before).getTime()) ? before : undefined,
    });
    return NextResponse.json({ logs, tableMissing });
  } catch (e) {
    if (e instanceof StaffContactsTableMissingError) {
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
