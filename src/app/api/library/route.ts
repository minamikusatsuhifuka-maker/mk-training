// 資料庫 一覧取得・登録 API（指示書86＋87）
// GET  : docs 全件を返す（87で承認フロー撤廃＝全員が全件閲覧可）。ログイン必須。
// POST : 資料を登録（ファイルを Storage へ保存＋メタを portal_library に追記）。ログインユーザー全員可。
//        登録＝即公開（status なし）。変更履歴に create を記録。
// ※ 書き込みは Service Role 経由（anon 直書きを避けサーバーで実行）。閲覧は全員可のため制約なし。

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
import { loadStore, saveStore, appendLog, loadLog } from "@/lib/library-server";
import {
  LIBRARY_PATH_PREFIX,
  normalizeCategory,
  normalizeKeywords,
  normalizeTreatments,
  extForFile,
  genLibraryId,
  type LibraryDoc,
} from "@/lib/library";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const SEARCH_TEXT_LIMIT = 2000;

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  const msg = e instanceof Error ? e.message : "処理に失敗しました";
  if (/bucket/i.test(msg) && /not.*found/i.test(msg)) {
    return NextResponse.json(
      {
        error: `Storage バケット「${STAFF_PHOTOS_BUCKET}」が見つかりません。Supabase ダッシュボードで public バケットとして作成してください。`,
      },
      { status: 503 }
    );
  }
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

export async function GET() {
  const { user, db } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  try {
    const admin = createSupabaseAdminClient();
    const [store, log] = await Promise.all([loadStore(admin), loadLog(admin)]);
    // 新しい順（更新日時降順）で返す
    const docs = [...store.docs].sort((a, b) =>
      (b.updatedAt || "").localeCompare(a.updatedAt || "")
    );
    // 変更履歴は既に新しい順（append時に先頭挿入）
    return NextResponse.json({ docs, log: log.entries });
  } catch (e) {
    return errorResponse(e);
  }
}

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

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "ファイルがありません" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "ファイルサイズが不正です（20MBまで）" },
      { status: 400 }
    );
  }

  const title = ((form.get("title") as string) || "").trim();
  if (!title) {
    return NextResponse.json({ error: "タイトルは必須です" }, { status: 400 });
  }
  const fileName = ((form.get("fileName") as string) || "").trim() || "資料";
  const mimeType = file.type || "application/octet-stream";
  const category = normalizeCategory(form.get("category"));
  let keywords: string[] = [];
  try {
    keywords = normalizeKeywords(JSON.parse((form.get("keywords") as string) || "[]"));
  } catch {
    keywords = [];
  }
  let treatments: string[] = [];
  try {
    treatments = normalizeTreatments(
      JSON.parse((form.get("treatments") as string) || "[]")
    );
  } catch {
    treatments = [];
  }
  const summary = ((form.get("summary") as string) || "").trim();
  const searchText = ((form.get("searchText") as string) || "").slice(
    0,
    SEARCH_TEXT_LIMIT
  );

  try {
    const admin = createSupabaseAdminClient();
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

    const now = new Date().toISOString();
    const userName = await resolveUserName(db, user.id, user.email);
    const doc: LibraryDoc = {
      id: genLibraryId(),
      title,
      category,
      keywords,
      treatments,
      summary,
      fileName,
      filePath: path,
      fileUrl: pub.publicUrl,
      mimeType,
      searchText,
      uploadedBy: user.id,
      uploadedByName: userName,
      uploadedAt: now,
      updatedAt: now,
      versions: [],
    };

    const store = await loadStore(admin);
    store.docs.push(doc);
    await saveStore(admin, store);
    await appendLog(admin, {
      userId: user.id,
      userName,
      action: "create",
      docId: doc.id,
      docTitle: doc.title,
    });

    return NextResponse.json({ ok: true, doc });
  } catch (e) {
    return errorResponse(e);
  }
}
