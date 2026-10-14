// 📣 お知らせ・イベント（指示書228）のサーバー共通部 — サーバー専用
//
// 【見られる人（228 §4・判定はすべてここ）】
//   本文と貼ったもの        … ログインしたスタッフ全員（検証用アカウントがつくったものは、検証用アカウントと院長だけ）
//   自分の出欠              … 本人
//   イベントごとの出欠の一覧 … つくった人・院長・委任の設定で「📣 イベントの出欠・参加記録」を任された幹部
//   参加の記録（管理画面）   … 院長・任された幹部（/api/admin/notice-attendance）
//
// 【スイッチ】機能フラグ notices がOFFの間は、院長と検証用アカウントだけが使える（それ以外は 404 ＝無いのと同じ）。
//
// 【置き場所】clinic_events（RLS有効・ポリシー0件）に record_type を足す（lib/notices.ts の冒頭）。
//   貼ったものは非公開バケット event-photos の notices/<お知らせid>/ 配下。リンクは見るときだけ短い時間で出す。

import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient, ServiceRoleMissingError } from "./supabase-admin";
import { getSessionUser, displayNameOf } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import { isTestSeedUser } from "./test-seed";
import { serverFeatureEnabled } from "./staff-growth-server";
import { isActiveAccountId, loadDelegatedItems } from "./admin-delegation-server";
import { EVENTS_TABLE, EVENT_PHOTOS_BUCKET, EventPhotoBucketMissingError } from "./events-server";
import { InfraMissingError } from "./infra-error";
import { isBucketNotFound, signBucketPaths } from "./storage-signed";
import { resolveDisplayNames } from "./display-names-server";
import { isMailConfigured, portalOrigin, sendPortalMail } from "./mail-send";
import {
  NOTICE_ATTENDANCE_TYPE,
  NOTICE_FILES_PREFIX,
  NOTICE_FILE_SIGN_TTL,
  NOTICE_KIND_LABEL,
  NOTICE_MAIL_SENT_TYPE,
  NOTICE_READ_TYPE,
  NOTICE_RSVP_TYPE,
  NOTICE_TYPE,
  attendanceRowId,
  eventStarted,
  newMailSentRowId,
  normalizeAttendance,
  normalizeNotice,
  normalizeRsvp,
  reminderSentRowId,
  readRowId,
  reminderStageFor,
  rsvpRowId,
  type Notice,
  type NoticeAttachment,
  type NoticeAttendance,
  type NoticeRsvp,
  type ReminderStage,
} from "./notices";

export { ServiceRoleMissingError, EventPhotoBucketMissingError };

export type NoticesAdmin = ReturnType<typeof createSupabaseAdminClient>;

/** 委任の項目key（lib/admin-items.ts） */
export const NOTICE_ATTENDANCE_ITEM = "notice-attendance";

// ─── 前提の表が無いとき ───

export class NoticesTableMissingError extends InfraMissingError {
  constructor(detail?: string) {
    super(
      "お知らせ・イベントの保存先（clinic_events）がまだ作られていません。指示書132AのSQLを実行してください。" +
        (detail ? `（詳細: ${detail}）` : ""),
      "NoticesTableMissingError"
    );
  }
}

function check(error: { message: string } | null): void {
  if (!error) return;
  if (/clinic_events.*(does not exist|schema cache)/i.test(error.message)) throw new NoticesTableMissingError(error.message);
  throw new Error(error.message);
}

// ─── 認可 ───

export type NoticesAuth = {
  ok: true;
  user: User;
  admin: NoticesAdmin;
  isAdmin: boolean;
  testSeed: boolean;
  /** 「📣 イベントの出欠・参加記録」を任された幹部 */
  delegated: boolean;
  name: string;
};

/**
 * 認証＋スイッチの前段。未ログイン=401、使えない人=404（無いのと同じ）。
 * スイッチOFFの間に使えるのは院長と検証用アカウントだけ（228 §6）。
 */
