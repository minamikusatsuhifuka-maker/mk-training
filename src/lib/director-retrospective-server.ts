// 院長の振り返り記録のサーバー共通部（指示書173・サーバー専用）
//
// 保護は149（メンバーノート）/169（スタッフ連絡先）と同型:
//   RLS全拒否テーブル clinic_director_retrospective ＋ service-role のみ。
//   閲覧 = 管理者 or menu_access の指名リスト（157の仕組みを流用・**既定は管理者のみ**）
//   編集・出力 = **管理者のみ**（173-1: 管理者は閲覧・編集、それ以外は不可）
//   fail-close: 設定が無い・壊れている・取得に失敗したときは **管理者のみ**。
//   非許可・未ログインには **404**（存在秘匿。403だと機能の存在が分かる）。
//
// 【scope（159-Aの「全員」モード）を読まない】
// 赤裸々な内容を書く場所（173-1）。「全員が開ける」状態を作れる口そのものを持たせない。
// 指名リストの編集UIも今回は作っていない（判定側に口があるだけ＝実質管理者のみ）。
//
// 【専用テーブルにした理由（173-5）】
// 構造の決まったデータで件数が増える（期×4種類の記録＋操作ログ）。
// content_store の1キーに溜めると上限で古い記録から失うことになる。
// 169と同じく、テーブルそのものがRLS全拒否なのでキー登録の漏れとは無関係に守られる。
// テーブル未作成の間は画面が案内表示に変わるだけで、開く方向には倒れない。

import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "./supabase-admin";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import { loadMenuAllowedUserIds } from "./menu-access-server";
import { MENU_DIRECTOR_RETROSPECTIVE } from "./menu-access";
import { serverGetContentRow } from "./content-store-server";
import { STAFF_PROFILES_INDEX_KEY } from "./staff-profiles";
import {
  PROFILE_ROLE_CONFIG_KEY,
  normalizeProfileRoles,
  resolveRole,
} from "./profile-roles";
import { STAFF_CONTACTS_TABLE } from "./staff-contacts-server";
import {
  RECORD_KINDS,
  emptyRetrospectiveData,
  normalizeRecord,
  normalizeRetrospectiveLog,
  type RecordKind,
  type RetrospectiveData,
  type RetrospectiveLog,
  type RetrospectiveLogChange,
  type RetrospectiveRecord,
  type RosterEntry,
} from "./director-retrospective";

export { ServiceRoleMissingError };

export const RETRO_TABLE = "clinic_director_retrospective";

const LOG_TYPE = "log";

export type RetroAdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** テーブル未作成（SQL未実行）を表す印。画面で案内を出すために区別する */
export class RetrospectiveTableMissingError extends Error {
  constructor() {
    super(
      "振り返り記録のテーブルがまだ作られていません。交付済みのSQLを実行してください。"
    );
    this.name = "RetrospectiveTableMissingError";
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

/** アカウントが今も有効か（169と同じ。取得できない・例外・banned_until が未来 → false） */
async function isActiveAccount(
  admin: RetroAdminClient,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return false;
    const bannedUntil = (data.user as { banned_until?: string | null }).banned_until;
    if (!bannedUntil) return true;
    const until = new Date(bannedUntil).getTime();
    if (Number.isNaN(until)) return false;
    return until <= Date.now();
  } catch {
    return false;
  }
}

export type RetrospectiveAuth =
  | { ok: false }
  | {
      ok: true;
      admin: RetroAdminClient;
      userId: string;
      userEmail: string;
      /** 編集・出力できるのは管理者だけ */
      isAdmin: boolean;
    };

export async function authorizeDirectorRetrospective(): Promise<RetrospectiveAuth> {
  const { user } = await getSessionUser();
  if (!user) return { ok: false };

  let admin: RetroAdminClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false }; // service-role未設定＝誰も入れない
  }

  const isAdmin = isAdminUser(user);

  // 157の menu_access を流用。未設定（null）は空扱い＝管理者のみ。
  let viewerUserIds: string[];
  try {
    viewerUserIds = (await loadMenuAllowedUserIds(MENU_DIRECTOR_RETROSPECTIVE)) ?? [];
  } catch {
    return { ok: false }; // 判定できないときは開けない
  }

  const allowed = isAdmin || viewerUserIds.includes(user.id);
  if (!allowed) return { ok: false };

  // 無効化されたアカウントを通さない。管理者も例外にしない
  if (!(await isActiveAccount(admin, user.id))) return { ok: false };

  return {
    ok: true,
    admin,
    userId: user.id,
    userEmail: user.email ?? "",
    isAdmin,
  };
}

