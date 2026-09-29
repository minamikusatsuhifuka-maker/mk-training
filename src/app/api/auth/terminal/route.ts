// 本人の院内端末まわり（指示書192 B・D）— ログイン済みのみ（requireLogin）
//   GET → { terminal（この端末が院内端末でスイッチON）, idleMinutes, pinLoginEnabled, canSetPin, pinSet, pinUpdatedAt, isAdmin }
//   PUT { pin, loginPassword } → 自分の番号を設定・変更（本人のログインパスワードの再入力＋弱い番号・生年月日の番号を拒否）。管理者は設定できない
//   DELETE { loginPassword } → 自分の番号を解除
// 番号は scrypt＋乱数ソルトで保存し、この API も値を返さない。

import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { isAdminUser } from "@/lib/admin-role";
import { verifyLoginPassword } from "@/lib/delete-password-server";
import { fetchAllStaffContacts } from "@/lib/staff-contacts-server";
import { isTestSeedUser } from "@/lib/test-seed";
import { DEVICE_COOKIE, validatePin } from "@/lib/terminal-auth";
import { TerminalTableMissingError, clearPin, pinStatus, recordTerminalLog, setPin, terminalAdmin, terminalAvailable } from "@/lib/terminal-auth-server";

export const runtime = "nodejs";

function errorResponse(e: unknown): NextResponse {
  if (e instanceof TerminalTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;
  try {
    const admin = terminalAdmin();
    const { available, setting } = await terminalAvailable(admin, req.cookies.get(DEVICE_COOKIE)?.value);
    const isAdmin = isAdminUser(user);
    const st = await pinStatus(admin, user.id);
    return NextResponse.json({
      terminal: available,
      idleMinutes: setting.idleMinutes,
      pinLoginEnabled: setting.pinLoginEnabled,
      // 192-補 4: 検証用アカウントはOFFのあいだも番号を設定できる。管理者は番号でログインできないので設定もできない
      canSetPin: !isAdmin && (setting.pinLoginEnabled || isTestSeedUser(user)),
      pinSet: st.set,
      pinUpdatedAt: st.updatedAt,
      pinLockedUntil: st.lockedUntil,
      isAdmin,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;
  if (isAdminUser(user)) return NextResponse.json({ error: "管理者は番号でログインできないため、番号を設定できません" }, { status: 403 });
  let body: { pin?: unknown; loginPassword?: unknown };
  try {
    body = (await req.json()) as { pin?: unknown; loginPassword?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const pin = typeof body.pin === "string" ? body.pin : "";
  const loginPassword = typeof body.loginPassword === "string" ? body.loginPassword : "";
  try {
    const admin = terminalAdmin();
    const { setting } = await terminalAvailable(admin, req.cookies.get(DEVICE_COOKIE)?.value);
    if (!setting.pinLoginEnabled && !isTestSeedUser(user)) return NextResponse.json({ error: "番号ログインはまだ開始されていません" }, { status: 409 });
    // 生年月日（169の連絡先に登録があれば）から作った番号は拒否
    let birthday = "";
    try {
      const { contacts } = await fetchAllStaffContacts(admin);
      birthday = contacts.find((c) => c.userId === user.id)?.birthday ?? "";
    } catch {
      /* 連絡先が読めなければ生年月日の判定なし */
    }
    const invalid = validatePin(pin, birthday);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    if (!loginPassword) return NextResponse.json({ error: "本人確認のため、ログインパスワードを入力してください" }, { status: 400 });
    if (!(await verifyLoginPassword(user.email ?? "", loginPassword))) {
      await recordTerminalLog(admin, { by: user.email || user.id, action: "番号の設定で本人確認に失敗", target: user.id, changes: [] });
      return NextResponse.json({ error: "ログインパスワードが違います" }, { status: 403 });
    }
    const prev = await pinStatus(admin, user.id);
    await setPin(admin, user.id, pin, user.email || user.id);
    await recordTerminalLog(admin, { by: user.email || user.id, action: prev.set ? "番号を変更" : "番号を設定", target: user.id, changes: [{ field: "本人確認", before: "", after: "ログインパスワードの再入力あり" }] });
    return NextResponse.json({ ok: true, pinSet: true });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireLogin();
  if (gate.response) return gate.response;
  const user = gate.user;
  let body: { loginPassword?: unknown };
  try {
    body = (await req.json()) as { loginPassword?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const loginPassword = typeof body.loginPassword === "string" ? body.loginPassword : "";
  try {
    if (!loginPassword || !(await verifyLoginPassword(user.email ?? "", loginPassword))) return NextResponse.json({ error: "ログインパスワードが違います" }, { status: 403 });
    const admin = terminalAdmin();
    const removed = await clearPin(admin, user.id);
    if (removed) await recordTerminalLog(admin, { by: user.email || user.id, action: "番号を解除（本人）", target: user.id, changes: [] });
    return NextResponse.json({ ok: true, pinSet: false });
  } catch (e) {
    return errorResponse(e);
  }
}
