// 📣 お知らせ・イベント：貼ったもの（指示書228 §2-2）— つくった人・院長だけ
//
//   POST   { noticeId, name, mime, size }  … 置き場に直接送るための「1回だけ使える送り先」を出す
//   PUT    { noticeId, path, name }        … 送り終わったファイルを確かめて、お知らせに付ける
//   DELETE { noticeId, path }              … 外す（置き場の実体も消す）
//
// 【なぜ直接送るのか】Vercel の関数が受け取れる大きさは4.5MBまで。10MBのPDFを通せないため、
//   ファイルはブラウザから非公開の置き場（event-photos の notices/<お知らせid>/）へ直接送り、
//   サーバーは「送り先を出す」と「送られたものを確かめて付ける」だけを行う。
// 【確かめること（PUT）】パスがそのお知らせのものか／10MB以下か／中身が申告どおりの種類か（先頭の数バイト）。
//   画像は**サーバーでも位置情報などのメタデータを消してから**置き直す（端末で描き直し済みでも二重に）。
//   合わないものは置き場から消して断る。HEIC は端末で JPEG にしてから送る（そのままは置かない）。

import { NextRequest, NextResponse } from "next/server";
import { EVENT_PHOTOS_BUCKET, translateStorageError } from "@/lib/events-server";
import {
  EventPhotoBucketMissingError,
  NoticesTableMissingError,
  ServiceRoleMissingError,
  authorizeNotices,
  canEditNotice,
  canSeeNotice,
  fetchNotice,
  saveNotice,
  withSignedAttachments,
  type NoticesAuth,
} from "@/lib/notices-server";
import {
  NOTICE_FILE_MAX_BYTES,
  NOTICE_FILE_MAX_COUNT,
  attachmentKindOf,
  extFor,
  formatBytes,
  isNoticeFilePath,
  isNoticeId,
  noticeFilePath,
  safeFileName,
  sniffFileType,
  sniffMatches,
  storedMimeFor,
  type Notice,
  type NoticeAttachmentKind,
} from "@/lib/notices";
import { stripImageMetadata } from "@/lib/notice-image-meta";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** 置き場の上限を10MBに広げるSQL（院長が実行）。広げるまでは置き場の上限（8MB）が先に効く */
const LIMIT_SQL = "228_お知らせ・イベント_置き場の上限10MB.sql";

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError || e instanceof NoticesTableMissingError || e instanceof EventPhotoBucketMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500 });
}

async function editableNotice(
  auth: NoticesAuth,
  noticeId: string
): Promise<{ notice: Notice; res: null } | { notice: null; res: NextResponse }> {
  if (!isNoticeId(noticeId)) return { notice: null, res: NextResponse.json({ error: "見つかりません" }, { status: 404 }) };
  const n = await fetchNotice(auth.admin, noticeId);
  if (!n || !canSeeNotice(n, auth)) return { notice: null, res: NextResponse.json({ error: "見つかりません" }, { status: 404 }) };
  if (!canEditNotice(n, auth)) {
    return { notice: null, res: NextResponse.json({ error: "貼れるのは、つくった人と院長だけです" }, { status: 403 }) };
  }
  return { notice: n, res: null };
}

/** 置き場の今の上限（バイト）。読めなければ null（＝上限なしとして扱い、送るときの失敗に任せる） */
async function bucketLimit(auth: NoticesAuth): Promise<number | null> {
  const { data, error } = await auth.admin.storage.getBucket(EVENT_PHOTOS_BUCKET);
  if (error || !data) {
    if (error && /not.?found/i.test(error.message)) throw new EventPhotoBucketMissingError(error.message);
    return null;
  }
  const lim = (data as { file_size_limit?: number | null }).file_size_limit;
  return typeof lim === "number" && lim > 0 ? lim : null;
}

function kindFromPath(path: string): { kind: NoticeAttachmentKind; mime: string } | null {
  const ext = path.split(".").pop();
  if (ext === "jpg") return { kind: "image", mime: "image/jpeg" };
  if (ext === "png") return { kind: "image", mime: "image/png" };
  if (ext === "webp") return { kind: "image", mime: "image/webp" };
  if (ext === "pdf") return { kind: "pdf", mime: "application/pdf" };
  if (ext === "docx") return { kind: "docx", mime: storedMimeFor("docx", "") as string };
  return null;
}

