// 院内端末の管理（指示書192 A・192-補）— **院長のみ**（requireAdmin＝app_metadata.role。委任は見ない）
//   GET  → { setting, devices（この端末かどうか付き・鍵は返さない）, pinUsers（番号を設定している人・値は返さない）, logs, tableMissing }
//   POST { action: "register", name, loginPassword } → この端末を院内端末として登録（Cookie に端末の鍵）。院長のパスワード再入力
//        { action: "revoke", id }                    → 登録を取り消す（即時に番号ログイン不可）
//        { action: "enable", loginPassword }         → 番号ログインを開始（既定OFF。ONは再入力）
//        { action: "disable" }                       → 番号ログインを停止（閉じる方向＝即時）
//        { action: "idle", minutes }                 → 自動ログアウトまでの分（5〜60）
//        { action: "resetPin", userId }              → その人の番号を解除（院長は番号を見られない。解除だけ）

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { verifyLoginPassword } from "@/lib/delete-password-server";
import { loadProfilesIndexServer } from "@/lib/staff-growth-roster-server";
import { DEVICE_COOKIE, DEVICE_COOKIE_DAYS, clampIdleMinutes, isDeviceSuspended, parseDeviceCookie } from "@/lib/terminal-auth";
import { TerminalTableMissingError, clearPin, fetchTerminalLogs, fetchTerminalSetting, listDevices, listPinUsers, recordTerminalLog, registerDevice, revokeDevice, saveTerminalSetting, terminalAdmin } from "@/lib/terminal-auth-server";

export const runtime = "nodejs";

function errorResponse(e: unknown): NextResponse {
  if (e instanceof TerminalTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const admin = terminalAdmin();
    const { setting, tableMissing } = await fetchTerminalSetting(admin);
    if (tableMissing) return NextResponse.json({ setting, devices: [], pinUsers: [], logs: [], tableMissing: true, thisDeviceId: "" });
    const now = new Date().toISOString();
    const thisId = parseDeviceCookie(req.cookies.get(DEVICE_COOKIE)?.value)?.id ?? "";
    const [devices, pins, logs, profiles] = await Promise.all([listDevices(admin), listPinUsers(admin), fetchTerminalLogs(admin, 100), loadProfilesIndexServer()]);
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const nameOf = (id: string) => profiles.find((p) => p.userId === id)?.name || (() => { const u = data?.users.find((x) => x.id === id); const meta = u?.user_metadata as Record<string, unknown> | null; return (typeof meta?.display_name === "string" && meta.display_name) || u?.email || id; })();
    return NextResponse.json({
      setting,
      devices: devices.map((d) => ({ id: d.id, name: d.name, registeredAt: d.registeredAt, registeredBy: d.registeredBy, lastUsedAt: d.lastUsedAt, revokedAt: d.revokedAt, suspended: isDeviceSuspended(d, now), suspendedUntil: d.suspendedUntil, thisDevice: d.id === thisId })),
      pinUsers: pins.map((p) => ({ ...p, name: nameOf(p.userId) })),
      logs,
      tableMissing: false,
      thisDeviceId: thisId,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  const user = auth.user;
  const by = user.email || user.id;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const action = typeof body.action === "string" ? body.action : "";
  const loginPassword = typeof body.loginPassword === "string" ? body.loginPassword : "";
  try {
    const admin = terminalAdmin();
    if (action === "register") {
      if (!loginPassword) return NextResponse.json({ error: "本人確認のため、院長のログインパスワードを入力してください" }, { status: 400 });
      if (!(await verifyLoginPassword(user.email ?? "", loginPassword))) {
        await recordTerminalLog(admin, { by, action: "端末登録で本人確認に失敗", target: "-", changes: [] });
        return NextResponse.json({ error: "ログインパスワードが違います" }, { status: 403 });
      }
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
      if (!name) return NextResponse.json({ error: "端末名を入れてください（例: 受付PC）" }, { status: 400 });
      const { device, cookieValue } = await registerDevice(admin, name, by);
      await recordTerminalLog(admin, { by, action: "院内端末を登録", target: device.id, changes: [{ field: "端末名", before: "", after: device.name }] });
      const res = NextResponse.json({ ok: true, device: { id: device.id, name: device.name, registeredAt: device.registeredAt } });
      // 端末の鍵: HttpOnly・Secure・SameSite=Strict。JS からは読めない
      res.cookies.set(DEVICE_COOKIE, cookieValue, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: DEVICE_COOKIE_DAYS * 24 * 60 * 60 });
      return res;
    }
    if (action === "revoke") {
      const id = typeof body.id === "string" ? body.id : "";
      if (!id) return NextResponse.json({ error: "端末が指定されていません" }, { status: 400 });
      const ok = await revokeDevice(admin, id, by);
      if (!ok) return NextResponse.json({ error: "端末が見つかりません" }, { status: 404 });
      await recordTerminalLog(admin, { by, action: "院内端末の登録を取り消し", target: id, changes: [] });
      return NextResponse.json({ ok: true });
    }
    if (action === "enable") {
      if (!loginPassword) return NextResponse.json({ error: "番号ログインを開始するには、院長のログインパスワードを入力してください" }, { status: 400 });
      if (!(await verifyLoginPassword(user.email ?? "", loginPassword))) {
        await recordTerminalLog(admin, { by, action: "番号ログインの開始で本人確認に失敗", target: "-", changes: [] });
        return NextResponse.json({ error: "ログインパスワードが違います" }, { status: 403 });
      }
      const setting = await saveTerminalSetting(admin, { pinLoginEnabled: true }, by);
      await recordTerminalLog(admin, { by, action: "番号ログインを開始（ON）", target: "setting", changes: [{ field: "番号ログイン", before: "OFF", after: "ON" }] });
      return NextResponse.json({ ok: true, setting });
    }
    if (action === "disable") {
      const setting = await saveTerminalSetting(admin, { pinLoginEnabled: false }, by);
      await recordTerminalLog(admin, { by, action: "番号ログインを停止（OFF）", target: "setting", changes: [{ field: "番号ログイン", before: "ON", after: "OFF" }] });
      return NextResponse.json({ ok: true, setting });
    }
    if (action === "idle") {
      const minutes = clampIdleMinutes(Number(body.minutes));
      const setting = await saveTerminalSetting(admin, { idleMinutes: minutes }, by);
      await recordTerminalLog(admin, { by, action: "自動ログアウトの時間を変更", target: "setting", changes: [{ field: "分", before: "", after: `${minutes}分` }] });
      return NextResponse.json({ ok: true, setting });
    }
    if (action === "resetPin") {
      const userId = typeof body.userId === "string" ? body.userId : "";
      if (!userId) return NextResponse.json({ error: "対象が指定されていません" }, { status: 400 });
      const removed = await clearPin(admin, userId);
      await recordTerminalLog(admin, { by, action: "番号を解除（院長）", target: userId, changes: [] });
      return NextResponse.json({ ok: true, removed });
    }
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
