// 削除用パスワードの設定API（指示書189 B）— **院長のみ**（authorizeHiring。委任は見ない）。非許可は404
//   GET → { configured, updatedAt, lockedUntil }（ハッシュ・ソルトは返さない）
//   PUT { loginPassword, newPassword } → 院長のログインパスワードを再入力で確認してから、新しい削除用パスワードを設定・変更・再設定
//   平文は保存しない（scrypt）。入力値はログに残さない。

import { NextRequest, NextResponse } from "next/server";
import { HiringTableMissingError, ServiceRoleMissingError, authorizeHiring, recordHiringLog } from "@/lib/hiring-docs-server";
import { deletePasswordStatus, setDeletePassword, verifyLoginPassword } from "@/lib/delete-password-server";
import { validateNewDeletePassword } from "@/lib/delete-password";

export const runtime = "nodejs";

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof HiringTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
}

export async function GET() {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  try {
    return NextResponse.json(await deletePasswordStatus(auth.admin));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let body: { loginPassword?: unknown; newPassword?: unknown };
  try {
    body = (await req.json()) as { loginPassword?: unknown; newPassword?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const loginPassword = typeof body.loginPassword === "string" ? body.loginPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const invalid = validateNewDeletePassword(newPassword);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (!loginPassword) return NextResponse.json({ error: "本人確認のため、院長のログインパスワードを入力してください" }, { status: 400 });
  try {
    const by = auth.userEmail || auth.userId;
    // B-1/B-4: 本人確認（ログインパスワードの再入力）
    if (!(await verifyLoginPassword(auth.userEmail, loginPassword))) {
      await recordHiringLog(auth.admin, { by, action: "削除用パスワードの設定で本人確認に失敗", target: "-", changes: [] });
      return NextResponse.json({ error: "ログインパスワードが違います" }, { status: 403 });
    }
    await setDeletePassword(auth.admin, newPassword, by);
    return NextResponse.json({ ok: true, ...(await deletePasswordStatus(auth.admin)) });
  } catch (e) {
    return errorResponse(e);
  }
}