export async function authorizeNotices(): Promise<NoticesAuth | { ok: false; status: 401 | 404 }> {
  const { user } = await getSessionUser();
  if (!user) return { ok: false, status: 401 };
  const isAdmin = isAdminUser(user);
  const testSeed = isTestSeedUser(user);
  if (!isAdmin && !testSeed && !(await serverFeatureEnabled("notices"))) return { ok: false, status: 404 };
  const admin = createSupabaseAdminClient();
  let delegated = false;
  if (!isAdmin) {
    const items = await loadDelegatedItems(user.id);
    delegated = items.includes(NOTICE_ATTENDANCE_ITEM) && (await isActiveAccountId(user.id));
  }
  return { ok: true, user, admin, isAdmin, testSeed, delegated, name: displayNameOf(user) };
}

/** 本文と貼ったものを見られるか（検証用がつくったものは、検証用アカウントと院長だけ） */
export function canSeeNotice(n: Notice, a: Pick<NoticesAuth, "isAdmin" | "testSeed">): boolean {
  return !n.testSeed || a.isAdmin || a.testSeed;
}
/** 直す・消す（つくった人・院長） */
export function canEditNotice(n: Notice, a: Pick<NoticesAuth, "isAdmin" | "user">): boolean {
  return a.isAdmin || n.authorId === a.user.id;
}
/** 出欠の一覧（つくった人・院長・任された幹部） */
export function canSeeRsvpList(n: Notice, a: Pick<NoticesAuth, "isAdmin" | "user" | "delegated">): boolean {
  return n.kind === "event" && (canEditNotice(n, a) || a.delegated);
}
/** 代わりに出欠を直す（つくった人・院長） */
export function canProxyRsvp(n: Notice, a: Pick<NoticesAuth, "isAdmin" | "user">): boolean {
  return n.kind === "event" && canEditNotice(n, a);
}
/**
 * 参加の確定・直し（228 §3）
 *   確定の前 … 開催日時を過ぎたら、つくった人・院長・任された幹部
 *   確定の後 … 院長・任された幹部だけ
 */
export function canEditAttendance(
  n: Pick<Notice, "kind" | "heldOn" | "heldTime" | "authorId"> | null,
  att: NoticeAttendance | null,
  a: Pick<NoticesAuth, "isAdmin" | "user" | "delegated">,
  nowMs = Date.now()
): boolean {
  if (att) return a.isAdmin || a.delegated;
  if (!n || n.kind !== "event" || !eventStarted(n, nowMs)) return false;
  return a.isAdmin || a.delegated || n.authorId === a.user.id;
}

// ─── アカウント（出欠をとる相手）───

export type Account = { id: string; email: string; name: string; testSeed: boolean; active: boolean };

let accountsCache: { at: number; list: Account[] } | null = null;
const ACCOUNTS_TTL = 60_000;

function isBanned(u: User): boolean {
  const b = (u as { banned_until?: string | null }).banned_until;
  if (!b || b === "none") return false;
  const t = Date.parse(b);
  return Number.isNaN(t) ? true : t > Date.now();
}

export async function loadAccounts(admin: NoticesAdmin): Promise<Account[]> {
  if (accountsCache && Date.now() - accountsCache.at < ACCOUNTS_TTL) return accountsCache.list;
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  const users = data?.users ?? [];
  const names = await resolveDisplayNames(users.map((u) => u.id));
  const list = users.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    name: names.get(u.id) || displayNameOf(u) || "名前未設定",
    testSeed: isTestSeedUser(u),
    active: !isBanned(u),
  }));
  accountsCache = { at: Date.now(), list };
  return list;
}

/**
 * 出欠をとる相手（有効なアカウント）。
 * 一般のイベントは検証用アカウントを除く／検証用アカウントがつくったイベントは検証用アカウントだけ。
 */
export function audienceOf(testSeed: boolean, accounts: Account[]): Account[] {
  return accounts
    .filter((a) => a.active && a.testSeed === testSeed)
    .sort((x, y) => x.name.localeCompare(y.name, "ja"));
}

// ─── 読み書き ───

export async function fetchNotices(admin: NoticesAdmin): Promise<Notice[]> {
  const { data, error } = await admin.from(EVENTS_TABLE).select("id, data").eq("record_type", NOTICE_TYPE);
  check(error);
  return ((data ?? []) as { id: string; data: unknown }[])
    .map((r) => normalizeNotice(r.id, r.data))
    .filter((n): n is Notice => n !== null);
}

