// スタッフ連絡先の設定API（指示書169）— **管理者のみ**
//   GET → { viewerUserIds }（この連絡先を開ける人）
//   PUT → 指名リストの保存
// 非許可・未ログイン・非管理者にはすべて 404（存在秘匿）。
//
// 保存先は157の `menu_access`（content_store の server-only キー）。新しい方式を持ち込まない。
// **公開範囲（159-Aの「全員」モード）はこの機能では扱わない。**
// 住所・電話番号と、本人以外（家族・保証人）の情報を含むため、全員に開く口を作らない。
//
// ロックアウト防止: 保存時は「操作している管理者自身」を必ず含める（149・157と同じ）。

import { NextResponse } from "next/server";
import {
  authorizeStaffContacts,
  recordStaffContactLog,
  ServiceRoleMissingError,
} from "@/lib/staff-contacts-server";
import { saveMenuAllowedUserIds } from "@/lib/menu-access-server";
import { MENU_STAFF_CONTACTS } from "@/lib/menu-access";

export const runtime = "nodejs";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

export async function GET() {
  const auth = await authorizeStaffContacts();
  if (!auth.ok || !auth.isAdmin) return hidden();
  return NextResponse.json({ viewerUserIds: auth.viewerUserIds });
}

export async function PUT(req: Request) {
  const auth = await authorizeStaffContacts();
  if (!auth.ok || !auth.isAdmin) return hidden();

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }

  const raw = Array.isArray(body.viewerUserIds) ? body.viewerUserIds : [];
  const ids = Array.from(
    new Set(
      raw.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    )
  );
  // 設定した本人が締め出される事故を防ぐ
  const viewerUserIds = ids.includes(auth.userId) ? ids : [...ids, auth.userId];

  try {
    const by = auth.userEmail || auth.userId;
    const ok = await saveMenuAllowedUserIds(
      MENU_STAFF_CONTACTS,
      viewerUserIds,
      by
    );
    if (!ok) {
      return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
    }
    // 誰が開けるようにしたかは操作ログに残す（人数だけ・名前は残さない）。
    // 人数が同じでも入れ替わっていれば「変わった」ので、集合として比べる
    const same =
      [...viewerUserIds].sort().join(",") ===
      [...auth.viewerUserIds].sort().join(",");
    if (!same) {
      await recordStaffContactLog(auth.admin, {
        by,
        action: "設定変更",
        target: "",
        changes: [
          {
            field: "この連絡先を開ける人",
            before: `${auth.viewerUserIds.length}人`,
            after: `${viewerUserIds.length}人`,
          },
        ],
      });
    }
    return NextResponse.json({ ok: true, viewerUserIds });
  } catch (e) {
    if (e instanceof ServiceRoleMissingError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗しました" },
      { status: 500 }
    );
  }
}
