// プロフィール写真 API（要ログイン・本人のみ）
// POST: multipart/form-data { kind: "avatar" | "photo", file }
//   - avatar → staff-photos/{userId}/avatar.jpg（上書き）
//   - photo  → staff-photos/{userId}/photos/{uuid}.jpg（上限 MAX_SHARED_PHOTOS 枚）
// DELETE: { url } 自分の共有写真を削除（Storage＋プロフィールから除去）
// ※ バケット staff-photos はダッシュボードで作成済み前提。未作成時は分かりやすいエラーを返す。

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "@/lib/supabase-admin";
import {
  getSessionUser,
  loadProfileServer,
  saveProfileServer,
} from "@/lib/staff-profiles-server";
import {
  STAFF_PHOTOS_BUCKET,
  MAX_SHARED_PHOTOS,
} from "@/lib/staff-profiles";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // クライアントでリサイズ済み前提の安全網

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  const msg = e instanceof Error ? e.message : "処理に失敗しました";
  // バケット未作成の典型エラーを分かりやすく
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

  const kind = form.get("kind");
  const file = form.get("file");
  if ((kind !== "avatar" && kind !== "photo") || !(file instanceof Blob)) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "画像サイズが不正です（4MBまで）" },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const profile = await loadProfileServer(db, user.id);

    if (kind === "photo" && profile.photos.length >= MAX_SHARED_PHOTOS) {
      return NextResponse.json(
        { error: `共有写真は1人 ${MAX_SHARED_PHOTOS} 枚までです` },
        { status: 400 }
      );
    }

    const path =
      kind === "avatar"
        ? `${user.id}/avatar.jpg`
        : `${user.id}/photos/${randomUUID()}.jpg`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upError } = await admin.storage
      .from(STAFF_PHOTOS_BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: kind === "avatar" });
    if (upError) throw new Error(upError.message);

    const { data: pub } = admin.storage
      .from(STAFF_PHOTOS_BUCKET)
      .getPublicUrl(path);
    // アバターは同一パス上書きのためキャッシュバスターを付ける
    const url =
      kind === "avatar" ? `${pub.publicUrl}?v=${Date.now()}` : pub.publicUrl;

    if (kind === "avatar") {
      profile.avatarUrl = url;
    } else {
      profile.photos = [
        ...profile.photos,
        { url, uploadedAt: new Date().toISOString() },
      ];
    }
    if (!profile.name) profile.name = user.email ?? "";
    await saveProfileServer(db, profile);

    return NextResponse.json({ ok: true, url });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const { user, db } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  let body: { url?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const url = typeof body.url === "string" ? body.url : "";

  // URL から Storage パスを取り出し、本人のフォルダ配下であることを検証
  const marker = `/storage/v1/object/public/${STAFF_PHOTOS_BUCKET}/`;
  const idx = url.indexOf(marker);
  const path = idx >= 0 ? decodeURIComponent(url.slice(idx + marker.length).split("?")[0]) : "";
  if (!path || !path.startsWith(`${user.id}/photos/`)) {
    return NextResponse.json(
      { error: "自分の共有写真のみ削除できます" },
      { status: 403 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error: rmError } = await admin.storage
      .from(STAFF_PHOTOS_BUCKET)
      .remove([path]);
    if (rmError) throw new Error(rmError.message);

    const profile = await loadProfileServer(db, user.id);
    profile.photos = profile.photos.filter((p) => p.url !== url);
    await saveProfileServer(db, profile);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