export async function fetchNotice(admin: NoticesAdmin, id: string): Promise<Notice | null> {
  const { data, error } = await admin
    .from(EVENTS_TABLE)
    .select("id, data")
    .eq("id", id)
    .eq("record_type", NOTICE_TYPE)
    .maybeSingle();
  check(error);
  return data ? normalizeNotice(data.id, data.data) : null;
}

export async function saveNotice(admin: NoticesAdmin, n: Notice, isNew: boolean): Promise<void> {
  // 見るためのリンク（url）は保存しない
  const { id, attachments, ...rest } = n;
  const data = {
    ...rest,
    attachments: attachments.map((a) => ({ path: a.path, name: a.name, kind: a.kind, mime: a.mime, size: a.size, uploadedAt: a.uploadedAt })),
  };
  if (isNew) {
    const { error } = await admin.from(EVENTS_TABLE).insert({ id, record_type: NOTICE_TYPE, data });
    check(error);
  } else {
    const { error } = await admin
      .from(EVENTS_TABLE)
      .update({ data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("record_type", NOTICE_TYPE);
    check(error);
  }
}

/** 自分が開いたお知らせのid */
export async function fetchMyReadIds(admin: NoticesAdmin, userId: string): Promise<Set<string>> {
  const { data, error } = await admin
    .from(EVENTS_TABLE)
    .select("data")
    .eq("record_type", NOTICE_READ_TYPE)
    .eq("data->>userId", userId);
  check(error);
  const out = new Set<string>();
  for (const r of (data ?? []) as { data: { noticeId?: unknown } | null }[]) {
    if (typeof r.data?.noticeId === "string") out.add(r.data.noticeId);
  }
  return out;
}

export async function markRead(admin: NoticesAdmin, noticeId: string, userId: string): Promise<void> {
  const { error } = await admin.from(EVENTS_TABLE).upsert({
    id: readRowId(noticeId, userId),
    record_type: NOTICE_READ_TYPE,
    data: { noticeId, userId, at: new Date().toISOString() },
    updated_at: new Date().toISOString(),
  });
  check(error);
}

/** 自分の出欠（お知らせid → 出欠） */
export async function fetchMyRsvps(admin: NoticesAdmin, userId: string): Promise<Map<string, NoticeRsvp>> {
  const { data, error } = await admin
    .from(EVENTS_TABLE)
    .select("data")
    .eq("record_type", NOTICE_RSVP_TYPE)
    .eq("data->>userId", userId);
  check(error);
  const out = new Map<string, NoticeRsvp>();
  for (const r of (data ?? []) as { data: unknown }[]) {
    const v = normalizeRsvp(r.data);
    if (v) out.set(v.noticeId, v);
  }
  return out;
}

/** そのイベントの出欠すべて（一覧を見られる人にだけ使う） */
export async function fetchRsvpsFor(admin: NoticesAdmin, noticeId: string): Promise<NoticeRsvp[]> {
  const { data, error } = await admin
    .from(EVENTS_TABLE)
    .select("data")
    .eq("record_type", NOTICE_RSVP_TYPE)
    .eq("data->>noticeId", noticeId);
  check(error);
  return ((data ?? []) as { data: unknown }[])
    .map((r) => normalizeRsvp(r.data))
    .filter((v): v is NoticeRsvp => v !== null);
}

/** 出欠のあるイベントのid（すべての出欠の行・メールの対象を数えるときに使う） */
export async function fetchAllRsvps(admin: NoticesAdmin): Promise<NoticeRsvp[]> {
  const { data, error } = await admin.from(EVENTS_TABLE).select("data").eq("record_type", NOTICE_RSVP_TYPE);
  check(error);
  return ((data ?? []) as { data: unknown }[])
    .map((r) => normalizeRsvp(r.data))
    .filter((v): v is NoticeRsvp => v !== null);
}

export async function saveRsvp(admin: NoticesAdmin, r: NoticeRsvp): Promise<void> {
  const { error } = await admin.from(EVENTS_TABLE).upsert({
    id: rsvpRowId(r.noticeId, r.userId),
    record_type: NOTICE_RSVP_TYPE,
    data: r,
    updated_at: new Date().toISOString(),
  });
  check(error);
}

export async function fetchAttendance(admin: NoticesAdmin, noticeId: string): Promise<NoticeAttendance | null> {
  const { data, error } = await admin
    .from(EVENTS_TABLE)
    .select("data")
    .eq("id", attendanceRowId(noticeId))
    .eq("record_type", NOTICE_ATTENDANCE_TYPE)
    .maybeSingle();
  check(error);
  return data ? normalizeAttendance(data.data) : null;
}

export async function fetchAllAttendance(admin: NoticesAdmin): Promise<NoticeAttendance[]> {
  const { data, error } = await admin.from(EVENTS_TABLE).select("data").eq("record_type", NOTICE_ATTENDANCE_TYPE);
  check(error);
  return ((data ?? []) as { data: unknown }[])
    .map((r) => normalizeAttendance(r.data))
    .filter((v): v is NoticeAttendance => v !== null);
}

export async function saveAttendance(admin: NoticesAdmin, att: NoticeAttendance): Promise<void> {
  const { error } = await admin.from(EVENTS_TABLE).upsert({
    id: attendanceRowId(att.noticeId),
    record_type: NOTICE_ATTENDANCE_TYPE,
    data: att,
    updated_at: new Date().toISOString(),
  });
  check(error);
}

export async function deleteAttendance(admin: NoticesAdmin, noticeId: string): Promise<void> {
  const { error } = await admin
    .from(EVENTS_TABLE)
    .delete()
    .eq("id", attendanceRowId(noticeId))
    .eq("record_type", NOTICE_ATTENDANCE_TYPE);
  check(error);
}

// ─── 貼ったもの（Storage）───

/** 置き場の中の、そのお知らせのファイルを全部消す（途中で止まったアップロードの残りも含む） */
export async function removeNoticeFolder(admin: NoticesAdmin, noticeId: string): Promise<void> {
  const folder = `${NOTICE_FILES_PREFIX}/${noticeId}`;
  const { data, error } = await admin.storage.from(EVENT_PHOTOS_BUCKET).list(folder, { limit: 1000 });
  if (error) {
    if (isBucketNotFound(error.message)) return; // 置き場が無い＝消すものも無い
    throw new Error(error.message);
  }
  const paths = (data ?? []).filter((o) => o.name).map((o) => `${folder}/${o.name}`);
  if (paths.length === 0) return;
  const { error: rmErr } = await admin.storage.from(EVENT_PHOTOS_BUCKET).remove(paths);
  if (rmErr) throw new Error(`貼ったファイルを消せませんでした: ${rmErr.message}`);
}

/**
 * 消す（つくった人・院長）。貼ったもの→出欠・開いた印・メールの印→本体 の順。
 * **参加の記録（確定済み）は残す**（院長と任された幹部が管理画面で見る記録のため）。
 */
export async function deleteNoticeCascade(admin: NoticesAdmin, n: Notice): Promise<void> {
  await removeNoticeFolder(admin, n.id);
  for (const t of [NOTICE_RSVP_TYPE, NOTICE_READ_TYPE, NOTICE_MAIL_SENT_TYPE]) {
    const { error } = await admin.from(EVENTS_TABLE).delete().eq("record_type", t).eq("data->>noticeId", n.id);
    check(error);
  }
  const { error } = await admin.from(EVENTS_TABLE).delete().eq("id", n.id).eq("record_type", NOTICE_TYPE);
  check(error);
}

/** 見るためのリンクを付ける（10分だけ有効）。Wordはダウンロードになるよう名前を付ける */
export async function withSignedAttachments(
  admin: NoticesAdmin,
  n: Notice
): Promise<{ notice: Notice; bucketMissing: boolean }> {
  if (n.attachments.length === 0) return { notice: n, bucketMissing: false };
  const { urls, bucketMissing } = await signBucketPaths(
    admin,
    EVENT_PHOTOS_BUCKET,
    n.attachments.map((a) => a.path),
    NOTICE_FILE_SIGN_TTL
  );
  const attachments: NoticeAttachment[] = n.attachments.map((a) => {
    const signed = urls.get(a.path) ?? "";
    const url = signed && a.kind === "docx" ? `${signed}&download=${encodeURIComponent(a.name)}` : signed;
    return { ...a, url };
  });
  return { notice: { ...n, attachments }, bucketMissing };
}

// ─── メール（228 §5）───

export type NoticesMailSkip = "feature_off" | "flag_off" | "smtp_not_configured";

/** 送れる状態か（機能ON・メールの切り替えON・送信設定あり）。保存されたスイッチだけを見る（プレビューは関係ない） */
export async function noticesMailReady(): Promise<{ ready: true } | { ready: false; reason: NoticesMailSkip }> {
  if (!(await serverFeatureEnabled("notices"))) return { ready: false, reason: "feature_off" };
  if (!(await serverFeatureEnabled("notices_email"))) return { ready: false, reason: "flag_off" };
  if (!isMailConfigured()) return { ready: false, reason: "smtp_not_configured" };
  return { ready: true };
}

export function noticeLink(id: string): string {
  return `${portalOrigin()}/notices?id=${encodeURIComponent(id)}`;
}

function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, " ").trim();
}

