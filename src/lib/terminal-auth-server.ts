// 院内端末の番号ログイン（指示書192）— サーバー専用
//   保存先: clinic_terminal_auth（RLS 全拒否・service-role のみ。SQL は 192_院内端末_テーブル作成.sql）
//   record_type: setting | device | pin | log
//   端末の鍵は SHA-256 のハッシュだけ、番号は scrypt＋乱数ソルト（189と同じ関数）だけを保存する。どのAPIも値を返さない。

import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabase-admin";
import { hashDeletePassword, verifyDeletePasswordHash } from "./delete-password-server";
import { nextAttemptState, attemptsLeft, isLocked } from "./delete-password";
import {
  DEFAULT_TERMINAL_SETTING,
  clampIdleMinutes,
  isDeviceSuspended,
  nextDeviceFailState,
  normalizeTerminalDevice,
  normalizeTerminalSetting,
  parseDeviceCookie,
  type TerminalDevice,
  type TerminalSetting,
} from "./terminal-auth";
import { isAdminUser } from "./admin-role";

export const TERMINAL_TABLE = "clinic_terminal_auth";
const SETTING_ID = "setting";
type Admin = SupabaseClient;

export class TerminalTableMissingError extends Error {
  constructor() {
    super("院内端末のテーブルがまだ作られていません。交付済みのSQL（192_院内端末_テーブル作成.sql）を実行してください。");
    this.name = "TerminalTableMissingError";
  }
}
function isMissingTable(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("could not find the table") || m.includes("schema cache");
}
function throwDb(message: string): never {
  if (isMissingTable(message)) throw new TerminalTableMissingError();
  throw new Error(message);
}

async function upsert(admin: Admin, type: string, id: string, data: Record<string, unknown>, by: string): Promise<void> {
  const { error } = await admin.from(TERMINAL_TABLE).upsert({ id, record_type: type, data, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throwDb(error.message);
}
async function getRow(admin: Admin, type: string, id: string): Promise<unknown | null> {
  const { data, error } = await admin.from(TERMINAL_TABLE).select("id, data").eq("id", id).eq("record_type", type).maybeSingle();
  if (error) throwDb(error.message);
  return data?.data ?? null;
}

// ─── 設定（192-補）───

export async function fetchTerminalSetting(admin: Admin): Promise<{ setting: TerminalSetting; tableMissing: boolean }> {
  try {
    const raw = await getRow(admin, "setting", SETTING_ID);
    return { setting: raw ? normalizeTerminalSetting(raw) : DEFAULT_TERMINAL_SETTING, tableMissing: false };
  } catch (e) {
    if (e instanceof TerminalTableMissingError) return { setting: DEFAULT_TERMINAL_SETTING, tableMissing: true };
    throw e;
  }
}
export async function saveTerminalSetting(admin: Admin, patch: Partial<Pick<TerminalSetting, "pinLoginEnabled" | "idleMinutes">>, by: string): Promise<TerminalSetting> {
  const { setting } = await fetchTerminalSetting(admin);
  const next: TerminalSetting = {
    pinLoginEnabled: patch.pinLoginEnabled ?? setting.pinLoginEnabled,
    idleMinutes: clampIdleMinutes(patch.idleMinutes ?? setting.idleMinutes),
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };
  await upsert(admin, "setting", SETTING_ID, { ...next }, by);
  return next;
}

// ─── 端末 ───

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function listDevices(admin: Admin): Promise<TerminalDevice[]> {
  const { data, error } = await admin.from(TERMINAL_TABLE).select("id, data").eq("record_type", "device");
  if (error) throwDb(error.message);
  return (data ?? [])
    .map((r) => normalizeTerminalDevice(String(r.id), r.data))
    .filter((d): d is TerminalDevice => d !== null)
    .sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));
}

/** 端末を登録し、ブラウザに保存する Cookie の値（<id>.<secret>）を返す。secret はここでしか手に入らない */
export async function registerDevice(admin: Admin, name: string, by: string): Promise<{ device: TerminalDevice; cookieValue: string }> {
  const id = `dev-${randomBytes(9).toString("base64url")}`;
  const secret = randomBytes(32).toString("base64url");
  const now = new Date().toISOString();
  const device: TerminalDevice = { id, name: name.trim().slice(0, 60) || "院内端末", secretHash: sha256(secret), registeredAt: now, registeredBy: by, lastUsedAt: "", revokedAt: "", failWindowStart: "", failCount: 0, suspendedUntil: "" };
  const { id: _i, ...data } = device;
  void _i;
  await upsert(admin, "device", id, data, by);
  return { device, cookieValue: `${id}.${secret}` };
}

