// 資料庫のサーバー側ヘルパ（指示書86＋87・Service Role 経由の書き込み）
// - content_store（id/content_type/data 形式）に portal_library / portal_library_log を読み書き。
//   ※ 既存の content_store は id/content_type/data カラム（portal-store.ts と同形式）。
// - 書き込みはすべて Service Role（RLSバイパス・サーバー専用）。読み取りも admin で統一。
// - 変更履歴（監査ログ）を全操作で必ず記録する（誰が・いつ・何を）。

import { createSupabaseAdminClient } from "./supabase-admin";
import { signPublicUrls } from "./storage-signed";
import {
  LIBRARY_KEY,
  LIBRARY_LOG_KEY,
  LIBRARY_LOG_MAX,
  normalizeStore,
  normalizeLog,
  genLibraryId,
  type LibraryDoc,
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

// ─── 署名付きURLへの差し替え（指示書163）───
//
// 資料のURLを、**返すときだけ**署名付きURLに差し替える。
// 保存されている値（公開URL）は書き換えない＝既存データに触れずに非公開化へ移行でき、
// 元に戻したくなればこの層を外すだけで済む（歯止め2・歯止め6）。
//
// 差し替える対象は3か所ある。**どれか1つでも漏れると、その画面だけ開けなくなる**:
//   ① doc.fileUrl            … 本体
//   ② doc.versions[].fileUrl … 過去の版（指示書95）
//   ③ doc.pendingUpdate      … 承認待ちの差し替えファイル（指示書96）

/** 資料1件に含まれる公開URLをすべて集める */
function docUrls(doc: LibraryDoc): string[] {
  const urls: string[] = [];
  if (doc.fileUrl) urls.push(doc.fileUrl);
  for (const v of doc.versions ?? []) if (v.fileUrl) urls.push(v.fileUrl);
  if (doc.pendingUpdate?.fileUrl) urls.push(doc.pendingUpdate.fileUrl);
  return urls;
}

/** 1件だけ署名する（登録・差し替え直後にその資料を返す場面用） */
export async function withSignedDoc(
  admin: Admin,
  doc: LibraryDoc
): Promise<LibraryDoc> {
  return (await withSignedDocUrls(admin, [doc]))[0] ?? doc;
}

/**
 * 一覧に含まれるすべてのURLを**1回のAPI呼び出しでまとめて署名**して差し替える。
 * 署名できなかったものは空文字にする（公開URLのまま返さない＝fail-close）。
 * 外部リンク（kind:"link"）は公開URLではないので、そのまま残る。
 */
export async function withSignedDocUrls(
  admin: Admin,
  docs: LibraryDoc[]
): Promise<LibraryDoc[]> {
  const all = docs.flatMap(docUrls);
  if (all.length === 0) return docs;
  const signed = await signPublicUrls(admin, all);

  // 公開URLだったものだけを差し替える。それ以外（外部リンク等）は元の値を保つ
  const swap = (url: string): string =>
    url && url.includes("/storage/v1/object/public/")
      ? signed.get(url) ?? ""
      : url;

  return docs.map((doc) => ({
    ...doc,
    fileUrl: swap(doc.fileUrl),
    versions: (doc.versions ?? []).map((v) => ({
      ...v,
      fileUrl: swap(v.fileUrl),
    })),
    ...(doc.pendingUpdate
      ? {
          pendingUpdate: {
            ...doc.pendingUpdate,
            fileUrl: swap(doc.pendingUpdate.fileUrl),
          },
        }
      : {}),
  }));
}
