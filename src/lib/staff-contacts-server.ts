// スタッフ連絡先のサーバー共通部（指示書169・サーバー専用）
//
// 保護は149（メンバーノート）/154（書類進捗ボード）と同型:
//   RLS全拒否テーブル clinic_staff_contacts ＋ service-role のみ ＋ 指名制。
//   閲覧 = 管理者 or menu_access の指名リストに含まれる（157の仕組みを流用）。
//   編集 = **管理者のみ**（169-1-3: 誤って書き換えられると本人に連絡が取れなくなる）。
//   fail-close: 設定が無い・壊れている・取得に失敗したときは **管理者のみ**。
//   非許可・未ログインには **404**（403だと機能の存在が分かるため）。
//
// 【scope（159-Aの「全員」モード）を読まない】
// 住所・電話番号に加えて、本人ではない家族・保証人の個人情報を含む。
// 「全員が開ける」状態を作れる口そのものを持たせない（閉じる方向にのみ倒す）。
//
// 【新規テーブルを作った理由（169-3-1）】
// 159の操作ログは既存テーブルに record_type を足してSQL実行を不要にしたが、今回は分けた。
//   ・content_store に相乗りすると、秘匿は content-store-policy の server-only キー
//     1行に依存する。専用テーブルなら**テーブルそのものがRLS全拒否**で、
//     キー登録の漏れとは無関係に守られる
//   ・操作ログを行として持てる（切り捨てが起きない・created_at でまとめて消せる）。
//     1キーのJSONに溜める方式だと上限を決めて古い記録から失うことになる
//   ・機微データの置き場所を機能ごとに分け、事故の波及を断つ（149の判断と同じ）
// テーブル未作成の間は画面が案内表示に変わるだけで、開く方向には倒れない。

import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "./supabase-admin";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import { loadMenuAllowedUserIds } from "./menu-access-server";
import { MENU_STAFF_CONTACTS } from "./menu-access";
import {
  normalizeStaffContact,
  normalizeStaffContactLog,
  type StaffContact,
  type StaffContactLog,
  type StaffContactLogChange,
} from "./staff-contacts";

export { ServiceRoleMissingError };

export const STAFF_CONTACTS_TABLE = "clinic_staff_contacts";

const CONTACT_TYPE = "contact";
const LOG_TYPE = "log";

export type StaffContactsAdminClient = ReturnType<
  typeof createSupabaseAdminClient
>;

/** テーブル未作成（SQL未実行）を表す印。画面で案内を出すために区別する */
export class StaffContactsTableMissingError extends Error {
  constructor() {
    super(
      "スタッフ連絡先のテーブルがまだ作られていません。交付済みのSQLを実行してください。"
    );
    this.name = "StaffContactsTableMissingError";
  }
}

function isMissingTable(message: string | undefined): boolean {
  const m = (message ?? "").toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("could not find the table") ||
    m.includes("schema cache")
  );
}

/**
 * そのアカウントが**今も有効か**を service-role で確かめる。
 * 無効化は Supabase Auth の ban（banned_until）で行っている
 *（/api/admin/staff-accounts の ban_duration: "87600h"）。
 *
 * 取得できない・例外・banned_until が未来 → すべて false（開けない方向）。
 *
 * doc-tasks-server.ts にも同等の実装があるが、161〜168で固まっている既存機能に
 * 手を入れないためにここへ置いた（共通化するなら両方を同時に検証できるときに行う）。
 */
async function isActiveAccount(
  admin: StaffContactsAdminClient,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    const bannedUntil = (data.user as { banned_until?: string | null })
      .banned_until;
    if (!bannedUntil) return true;
    const until = new Date(bannedUntil).getTime();
    // 日付として読めない値は「無効かもしれない」とみなして閉じる
    if (Number.isNaN(until)) return false;
    return until <= Date.now();
  } catch {
    return false;
  }
}

export type StaffContactsAuth =
  | { ok: false }
  | {
      ok: true;
      admin: StaffContactsAdminClient;
      userId: string;
      userEmail: string;
      /** 編集できるのは管理者だけ（閲覧できる＝編集できる、ではない） */
      isAdmin: boolean;
      /** 現在の指名リスト（管理者向けの設定画面でのみ使う） */
      viewerUserIds: string[];
    };

