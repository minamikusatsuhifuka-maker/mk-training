// 閲覧者（指定アカウント）の管理API（指示書149）
// 変更できるのは **管理者のみ**。非許可・未ログイン・非管理者にはすべて 404（存在秘匿）。
//
// ロックアウト防止: 保存時に「操作している管理者自身」を必ずリストに含める。
// これにより、リストを設定した本人が締め出されてSQLでしか直せない状態を作らない。

import { NextResponse } from "next/server";
import {
  authorizeMemberNotes,
  saveViewerUserIds,
  MemberNotesTableMissingError,
  ServiceRoleMissingError,
} from "@/lib/member-notes-server";

export const runtime = "nodejs";

const hidden = () =>
  NextResponse.json({ error: "Not Found" }, { status: 404 });

export async function PUT(req: Request) {
  const auth = await authorizeMemberNotes();
  if (!auth.ok) return hidden();
  // 閲覧者リストの編集は管理者だけ（指定された非管理者は閲覧・記入のみ）
  if (!auth.isAdmin) return hidden();

  let body: { viewerUserIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const raw = Array.isArray(body.viewerUserIds) ? body.viewerUserIds : null;
  if (!raw) {
    return NextResponse.json(
      { error: "viewerUserIds が必要です" },
      { status: 400 }
    );
  }
  const ids = raw.filter(
    (v): v is string => typeof v === "string" && v.trim() !== ""
  );
  // 自分を必ず含める（締め出し防止）
  if (!ids.includes(auth.userId)) ids.push(auth.userId);

  try {
    await saveViewerUserIds(auth.admin, ids, auth.userEmail || auth.userId);
    return NextResponse.json({ ok: true, viewerUserIds: ids });
  } catch (e) {
    if (e instanceof MemberNotesTableMissingError) {
      return NextResponse.json(
        { error: e.message, tableMissing: true },
        { status: 503 }
      );
    }
    if (e instanceof ServiceRoleMissingError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗しました" },
      { status: 500 }
    );
  }
}
