// イベント機能API（指示書132-A/132-B・機能ID events）
// - データは clinic_events テーブル（RLS有効＋ポリシーなし＝直アクセス全拒否）。
//   読み書きは本API（Service Role）経由のみ＝サーバー側で権限を強制する（110基盤と同方式）。
// - 権限: 閲覧=ログイン済みスタッフ全員（401）。
//   書き込み=管理者 or 指定メンバー（config行 editorUserIds）。
//   fail-close: config行なし・取得失敗・空リスト → 管理者のみ書き込み可。
// - 写真は非公開バケット event-photos。一覧GETで期限つき署名URLを都度発行（担保案1・
//   恒久URLはDBに保存しない＝ログインスタッフがAPIを通らない限り画像URLが得られない）。
// - 完全削除=管理者のみ。写真実体（Storage）→DB行の順で孤児ゼロ。
// - 認可・行アクセスの共通部は lib/events-server.ts（/api/events/photos と共用）。

import { NextRequest, NextResponse } from "next/server";
import { ServiceRoleMissingError } from "@/lib/supabase-admin";
import {
  EVENTS_TABLE,
  EVENT_PHOTOS_BUCKET,
  EventPhotoBucketMissingError,
  authorizeEvents,
  loadEditorUserIds,
  fetchEventRow,
  saveEventRow,
  attachSignedUrls,
  eventPhotosBucketExists,
  translateStorageError,
} from "@/lib/events-server";
import {
  EVENT_CONFIG_ID,
  normalizeClinicEvent,
  normalizeEventLibraryRefs,
  sortEventsByHeldOn,
  type ClinicEvent,
} from "@/lib/clinic-events";

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
  if (/clinic_events.*(does not exist|schema cache)/i.test(msg)) {
    return NextResponse.json(
      { error: "イベント用テーブル（clinic_events）が未作成です。指示書132AのSQLを実行してください。" },
      { status: 503 }
    );
  }
  return NextResponse.json({ error: msg }, { status: 500 });
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function ymd(v: unknown): string {
  const s = str(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function genEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── GET: 一覧（?all=1で削除済み含む）／?config=1 で編集メンバー（管理者のみ） ───

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeEvents();
    if (!auth.user || !auth.admin) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);

    if (searchParams.get("config") === "1") {
      if (!auth.isAdmin) {
        return NextResponse.json({ error: "権限がありません" }, { status: 403 });
      }
      const editorUserIds = await loadEditorUserIds(auth.admin);
      return NextResponse.json({ editorUserIds });
    }

    const all = searchParams.get("all") === "1";
    const { data, error } = await auth.admin
      .from(EVENTS_TABLE)
      .select("id, data")
      .eq("record_type", "event");
    if (error) throw new Error(error.message);

    let events = (data ?? [])
      .map((r) => normalizeClinicEvent(r.id, r.data))
      .filter((e): e is ClinicEvent => e !== null);
    if (!all) events = events.filter((e) => !e.deleted);

    // 写真の署名URLを付与（132-B・担保案1）
    const signed = await attachSignedUrls(auth.admin, sortEventsByHeldOn(events));

    // 写真の保管庫が無いことを、編集できる人にだけ先に知らせる（165）。
    // 一覧を落とさない（写真以外は使える）が、黙ってもいない。
    // 閲覧専用のスタッフには出さない＝直せない人に出しても意味がないため、
    // Storage への問い合わせもその場合はしない（全員分の往復を増やさない）。
    let photoBucketMissing = signed.bucketMissing;
    if (auth.canEdit && !photoBucketMissing) {
      photoBucketMissing = !(await eventPhotosBucketExists(auth.admin));
    }

    return NextResponse.json({
      events: signed.events,
      canEdit: auth.canEdit,
      isAdmin: auth.isAdmin,
      photoBucketMissing,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── POST: 新規作成（管理者 or 指定メンバー） ───

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeEvents();
    if (!auth.user || !auth.admin) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    if (!auth.canEdit) {
      return NextResponse.json({ error: "投稿権限がありません" }, { status: 403 });
    }
    const body = (await req.json()) as Record<string, unknown>;
    const title = str(body.title).trim();
    const heldOn = ymd(body.heldOn);
    if (!title || !heldOn) {
      return NextResponse.json(
        { error: "タイトルと開催日は必須です" },
        { status: 400 }
      );
    }
    const now = new Date().toISOString();
    const ev: ClinicEvent = {
      id: genEventId(),
      title,
      heldOn,
      description: str(body.description),
      libraryRefs: normalizeEventLibraryRefs(body.libraryRefs),
      photos: [],
      deleted: false,
      createdAt: now,
      updatedAt: now,
    };
    await saveEventRow(auth.admin, ev, true);
    return NextResponse.json({ event: ev });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── PATCH: 更新・論理削除/復元（単体 or ids[]一括） ───

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authorizeEvents();
    if (!auth.user || !auth.admin) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    if (!auth.canEdit) {
      return NextResponse.json({ error: "編集権限がありません" }, { status: 403 });
    }
    const body = (await req.json()) as Record<string, unknown>;

    // 一括論理削除/復元（指示書128の一括操作: 1リクエストで処理）
    if (Array.isArray(body.ids)) {
      const ids = body.ids.filter(
        (v): v is string => typeof v === "string" && v !== ""
      );
      const deleted = body.deleted === true;
      for (const id of ids) {
        const ev = await fetchEventRow(auth.admin, id);
        if (!ev) continue;
        await saveEventRow(
          auth.admin,
          { ...ev, deleted, updatedAt: new Date().toISOString() },
          false
        );
      }
      return NextResponse.json({ ok: true, count: ids.length });
    }

    const id = str(body.id);
    if (!id) {
      return NextResponse.json({ error: "id は必須です" }, { status: 400 });
    }
    const ev = await fetchEventRow(auth.admin, id);
    if (!ev) {
      return NextResponse.json({ error: "イベントが見つかりません" }, { status: 404 });
    }
    const next: ClinicEvent = {
      ...ev,
      title: "title" in body ? str(body.title).trim() || ev.title : ev.title,
      heldOn: "heldOn" in body ? ymd(body.heldOn) || ev.heldOn : ev.heldOn,
      description:
        "description" in body ? str(body.description) : ev.description,
      libraryRefs:
        "libraryRefs" in body
          ? normalizeEventLibraryRefs(body.libraryRefs)
          : ev.libraryRefs,
      deleted: "deleted" in body ? body.deleted === true : ev.deleted,
      updatedAt: new Date().toISOString(),
    };
    await saveEventRow(auth.admin, next, false);
    return NextResponse.json({ event: next });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── DELETE: 完全削除（管理者のみ・写真実体→DB行の順で孤児ゼロ） ───

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authorizeEvents();
    if (!auth.user || !auth.admin) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    const id = str(new URL(req.url).searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "id は必須です" }, { status: 400 });
    }
    const ev = await fetchEventRow(auth.admin, id);
    if (!ev) {
      return NextResponse.json({ error: "イベントが見つかりません" }, { status: 404 });
    }
    // 写真実体を先に削除（非公開バケット event-photos・失敗時は中断して明示＝孤児ゼロ）
    const paths = ev.photos.map((p) => p.path).filter(Boolean);
    if (paths.length > 0) {
      const { error: rmError } = await auth.admin.storage
        .from(EVENT_PHOTOS_BUCKET)
        .remove(paths);
      if (rmError) {
        // バケット未作成なら「再試行」ではなく作成が答え＝原因を名指しする（165）。
        // それ以外は従来どおり再試行を促す（DBは変えていない＝孤児ゼロ）。
        const translated = translateStorageError(rmError.message);
        if (translated instanceof EventPhotoBucketMissingError) throw translated;
        return NextResponse.json(
          { error: `写真の削除に失敗しました（再試行してください）: ${rmError.message}` },
          { status: 500 }
        );
      }
    }
    const { error } = await auth.admin
      .from(EVENTS_TABLE)
      .delete()
      .eq("id", id)
      .eq("record_type", "event");
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── PUT: 編集メンバー設定の保存（管理者のみ） ───

export async function PUT(req: NextRequest) {
  try {
    const auth = await authorizeEvents();
    if (!auth.user || !auth.admin) {
      return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
    }
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "権限がありません" }, { status: 403 });
    }
    const body = (await req.json()) as Record<string, unknown>;
    const editorUserIds = Array.isArray(body.editorUserIds)
      ? body.editorUserIds.filter(
          (v): v is string => typeof v === "string" && v !== ""
        )
      : [];
    const { error } = await auth.admin.from(EVENTS_TABLE).upsert({
      id: EVENT_CONFIG_ID,
      record_type: "config",
      data: { editorUserIds },
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, editorUserIds });
  } catch (e) {
    return errorResponse(e);
  }
}