export async function authorizeStaffContacts(): Promise<StaffContactsAuth> {
  const { user } = await getSessionUser();
  if (!user) return { ok: false };

  let admin: StaffContactsAdminClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false }; // service-role未設定＝誰も入れない
  }

  const isAdmin = isAdminUser(user);

  // 157の menu_access をそのまま流用。未設定（null）は空扱い＝管理者のみ。
  // 読み取りに失敗したときも menu-access-server 側が空を返す（fail-close）。
  let viewerUserIds: string[];
  try {
    viewerUserIds = (await loadMenuAllowedUserIds(MENU_STAFF_CONTACTS)) ?? [];
  } catch {
    return { ok: false }; // 判定できないときは開けない
  }

  const allowed = isAdmin || viewerUserIds.includes(user.id);
  if (!allowed) return { ok: false };

  // 無効化されたアカウントを通さない（指名リストに残ったまま無効化された人を通さない）。
  // 管理者も例外にしない。
  if (!(await isActiveAccount(admin, user.id))) return { ok: false };

  return {
    ok: true,
    admin,
    userId: user.id,
    userEmail: user.email ?? "",
    isAdmin,
    viewerUserIds,
  };
}

// ─── 連絡先の読み書き ───

export async function fetchAllStaffContacts(
  admin: StaffContactsAdminClient
): Promise<{ contacts: StaffContact[]; tableMissing: boolean }> {
  const { data, error } = await admin
    .from(STAFF_CONTACTS_TABLE)
    .select("id, data")
    .eq("record_type", CONTACT_TYPE);
  if (error) {
    if (isMissingTable(error.message)) return { contacts: [], tableMissing: true };
    throw new Error(error.message);
  }
  const contacts = (data ?? [])
    .map((r) => normalizeStaffContact(r.id as string, r.data))
    .filter((c): c is StaffContact => c !== null);
  return { contacts, tableMissing: false };
}

export async function fetchStaffContactRow(
  admin: StaffContactsAdminClient,
  id: string
): Promise<StaffContact | null> {
  const { data, error } = await admin
    .from(STAFF_CONTACTS_TABLE)
    .select("id, data")
    .eq("id", id)
    .eq("record_type", CONTACT_TYPE)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) throw new StaffContactsTableMissingError();
    throw new Error(error.message);
  }
  if (!data) return null;
  return normalizeStaffContact(data.id as string, data.data);
}

export async function saveStaffContactRow(
  admin: StaffContactsAdminClient,
  contact: StaffContact,
  updatedBy: string,
  isNew: boolean
): Promise<void> {
  const { id, ...data } = contact;
  const row = {
    id,
    record_type: CONTACT_TYPE,
    data,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };
  const { error } = isNew
    ? await admin.from(STAFF_CONTACTS_TABLE).insert(row)
    : await admin
        .from(STAFF_CONTACTS_TABLE)
        .update(row)
        .eq("id", id)
        .eq("record_type", CONTACT_TYPE);
  if (error) {
    if (isMissingTable(error.message)) throw new StaffContactsTableMissingError();
    throw new Error(error.message);
  }
}

export async function deleteStaffContactRow(
  admin: StaffContactsAdminClient,
  id: string
): Promise<void> {
  const { error } = await admin
    .from(STAFF_CONTACTS_TABLE)
    .delete()
    .eq("id", id)
    .eq("record_type", CONTACT_TYPE);
  if (error) {
    if (isMissingTable(error.message)) throw new StaffContactsTableMissingError();
    throw new Error(error.message);
  }
}

/**
 * 退職者（無効化されたアカウント）の userId 一覧（169-3-4）。
 *
 * **記録は自動削除しない。** 一覧で既定は隠し、「退職者も表示」で見られるようにするための印。
 * 取得に失敗したときは空を返す＝誰も退職者扱いにしない（隠す方に倒すと
 * 「連絡先が消えた」ように見えてしまう。閲覧者は既に認可済みなので秘匿の問題は生じない）。
 */
export async function loadRetiredUserIds(
  admin: StaffContactsAdminClient
): Promise<string[]> {
  try {
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error || !data?.users) return [];
    const now = Date.now();
    return data.users
      .filter((u) => {
        const until = (u as { banned_until?: string | null }).banned_until;
        if (!until) return false;
        const t = new Date(until).getTime();
        return !Number.isNaN(t) && t > now;
      })
      .map((u) => u.id);
  } catch {
    return [];
  }
}

// ─── 操作ログ（指示書159-Bと同じ仕組み）───

function newLogId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 操作ログを1件残す。
 * **記録に失敗しても業務は止めない**（159と同じ。記録できなかったことはサーバーログに残す）。
 */
export async function recordStaffContactLog(
  admin: StaffContactsAdminClient,
  entry: {
    by: string;
    action: string;
    target: string;
    changes: StaffContactLogChange[];
  }
): Promise<void> {
  try {
    const at = new Date().toISOString();
    await admin.from(STAFF_CONTACTS_TABLE).insert({
      id: newLogId(),
      record_type: LOG_TYPE,
      data: { at, ...entry },
      updated_by: entry.by,
      updated_at: at,
    });
  } catch (e) {
    console.error(
      "[staff-contacts] 操作ログを記録できませんでした:",
      e instanceof Error ? e.message : e
    );
  }
}