export async function revokeDevice(admin: Admin, id: string, by: string): Promise<boolean> {
  const raw = await getRow(admin, "device", id);
  const d = normalizeTerminalDevice(id, raw);
  if (!d) return false;
  await upsert(admin, "device", id, { ...d, id: undefined, revokedAt: new Date().toISOString() }, by);
  return true;
}

export async function saveDevice(admin: Admin, d: TerminalDevice, by: string): Promise<void> {
  const { id, ...data } = d;
  await upsert(admin, "device", id, data, by);
}

/** Cookie の値から、有効な（取り消されていない）端末を返す。鍵が違えば null */
export async function verifyDeviceCookie(admin: Admin, cookieValue: string | undefined | null): Promise<TerminalDevice | null> {
  const parsed = parseDeviceCookie(cookieValue);
  if (!parsed) return null;
  let raw: unknown;
  try {
    raw = await getRow(admin, "device", parsed.id);
  } catch {
    return null; // テーブル未作成なども「端末ではない」
  }
  const d = normalizeTerminalDevice(parsed.id, raw);
  if (!d || d.revokedAt) return null;
  const expected = Buffer.from(d.secretHash, "hex");
  const actual = Buffer.from(sha256(parsed.secret), "hex");
  if (expected.length !== actual.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ actual[i];
  return diff === 0 ? d : null;
}

/** 番号ログインが今この端末で使えるか（スイッチON かつ 有効な端末 かつ 停止中でない） */
export async function terminalAvailable(admin: Admin, cookieValue: string | undefined | null): Promise<{ available: boolean; device: TerminalDevice | null; setting: TerminalSetting }> {
  const { setting } = await fetchTerminalSetting(admin);
  if (!setting.pinLoginEnabled) return { available: false, device: null, setting };
  const device = await verifyDeviceCookie(admin, cookieValue);
  if (!device) return { available: false, device: null, setting };
  return { available: !isDeviceSuspended(device, new Date().toISOString()), device, setting };
}

// ─── 番号（PIN）───

type PinRow = { userId: string; algo: "scrypt"; salt: string; hash: string; updatedAt: string; failCount: number; lockedUntil: string };
const pinId = (userId: string) => `pin-${userId}`;

async function getPin(admin: Admin, userId: string): Promise<PinRow | null> {
  const raw = (await getRow(admin, "pin", pinId(userId))) as Partial<PinRow> | null;
  if (!raw || typeof raw.hash !== "string" || typeof raw.salt !== "string") return null;
  return { userId, algo: "scrypt", salt: raw.salt, hash: raw.hash, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "", failCount: typeof raw.failCount === "number" ? raw.failCount : 0, lockedUntil: typeof raw.lockedUntil === "string" ? raw.lockedUntil : "" };
}

export async function setPin(admin: Admin, userId: string, pin: string, by: string): Promise<void> {
  const { salt, hash } = hashDeletePassword(pin); // scrypt＋乱数ソルト（189と同じ）
  await upsert(admin, "pin", pinId(userId), { userId, algo: "scrypt", salt, hash, updatedAt: new Date().toISOString(), failCount: 0, lockedUntil: "" }, by);
}
export async function clearPin(admin: Admin, userId: string): Promise<boolean> {
  const { data, error } = await admin.from(TERMINAL_TABLE).delete().eq("id", pinId(userId)).eq("record_type", "pin").select("id");
  if (error) throwDb(error.message);
  return (data ?? []).length > 0;
}
export async function pinStatus(admin: Admin, userId: string): Promise<{ set: boolean; updatedAt: string; lockedUntil: string }> {
  try {
    const p = await getPin(admin, userId);
    const now = new Date().toISOString();
    return { set: !!p, updatedAt: p?.updatedAt ?? "", lockedUntil: p && isLocked(p, now) ? p.lockedUntil : "" };
  } catch (e) {
    if (e instanceof TerminalTableMissingError) return { set: false, updatedAt: "", lockedUntil: "" };
    throw e;
  }
}
/** 番号を設定している人の一覧（値は返さない） */
export async function listPinUsers(admin: Admin): Promise<{ userId: string; updatedAt: string; lockedUntil: string }[]> {
  const { data, error } = await admin.from(TERMINAL_TABLE).select("id, data").eq("record_type", "pin");
  if (error) throwDb(error.message);
  const now = new Date().toISOString();
  return (data ?? []).map((r) => {
    const g = (r.data ?? {}) as Partial<PinRow>;
    return { userId: typeof g.userId === "string" ? g.userId : String(r.id).replace(/^pin-/, ""), updatedAt: typeof g.updatedAt === "string" ? g.updatedAt : "", lockedUntil: typeof g.lockedUntil === "string" && g.lockedUntil > now ? g.lockedUntil : "" };
  });
}

export type PinVerify = { ok: true } | { ok: false; reason: "unset" | "locked" | "wrong"; attemptsLeft?: number };

/** 番号の照合（ログインAPIの中だけ）。失敗回数・停止を更新する */
export async function verifyPin(admin: Admin, userId: string, pin: string, by: string): Promise<PinVerify> {
  const p = await getPin(admin, userId);
  if (!p) return { ok: false, reason: "unset" };
  const now = new Date();
  if (isLocked(p, now.toISOString())) return { ok: false, reason: "locked" };
  const ok = pin.length > 0 && verifyDeletePasswordHash(pin, p.salt, p.hash);
  const next = nextAttemptState({ failCount: p.failCount, lockedUntil: p.lockedUntil }, ok, now);
  await upsert(admin, "pin", pinId(userId), { ...p, failCount: next.failCount, lockedUntil: next.lockedUntil }, by);
  return ok ? { ok: true } : { ok: false, reason: "wrong", attemptsLeft: attemptsLeft(next) };
}

export async function recordDeviceFailure(admin: Admin, d: TerminalDevice, by: string): Promise<TerminalDevice> {
  const next = { ...d, ...nextDeviceFailState(d, new Date()) };
  await saveDevice(admin, next, by);
  return next;
}
export async function touchDevice(admin: Admin, d: TerminalDevice, by: string): Promise<void> {
  await saveDevice(admin, { ...d, lastUsedAt: new Date().toISOString() }, by);
}

// ─── アカウントの検索（メール）───

export async function findUserByEmail(admin: Admin, email: string): Promise<User | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return null;
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  return (data?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === wanted) ?? null;
}
export function isBannedUser(u: User): boolean {
  const until = (u as User & { banned_until?: string | null }).banned_until;
  return !!until && new Date(until).getTime() > Date.now();
}
/** 番号でログインしてよいアカウントか（管理者・無効化は不可） */
export function pinLoginEligible(u: User): boolean {
  return !isAdminUser(u) && !isBannedUser(u) && !!u.email;
}