/** 新しいお知らせ・イベントのメール（題名とリンクだけ・228 §5） */
export function buildNewNoticeMail(n: Pick<Notice, "id" | "kind" | "title">): { subject: string; text: string } {
  const label = NOTICE_KIND_LABEL[n.kind];
  const title = oneLine(n.title);
  return {
    subject: `【南草津皮フ科】新しい${label}：${title}`,
    text: [
      `新しい${label}があります。`,
      "",
      `題名：${title}`,
      "",
      "こちらから開けます：",
      noticeLink(n.id),
      "",
      "（このメールには題名とリンクだけを載せています。中身はポータルでご覧ください）",
    ].join("\n"),
  };
}

/** 出欠の締切前の知らせ（題名とリンクだけ・228 §5） */
export function buildReminderMail(n: Pick<Notice, "id" | "title">): { subject: string; text: string } {
  const title = oneLine(n.title);
  return {
    subject: `【南草津皮フ科】出欠の回答のお願い：${title}`,
    text: [
      "イベントの出欠の締切が近づいています。まだ回答していない方にお送りしています。",
      "",
      `題名：${title}`,
      "",
      "回答はこちらから：",
      noticeLink(n.id),
      "",
      "（このメールには題名とリンクだけを載せています）",
    ].join("\n"),
  };
}

