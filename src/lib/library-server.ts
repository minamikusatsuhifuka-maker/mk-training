// 資料庫のサーバー側ヘルパ（指示書86＋87・Service Role 経由の書き込み）
// - content_store（id/content_type/data 形式）に portal_library / portal_library_log を読み書き。
//   ※ 既存の content_store は id/content_type/data カラム（portal-store.ts と同形式）。
// - 書き込みはすべて Service Role（RLSバイパス・サーバー専用）。読み取りも admin で統一。
// - 変更履歴（監査ログ）を全操作で必ず記録する（誰が・いつ・何を）。

import { createSupabaseAdminClient } from "./supabase-admin";
import {
  LIBRARY_KEY,
  LIBRARY_LOG_KEY,
  LIBRARY_LOG_MAX,
  normalizeStore,
  normalizeLog,
  genLibraryId,
  type LibraryStore,
  type LibraryLog,
  type LibraryLogEntry,
} from "./library";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

async function readData(admin: Admin, key: string): Promise<unknown> {
  const { data } = await admin
    .from("content_store")
    .select("data")
    .eq("id", key)
    .maybeSingle();
  return (data?.data as unknown) ?? null;
}

async function writeData(
  admin: Admin,
  key: string,
  value: Record<string, unknown>
): Promise<void> {
  const { error } = await admin.from("content_store").upsert({
    id: key,
    content_type: "portal",
    data: value,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function loadStore(admin: Admin): Promise<LibraryStore> {
  return normalizeStore(await readData(admin, LIBRARY_KEY));
}

export async function saveStore(
  admin: Admin,
  store: LibraryStore
): Promise<void> {
  await writeData(admin, LIBRARY_KEY, {
    docs: store.docs,
    updatedAt: new Date().toISOString(),
  } as unknown as Record<string, unknown>);
}

export async function loadLog(admin: Admin): Promise<LibraryLog> {
  return normalizeLog(await readData(admin, LIBRARY_LOG_KEY));
}

// 監査ログを1件追記（最新200件で切り詰め）。ログ失敗は本体操作を妨げない。
export async function appendLog(
  admin: Admin,
  entry: Omit<LibraryLogEntry, "id" | "at">
): Promise<void> {
  try {
    const log = await loadLog(admin);
    const next: LibraryLogEntry = {
      ...entry,
      id: genLibraryId("liblog"),
      at: new Date().toISOString(),
    };
    const entries = [next, ...log.entries].slice(0, LIBRARY_LOG_MAX);
    await writeData(admin, LIBRARY_LOG_KEY, {
      entries,
      updatedAt: new Date().toISOString(),
    } as unknown as Record<string, unknown>);
  } catch {
    // ログ失敗は握りつぶす（本体操作は成立させる）
  }
}