// ─── 操作ログ（入力値・番号は残さない）───

export async function recordTerminalLog(admin: Admin, entry: { by: string; action: string; target: string; changes: { field: string; before: string; after: string }[] }): Promise<void> {
  try {
    const at = new Date().toISOString();
    await admin.from(TERMINAL_TABLE).insert({ id: `tlog-${Date.now()}-${randomBytes(3).toString("hex")}`, record_type: "log", data: { at, ...entry }, updated_by: entry.by, updated_at: at });
  } catch (e) {
    console.error("[terminal-auth] 操作ログを記録できませんでした:", e instanceof Error ? e.message : e);
  }
}
export type TerminalLog = { id: string; at: string; by: string; action: string; target: string; changes: { field: string; before: string; after: string }[] };
export async function fetchTerminalLogs(admin: Admin, limit = 100): Promise<TerminalLog[]> {
  const { data, error } = await admin.from(TERMINAL_TABLE).select("id, data").eq("record_type", "log").order("created_at", { ascending: false }).limit(limit);
  if (error) {
    if (isMissingTable(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((r) => {
    const g = (r.data ?? {}) as Partial<TerminalLog>;
    return { id: String(r.id), at: g.at ?? "", by: g.by ?? "", action: g.action ?? "", target: g.target ?? "", changes: Array.isArray(g.changes) ? g.changes : [] };
  });
}

export function terminalAdmin(): Admin {
  return createSupabaseAdminClient();
}