export type NewNoticeMailOutcome = {
  status: "sent" | "skipped";
  reason?: string;
  sent: number;
  failed: number;
};

/**
 * 新しいお知らせ・イベントをメールでも知らせる（つくった直後に1回だけ）。
 * 検証用アカウントがつくったもの・検証用アカウントあては送らない。つくった本人にも送らない。
 * 送った記録は件数だけ（宛先は残さない）。
 */
export async function sendNewNoticeMails(admin: NoticesAdmin, n: Notice): Promise<NewNoticeMailOutcome> {
  if (n.testSeed) return { status: "skipped", reason: "test_seed", sent: 0, failed: 0 };
  const ready = await noticesMailReady();
  if (!ready.ready) return { status: "skipped", reason: ready.reason, sent: 0, failed: 0 };
  // 2回送らない（同じお知らせで2度呼ばれても）
  const { data: prev } = await admin
    .from(EVENTS_TABLE)
    .select("id")
    .eq("id", newMailSentRowId(n.id))
    .maybeSingle();
  if (prev) return { status: "skipped", reason: "already", sent: 0, failed: 0 };
  // 先に印を置く（送っている途中にもう一度呼ばれても二重にならない）
  const startedAt = new Date().toISOString();
  const { error: markErr } = await admin.from(EVENTS_TABLE).insert({
    id: newMailSentRowId(n.id),
    record_type: NOTICE_MAIL_SENT_TYPE,
    data: { noticeId: n.id, stage: "new", startedAt, sent: 0, failed: 0 },
  });
  if (markErr) return { status: "skipped", reason: "already", sent: 0, failed: 0 };

  const accounts = await loadAccounts(admin);
  const to = audienceOf(false, accounts).filter((a) => a.id !== n.authorId && a.email);
  const mail = buildNewNoticeMail(n);
  let sent = 0;
  let failed = 0;
  for (const a of to) {
    const r = await sendPortalMail(a.email, mail.subject, mail.text);
    if (r.ok) sent += 1;
    else failed += 1;
  }
  await admin
    .from(EVENTS_TABLE)
    .update({ data: { noticeId: n.id, stage: "new", startedAt, finishedAt: new Date().toISOString(), sent, failed } })
    .eq("id", newMailSentRowId(n.id));
  console.log(`[notices] 新しい${NOTICE_KIND_LABEL[n.kind]}のメール sent=${sent} failed=${failed}`);
  return { status: "sent", sent, failed };
}

