// 院内端末の番号（PIN）ログイン（指示書192 C・192-補）— **未ログインで呼ばれる**
//
// 【proxy.ts の PUBLIC_API_PATHS と scripts/check-api-auth.mjs の PUBLIC_ROUTES に理由付きで明示】
//   ログイン前にしか呼べないため Cookie セッションでは守れない。代わりに:
//   1. 管理画面のスイッチ（192-補）がON、かつ
//   2. 端末の鍵（HttpOnly Cookie・サーバーにはハッシュのみ）が有効
//   でなければ、**既存の未認証と同じ応答**（{ error: "ログインが必要です" } 401）を返し、何も照合しない。
//
//   GET  → { available }（この端末で番号ログインが使えるか。それ以外の情報は返さない）
//   POST { email, pin } → 端末の鍵→メール→番号 の順に確かめ、通ったら通常のログインと同じ Cookie セッションを発行
//     ・管理者は番号でログインできない ・アカウント5回失敗→15分停止 ・端末1時間20回失敗→1時間停止
//     ・「メールが存在しない」「番号が違う」「停止中」は同じ応答（403・同じ文言）。入力値はログに残さない
//
// 【セッション発行】admin.generateLink(magiclink) の hashed_token を、Cookie を張るサーバークライアントの
//   verifyOtp で消費する＝ signInWithPassword と同じ Cookie（@supabase/ssr）が返る。161の関門・162のセッション維持はそのまま。

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { DEVICE_COOKIE, PIN_LOGIN_FAILED } from "@/lib/terminal-auth";
import { findUserByEmail, pinLoginEligible, recordDeviceFailure, recordTerminalLog, terminalAdmin, terminalAvailable, touchDevice, verifyPin } from "@/lib/terminal-auth-server";

export const runtime = "nodejs";

// proxy の未認証応答と**同一**にする（応答の違いから状態を推測させない）
const unauthorized = () => NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
const failed = () => NextResponse.json({ error: PIN_LOGIN_FAILED }, { status: 403 });

export async function GET(req: NextRequest) {
  try {
    const admin = terminalAdmin();
    const { available } = await terminalAvailable(admin, req.cookies.get(DEVICE_COOKIE)?.value);
    return NextResponse.json({ available });
  } catch {
    return NextResponse.json({ available: false });
  }
}

export async function POST(req: NextRequest) {
  let admin;
  try {
    admin = terminalAdmin();
  } catch {
    return unauthorized();
  }
  // 1. 端末の鍵の確認を最初に行う（E）。スイッチOFF・鍵なし・取り消し済み・停止中 → 既存の未認証と同じ応答
  const { available, device } = await terminalAvailable(admin, req.cookies.get(DEVICE_COOKIE)?.value);
  if (!available || !device) return unauthorized();

  let body: { email?: unknown; pin?: unknown };
  try {
    body = (await req.json()) as { email?: unknown; pin?: unknown };
  } catch {
    return failed();
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const pin = typeof body.pin === "string" ? body.pin : "";
  const by = `端末:${device.name}`;

  const fail = async (why: string, target = "-") => {
    await recordDeviceFailure(admin, device, by);
    await recordTerminalLog(admin, { by, action: "番号ログインに失敗", target, changes: [{ field: "理由", before: "", after: why }] });
    return failed();
  };

  if (!email || !/^\d{4,6}$/.test(pin)) return fail("形式");
  // 2. メール → アカウント（存在しない・管理者・無効化 は同じ応答）
  const user = await findUserByEmail(admin, email);
  if (!user) return fail("該当なし");
  if (!pinLoginEligible(user)) return fail("対象外（管理者または無効化）", user.id);
  // 3. 番号（アカウントごとの停止もここ）
  const v = await verifyPin(admin, user.id, pin, by);
  if (!v.ok) return fail(v.reason === "locked" ? "停止中（5回失敗）" : v.reason === "unset" ? "番号未設定" : `番号違い（残り${v.attemptsLeft ?? 0}回）`, user.id);

  // 4. セッション発行（通常のログインと同じ Cookie）
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email! });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    await recordTerminalLog(admin, { by, action: "番号ログインのセッション発行に失敗", target: user.id, changes: [] });
    return NextResponse.json({ error: "ログインの準備に失敗しました。パスワードでログインしてください" }, { status: 500 });
  }
  const server = await createSupabaseServerClient();
  const { error: otpErr } = await server.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (otpErr) {
    await recordTerminalLog(admin, { by, action: "番号ログインのセッション発行に失敗", target: user.id, changes: [] });
    return NextResponse.json({ error: "ログインの準備に失敗しました。パスワードでログインしてください" }, { status: 500 });
  }
  await touchDevice(admin, device, by);
  await recordTerminalLog(admin, { by, action: "番号ログイン", target: user.id, changes: [] });
  return NextResponse.json({ ok: true });
}
