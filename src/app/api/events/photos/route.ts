// イベント写真API（指示書132-B・担保案1=非公開バケット＋署名URL）
// - POST: 写真アップロード（multipart・管理者or編集メンバーのみ・1回20枚/各8MBサーバー強制）。
//   バケット event-photos（public: false）は交付SQLで事前作成するのが正（165）。
//   コード側の自動作成は保険で、作れなかった場合は原因を名指しして503で返す。
// - DELETE: 写真の付け外し＝**Storage実体を即削除**→DBから参照を除去（132承認済みの原則。
//   実体削除が失敗した場合はDBを変えず明示エラー＝孤児ゼロ）。
// - 認可・行アクセスは lib/events-server.ts（/api/events と共用・重複実装禁止）。

import { NextRequest, NextResponse } from "next/server";
import { ServiceRoleMissingError } from "@/lib/supabase-admin";
import {
  EVENT_PHOTOS_BUCKET,
  EVENT_PHOTO_MAX_BYTES,
  EVENT_PHOTO_MAX_COUNT,
  EventPhotoBucketMissingError,
  authorizeEvents,
  fetchEventRow,
  saveEventRow,
  ensureEventPhotosBucket,
  attachSignedUrls,
  translateStorageError,
} from "@/lib/events-server";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  // 前提リソース（バケット）未作成は「設定不足」＝503 で、何を作ればよいか名指しする（165）
  if (e instanceof EventPhotoBucketMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  const msg = e instanceof Error ? e.message : "処理に失敗しました";
  return NextResponse.json({ error: msg }, { status: 500 });
}

// ─── POST: アップロード（multipart: eventId + files[]） ───

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeEvents();
    if (!auth.user || !auth.admin) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    if (!auth.canEdit) {
      return NextResponse.json({ error: "写真を追加する権限がありません" }, { status: 403 });
    }

    const form = await req.formData();
    const eventId = String(form.get("eventId") ?? "");
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    if (!eventId || files.length === 0) {
      return NextResponse.json(
        { error: "eventId と写真ファイルは必須です" },
        { status: 400 }
      );
    }
    if (files.length > EVENT_PHOTO_MAX_COUNT) {
      return NextResponse.json(
        { error: `1回にアップロードできるのは${EVENT_PHOTO_MAX_COUNT}枚までです` },
        { status: 400 }
      );
    }
    for (const f of files) {
      if (f.size > EVENT_PHOTO_MAX_BYTES) {
        return NextResponse.json(
          { error: "8MBを超える写真が含まれています（アプリ側の圧縮に失敗した可能性があります）" },
          { status: 400 }
        );
      }
      if (!f.type.startsWith("image/")) {
        return NextResponse.json(
          { error: "画像ファイルのみアップロードできます" },
          { status: 400 }
        );
      }
    }

    const ev = await fetchEventRow(auth.admin, eventId);
    if (!ev) {
      return NextResponse.json({ error: "イベントが見つかりません" }, { status: 404 });
    }

    await ensureEventPhotosBucket(auth.admin);

    const now = new Date().toISOString();
    const added: { path: string; uploadedAt: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.type === "image/png" ? "png" : "jpg";
      const path = `${eventId}/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const bytes = Buffer.from(await f.arrayBuffer());
      const { error } = await auth.admin.storage
        .from(EVENT_PHOTOS_BUCKET)
        .upload(path, bytes, { contentType: f.type, upsert: false });
      // バケットが無い場合は「アップロードに失敗しました」で終わらせない（165）
      if (error) throw translateStorageError(error.message);
      added.push({ path, uploadedAt: now });
    }

    const next = {
      ...ev,
      photos: [...ev.photos, ...added],
      updatedAt: now,
    };
    await saveEventRow(auth.admin, next, false);

    const signed = (await attachSignedUrls(auth.admin, [next])).events[0];
    return NextResponse.json({ event: signed });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── DELETE: 付け外し（Storage実体を即削除→DB参照除去・JSON body: {eventId, path}） ───

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authorizeEvents();
    if (!auth.user || !auth.admin) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    if (!auth.canEdit) {
      return NextResponse.json({ error: "写真を外す権限がありません" }, { status: 403 });
    }
    const body = (await req.json()) as { eventId?: unknown; path?: unknown };
    const eventId = typeof body.eventId === "string" ? body.eventId : "";
    const path = typeof body.path === "string" ? body.path : "";
    if (!eventId || !path) {
      return NextResponse.json({ error: "eventId と path は必須です" }, { status: 400 });
    }

    const ev = await fetchEventRow(auth.admin, eventId);
    if (!ev) {
      return NextResponse.json({ error: "イベントが見つかりません" }, { status: 404 });
    }
    if (!ev.photos.some((p) => p.path === path)) {
      return NextResponse.json({ error: "対象の写真が見つかりません" }, { status: 404 });
    }

    // 実体を先に削除（失敗時はDBを変えない＝参照が残り再試行できる）
    const { error: rmError } = await auth.admin.storage
      .from(EVENT_PHOTOS_BUCKET)
      .remove([path]);
    if (rmError) {
      // バケット未作成なら再試行では直らない＝作るべきものを名指しする（165）
      const translated = translateStorageError(rmError.message);
      if (translated instanceof EventPhotoBucketMissingError) throw translated;
      return NextResponse.json(
        { error: `写真の削除に失敗しました（再試行してください）: ${rmError.message}` },
        { status: 500 }
      );
    }

    const next = {
      ...ev,
      photos: ev.photos.filter((p) => p.path !== path),
      updatedAt: new Date().toISOString(),
    };
    await saveEventRow(auth.admin, next, false);

    const signed = (await attachSignedUrls(auth.admin, [next])).events[0];
    return NextResponse.json({ event: signed });
  } catch (e) {
    return errorResponse(e);
  }
}
