// 採用資料API（指示書184）— **院長のみ**（authorizeHiring。委任は見ない）。非許可は404
//   GET    ?user=<userId> → { docs（署名URL10分つき）, profile, logs, tableMissing, bucketMissing, aiEnabled }
//   POST   multipart { userId, kind, docDate, memo, file } → 登録（PDF・JPEG・PNG・20MBまで）
//   PATCH  JSON { id, kind?, docDate?, memo? }（資料の項目） または { userId, profile: {...} }（経歴・入職時の想い）
//   DELETE JSON { id } → 削除（実体も。院長の操作のみ・自動削除はしない）
// /api/admin 配下なので proxy が管理者以外を実在しないAPIと同じ応答にする（159-D）。183の対応表にも無い＝委任不可。

import { NextRequest, NextResponse } from "next/server";
import {
  HiringBucketMissingError,
  HiringTableMissingError,
  ServiceRoleMissingError,
  authorizeHiring,
  deleteHiringDoc,
  ensureHiringBucket,
  fetchHiringDoc,
  fetchHiringDocs,
  fetchHiringLogs,
  fetchHiringProfile,
  newHiringId,
  recordHiringLog,
  saveHiringDoc,
  saveHiringProfile,
  signHiringDocs,
  translateHiringStorageError,
  HIRING_BUCKET,
} from "@/lib/hiring-docs-server";
import { fetchGrowthConfig } from "@/lib/staff-growth-server";
import {
  HIRING_DOC_MAX_BYTES,
  HIRING_DOC_MEMO_MAX,
  HIRING_PROFILE_FIELDS,
  hiringDocKindLabel,
  isAllowedHiringMime,
  isHiringDocKind,
  normalizeHiringDoc,
  normalizeHiringProfile,
  ymd,
} from "@/lib/hiring-docs";

export const runtime = "nodejs";
export const maxDuration = 60;

const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404 });

function errorResponse(e: unknown): NextResponse {
  if (e instanceof HiringTableMissingError) return NextResponse.json({ error: e.message, tableMissing: true }, { status: 503 });
  if (e instanceof HiringBucketMissingError) return NextResponse.json({ error: e.message, bucketMissing: true }, { status: 503 });
  if (e instanceof ServiceRoleMissingError) return NextResponse.json({ error: e.message }, { status: 503 });
  return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
}

function presence(v: string): string {
  return v.trim() ? "記載あり" : "空";
}

