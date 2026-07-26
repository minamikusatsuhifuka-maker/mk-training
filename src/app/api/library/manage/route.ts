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
  VERSIONS_MAX,
  normalizeCategory,
  normalizeKeywords,
  normalizeTreatments,
  extForFile,
  genLibraryId,
  docVersionNumber,
  normalizeReviewDueAt,
  oneYearFromTodayYmd,
  type LibraryDoc,
  type DocVersion,
  type PendingUpdate,
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

    if (action === "rollback") {
      // 指示書95: 選択した版(versionId)を現行に据え、現行だったファイルは versions に積む
      const versionId = typeof body.versionId === "string" ? body.versionId : "";
      if (!versionId) {
        return NextResponse.json({ error: "版IDがありません" }, { status: 400 });
      }
      const store = await loadStore(admin);
      const idx = store.docs.findIndex((d) => d.id === id);
      if (idx < 0) {
        return NextResponse.json(
          { error: "資料が見つかりません" },
          { status: 404 }
        );
      }
      const cur = store.docs[idx];
      const target = cur.versions.find((v) => v.versionId === versionId);
      if (!target) {
        return NextResponse.json(
          { error: "指定の版が見つかりません" },
          { status: 404 }
        );
      }
      // 現行ファイルを版として積む
      const curAsVersion: DocVersion = {
        versionId: genLibraryId("ver"),
        fileName: cur.fileName,
        filePath: cur.filePath,
        fileUrl: cur.fileUrl,
        mimeType: cur.mimeType,
        replacedAt: new Date().toISOString(),
        replacedBy: userName,
      };
      const nextVersions = [
        ...cur.versions.filter((v) => v.versionId !== versionId),
        curAsVersion,
      ].slice(-VERSIONS_MAX);
      const updated: LibraryDoc = {
        ...cur,
        fileName: target.fileName,
        filePath: target.filePath,
        fileUrl: target.fileUrl,
        mimeType: target.mimeType,
        updatedAt: new Date().toISOString(),
        versions: nextVersions,
      };
      store.docs[idx] = updated;
      await saveStore(admin, store);
      await appendLog(admin, {
        userId: user.id,
        userName,
        action: "rollback",
        docId: updated.id,
        docTitle: updated.title,
        note: `版を復元: ${target.fileName || target.versionId}`,
      });
      return NextResponse.json({ ok: true, doc: updated });
    }

    if (action === "approveUpdate") {
      // 指示書96: 更新待ちを承認して公開版に昇格。現行を versions[] に積む。誰でも可。
      const store = await loadStore(admin);
      const idx = store.docs.findIndex((d) => d.id === id);
      if (idx < 0) {
        return NextResponse.json({ error: "資料が見つかりません" }, { status: 404 });
      }
      const cur = store.docs[idx];
      const pu = cur.pendingUpdate;
      if (!pu) {
        return NextResponse.json({ error: "更新待ちがありません" }, { status: 404 });
      }
      // タイトルは承認者の選択（既定=既存を保持）。keepTitle=false で新提案を採用。
      const keepTitle = body.keepTitle !== false;
      const nextTitle =
        !keepTitle && pu.aiMeta.title ? pu.aiMeta.title : cur.title;
      const fromV = docVersionNumber(cur);
      const curAsVersion: DocVersion = {
        versionId: genLibraryId("ver"),
        fileName: cur.fileName,
        filePath: cur.filePath,
        fileUrl: cur.fileUrl,
        mimeType: cur.mimeType,
        replacedAt: new Date().toISOString(),
        replacedBy: userName, // 承認者
      };
      const updated: LibraryDoc = {
        ...cur,
        title: nextTitle,
        fileName: pu.fileName,
        filePath: pu.filePath,
        fileUrl: pu.fileUrl,
        mimeType: pu.mimeType,
        searchText: pu.searchText || cur.searchText,
        keywords: pu.aiMeta.keywords.length ? pu.aiMeta.keywords : cur.keywords,
        summary: pu.aiMeta.summary || cur.summary,
        treatments: pu.aiMeta.treatments.length
          ? pu.aiMeta.treatments
          : cur.treatments,
        updatedAt: new Date().toISOString(),
        versions: [...cur.versions, curAsVersion].slice(-VERSIONS_MAX),
        pendingUpdate: null,
        // 指示書98: 承認時に見直し日を1年後にリセット（resetReview 既定ON・OFFなら据え置き）
        reviewDueAt:
          body.resetReview === false ? cur.reviewDueAt : oneYearFromTodayYmd(),
      };
      store.docs[idx] = updated;
      await saveStore(admin, store);
      await appendLog(admin, {
        userId: user.id,
        userName,
        action: "approveUpdate",
        docId: updated.id,
        docTitle: updated.title,
        note: `v${fromV}→v${fromV + 1}（承認: ${userName || "不明"}）`,
      });
      return NextResponse.json({ ok: true, doc: updated });
    }

    if (action === "withdrawUpdate") {
      // 指示書96: 更新待ちを取り下げ（ファイルはStorage残置）。誰でも可。
      const store = await loadStore(admin);
      const idx = store.docs.findIndex((d) => d.id === id);
      if (idx < 0) {
        return NextResponse.json({ error: "資料が見つかりません" }, { status: 404 });
      }
      const cur = store.docs[idx];
      if (!cur.pendingUpdate) {
        return NextResponse.json({ error: "更新待ちがありません" }, { status: 404 });
      }
      const updated: LibraryDoc = { ...cur, pendingUpdate: null };
      store.docs[idx] = updated;
      await saveStore(admin, store);
      await appendLog(admin, {
        userId: user.id,
        userName,
        action: "withdrawUpdate",
        docId: updated.id,
        docTitle: updated.title,
      });
      return NextResponse.json({ ok: true, doc: updated });
    }

    if (action === "mergeTag") {
      // 指示書98-F: 全docの treatments を from→to に一括置換（重複除去）。誰でも可・wiki方式。
      const from = typeof body.from === "string" ? body.from.trim() : "";
      const to = typeof body.to === "string" ? body.to.trim() : "";
      if (!from || !to || from === to) {
        return NextResponse.json({ error: "統合元/先が不正です" }, { status: 400 });
      }
      const store = await loadStore(admin);
      let changed = 0;
      for (let i = 0; i < store.docs.length; i++) {
        const d = store.docs[i];
        if (!d.treatments.includes(from)) continue;
        const merged = normalizeTreatments(
          d.treatments.map((t) => (t === from ? to : t))
        );
        store.docs[i] = { ...d, treatments: merged, updatedAt: new Date().toISOString() };
        changed++;
      }
      if (changed === 0) {
        return NextResponse.json({ error: "対象の資料がありません" }, { status: 404 });
      }
      await saveStore(admin, store);
      await appendLog(admin, {
        userId: user.id,
        userName,
        action: "mergeTag",
        docId: "",
        docTitle: "施術タグ",
        note: `タグ統合: ${from} → ${to}（${changed}件）`,
      });
      return NextResponse.json({ ok: true, changed });
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
      treatments:
        body.treatments !== undefined
          ? normalizeTreatments(body.treatments)
          : cur.treatments,
      summary:
        typeof body.summary === "string" ? body.summary.trim() : cur.summary,
      reviewDueAt:
        "reviewDueAt" in body
          ? normalizeReviewDueAt(body.reviewDueAt)
          : cur.reviewDueAt,
      updatedAt: new Date().toISOString(),
    };
    store.docs[idx] = updated;
    await saveStore(admin, store);
    const note = typeof body.note === "string" ? body.note.trim() : "";
    await appendLog(admin, {
      userId: user.id,
      userName,
      action: "edit",
      docId: updated.id,
      docTitle: updated.title,
      ...(note ? { note } : {}),
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

    // 指示書96: 即時差し替えを廃止し「更新待ち(pendingUpdate)」を作る。承認は別途 approveUpdate。
    if (store.docs[idx].pendingUpdate) {
      return NextResponse.json(
        { error: "この資料には既に更新待ちがあります。先に承認または取り下げしてください。" },
        { status: 409 }
      );
    }

    const fileName =
      ((form.get("fileName") as string) || "").trim() ||
      store.docs[idx].fileName;
    const mimeType = file.type || store.docs[idx].mimeType;
    const searchText = ((form.get("searchText") as string) || "").slice(
      0,
      SEARCH_TEXT_LIMIT
    );
    // AI提案メタ（承認時に採用/選択）
    const aiTitle = ((form.get("title") as string) || "").trim();
    const aiSummary = ((form.get("summary") as string) || "").trim();
    let aiKeywords: string[] = [];
    let aiTreatments: string[] = [];
    try {
      aiKeywords = normalizeKeywords(JSON.parse((form.get("keywords") as string) || "[]"));
    } catch {
      aiKeywords = [];
    }
    try {
      aiTreatments = normalizeTreatments(JSON.parse((form.get("treatments") as string) || "[]"));
    } catch {
      aiTreatments = [];
    }

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

    const userName2 = await resolveUserName(db, user.id, user.email);
    const pending: PendingUpdate = {
      fileName,
      filePath: path,
      fileUrl: pub.publicUrl,
      mimeType,
      searchText,
      aiMeta: {
        title: aiTitle,
        keywords: aiKeywords,
        summary: aiSummary,
        treatments: aiTreatments,
      },
      uploadedBy: user.id,
      uploadedByName: userName2,
      uploadedAt: new Date().toISOString(),
    };
    const updated: LibraryDoc = { ...store.docs[idx], pendingUpdate: pending };
    store.docs[idx] = updated;
    await saveStore(admin, store);
    return NextResponse.json({ ok: true, doc: updated });
  } catch (e) {
    return errorResponse(e);
  }
}