export type NoticeReminderOutcome = {
  status: "sent" | "skipped";
  reason?: string;
  /** 今日が知らせる日のイベント×未回答の人 */
  due: number;
  sent: number;
  alreadySent: number;
  noEmail: number;
  failures: string[];
};

/**
 * 出欠の締切の3日前・前日に、まだ答えていない人へメールで知らせる（朝8時の定時処理・228 §5）。
 * アプリ内の知らせはこの処理では配らない（本人の画面が締切から計算して出す＝ログインすれば必ず見える）。
 */
export async function dispatchNoticeReminders(admin: NoticesAdmin, today: string): Promise<NoticeReminderOutcome> {
  const base: NoticeReminderOutcome = { status: "skipped", due: 0, sent: 0, alreadySent: 0, noEmail: 0, failures: [] };
  const ready = await noticesMailReady();
  if (!ready.ready) return { ...base, reason: ready.reason };

  const events = (await fetchNotices(admin)).filter((n) => !n.testSeed && reminderStageFor(n, today));
  if (events.length === 0) return { ...base, status: "sent" };

  const rsvps = await fetchAllRsvps(admin);
  const answered = new Set(rsvps.map((r) => `${r.noticeId}:${r.userId}`));
  const { data: sentRows, error } = await admin
    .from(EVENTS_TABLE)
    .select("id")
    .eq("record_type", NOTICE_MAIL_SENT_TYPE);
  check(error);
  const sentIds = new Set(((sentRows ?? []) as { id: string }[]).map((r) => String(r.id)));
  const audience = audienceOf(false, await loadAccounts(admin));

  const out: NoticeReminderOutcome = { ...base, status: "sent" };
  for (const n of events) {
    const stage = reminderStageFor(n, today) as ReminderStage;
    const mail = buildReminderMail(n);
    for (const a of audience) {
      if (answered.has(`${n.id}:${a.id}`)) continue;
      out.due += 1;
      const rowId = reminderSentRowId(n.id, stage, n.rsvpDeadline, a.id);
      if (sentIds.has(rowId)) {
        out.alreadySent += 1;
        continue;
      }
      if (!a.email) {
        out.noEmail += 1;
        continue;
      }
      const r = await sendPortalMail(a.email, mail.subject, mail.text);
      if (!r.ok) {
        // 送れなかった人は印を残さない（同じ日にもう一度呼ばれたら試し直せる）
        out.failures.push(`${stage}: ${r.error}`);
        continue;
      }
      const at = new Date().toISOString();
      const { error: markErr } = await admin.from(EVENTS_TABLE).upsert({
        id: rowId,
        record_type: NOTICE_MAIL_SENT_TYPE,
        // 本文・宛先は残さない（誰の・どのお知らせの・どの段を・いつ）
        data: { noticeId: n.id, userId: a.id, stage, deadline: n.rsvpDeadline, sentAt: at },
        updated_at: at,
      });
      if (markErr) out.failures.push(`${stage}: 送った印を残せませんでした（${markErr.message}）`);
      out.sent += 1;
    }
  }
  return out;
}

// ─── 検証用データの一括削除（228 §6・lib/test-seed-run-server.ts から呼ぶ）───

