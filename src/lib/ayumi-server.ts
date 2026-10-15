// 📜 当院の歩み（指示書253）— サーバー専用
//
// 【判定（253 §4・§5）】
//   見る        … ログインしたスタッフ全員。スイッチ ayumi がOFFの間は院長と検証用アカウントだけ（ほかは無いのと同じ404）
//   書く        … 院長と、委任の設定で「📜 当院の歩み」（admin item "ayumi"）を任された幹部（無効のアカウントは除く）
//   入口の文    … 院長だけ
//   声          … その出来事の「関わった人」に選ばれた本人（自分の声だけ）。消すのは院長と任された幹部も
// 【保存先】clinic_staff_growth（新しい表もSQLも足さない）
//   ayumi_entry（id = ay-…）／ ayumi_voice（id = av-<出来事>-<人>）／ ayumi_intro（id = ayumi-intro）／ ayumi_dismissed（id = ayumi-dismissed）
// 【写真】event-photos の ayumi/<出来事id>/ に置く（228と同じ置き場）。見るときは短い時間だけ有効なリンクを付ける。
// 【検証用（237）】検証用アカウントが作った出来事・声には印を付け、本物のスタッフには返さない。

import type { User } from "@supabase/supabase-js";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import { isTestSeedUser } from "./test-seed";
import { createSupabaseAdminClient } from "./supabase-admin";
import { GROWTH_TABLE, isMissingTable, serverFeatureEnabled } from "./staff-growth-server";
import { isActiveAccountId, loadDelegatedItems } from "./admin-delegation-server";
import { hidesTestSeedFor } from "./test-seed-hide-server";
import { audienceOf, loadAccounts } from "./notices-server";
import { EVENT_PHOTOS_BUCKET } from "./events-server";
import { signBucketPaths } from "./storage-signed";
import {
  normalizeEntry,
  normalizeIntro,
  normalizeVoice,
  type AyumiEntry,
  type AyumiIntro,
  type AyumiVoice,
} from "./ayumi";

export const AYUMI_ITEM_KEY = "ayumi";
export const AYUMI_FEATURE = "ayumi";
export const AYUMI_ENTRY_TYPE = "ayumi_entry";
export const AYUMI_VOICE_TYPE = "ayumi_voice";
export const AYUMI_INTRO_TYPE = "ayumi_intro";
export const AYUMI_INTRO_ID = "ayumi-intro";
export const AYUMI_DISMISSED_TYPE = "ayumi_dismissed";
export const AYUMI_DISMISSED_ID = "ayumi-dismissed";
export const AYUMI_PHOTO_PREFIX = "ayumi";
const PHOTO_SIGN_TTL = 60 * 60;

type Admin = ReturnType<typeof createSupabaseAdminClient>;

export type AyumiAuth = {
  ok: true;
  user: User;
  admin: Admin;
  isAdmin: boolean;
  testSeed: boolean;
  /** 出来事を足す・直す・消す、候補から残す・外す、写真、どの声も消す */
  canWrite: boolean;
  /** 入口の文を直す（院長だけ） */
  canEditIntro: boolean;
};

/** 未ログイン=401、使えない人=404（無いのと同じ） */
export async function authorizeAyumi(): Promise<AyumiAuth | { ok: false; status: 401 | 404 }> {
  const { user } = await getSessionUser();
  if (!user) return { ok: false, status: 401 };
  const isAdmin = isAdminUser(user);
  const testSeed = isTestSeedUser(user);
  if (!isAdmin && !testSeed && !(await serverFeatureEnabled(AYUMI_FEATURE))) return { ok: false, status: 404 };
  let canWrite = isAdmin;
  if (!isAdmin) {
    const items = await loadDelegatedItems(user.id);
    canWrite = items.includes(AYUMI_ITEM_KEY) && (await isActiveAccountId(user.id));
  }
  return { ok: true, user, admin: createSupabaseAdminClient(), isAdmin, testSeed, canWrite, canEditIntro: isAdmin };
}

// ─── 読み書き（共通） ───

