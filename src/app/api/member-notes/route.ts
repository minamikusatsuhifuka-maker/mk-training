// メンバーノートAPI（指示書149）
// 非許可ユーザー・未ログインには **すべて 404**（機能の存在自体を知らせない）。
//   GET    ?probe=1 → { ok:true }（ナビ表示判定用・データは返さない）
//   GET             → { notes, viewerUserIds, isAdmin, tableMissing }
//   PUT             → 1件保存（upsert）
//   DELETE          → 1件を物理削除
// 実体アクセスはすべて service-role（RLS全拒否テーブル）。

import { NextResponse } from "next/server";
import {
  authorizeMemberNotes,
  deleteNote,
  fetchAllNotes,
  saveNote,
  MemberNotesTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/member-notes-server";
import { normalizeMemberNote } from "@/lib/member-notes";

export const runtime = "nodejs";

// 非許可時の応答。存在を悟らせないため、Next の標準的な 404 と同じ形にする
const hidden = () =>
  NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof MemberNotesTableMissingError) {
    return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  }
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "処理に失敗しました" },
    { status: 500 }
  );
}

export async function GET(req: Request) {
  const auth = await authorizeMemberNotes();
  if (!auth.ok) return hidden();

  // ナビのリンク表示判定用。中身は返さない
  if (new URL(req.url).searchParams.get("probe") === "1") {
    return NextResponse.json({ ok: true });
  }

  try {
    const { notes, tableMissing } = await fetchAllNotes(auth.admin);
    return NextResponse.json({
      notes,
      viewerUserIds: auth.viewerUserIds,
      isAdmin: auth.isAdmin,
      tableMissing: tableMissing || auth.tableMissing,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: Request) {
  const auth = await authorizeMemberNotes();
  if (!auth.ok) return hidden();

  let body: { staffUserId?: unknown } & Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const staffUserId =
    typeof body.staffUserId === "string" ? body.staffUserId.trim() : "";
  if (!staffUserId) {
    return NextResponse.json({ error: "対象がありません" }, { status: 400 });
  }

  // クライアント値は信用せず必ず正規化を通す（日付書式・文字数上限）
  const note = normalizeMemberNote(staffUserId, body);
  if (!note) {
    return NextResponse.json({ error: "対象がありません" }, { status: 400 });
  }

  try {
    await saveNote(auth.admin, note, auth.userEmail || auth.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: Request) {
  const auth = await authorizeMemberNotes();
  if (!auth.ok) return hidden();

  let body: { staffUserId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const staffUserId =
    typeof body.staffUserId === "string" ? body.staffUserId.trim() : "";
  if (!staffUserId) {
    return NextResponse.json({ error: "対象がありません" }, { status: 400 });
  }

  try {
    await deleteNote(auth.admin, staffUserId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