export async function GET(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  const userId = req.nextUrl.searchParams.get("user") ?? "";
  if (!userId) return NextResponse.json({ error: "user は必須です" }, { status: 400 });
  try {
    const [{ docs, tableMissing }, config] = await Promise.all([
      fetchHiringDocs(auth.admin, userId),
      fetchGrowthConfig(auth.admin),
    ]);
    const signed = await signHiringDocs(auth.admin, docs);
    const profile = tableMissing ? normalizeHiringProfile(userId, null) : await fetchHiringProfile(auth.admin, userId);
    const { logs } = tableMissing ? { logs: [] } : await fetchHiringLogs(auth.admin, 100);
    return NextResponse.json({
      docs: signed.docs,
      profile,
      logs: logs.filter((l) => l.target === userId || l.target.startsWith(`${userId}:`)),
      tableMissing,
      bucketMissing: signed.bucketMissing,
      // 184 3-5: AI整理は179で院長が確認した有料枠の設定がONのときだけ
      aiEnabled: config.aiDraftEnabled,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const userId = String(form.get("userId") ?? "").trim();
  const kind = String(form.get("kind") ?? "");
  const docDate = ymd(String(form.get("docDate") ?? ""));
  const memo = String(form.get("memo") ?? "").slice(0, HIRING_DOC_MEMO_MAX);
  const file = form.get("file");
  if (!userId || !(file instanceof File)) return NextResponse.json({ error: "対象のスタッフとファイルは必須です" }, { status: 400 });
  if (!isHiringDocKind(kind)) return NextResponse.json({ error: "資料の種類が不正です" }, { status: 400 });
  const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (!isAllowedHiringMime(mime)) {
    return NextResponse.json({ error: "登録できるのは PDF・JPEG・PNG です（HEIC は端末で JPEG に変換されます）" }, { status: 400 });
  }
  if (file.size === 0 || file.size > HIRING_DOC_MAX_BYTES) {
    return NextResponse.json({ error: "ファイルが大きすぎます（20MBまで）" }, { status: 400 });
  }
  try {
    await ensureHiringBucket(auth.admin);
    const id = newHiringId("hdoc");
    const ext = mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg";
    const path = `${userId}/${id}.${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error } = await auth.admin.storage.from(HIRING_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
    if (error) throw translateHiringStorageError(error.message);
    const doc = normalizeHiringDoc(id, {
      userId,
      kind,
      docDate,
      memo,
      path,
      fileName: (file.name || "file").slice(0, 200),
      mimeType: mime,
      size: file.size,
      uploadedBy: auth.userEmail || auth.userId,
      createdAt: new Date().toISOString(),
    });
    if (!doc) throw new Error("資料の記録を作れませんでした");
    const by = auth.userEmail || auth.userId;
    await saveHiringDoc(auth.admin, doc, by);
    await recordHiringLog(auth.admin, {
      by,
      action: "登録",
      target: userId,
      changes: [
        { field: "種類", before: "", after: hiringDocKindLabel(doc.kind) },
        { field: "資料の日付", before: "", after: doc.docDate || "未設定" },
        { field: "メモ", before: "", after: presence(doc.memo) },
      ],
    });
    const signed = await signHiringDocs(auth.admin, [doc]);
    return NextResponse.json({ doc: signed.docs[0] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const by = auth.userEmail || auth.userId;
  try {
    // 経歴・入職時の想い
    if (typeof body.userId === "string" && body.userId && body.profile && typeof body.profile === "object") {
      const prev = await fetchHiringProfile(auth.admin, body.userId);
      const next = normalizeHiringProfile(body.userId, { ...prev, ...(body.profile as Record<string, unknown>) });
      await saveHiringProfile(auth.admin, next, by);
      const changes = HIRING_PROFILE_FIELDS.filter((f) => prev[f.key] !== next[f.key]).map((f) => ({
        field: f.label,
        before: presence(prev[f.key]),
        after: prev[f.key].trim() && next[f.key].trim() ? "記載あり（変更）" : presence(next[f.key]),
      }));
      if (changes.length > 0) await recordHiringLog(auth.admin, { by, action: "更新", target: `${body.userId}:profile`, changes });
      return NextResponse.json({ profile: next });
    }
    // 資料の項目
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
    const prev = await fetchHiringDoc(auth.admin, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    const next = normalizeHiringDoc(id, {
      ...prev,
      ...(typeof body.kind === "string" ? { kind: body.kind } : {}),
      ...(typeof body.docDate === "string" ? { docDate: body.docDate } : {}),
      ...(typeof body.memo === "string" ? { memo: body.memo } : {}),
    });
    if (!next) return NextResponse.json({ error: "更新できませんでした" }, { status: 400 });
    await saveHiringDoc(auth.admin, next, by);
    const changes = [
      ...(prev.kind !== next.kind ? [{ field: "種類", before: hiringDocKindLabel(prev.kind), after: hiringDocKindLabel(next.kind) }] : []),
      ...(prev.docDate !== next.docDate ? [{ field: "資料の日付", before: prev.docDate || "未設定", after: next.docDate || "未設定" }] : []),
      ...(prev.memo !== next.memo ? [{ field: "メモ", before: presence(prev.memo), after: presence(next.memo) }] : []),
    ];
    if (changes.length > 0) await recordHiringLog(auth.admin, { by, action: "更新", target: prev.userId, changes });
    const signed = await signHiringDocs(auth.admin, [next]);
    return NextResponse.json({ doc: signed.docs[0] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeHiring();
  if (!auth.ok) return hidden();
  let body: { id?: unknown };
  try {
    body = (await req.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id は必須です" }, { status: 400 });
  try {
    const prev = await fetchHiringDoc(auth.admin, id);
    if (!prev) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
    await deleteHiringDoc(auth.admin, prev);
    await recordHiringLog(auth.admin, {
      by: auth.userEmail || auth.userId,
      action: "削除",
      target: prev.userId,
      changes: [{ field: "種類", before: hiringDocKindLabel(prev.kind), after: "" }],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