async function selectType(admin: Admin, type: string): Promise<{ id: string; data: unknown }[]> {
  const { data, error } = await admin.from(GROWTH_TABLE).select("id, data").eq("record_type", type);
  if (error) {
    if (isMissingTable(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as { id: string; data: unknown }[];
}

async function upsertRow(admin: Admin, id: string, type: string, data: unknown, by: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await admin.from(GROWTH_TABLE).upsert({ id, record_type: type, data, updated_by: by, updated_at: now });
  if (error) throw new Error(error.message);
}

async function deleteRows(admin: Admin, type: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin.from(GROWTH_TABLE).delete().in("id", ids).eq("record_type", type);
  if (error) throw new Error(error.message);
}

// ─── 出来事 ───

export async function loadEntries(admin: Admin): Promise<AyumiEntry[]> {
  return (await selectType(admin, AYUMI_ENTRY_TYPE)).map((r) => normalizeEntry(r.id, r.data)).filter((e): e is AyumiEntry => e !== null);
}

export async function loadEntry(admin: Admin, id: string): Promise<AyumiEntry | null> {
  const { data, error } = await admin.from(GROWTH_TABLE).select("id, data").eq("id", id).eq("record_type", AYUMI_ENTRY_TYPE).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { id: string; data: unknown } | null;
  return row ? normalizeEntry(row.id, row.data) : null;
}

export async function saveEntry(admin: Admin, e: AyumiEntry, by: string): Promise<AyumiEntry> {
  const next: AyumiEntry = { ...e, photos: e.photos.map((p) => ({ path: p.path, name: p.name, size: p.size, uploadedAt: p.uploadedAt })) /* 見るためのリンクは保存しない */, updatedAt: new Date().toISOString() };
  await upsertRow(admin, next.id, AYUMI_ENTRY_TYPE, { ...next, ...(next.testSeed ? { seed191: true } : {}) }, by);
  return next;
}

/** 出来事を消す（声と写真も一緒に） */
export async function deleteEntryCascade(admin: Admin, e: AyumiEntry): Promise<void> {
  const voices = (await loadVoices(admin)).filter((v) => v.entryId === e.id);
  await deleteRows(admin, AYUMI_VOICE_TYPE, voices.map((v) => voiceRowId(v)));
  if (e.photos.length > 0) await admin.storage.from(EVENT_PHOTOS_BUCKET).remove(e.photos.map((p) => p.path)).catch(() => undefined);
  await deleteRows(admin, AYUMI_ENTRY_TYPE, [e.id]);
}

/** 見る人に返す出来事（本物のスタッフには検証用の出来事を出さない） */
export function visibleEntries(entries: AyumiEntry[], user: Pick<User, "app_metadata">): AyumiEntry[] {
  return hidesTestSeedFor(user) ? entries.filter((e) => !e.testSeed) : entries;
}

/** 写真に、見るための短い時間だけ有効なリンクを付ける */
export async function withPhotoUrls(admin: Admin, entries: AyumiEntry[]): Promise<AyumiEntry[]> {
  const paths = entries.flatMap((e) => e.photos.map((p) => p.path));
  if (paths.length === 0) return entries;
  const { urls } = await signBucketPaths(admin, EVENT_PHOTOS_BUCKET, paths, PHOTO_SIGN_TTL);
  return entries.map((e) => ({ ...e, photos: e.photos.map((p) => ({ ...p, url: urls.get(p.path) ?? "" })) }));
}

// ─── 声 ───

function voiceRowId(v: Pick<AyumiVoice, "entryId" | "userId">): string {
  return `av-${v.entryId}-${v.userId}`;
}

export async function loadVoices(admin: Admin): Promise<AyumiVoice[]> {
  return (await selectType(admin, AYUMI_VOICE_TYPE)).map((r) => normalizeVoice(r.data)).filter((v): v is AyumiVoice => v !== null);
}

export async function saveVoice(admin: Admin, v: AyumiVoice, by: string): Promise<AyumiVoice> {
  const next = { ...v, updatedAt: new Date().toISOString() };
  await upsertRow(admin, voiceRowId(next), AYUMI_VOICE_TYPE, { ...next, ...(next.testSeed ? { seed191: true } : {}) }, by);
  return next;
}

export async function deleteVoice(admin: Admin, entryId: string, userId: string): Promise<void> {
  await deleteRows(admin, AYUMI_VOICE_TYPE, [voiceRowId({ entryId, userId })]);
}

export function visibleVoices(voices: AyumiVoice[], user: Pick<User, "app_metadata">): AyumiVoice[] {
  return hidesTestSeedFor(user) ? voices.filter((v) => !v.testSeed) : voices;
}

// ─── 入口の文 ───

export async function loadIntro(admin: Admin): Promise<AyumiIntro> {
  const { data, error } = await admin.from(GROWTH_TABLE).select("data").eq("id", AYUMI_INTRO_ID).eq("record_type", AYUMI_INTRO_TYPE).maybeSingle();
  if (error && !isMissingTable(error.message)) throw new Error(error.message);
  return normalizeIntro((data as { data?: unknown } | null)?.data);
}

export async function saveIntro(admin: Admin, intro: AyumiIntro, by: string): Promise<AyumiIntro> {
  const next = { ...normalizeIntro(intro), updatedAt: new Date().toISOString() };
  await upsertRow(admin, AYUMI_INTRO_ID, AYUMI_INTRO_TYPE, next, by);
  return next;
}

// ─── 候補から外したもの ───

export async function loadDismissed(admin: Admin): Promise<Set<string>> {
  const { data, error } = await admin.from(GROWTH_TABLE).select("data").eq("id", AYUMI_DISMISSED_ID).eq("record_type", AYUMI_DISMISSED_TYPE).maybeSingle();
  if (error && !isMissingTable(error.message)) throw new Error(error.message);
  const ids = (data as { data?: { planIds?: unknown } } | null)?.data?.planIds;
  return new Set(Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : []);
}

export async function saveDismissed(admin: Admin, ids: Set<string>, by: string): Promise<void> {
  await upsertRow(admin, AYUMI_DISMISSED_ID, AYUMI_DISMISSED_TYPE, { planIds: [...ids].slice(-2000), updatedAt: new Date().toISOString() }, by);
}

// ─── 関わった人に選べる人（本物には本物だけ・検証用には検証用だけ） ───

export async function peopleCandidates(admin: Admin, testSeed: boolean): Promise<{ id: string; name: string }[]> {
  return audienceOf(testSeed, await loadAccounts(admin)).map((a) => ({ id: a.id, name: a.name }));
}

export function pickPeople(raw: unknown, candidates: { id: string; name: string }[], keep: { id: string; name: string }[] = []): { id: string; name: string }[] {
  const ids = Array.isArray(raw)
    ? raw.map((v) => (typeof v === "string" ? v : v && typeof v === "object" ? (v as { id?: unknown }).id : null)).filter((v): v is string => typeof v === "string")
    : [];
  const out: { id: string; name: string }[] = [];
  for (const id of ids) {
    if (out.some((p) => p.id === id)) continue;
    // 一覧にいる人（名前は今の表示名）。一覧にいない人（もう在籍していない等）は、前から入っていた人だけ残す
    const c = candidates.find((x) => x.id === id) ?? keep.find((x) => x.id === id);
    if (c) out.push({ id: c.id, name: c.name });
  }
  return out;
}

export function isAyumiPhotoPath(entryId: string, path: string): boolean {
  const prefix = `${AYUMI_PHOTO_PREFIX}/${entryId}/`;
  return path.startsWith(prefix) && /^[0-9]+-[a-z0-9]+\.(jpg|png|webp)$/.test(path.slice(prefix.length));
}

export function ayumiPhotoPath(entryId: string, ext: string, now = Date.now(), rand = Math.random()): string {
  return `${AYUMI_PHOTO_PREFIX}/${entryId}/${now}-${rand.toString(36).slice(2, 10)}.${ext}`;
}