/**
 * 操作ログの取得（**時系列のみ**・新しい順）。管理者のみ＝呼び出し側で保証する。
 *
 * 159-B-5と同じ線: 人別の集計・ランキング・比較・並び替えの口はここに作らない。
 * 絞り込みは日付の範囲だけ（保持期間の運用に必要なため）。
 */
export async function fetchStaffContactLogs(
  admin: StaffContactsAdminClient,
  options: { limit: number; before?: string }
): Promise<{ logs: StaffContactLog[]; tableMissing: boolean }> {
  let query = admin
    .from(STAFF_CONTACTS_TABLE)
    .select("id, data, created_at")
    .eq("record_type", LOG_TYPE)
    .order("created_at", { ascending: false })
    .limit(options.limit);
  if (options.before) query = query.lt("created_at", options.before);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error.message)) return { logs: [], tableMissing: true };
    throw new Error(error.message);
  }
  const logs = (data ?? [])
    .map((r) => normalizeStaffContactLog(r.id as string, r.data))
    .filter((l): l is StaffContactLog => l !== null);
  return { logs, tableMissing: false };
}

// ─── 操作ログ用の差分 ───
//
// 【値そのものを残さない】
// 住所・電話番号・緊急連絡先は、それ自体が守るべき情報である。
// 「変更前 → 変更後」を実際の値で残すと、削除した連絡先の中身が操作ログに
// 永久に残り、ログが第二の台帳になってしまう。
// よって記録するのは **どの項目が「空 ⇄ 記載あり」または「変更された」か** だけ。
// 氏名だけは対象を識別するために実際の値を残す。

/** 値の状態を「空 / 記載あり」に丸める */
function presence(v: string): string {
  return v ? "記載あり" : "空";
}

function addPresenceChange(
  changes: StaffContactLogChange[],
  field: string,
  before: string,
  after: string
): void {
  if (before === after) return;
  changes.push({
    field,
    before: presence(before),
    // 中身だけが変わったときも「変わった」と分かるようにする
    after: before && after ? "記載あり（変更）" : presence(after),
  });
}

/** 緊急連絡先はまとめて「何件登録されているか」だけを見る（第三者の情報のため） */
function emergencyDigest(c: StaffContact): string {
  return c.emergency
    .map((e) => `${e.name}|${e.relation}|${e.phone}|${e.memo}`)
    .join("//");
}

export function buildStaffContactChanges(
  prev: StaffContact,
  next: StaffContact
): StaffContactLogChange[] {
  const changes: StaffContactLogChange[] = [];

  // 氏名だけは対象の識別に必要なので実際の値を残す
  if (prev.name !== next.name) {
    changes.push({ field: "氏名", before: prev.name, after: next.name });
  }
  if (prev.userId !== next.userId) {
    changes.push({
      field: "アカウントの紐付け",
      before: prev.userId ? "あり" : "なし",
      after: next.userId ? "あり" : "なし",
    });
  }
  addPresenceChange(changes, "住所", prev.address, next.address);
  addPresenceChange(changes, "電話番号（携帯）", prev.phoneMobile, next.phoneMobile);
  addPresenceChange(changes, "電話番号（自宅）", prev.phoneHome, next.phoneHome);
  addPresenceChange(changes, "メールアドレス", prev.privateEmail, next.privateEmail);
  addPresenceChange(changes, "生年月日", prev.birthday, next.birthday);
  addPresenceChange(changes, "入職日", prev.joinedOn, next.joinedOn);
  addPresenceChange(changes, "備考", prev.memo, next.memo);

  const beforeDigest = emergencyDigest(prev);
  const afterDigest = emergencyDigest(next);
  if (beforeDigest !== afterDigest) {
    changes.push({
      field: "緊急連絡先・保証人",
      before: `${prev.emergency.length}件`,
      after: `${next.emergency.length}件`,
    });
  }
  return changes;
}

/** 登録・削除の記録用に、そのときの内容を項目ごとに並べる（値は残さない） */
export function staffContactSnapshot(
  contact: StaffContact
): StaffContactLogChange[] {
  const empty: StaffContact = {
    ...contact,
    name: "",
    userId: "",
    address: "",
    phoneMobile: "",
    phoneHome: "",
    privateEmail: "",
    birthday: "",
    joinedOn: "",
    memo: "",
    emergency: [],
  };
  return buildStaffContactChanges(empty, contact);
}