export type NoticeSeedTargets = {
  /** 消す行（record_type ごと） */
  rows: { id: string; record_type: string }[];
  /** 貼ったファイルの置き場ごと消すお知らせ */
  folders: string[];
  /** 一般のイベントの参加の記録から、検証用アカウントだけを外すもの */
  attendanceFixes: NoticeAttendance[];
};

/**
 * 検証用アカウントがつくったお知らせ・イベント（と、その出欠・開いた印・メールの印・参加の記録・ファイル）と、
 * 検証用アカウントの出欠・開いた印を集める。一般のイベントの参加の記録は消さずに、検証用アカウントだけを外す。
 */
export async function collectNoticeSeedTargets(admin: NoticesAdmin, testIds: ReadonlySet<string>): Promise<NoticeSeedTargets> {
  const { data, error } = await admin
    .from(EVENTS_TABLE)
    .select("id, record_type, data")
    .in("record_type", [NOTICE_TYPE, NOTICE_RSVP_TYPE, NOTICE_READ_TYPE, NOTICE_ATTENDANCE_TYPE, NOTICE_MAIL_SENT_TYPE]);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return { rows: [], folders: [], attendanceFixes: [] };
    throw new Error(error.message);
  }
  const all = (data ?? []) as { id: string; record_type: string; data: Record<string, unknown> | null }[];
  const testNotices = new Set<string>();
  for (const r of all) {
    if (r.record_type !== NOTICE_TYPE) continue;
    const author = typeof r.data?.authorId === "string" ? r.data.authorId : "";
    if (r.data?.testSeed === true || testIds.has(author)) testNotices.add(r.id);
  }
  const rows: NoticeSeedTargets["rows"] = [];
  const attendanceFixes: NoticeAttendance[] = [];
  for (const r of all) {
    const noticeId = typeof r.data?.noticeId === "string" ? r.data.noticeId : "";
    const userId = typeof r.data?.userId === "string" ? r.data.userId : "";
    if (r.record_type === NOTICE_TYPE) {
      if (testNotices.has(r.id)) rows.push({ id: r.id, record_type: r.record_type });
      continue;
    }
    if (r.record_type === NOTICE_ATTENDANCE_TYPE) {
      const att = normalizeAttendance(r.data);
      if (!att) continue;
      if (att.testSeed || testNotices.has(att.noticeId)) rows.push({ id: r.id, record_type: r.record_type });
      else if (att.userIds.some((u) => testIds.has(u))) attendanceFixes.push(att);
      continue;
    }
    if (testNotices.has(noticeId) || testIds.has(userId)) rows.push({ id: r.id, record_type: r.record_type });
  }
  return { rows, folders: Array.from(testNotices), attendanceFixes };
}

/** 対象一覧の件数（一括削除の画面に出す） */
export function countNoticeSeedTargets(t: NoticeSeedTargets): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of t.rows) out[r.record_type] = (out[r.record_type] ?? 0) + 1;
  if (t.attendanceFixes.length > 0) out.notice_attendance_fix = t.attendanceFixes.length;
  return out;
}

export async function purgeNoticeSeedTargets(
  admin: NoticesAdmin,
  t: NoticeSeedTargets,
  testIds: ReadonlySet<string>,
  by: string
): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  const add = (k: string) => (deleted[k] = (deleted[k] ?? 0) + 1);
  // 1. ファイル（置き場ごと）
  for (const id of t.folders) await removeNoticeFolder(admin, id);
  // 2. 行
  for (const r of t.rows) {
    const { error } = await admin.from(EVENTS_TABLE).delete().eq("id", r.id).eq("record_type", r.record_type);
    check(error);
    add(r.record_type);
  }
  // 3. 一般のイベントの参加の記録から検証用アカウントだけを外す（記録そのものは残す）
  for (const att of t.attendanceFixes) {
    const userIds = att.userIds.filter((u) => !testIds.has(u));
    const names = Object.fromEntries(Object.entries(att.names).filter(([k]) => !testIds.has(k)));
    await saveAttendance(admin, { ...att, userIds, names, updatedAt: new Date().toISOString(), updatedBy: by });
    add("notice_attendance_fix");
  }
  if (t.folders.length > 0) deleted.notice_files = t.folders.length;
  return deleted;
}
