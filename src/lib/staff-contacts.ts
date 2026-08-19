// スタッフ連絡先（指示書169）— 型・正規化・クライアント呼び出し
//
// 【この機能が扱うもの】
// 本人の連絡先（住所・電話・私用メール・生年月日・入職日・備考）と、
// 緊急連絡先／保証人（氏名・続柄・電話・備考）。
//
// 【保存しないもの（169-2-3）— 項目として存在させない】
//   ・マイナンバー
//   ・銀行口座番号
//   ・保険証番号
//   ・家族の住所・生年月日・勤務先
// これらは「入力させない」ではなく **型に無い**。必要な場面はこのアプリの外で扱う。
// 指示書154の患者情報最小化（患者氏名フィールドを作らない）と同じ考え方で、
// 上のどれかを足したくなったときは、まず指示書に立ち返ること。
//
// 【緊急連絡先を最小限にする理由（169-2-2）】
// 登録される家族・保証人は、自分の情報がアプリに入っていることを知らない可能性がある。
// 目的は「緊急時に連絡が取れること」だけなので、それ以上の項目を持たない。

/** 緊急連絡先・保証人（第三者の情報。最小限） */
export type EmergencyContact = {
  /** 氏名 */
  name: string;
  /** 続柄（母・配偶者 など） */
  relation: string;
  /** 電話番号 */
  phone: string;
  /** 備考（自由記述） */
  memo: string;
};

export type StaffContact = {
  id: string;
  /**
   * アカウント（Supabase Auth の userId）との紐付け。
   * 空でも登録できる（アカウントをまだ作っていない人・作らない人のため）。
   * 退職者（無効化アカウント）の判定にもこの値を使う。
   */
  userId: string;
  /** 氏名（必須） */
  name: string;
  /** 住所 */
  address: string;
  /** 電話番号（携帯） */
  phoneMobile: string;
  /** 電話番号（自宅） */
  phoneHome: string;
  /** メールアドレス（アカウントとは別の私用のもの） */
  privateEmail: string;
  /** 生年月日 YYYY-MM-DD */
  birthday: string;
  /** 入職日 YYYY-MM-DD */
  joinedOn: string;
  /** 備考（自由記述） */
  memo: string;
  /** 緊急連絡先・保証人（複数可） */
  emergency: EmergencyContact[];
  createdAt: string;
  updatedAt: string;
};

export const NAME_MAX = 60;
export const ADDRESS_MAX = 200;
export const PHONE_MAX = 30;
export const EMAIL_MAX = 200;
export const MEMO_MAX = 1000;
export const RELATION_MAX = 20;
/** 緊急連絡先の上限（本人・保証人・予備で足りる） */
export const EMERGENCY_MAX = 3;

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** YYYY-MM-DD だけを通す（それ以外は空） */
export function ymd(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function normalizeEmergency(raw: unknown): EmergencyContact[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, EMERGENCY_MAX)
    .map((v) => {
      const g = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      return {
        name: text(g.name, NAME_MAX).trim(),
        relation: text(g.relation, RELATION_MAX).trim(),
        phone: text(g.phone, PHONE_MAX).trim(),
        memo: text(g.memo, MEMO_MAX),
      };
    })
    // 全部空の行は保存しない（編集画面で行だけ足したときのゴミを残さない）
    .filter((e) => e.name || e.relation || e.phone || e.memo);
}

export function normalizeStaffContact(
  id: string,
  raw: unknown
): StaffContact | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const name = text(g.name, NAME_MAX).trim();
  if (!name) return null; // 氏名が無い行は表示できない
  return {
    id,
    userId: text(g.userId, 100),
    name,
    address: text(g.address, ADDRESS_MAX).trim(),
    phoneMobile: text(g.phoneMobile, PHONE_MAX).trim(),
    phoneHome: text(g.phoneHome, PHONE_MAX).trim(),
    privateEmail: text(g.privateEmail, EMAIL_MAX).trim(),
    birthday: ymd(g.birthday),
    joinedOn: ymd(g.joinedOn),
    memo: text(g.memo, MEMO_MAX),
    emergency: normalizeEmergency(g.emergency),
    createdAt: text(g.createdAt, 40),
    updatedAt: text(g.updatedAt, 40),
  };
}

export function emptyStaffContact(): StaffContact {
  return {
    id: "",
    userId: "",
    name: "",
    address: "",
    phoneMobile: "",
    phoneHome: "",
    privateEmail: "",
    birthday: "",
    joinedOn: "",
    memo: "",
    emergency: [],
    createdAt: "",
    updatedAt: "",
  };
}

// ─── 並び替え・絞り込み（純関数）───

/** 氏名の五十音順（同名は登録順）。並び替えの選択肢は設けない */
export function sortStaffContacts(list: StaffContact[]): StaffContact[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "ja") ||
        a.createdAt.localeCompare(b.createdAt)
    );
}

/**
 * キーワード絞り込み（169-3-3「人数が増えたときに探せるように」）。
 * 対象は氏名・電話・私用メール・住所・緊急連絡先の氏名／続柄／電話。
 * 生年月日と備考は入れない（探す手がかりにならず、打ち間違いで意図しない人が出るため）。
 */