// ─── POST: 送り先を出す ───

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeNotices();
    if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "ログインが必要です" : "Not Found" }, { status: auth.status });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const r = await editableNotice(auth, typeof body?.noticeId === "string" ? body.noticeId : "");
    if (!r.notice) return r.res;
    const n = r.notice;
    const name = safeFileName(typeof body?.name === "string" ? body.name : "");
    const mime = typeof body?.mime === "string" ? body.mime : "";
    const size = typeof body?.size === "number" ? body.size : -1;

    if (n.attachments.length >= NOTICE_FILE_MAX_COUNT) {
      return NextResponse.json({ error: `1件に貼れるのは${NOTICE_FILE_MAX_COUNT}ファイルまでです` }, { status: 400 });
    }
    const kind = attachmentKindOf(mime, name);
    if (!kind) return NextResponse.json({ error: "貼れるのは画像（JPEG・PNG・HEIC・WebP）・PDF・Word（.docx）だけです" }, { status: 400 });
    const stored = storedMimeFor(kind, mime);
    if (!stored) {
      return NextResponse.json({ error: "画像はJPEG・PNG・WebPにしてから送ってください（HEICは画面が自動で変換します）" }, { status: 400 });
    }
    if (size <= 0 || size > NOTICE_FILE_MAX_BYTES) {
      return NextResponse.json({ error: `1ファイル${formatBytes(NOTICE_FILE_MAX_BYTES)}までです（このファイルは${formatBytes(Math.max(0, size))}）` }, { status: 400 });
    }
    const limit = await bucketLimit(auth);
    if (limit !== null && size > limit) {
      // 165 で作った置き場の上限は8MB。10MBまで広げるSQLを院長が実行するまでは、ここで止める（理由を名指しする）
      const forAdmin = auth.isAdmin
        ? `置き場（event-photos）の上限が${formatBytes(limit)}のままです。Supabase の SQL Editor で ${LIMIT_SQL} を実行すると10MBまで貼れるようになります。`
        : `いまは${formatBytes(limit)}までのファイルしか貼れません（院長が設定を広げると10MBまで貼れます）。`;
      return NextResponse.json({ error: forAdmin, code: "bucket_limit" }, { status: 400 });
    }
    const path = noticeFilePath(n.id, extFor(kind, stored));
    const { data, error } = await auth.admin.storage.from(EVENT_PHOTOS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw translateStorageError(error?.message ?? "送り先を用意できませんでした");
    return NextResponse.json({ path: data.path, token: data.token, mime: stored, bucket: EVENT_PHOTOS_BUCKET });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── PUT: 確かめて付ける ───

export async function PUT(req: NextRequest) {
  try {
    const auth = await authorizeNotices();
    if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "ログインが必要です" : "Not Found" }, { status: auth.status });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const r = await editableNotice(auth, typeof body?.noticeId === "string" ? body.noticeId : "");
    if (!r.notice) return r.res;
    const n = r.notice;
    const path = typeof body?.path === "string" ? body.path : "";
    const name = safeFileName(typeof body?.name === "string" ? body.name : "");
    if (!isNoticeFilePath(n.id, path)) return NextResponse.json({ error: "ファイルの場所が正しくありません" }, { status: 400 });
    if (n.attachments.some((a) => a.path === path)) {
      const signed = await withSignedAttachments(auth.admin, n);
      return NextResponse.json({ notice: signed.notice });
    }
    const bucket = auth.admin.storage.from(EVENT_PHOTOS_BUCKET);
    const reject = async (msg: string) => {
      await bucket.remove([path]).catch(() => undefined);
      return NextResponse.json({ error: msg }, { status: 400 });
    };
    if (n.attachments.length >= NOTICE_FILE_MAX_COUNT) {
      return reject(`1件に貼れるのは${NOTICE_FILE_MAX_COUNT}ファイルまでです`);
    }
    const t = kindFromPath(path);
    if (!t) return reject("この種類のファイルは貼れません");

    const { data: blob, error: dlErr } = await bucket.download(path);
    if (dlErr || !blob) throw translateStorageError(dlErr?.message ?? "送られたファイルが見つかりません");
    let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length === 0 || bytes.length > NOTICE_FILE_MAX_BYTES) {
      return reject(`1ファイル${formatBytes(NOTICE_FILE_MAX_BYTES)}までです`);
    }
    if (!sniffMatches(t.kind, t.mime, sniffFileType(bytes))) {
      return reject("ファイルの中身が種類と合いません（拡張子を付け替えたファイルは貼れません）");
    }
    if (t.kind === "image") {
      // 位置情報などのメタデータを消してから置き直す（228 §2-2）
      let stripped: ReturnType<typeof stripImageMetadata>;
      try {
        stripped = stripImageMetadata(bytes, t.mime);
      } catch {
        return reject("画像を読み取れませんでした");
      }
      if (stripped.removed.length > 0) {
        const { error: upErr } = await bucket.upload(path, stripped.bytes, { contentType: t.mime, upsert: true });
        if (upErr) {
          await bucket.remove([path]).catch(() => undefined);
          throw translateStorageError(upErr.message);
        }
        bytes = stripped.bytes;
      }
    }
    const next: Notice = {
      ...n,
      attachments: [
        ...n.attachments,
        { path, name, kind: t.kind, mime: t.mime, size: bytes.length, uploadedAt: new Date().toISOString() },
      ],
      updatedAt: new Date().toISOString(),
    };
    await saveNotice(auth.admin, next, false);
    const signed = await withSignedAttachments(auth.admin, next);
    return NextResponse.json({ notice: signed.notice });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── DELETE: 外す ───

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authorizeNotices();
    if (!auth.ok) return NextResponse.json({ error: auth.status === 401 ? "ログインが必要です" : "Not Found" }, { status: auth.status });
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const r = await editableNotice(auth, typeof body?.noticeId === "string" ? body.noticeId : "");
    if (!r.notice) return r.res;
    const n = r.notice;
    const path = typeof body?.path === "string" ? body.path : "";
    if (!n.attachments.some((a) => a.path === path)) return NextResponse.json({ error: "そのファイルは付いていません" }, { status: 404 });
    // 実体を先に消す（失敗したら付けたままにする＝やり直せる）
    const { error } = await auth.admin.storage.from(EVENT_PHOTOS_BUCKET).remove([path]);
    if (error) throw translateStorageError(error.message);
    const next: Notice = { ...n, attachments: n.attachments.filter((a) => a.path !== path), updatedAt: new Date().toISOString() };
    await saveNotice(auth.admin, next, false);
    const signed = await withSignedAttachments(auth.admin, next);
    return NextResponse.json({ notice: signed.notice });
  } catch (e) {
    return errorResponse(e);
  }
}
