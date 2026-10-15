// 📜 当院の歩み：写真（指示書253 §2）— 書く人（院長・任された幹部）だけ
//
//   POST   { entryId, name, mime, size } … 置き場に直接送るための「1回だけ使える送り先」を出す
//   PUT    { entryId, path, name }       … 送り終わった写真を確かめて、出来事に付ける
//   DELETE { entryId, path }             … 外す（置き場の実体も消す）
//
// 228（お知らせ・イベント）と同じ置き場・同じ決まり：1枚10MBまで・1件に10枚まで・画像だけ。
//   端末で描き直してから送る（位置情報などを消す・HEICはJPEG）。サーバーでももう一度メタデータを消して置き直す。

import { NextResponse, type NextRequest } from "next/server";
import { EVENT_PHOTOS_BUCKET, translateStorageError } from "@/lib/events-server";
import { authorizeAyumi, ayumiPhotoPath, isAyumiPhotoPath, loadEntry, saveEntry, visibleEntries, withPhotoUrls } from "@/lib/ayumi-server";
import { NOTICE_FILE_MAX_BYTES, attachmentKindOf, extFor, formatBytes, safeFileName, sniffFileType, sniffMatches, storedMimeFor } from "@/lib/notices";
import { stripImageMetadata } from "@/lib/notice-image-meta";
import { PHOTO_MAX_COUNT, type AyumiEntry } from "@/lib/ayumi";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const hidden = () => NextResponse.json({ error: "Not Found" }, { status: 404, headers: NO_STORE });
const bad = (msg: string) => NextResponse.json({ error: msg }, { status: 400, headers: NO_STORE });
const fail = (e: unknown) => NextResponse.json({ error: e instanceof Error ? e.message : "処理に失敗しました" }, { status: 500, headers: NO_STORE });

async function editable(entryId: string) {
  const auth = await authorizeAyumi();
  if (!auth.ok) return { res: NextResponse.json({ error: auth.status === 401 ? "ログインが必要です" : "Not Found" }, { status: auth.status }) };
  if (!auth.canWrite) return { res: hidden() };
  const e = entryId ? await loadEntry(auth.admin, entryId) : null;
  if (!e || visibleEntries([e], auth.user).length === 0) return { res: hidden() };
  return { auth, entry: e };
}

function mimeFromPath(path: string): string | null {
  const ext = path.split(".").pop();
  return ext === "jpg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const r = await editable(typeof body.entryId === "string" ? body.entryId : "");
    if (!r.auth) return r.res;
    const e = r.entry;
    const name = safeFileName(typeof body.name === "string" ? body.name : "");
    const mime = typeof body.mime === "string" ? body.mime : "";
    const size = typeof body.size === "number" ? body.size : -1;
    if (e.photos.length >= PHOTO_MAX_COUNT) return bad(`写真は1件に${PHOTO_MAX_COUNT}枚までです`);
    if (attachmentKindOf(mime, name) !== "image") return bad("貼れるのは画像（JPEG・PNG・HEIC・WebP）だけです");
    const stored = storedMimeFor("image", mime);
    if (!stored) return bad("画像はJPEG・PNG・WebPにしてから送ってください（HEICは画面が自動で変換します）");
    if (size <= 0 || size > NOTICE_FILE_MAX_BYTES) return bad(`1枚${formatBytes(NOTICE_FILE_MAX_BYTES)}までです（この写真は${formatBytes(Math.max(0, size))}）`);
    const path = ayumiPhotoPath(e.id, extFor("image", stored));
    const { data, error } = await r.auth.admin.storage.from(EVENT_PHOTOS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw translateStorageError(error?.message ?? "送り先を用意できませんでした");
    return NextResponse.json({ path: data.path, token: data.token, mime: stored, bucket: EVENT_PHOTOS_BUCKET }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const r = await editable(typeof body.entryId === "string" ? body.entryId : "");
    if (!r.auth) return r.res;
    const { auth, entry: e } = r;
    const path = typeof body.path === "string" ? body.path : "";
    const name = safeFileName(typeof body.name === "string" ? body.name : "");
    if (!isAyumiPhotoPath(e.id, path)) return bad("写真の場所が正しくありません");
    const bucket = auth.admin.storage.from(EVENT_PHOTOS_BUCKET);
    const reject = async (msg: string) => {
      await bucket.remove([path]).catch(() => undefined);
      return bad(msg);
    };
    if (!e.photos.some((p) => p.path === path)) {
      if (e.photos.length >= PHOTO_MAX_COUNT) return reject(`写真は1件に${PHOTO_MAX_COUNT}枚までです`);
      const mime = mimeFromPath(path);
      if (!mime) return reject("この種類のファイルは貼れません");
      const { data: blob, error: dlErr } = await bucket.download(path);
      if (dlErr || !blob) throw translateStorageError(dlErr?.message ?? "送られた写真が見つかりません");
      let bytes: Uint8Array = new Uint8Array(await blob.arrayBuffer());
      if (bytes.length === 0 || bytes.length > NOTICE_FILE_MAX_BYTES) return reject(`1枚${formatBytes(NOTICE_FILE_MAX_BYTES)}までです`);
      if (!sniffMatches("image", mime, sniffFileType(bytes))) return reject("ファイルの中身が種類と合いません");
      // 位置情報などのメタデータを消してから置き直す（228と同じ）
      let stripped: ReturnType<typeof stripImageMetadata>;
      try {
        stripped = stripImageMetadata(bytes, mime);
      } catch {
        return reject("画像を読み取れませんでした");
      }
      if (stripped.removed.length > 0) {
        const { error: upErr } = await bucket.upload(path, stripped.bytes, { contentType: mime, upsert: true });
        if (upErr) {
          await bucket.remove([path]).catch(() => undefined);
          throw translateStorageError(upErr.message);
        }
        bytes = stripped.bytes;
      }
      const next: AyumiEntry = { ...e, photos: [...e.photos, { path, name, size: bytes.length, uploadedAt: new Date().toISOString() }] };
      const saved = await saveEntry(auth.admin, next, auth.user.email ?? auth.user.id);
      return NextResponse.json({ entry: (await withPhotoUrls(auth.admin, [saved]))[0] }, { headers: NO_STORE });
    }
    return NextResponse.json({ entry: (await withPhotoUrls(auth.admin, [e]))[0] }, { headers: NO_STORE });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const r = await editable(typeof body.entryId === "string" ? body.entryId : "");
    if (!r.auth) return r.res;
    const { auth, entry: e } = r;
    const path = typeof body.path === "string" ? body.path : "";
    if (!e.photos.some((p) => p.path === path)) return NextResponse.json({ error: "その写真は付いていません" }, { status: 404, headers: NO_STORE });
    const { error } = await auth.admin.storage.from(EVENT_PHOTOS_BUCKET).remove([path]);
    if (error) throw translateStorageError(error.message);
    const saved = await saveEntry(auth.admin, { ...e, photos: e.photos.filter((p) => p.path !== path) }, auth.user.email ?? auth.user.id);
    return NextResponse.json({ entry: (await withPhotoUrls(auth.admin, [saved]))[0] }, { headers: NO_STORE });
  } catch (err) {
    return fail(err);
  }
}