export function matchStaffContact(c: StaffContact, keyword: string): boolean {
  const q = keyword.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    c.name,
    c.phoneMobile,
    c.phoneHome,
    c.privateEmail,
    c.address,
    ...c.emergency.flatMap((e) => [e.name, e.relation, e.phone]),
  ]
    .join("")
    .toLowerCase();
  return hay.includes(q);
}

// ─── 操作ログ（指示書159-Bと同じ仕組み）───
//
// 【値そのものを残さない】
// 159では院内メモの本文だけを「記載あり／空」に丸めたが、この機能は
// **住所・電話番号・緊急連絡先そのものが機微**なので、変更内容は
// 「空 → 記載あり」「記載あり → 記載あり（変更）」の粒度だけを残す。
// 誰がいつどの項目を触ったかは調査に足り、
// 削除した連絡先の中身が操作ログに永久に残る（＝第二の台帳になる）ことを防げる。
// 氏名だけは対象を識別するために実際の値を残す。

export type StaffContactLogChange = {
  field: string;
  before: string;
  after: string;
};

export type StaffContactLog = {
  id: string;
  /** 日時 ISO */
  at: string;
  /** 操作した人（メール or userId・サーバーが確定させる） */
  by: string;
  /** 「登録」「更新」「削除」「設定変更」 */
  action: string;
  /** 対象（氏名）。設定変更では空 */
  target: string;
  changes: StaffContactLogChange[];
};

/** 一覧の1ページ件数（時系列のみ・集計はしない） */
export const STAFF_CONTACT_LOG_PAGE_SIZE = 100;

export function normalizeStaffContactLog(
  id: string,
  raw: unknown
): StaffContactLog | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  const rawChanges = Array.isArray(g.changes) ? g.changes : [];
  return {
    id,
    at: text(g.at, 40),
    by: text(g.by, 200),
    action: text(g.action, 40),
    target: text(g.target, NAME_MAX),
    changes: rawChanges.slice(0, 40).map((c) => {
      const e = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      return {
        field: text(e.field, 60),
        before: text(e.before, 200),
        after: text(e.after, 200),
      };
    }),
  };
}

// ─── クライアント → /api/staff-contacts 呼び出しヘルパ ───

export type StaffContactsListResponse = {
  contacts: StaffContact[];
  /** 退職者（無効化されたアカウント）の userId。一覧の既定では隠す（169-3-4） */
  retiredUserIds: string[];
  isAdmin: boolean;
  tableMissing: boolean;
};

async function callApi<T>(
  init: RequestInit & { path?: string; query?: string }
): Promise<T> {
  const { path = "", query = "", ...rest } = init;
  const res = await fetch(`/api/staff-contacts${path}${query}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: rest.body ? { "Content-Type": "application/json" } : undefined,
    ...rest,
  });
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(j.error || `通信に失敗しました (${res.status})`);
  }
  return j;
}

export async function fetchStaffContacts(): Promise<StaffContactsListResponse> {
  return callApi<StaffContactsListResponse>({ method: "GET" });
}

/** 指名リストの取得（管理者のみ） */
export async function fetchStaffContactsConfig(): Promise<{
  viewerUserIds: string[];
}> {
  const j = await callApi<{ viewerUserIds?: string[] }>({
    method: "GET",
    path: "/config",
  });
  return { viewerUserIds: Array.isArray(j.viewerUserIds) ? j.viewerUserIds : [] };
}

/** 指名リストの保存（管理者のみ・サーバー側で操作者自身が必ず含まれる） */
export async function saveStaffContactsConfig(
  viewerUserIds: string[]
): Promise<{ viewerUserIds: string[] }> {
  const j = await callApi<{ viewerUserIds: string[] }>({
    method: "PUT",
    path: "/config",
    body: JSON.stringify({ viewerUserIds }),
  });
  return { viewerUserIds: j.viewerUserIds };
}

/** 登録・更新で送れる項目（id / createdAt / updatedAt はサーバーが決める） */
export type StaffContactInput = Omit<
  StaffContact,
  "id" | "createdAt" | "updatedAt"
>;

export async function createStaffContact(
  input: StaffContactInput
): Promise<StaffContact> {
  const j = await callApi<{ contact: StaffContact }>({
    method: "POST",
    body: JSON.stringify(input),
  });
  return j.contact;
}

export async function patchStaffContact(
  id: string,
  input: StaffContactInput
): Promise<StaffContact> {
  const j = await callApi<{ contact: StaffContact }>({
    method: "PATCH",
    body: JSON.stringify({ id, ...input }),
  });
  return j.contact;
}

export async function deleteStaffContact(id: string): Promise<void> {
  await callApi<{ ok: true }>({
    method: "DELETE",
    query: `?id=${encodeURIComponent(id)}`,
  });
}

/**
 * 操作ログの取得（管理者のみ）。
 * 返るのは新しい順の時系列だけ。集計・並び替えの引数は用意しない（159-B-5）。
 */
export async function fetchStaffContactLogs(before?: string): Promise<{
  logs: StaffContactLog[];
  tableMissing: boolean;
}> {
  const qs = before ? `?before=${encodeURIComponent(before)}` : "";
  const res = await fetch(`/api/admin/staff-contact-logs${qs}`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error("操作ログを取得できませんでした");
  return (await res.json()) as {
    logs: StaffContactLog[];
    tableMissing: boolean;
  };
}
