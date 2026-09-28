// 削除用パスワードのサーバー専用部（指示書189 B）— **院長のみ**（呼び出し側が authorizeHiring で保証）
//
// 【B-2 保存と照合（最重要）】
//   ・ハッシュ方式: Node 標準の **scrypt**（N=2^15, r=8, p=1, 64バイト）＋ 16バイトの乱数ソルト。平文・可逆暗号では保存しない
//   ・保存先: 184の clinic_hiring_docs（RLS全拒否・service-role のみ）に record_type = "secret" の1行。
//     /api/content-store は content_store テーブルしか触らないので、このテーブルの行はどのAPIからも読めない。
//     GET 系のAPIは「設定済みか」「ロック中か」だけを返し、ハッシュ・ソルトは一切返さない
//   ・照合はこのファイルの checkDeletePassword（削除APIの中）だけ。画面側では照合しない
//   ・ログには入力値・ハッシュを残さない
// 【B-3】5回続けて間違えたら15分ロック。失敗は操作ログに記録（入力値は残さない）
// 【B-1/B-4】設定・変更・再設定は院長のログインパスワードの再入力（verifyLoginPassword）が要る

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { HIRING_TABLE, HiringTableMissingError, recordHiringLog, type HiringAdminClient } from "./hiring-docs-server";
import { attemptsLeft, isLocked, nextAttemptState, type DeletePasswordAttemptState } from "./delete-password";

const SECRET_TYPE = "secret";
const SECRET_ID = "secret-delete-password";
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

type SecretRow = {
  algo: "scrypt";
  salt: string; // hex
  hash: string; // hex
  updatedAt: string;
  failCount: number;
  lockedUntil: string;
};

function isMissingTable(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return m.includes("does not exist") || m.includes("could not find the table") || m.includes("schema cache");
}

export function hashDeletePassword(plain: string): { salt: string; hash: string } {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN, SCRYPT_OPTS);
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}

export function verifyDeletePasswordHash(plain: string, saltHex: string, hashHex: string): boolean {
  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(plain, Buffer.from(saltHex, "hex"), expected.length, SCRYPT_OPTS);
    return expected.length > 0 && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function fetchSecret(admin: HiringAdminClient): Promise<SecretRow | null> {
  const { data, error } = await admin.from(HIRING_TABLE).select("data").eq("id", SECRET_ID).eq("record_type", SECRET_TYPE).maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) throw new HiringTableMissingError();
    throw new Error(error.message);
  }
  if (!data) return null;
  const g = (data.data ?? {}) as Partial<SecretRow>;
  if (typeof g.hash !== "string" || typeof g.salt !== "string") return null;
  return { algo: "scrypt", salt: g.salt, hash: g.hash, updatedAt: typeof g.updatedAt === "string" ? g.updatedAt : "", failCount: typeof g.failCount === "number" ? g.failCount : 0, lockedUntil: typeof g.lockedUntil === "string" ? g.lockedUntil : "" };
}

async function saveSecret(admin: HiringAdminClient, row: SecretRow, by: string): Promise<void> {
  const { error } = await admin.from(HIRING_TABLE).upsert({ id: SECRET_ID, record_type: SECRET_TYPE, data: row, updated_by: by, updated_at: new Date().toISOString() });
  if (error) {
    if (isMissingTable(error.message)) throw new HiringTableMissingError();
    throw new Error(error.message);
  }
}

/** 画面に返してよい状態だけ（ハッシュ・ソルトは含めない） */
export async function deletePasswordStatus(admin: HiringAdminClient): Promise<{ configured: boolean; updatedAt: string; lockedUntil: string }> {
  const s = await fetchSecret(admin);
  const now = new Date().toISOString();
  return { configured: !!s, updatedAt: s?.updatedAt ?? "", lockedUntil: s && isLocked(s, now) ? s.lockedUntil : "" };
}

/** 設定・変更・再設定（呼び出し側でログインパスワードの再入力を確認してから呼ぶ） */
export async function setDeletePassword(admin: HiringAdminClient, plain: string, by: string): Promise<void> {
  const prev = await fetchSecret(admin);
  const { salt, hash } = hashDeletePassword(plain);
  await saveSecret(admin, { algo: "scrypt", salt, hash, updatedAt: new Date().toISOString(), failCount: 0, lockedUntil: "" }, by);
  await recordHiringLog(admin, { by, action: prev ? "削除用パスワードを変更" : "削除用パスワードを設定", target: "-", changes: [{ field: "本人確認", before: "", after: "ログインパスワードの再入力あり" }] });
}

export type DeletePasswordCheck =
  | { ok: true }
  | { ok: false; reason: "unset" }
  | { ok: false; reason: "locked"; lockedUntil: string }
  | { ok: false; reason: "wrong"; attemptsLeft: number; lockedUntil: string };

/** 削除APIの中だけで呼ぶ照合。失敗回数・ロックを更新し、失敗を操作ログに残す（入力値は残さない） */
export async function checkDeletePassword(admin: HiringAdminClient, plain: string, by: string): Promise<DeletePasswordCheck> {
  const s = await fetchSecret(admin);
  if (!s) return { ok: false, reason: "unset" };
  const now = new Date();
  const nowIso = now.toISOString();
  if (isLocked(s, nowIso)) return { ok: false, reason: "locked", lockedUntil: s.lockedUntil };
  const ok = typeof plain === "string" && plain.length > 0 && verifyDeletePasswordHash(plain, s.salt, s.hash);
  const state: DeletePasswordAttemptState = { failCount: s.failCount, lockedUntil: s.lockedUntil };
  const next = nextAttemptState(state, ok, now);
  await saveSecret(admin, { ...s, failCount: next.failCount, lockedUntil: next.lockedUntil }, by);
  if (ok) return { ok: true };
  await recordHiringLog(admin, {
    by,
    action: "削除用パスワードの照合に失敗",
    target: "-",
    changes: [{ field: "状態", before: "", after: next.lockedUntil ? `15分ロック（${next.lockedUntil.slice(0, 16).replace("T", " ")}まで）` : `残り${attemptsLeft(next)}回` }],
  });
  return { ok: false, reason: "wrong", attemptsLeft: attemptsLeft(next), lockedUntil: next.lockedUntil };
}

/**
 * 院長のログインパスワードの再入力（B-1・B-4 の本人確認）。
 * セッションを持たない使い捨ての匿名クライアントで signInWithPassword を試すだけ（Cookie には触れない）。
 */
export async function verifyLoginPassword(email: string, password: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !email || !password) return false;
  try {
    const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    const ok = !error && !!data?.user;
    if (ok) await client.auth.signOut({ scope: "local" }).catch(() => {});
    return ok;
  } catch {
    return false;
  }
}
