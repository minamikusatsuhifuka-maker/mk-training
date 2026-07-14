// プロフィール写真 API（要ログイン・本人のみ）
// POST: multipart/form-data { kind: "avatar" | "photo" | "survey", file }
//   - avatar → staff-photos/{userId}/avatar.jpg（上書き）
//   - photo  → staff-photos/{userId}/photos/{uuid}.jpg（上限 MAX_SHARED_PHOTOS 枚）
//   - survey → staff-photos/{userId}/survey/{uuid}.jpg|.pdf（基本的欲求サーベイ。指示書58/60・1ファイルのみ＝差し替え）
//     PDF（application/pdf）はリサイズせずバイト列をそのまま保存する（指示書60）
// DELETE: { url } 自分の共有写真／サーベイファイルを削除（Storage＋プロフィールから除去）
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
const MAX_PDF_BYTES = 10 * 1024 * 1024; // PDFはリサイズしないため別上限（指示書60）

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
  if (
    (kind !== "avatar" && kind !== "photo" && kind !== "survey") ||
    !(file instanceof Blob)
  ) {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  // PDF は survey のみ受理（画像はリサイズ済み前提、PDFは無加工のため別上限）
  const isPdf = file.type === "application/pdf";
  if (isPdf && kind !== "survey") {
    return NextResponse.json(
      { error: "PDFはサーベイのみアップロードできます" },
      { status: 400 }
    );
  }
  const maxBytes = isPdf ? MAX_PDF_BYTES : MAX_UPLOAD_BYTES;
  if (file.size === 0 || file.size > maxBytes) {
    return NextResponse.json(
      {
        error: isPdf
          ? "PDFサイズが不正です（10MBまで）"
          : "画像サイズが不正です（4MBまで）",
      },
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
        : kind === "survey"
          ? `${user.id}/survey/${randomUUID()}.${isPdf ? "pdf" : "jpg"}`
          : `${user.id}/photos/${randomUUID()}.jpg`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upError } = await admin.storage
      .from(STAFF_PHOTOS_BUCKET)
      .upload(path, bytes, {
        contentType: isPdf ? "application/pdf" : "image/jpeg",
        upsert: kind === "avatar",
      });
    if (upError) throw new Error(upError.message);

    const { data: pub } = admin.storage
      .from(STAFF_PHOTOS_BUCKET)
      .getPublicUrl(path);
    // アバターは同一パス上書きのためキャッシュバスターを付ける
    const url =
      kind === "avatar" ? `${pub.publicUrl}?v=${Date.now()}` : pub.publicUrl;

    if (kind === "avatar") {
      profile.avatarUrl = url;
    } else if (kind === "survey") {
      // サーベイ画像は1枚のみ＝差し替え。旧ファイルはベストエフォートで削除
      const oldUrl = profile.needsSurvey?.imageUrl ?? "";
      const marker = `/storage/v1/object/public/${STAFF_PHOTOS_BUCKET}/`;
      const oldIdx = oldUrl.indexOf(marker);
      const oldPath =
        oldIdx >= 0
          ? decodeURIComponent(
              oldUrl.slice(oldIdx + marker.length).split("?")[0]
            )
          : "";
      if (oldPath.startsWith(`${user.id}/survey/`)) {
        await admin.storage
          .from(STAFF_PHOTOS_BUCKET)
          .remove([oldPath])
          .catch(() => {});
      }
      profile.needsSurvey = {
        visibility: "private",
        ...(profile.needsSurvey ?? {}),
        imageUrl: url,
        updatedAt: new Date().toISOString(),
      };
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
  // （共有写真 {uid}/photos/ またはサーベイ画像 {uid}/survey/ のみ削除可）
  const marker = `/storage/v1/object/public/${STAFF_PHOTOS_BUCKET}/`;
  const idx = url.indexOf(marker);
  const path = idx >= 0 ? decodeURIComponent(url.slice(idx + marker.length).split("?")[0]) : "";
  const isPhoto = path.startsWith(`${user.id}/photos/`);
  const isSurvey = path.startsWith(`${user.id}/survey/`);
  if (!path || (!isPhoto && !isSurvey)) {
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
    if (isSurvey) {
      // サーベイ削除はファイル＋読み取り値をまるごとクリア（指示書61のリセット導線。
      // aiParsed=false に戻り、/profile のスライダーが再表示され手入力できる）。開示設定は維持。
      if (profile.needsSurvey) {
        profile.needsSurvey = {
          visibility: profile.needsSurvey.visibility,
          aiParsed: false,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      profile.photos = profile.photos.filter((p) => p.url !== url);
    }
    await saveProfileServer(db, profile);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
