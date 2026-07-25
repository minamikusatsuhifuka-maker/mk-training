// 資料庫の編集・削除・復元・ファイル差し替え API（指示書87・wiki方式）
// - 87で承認フロー撤廃。編集・削除・復元・差し替えは「ログインユーザー全員」が可能。
// - すべての操作で変更履歴（監査ログ）を記録する（誰が・いつ・何を）。
// - 削除は物理削除だが、ログに元メタ(snapshot)を保持し復元できる（Storageのファイルは残す＝スコープ外）。
//   PATCH : { action: "edit", id, title, category, keywords, summary }  メタ編集
//           { action: "restore", id }                                    直近の削除から復元
//   DELETE: { id }                                                       削除（snapshotをログへ）
//   POST  : multipart { id, file, fileName }                             ファイル差し替え
// ※ 書き込みは Service Role 経由。閲覧・操作は全員可のため権限フィルタは無し。

import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "@/lib/supabase-admin";
import {
  getSessionUser,
  loadProfileServer,
} from "@/lib/staff-profiles-server";
import { STAFF_PHOTOS_BUCKET } from "@/lib/staff-profiles";
import { loadStore, saveStore, loadLog, appendLog } from "@/lib/library-server";
import {
  LIBRARY_PATH_PREFIX,
  normalizeCategory,
  normalizeKeywords,
  extForFile,
  genLibraryId,
  type LibraryDoc,
} from "@/lib/library";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;
const SEARCH_TEXT_LIMIT = 2000;

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  const msg = e instanceof Error ? e.message : "処理に失敗しました";
  return NextResponse.json({ error: msg }, { status: 500 });
}

async function resolveUserName(
  db: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  email?: string
): Promise<string> {
  try {
    const profile = await loadProfileServer(db, userId);
    if (profile?.name) return profile.name;
  } catch {
    /* fallthrough */
  }
  return email ?? "";
}

// ─── PATCH: メタ編集 / 復元 ───
export async function PATCH(req: NextRequest) {
  const { user, db } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const action = body.action;
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "IDがありません" }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const userName = await resolveUserName(db, user.id, user.email);

    if (action === "restore") {
      // 直近の削除ログ(snapshot付き)からその docId を復元
      const log = await loadLog(admin);
      const entry = log.entries.find(
        (e) => e.action === "delete" && e.docId === id && e.snapshot
      );
      if (!entry?.snapshot) {
        return NextResponse.json(
          { error: "復元できる履歴が見つかりません" },
          { status: 404 }
        );
      }
      const store = await loadStore(admin);
      if (store.docs.some((d) => d.id === id)) {
        return NextResponse.json(
          { error: "すでに存在します" },
          { status: 409 }
        );
      }
      const restored: LibraryDoc = {
        ...entry.snapshot,
        updatedAt: new Date().toISOString(),
      };
      store.docs.push(restored);
      await saveStore(admin, store);
      await appendLog(admin, {
        userId: user.id,
        userName,
        action: "restore",
        docId: restored.id,
        docTitle: restored.title,
      });
      return NextResponse.json({ ok: true, doc: restored });
    }

    // action === "edit"
    const store = await loadStore(admin);
    const idx = store.docs.findIndex((d) => d.id === id);
    if (idx < 0) {
      return NextResponse.json(
        { error: "資料が見つかりません" },
        { status: 404 }
      );
    }
    const cur = store.docs[idx];
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : cur.title;
    const updated: LibraryDoc = {
      ...cur,
      title,
      category: normalizeCategory(body.category ?? cur.category),
      keywords:
        body.keywords !== undefined
          ? normalizeKeywords(body.keywords)
          : cur.keywords,
      summary:
        typeof body.summary === "string" ? body.summary.trim() : cur.summary,
      updatedAt: new Date().toISOString(),
    };
    store.docs[idx] = updated;
    await saveStore(admin, store);
    await appendLog(admin, {
      userId: user.id,
      userName,
      action: "edit",
      docId: updated.id,
      docTitle: updated.title,
    });
    return NextResponse.json({ ok: true, doc: updated });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── DELETE: 削除（snapshotをログへ） ───
export async function DELETE(req: NextRequest) {
  const { user, db } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "IDがありません" }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const store = await loadStore(admin);
    const target = store.docs.find((d) => d.id === id);
    if (!target) {
      return NextResponse.json(
        { error: "資料が見つかりません" },
        { status: 404 }
      );
    }
    store.docs = store.docs.filter((d) => d.id !== id);
    await saveStore(admin, store);
    const userName = await resolveUserName(db, user.id, user.email);
    // 復元用に元メタを snapshot として保持（Storageのファイルは残す＝スコープ外）
    await appendLog(admin, {
      userId: user.id,
      userName,
      action: "delete",
      docId: target.id,
      docTitle: target.title,
      snapshot: target,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── POST: ファイル差し替え ───
export async function POST(req: NextRequest) {
  const { user, db } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const id = ((form.get("id") as string) || "").trim();
  const file = form.get("file");
  if (!id || !(file instanceof Blob)) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "ファイルサイズが不正です（20MBまで）" },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const store = await loadStore(admin);
    const idx = store.docs.findIndex((d) => d.id === id);
    if (idx < 0) {
      return NextResponse.json(
        { error: "資料が見つかりません" },
        { status: 404 }
      );
    }

    const fileName =
      ((form.get("fileName") as string) || "").trim() ||
      store.docs[idx].fileName;
    const mimeType = file.type || store.docs[idx].mimeType;
    const searchText =
      form.get("searchText") !== null
        ? ((form.get("searchText") as string) || "").slice(0, SEARCH_TEXT_LIMIT)
        : store.docs[idx].searchText;

    const ext = extForFile(mimeType, fileName);
    const path = `${LIBRARY_PATH_PREFIX}/${genLibraryId("f")}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upError } = await admin.storage
      .from(STAFF_PHOTOS_BUCKET)
      .upload(path, bytes, { contentType: mimeType, upsert: false });
    if (upError) throw new Error(upError.message);
    const { data: pub } = admin.storage
      .from(STAFF_PHOTOS_BUCKET)
      .getPublicUrl(path);

    // 旧ファイルは Storage に残す（指示書87）。指示書88: 旧doc全体を snapshot として履歴に保存し、
    // 履歴から旧版を開ける/DLできるようにする（prevFileUrl/prevFilePath/旧fileName/旧updatedAt を含む）。
    const prevDoc: LibraryDoc = { ...store.docs[idx] };
    const updated: LibraryDoc = {
      ...store.docs[idx],
      fileName,
      filePath: path,
      fileUrl: pub.publicUrl,
      mimeType,
      searchText,
      updatedAt: new Date().toISOString(),
    };
    store.docs[idx] = updated;
    await saveStore(admin, store);
    const userName = await resolveUserName(db, user.id, user.email);
    await appendLog(admin, {
      userId: user.id,
      userName,
      action: "replace",
      docId: updated.id,
      docTitle: updated.title,
      snapshot: prevDoc, // 差し替え前の版（履歴から開く/DL する）
    });
    return NextResponse.json({ ok: true, doc: updated });
  } catch (e) {
    return errorResponse(e);
  }
}