// ─── 記録の読み書き ───

function rowToRecord(row: {
  id: unknown;
  record_type: unknown;
  data: unknown;
}): RetrospectiveRecord | null {
  const kind = row.record_type;
  if (typeof kind !== "string" || !(RECORD_KINDS as string[]).includes(kind)) return null;
  return normalizeRecord(kind as RecordKind, String(row.id ?? ""), row.data);
}

export async function fetchAllRecords(
  admin: RetroAdminClient
): Promise<{ data: RetrospectiveData; tableMissing: boolean }> {
  const { data, error } = await admin
    .from(RETRO_TABLE)
    .select("id, record_type, data")
    .neq("record_type", LOG_TYPE);
  if (error) {
    if (isMissingTable(error.message)) {
      return { data: emptyRetrospectiveData(), tableMissing: true };
    }
    throw new Error(error.message);
  }
  const out = emptyRetrospectiveData();
  for (const row of data ?? []) {
    const rec = rowToRecord(row as { id: unknown; record_type: unknown; data: unknown });
    if (!rec) continue;
    switch (rec.kind) {
      case "period":
        out.periods.push(rec.record);
        break;
      case "event":
        out.events.push(rec.record);
        break;
      case "initiative":
        out.initiatives.push(rec.record);
        break;
      case "snapshot":
        out.snapshots.push(rec.record);
        break;
      case "delegation":
        out.delegations.push(rec.record);
        break;
    }
  }
  return { data: out, tableMissing: false };
}

export async function fetchRecord(
  admin: RetroAdminClient,
  kind: RecordKind,
  id: string
): Promise<RetrospectiveRecord | null> {
  const { data, error } = await admin
    .from(RETRO_TABLE)
    .select("id, record_type, data")
    .eq("id", id)
    .eq("record_type", kind)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error.message)) throw new RetrospectiveTableMissingError();
    throw new Error(error.message);
  }
  if (!data) return null;
  return rowToRecord(data as { id: unknown; record_type: unknown; data: unknown });
}

export async function saveRecord(
  admin: RetroAdminClient,
  rec: RetrospectiveRecord,
  updatedBy: string,
  isNew: boolean
): Promise<void> {
  const { id, ...data } = rec.record;
  const row = {
    id,
    record_type: rec.kind,
    data,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };
  const { error } = isNew
    ? await admin.from(RETRO_TABLE).insert(row)
    : await admin
        .from(RETRO_TABLE)
        .update(row)
        .eq("id", id)
        .eq("record_type", rec.kind);
  if (error) {
    if (isMissingTable(error.message)) throw new RetrospectiveTableMissingError();
    throw new Error(error.message);
  }
}

/** 1件を物理削除。期を消すときは、その期に属する記録（4種類）もまとめて消す */
export async function deleteRecordCascade(
  admin: RetroAdminClient,
  kind: RecordKind,
  id: string
): Promise<number> {
  let deleted = 0;
  if (kind === "period") {
    // 子の記録は data->>periodId で引く
    const { data, error } = await admin
      .from(RETRO_TABLE)
      .select("id, record_type")
      .neq("record_type", LOG_TYPE)
      .neq("record_type", "period")
      .eq("data->>periodId", id);
    if (error) {
      if (isMissingTable(error.message)) throw new RetrospectiveTableMissingError();
      throw new Error(error.message);
    }
    const childIds = (data ?? []).map((r) => String(r.id));
    if (childIds.length > 0) {
      const { error: e2 } = await admin
        .from(RETRO_TABLE)
        .delete()
        .in("id", childIds)
        .neq("record_type", LOG_TYPE);
      if (e2) throw new Error(e2.message);
      deleted += childIds.length;
    }
  }
  const { error } = await admin
    .from(RETRO_TABLE)
    .delete()
    .eq("id", id)
    .eq("record_type", kind);
  if (error) {
    if (isMissingTable(error.message)) throw new RetrospectiveTableMissingError();
    throw new Error(error.message);
  }
  return deleted + 1;
}

export function newRecordId(kind: RecordKind): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── 操作ログ（159/169と同じ仕組み）───

