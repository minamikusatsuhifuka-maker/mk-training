// メンバーノートのサーバー共通部（指示書149・サーバー専用）
//
// 認可の考え方（132 clinic_events と同型）:
//   allowed = 管理者 or config行の viewerUserIds に含まれる
//   fail-close: 設定が無い・壊れている・取得に失敗した場合は **管理者のみ**
//
// 管理者を常に許可する理由: 管理者は viewerUserIds 自体を編集できる立場なので、
// 管理者を弾いても「自分をリストに足す」だけで回避でき、見せかけの制限にしかならない。
// 実効的な制限にするなら管理者権限そのものを絞る必要がある（報告書に明記）。
//
// 非許可ユーザーには **404** を返す（存在秘匿）。403だと機能の存在が分かるため。

import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "./supabase-admin";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";
import {
  MEMBER_NOTES_CONFIG_ID,
  normalizeMemberNote,
  type MemberNote,
} from "./member-notes";

export { ServiceRoleMissingError };

export const MEMBER_NOTES_TABLE = "clinic_member_notes";

export type NotesAdminClient = ReturnType<typeof createSupabaseAdminClient>;

/** テーブル未作成（SQL未実行）を表す印。画面で案内を出すために区別する */
export class MemberNotesTableMissingError extends Error {
  constructor() {
    super(
      "メンバーノートのテーブルがまだ作られていません。交付済みのSQLを実行してください。"
    );
    this.name = "MemberNotesTableMissingError";
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

/** 閲覧者リスト（config行）。無い・壊れている・失敗は空配列＝fail-close */
export async function loadViewerUserIds(
  admin: NotesAdminClient
): Promise<{ ids: string[]; tableMissing: boolean }> {
  try {
    const { data, error } = await admin
      .from(MEMBER_NOTES_TABLE)
      .select("data")
      .eq("id", MEMBER_NOTES_CONFIG_ID)
      .maybeSingle();
    if (error) {
      return { ids: [], tableMissing: isMissingTable(error.message) };
    }
    const raw = (data?.data as { viewerUserIds?: unknown } | null)
      ?.viewerUserIds;
    const ids = Array.isArray(raw)
      ? raw.filter((v): v is string => typeof v === "string" && v !== "")
      : [];
    return { ids, tableMissing: false };
  } catch {
    return { ids: [], tableMissing: false }; // fail-close
  }
}

export async function saveViewerUserIds(
  admin: NotesAdminClient,
  ids: string[],
  updatedBy: string
): Promise<void> {
  const { error } = await admin.from(MEMBER_NOTES_TABLE).upsert({
    id: MEMBER_NOTES_CONFIG_ID,
    record_type: "config",
    data: { viewerUserIds: Array.from(new Set(ids)).slice(0, 100) },
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (isMissingTable(error.message)) throw new MemberNotesTableMissingError();
    throw new Error(error.message);
  }
}

export type NotesAuth =
  | { ok: false; tableMissing: boolean }
  | {
      ok: true;
      admin: NotesAdminClient;
      userId: string;
      userEmail: string;
      isAdmin: boolean;
      viewerUserIds: string[];
      tableMissing: boolean;
    };

/**
 * 認証＋認可の共通前段。許可されない場合は ok:false（呼び出し側は 404 を返す）。
 * 未ログインも ok:false（存在を知らせない）。
 */
export async function authorizeMemberNotes(): Promise<NotesAuth> {
  const { user } = await getSessionUser();
  if (!user) return { ok: false, tableMissing: false };

  let admin: NotesAdminClient;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return { ok: false, tableMissing: false }; // service-role未設定=誰も入れない
  }

  const isAdmin = isAdminUser(user);
  const { ids, tableMissing } = await loadViewerUserIds(admin);
  // fail-close: リストが空（未設定・取得失敗）なら管理者のみ
  const allowed = isAdmin || ids.includes(user.id);
  if (!allowed) return { ok: false, tableMissing };

  return {
    ok: true,
    admin,
    userId: user.id,
    userEmail: user.email ?? "",
    isAdmin,
    viewerUserIds: ids,
    tableMissing,
  };
}

export async function fetchAllNotes(
  admin: NotesAdminClient
): Promise<{ notes: MemberNote[]; tableMissing: boolean }> {
  const { data, error } = await admin
    .from(MEMBER_NOTES_TABLE)
    .select("id, data")
    .eq("record_type", "note");
  if (error) {
    if (isMissingTable(error.message)) return { notes: [], tableMissing: true };
    throw new Error(error.message);
  }
  const notes = (data ?? [])
    .map((r) => normalizeMemberNote(r.id as string, r.data))
    .filter((n): n is MemberNote => n !== null);
  return { notes, tableMissing: false };
}

export async function saveNote(
  admin: NotesAdminClient,
  note: MemberNote,
  updatedBy: string
): Promise<void> {
  const { staffUserId, ...rest } = note;
  const { error } = await admin.from(MEMBER_NOTES_TABLE).upsert({
    id: staffUserId,
    record_type: "note",
    data: { ...rest, updatedBy, updatedAt: new Date().toISOString() },
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    if (isMissingTable(error.message)) throw new MemberNotesTableMissingError();
    throw new Error(error.message);
  }
}

/** 削除は物理削除（機微データの原則・指示書149-8） */
export async function deleteNote(
  admin: NotesAdminClient,
  staffUserId: string
): Promise<void> {
  const { error } = await admin
    .from(MEMBER_NOTES_TABLE)
    .delete()
    .eq("id", staffUserId)
    .eq("record_type", "note");
  if (error) {
    if (isMissingTable(error.message)) throw new MemberNotesTableMissingError();
    throw new Error(error.message);
  }
}