function newLogId(): string {
  return `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 操作ログを1件残す。記録に失敗しても業務は止めない（サーバーログには残す） */
export async function recordRetrospectiveLog(
  admin: RetroAdminClient,
  entry: {
    by: string;
    action: string;
    kind: string;
    target: string;
    changes: RetrospectiveLogChange[];
  }
): Promise<void> {
  try {
    const at = new Date().toISOString();
    await admin.from(RETRO_TABLE).insert({
      id: newLogId(),
      record_type: LOG_TYPE,
      data: { at, ...entry },
      updated_by: entry.by,
      updated_at: at,
    });
  } catch (e) {
    console.error(
      "[director-retrospective] 操作ログを記録できませんでした:",
      e instanceof Error ? e.message : e
    );
  }
}

/** 操作ログの取得（時系列のみ・新しい順）。管理者のみ＝呼び出し側で保証する */
export async function fetchRetrospectiveLogsServer(
  admin: RetroAdminClient,
  options: { limit: number; before?: string }
): Promise<{ logs: RetrospectiveLog[]; tableMissing: boolean }> {
  let query = admin
    .from(RETRO_TABLE)
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
    .map((r) => normalizeRetrospectiveLog(r.id as string, r.data))
    .filter((l): l is RetrospectiveLog => l !== null);
  return { logs, tableMissing: false };
}

// ─── 匿名化用の名簿（173-4-2）───
//
// 「登録済みスタッフの氏名」を集める。出どころは3つ:
//   ① staff_profiles_index（プロフィールの氏名＋役職id → 役職ラベル）
//   ② Supabase Auth の全アカウント（display_name。**無効化済みも含める**＝退職者の氏名も置換する）
//   ③ clinic_staff_contacts（169。アカウントの無い人の氏名も置換できる）
// 役職が分からない人は「スタッフ」。取得に失敗した出どころは飛ばす（置換できる分だけ置換する。
// 出力ボタンは管理者だけが押せるので、失敗しても秘匿は崩れない）。

export async function loadStaffRoster(admin: RetroAdminClient): Promise<RosterEntry[]> {
  const roleByUserId = new Map<string, string>();
  const entries: RosterEntry[] = [];

  // 役職の定義（ラベル解決用）
  let roles = normalizeProfileRoles(null);
  try {
    const row = await serverGetContentRow(PROFILE_ROLE_CONFIG_KEY);
    roles = normalizeProfileRoles((row?.data as { roles?: unknown } | null)?.roles);
  } catch {
    /* 既定の役職で続ける */
  }

  // ① プロフィール一覧
  try {
    const row = await serverGetContentRow(STAFF_PROFILES_INDEX_KEY);
    const items = (row?.data as { items?: unknown } | null)?.items;
    if (Array.isArray(items)) {
      for (const it of items) {
        const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
        const name = typeof o.name === "string" ? o.name.trim() : "";
        const userId = typeof o.userId === "string" ? o.userId : "";
        const roleLabel = resolveRole(roles, typeof o.role === "string" ? o.role : "").label;
        if (userId) roleByUserId.set(userId, roleLabel);
        if (name) entries.push({ name, roleLabel });
      }
    }
  } catch {
    /* 飛ばす */
  }

  // ② Auth の全アカウント（無効化済みも含む）
  try {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (!error && data?.users) {
      for (const u of data.users) {
        const meta = u.user_metadata as Record<string, unknown> | null;
        const name = typeof meta?.display_name === "string" ? meta.display_name.trim() : "";
        if (!name) continue;
        entries.push({ name, roleLabel: roleByUserId.get(u.id) ?? "" });
      }
    }
  } catch {
    /* 飛ばす */
  }

  // ③ スタッフ連絡先（169）。テーブル未作成なら飛ばす
  try {
    const { data, error } = await admin
      .from(STAFF_CONTACTS_TABLE)
      .select("data")
      .eq("record_type", "contact");
    if (!error && data) {
      for (const r of data) {
        const o = (r.data && typeof r.data === "object" ? r.data : {}) as Record<
          string,
          unknown
        >;
        const name = typeof o.name === "string" ? o.name.trim() : "";
        const userId = typeof o.userId === "string" ? o.userId : "";
        if (name) entries.push({ name, roleLabel: roleByUserId.get(userId) ?? "" });
      }
    }
  } catch {
    /* 飛ばす */
  }

  // 同じ氏名は1つに（役職が分かっている方を優先）
  const byName = new Map<string, string>();
  for (const e of entries) {
    const cur = byName.get(e.name);
    if (cur === undefined || (!cur && e.roleLabel)) byName.set(e.name, e.roleLabel);
  }
  return Array.from(byName, ([name, roleLabel]) => ({ name, roleLabel }));
}
