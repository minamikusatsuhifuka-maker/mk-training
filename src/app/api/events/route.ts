// イベント機能API（指示書132-A・機能ID events）
// - データは clinic_events テーブル（RLS有効＋ポリシーなし＝直アクセス全拒否）。
//   読み書きは本API（Service Role）経由のみ＝サーバー側で権限を強制する（110基盤と同方式）。
// - 権限: 閲覧=ログイン済みスタッフ全員（401）。
//   書き込み=管理者 or 指定メンバー（config行 editorUserIds）。
//   fail-close: config行なし・取得失敗・空リスト → 管理者のみ書き込み可。
// - 完全削除=管理者のみ。写真実体（Storage）を先に掃除してからDB行を削除（孤児ゼロ原則）。
// - 編集メンバー設定（config）の閲覧・保存=管理者のみ。

import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";
import { STAFF_PHOTOS_BUCKET } from "@/lib/staff-profiles";
import {
  EVENT_CONFIG_ID,
  normalizeClinicEvent,
  normalizeEventLibraryRefs,
  sortEventsByHeldOn,
  type ClinicEvent,
} from "@/lib/clinic-events";

export const runtime = "nodejs";
export const maxDuration = 60;

const TABLE = "clinic_events";

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  const msg = e instanceof Error ? e.message : "処理に失敗しました";
  // テーブル未作成（SQL実行前）を分かりやすく返す
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

// 編集メンバー設定の取得（無い・壊れている場合は空＝fail-close）
async function loadEditorUserIds(
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<string[]> {
  try {
    const { data } = await admin
      .from(TABLE)
      .select("data")
      .eq("id", EVENT_CONFIG_ID)
      .maybeSingle();
    const ids = (data?.data as { editorUserIds?: unknown } | null)
      ?.editorUserIds;
    return Array.isArray(ids)
      ? ids.filter((v): v is string => typeof v === "string" && v !== "")
      : [];
  } catch {
    return []; // fail-close（管理者のみ書き込み可になる）
  }
}

// 認証＋権限の共通前段
async function authorize() {
  const { user } = await getSessionUser();
  if (!user) {
    return { user: null, admin: null, isAdmin: false, canEdit: false } as const;
  }
  const admin = createSupabaseAdminClient();
  const isAdmin = isAdminUser(user);
  const editors = await loadEditorUserIds(admin);
  const canEdit = isAdmin || editors.includes(user.id);
  return { user, admin, isAdmin, canEdit } as const;
}

function genEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchEventRow(
  admin: NonNullable<Awaited<ReturnType<typeof authorize>>["admin"]>,
  id: string
): Promise<ClinicEvent | null> {
  const { data } = await admin
    .from(TABLE)
    .select("id, data")
    .eq("id", id)
    .eq("record_type", "event")
    .maybeSingle();
  if (!data) return null;
  return normalizeClinicEvent(data.id, data.data);
}

async function saveEventRow(
  admin: NonNullable<Awaited<ReturnType<typeof authorize>>["admin"]>,
  ev: ClinicEvent,
  isNew: boolean
): Promise<void> {
  const { id, ...data } = ev;
  if (isNew) {
    const { error } = await admin
      .from(TABLE)
      .insert({ id, record_type: "event", data });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .from(TABLE)
      .update({ data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("record_type", "event");
    if (error) throw new Error(error.message);
  }
}

// ─── GET: 一覧（?all=1で削除済み含む）／?config=1 で編集メンバー（管理者のみ） ───

export async function GET(req: NextRequest) {
  try {
    const auth = await authorize();
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
      .from(TABLE)
      .select("id, data")
      .eq("record_type", "event");
    if (error) throw new Error(error.message);

    let events = (data ?? [])
      .map((r) => normalizeClinicEvent(r.id, r.data))
      .filter((e): e is ClinicEvent => e !== null);
    if (!all) events = events.filter((e) => !e.deleted);

    return NextResponse.json({
      events: sortEventsByHeldOn(events),
      canEdit: auth.canEdit,
      isAdmin: auth.isAdmin,
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── POST: 新規作成（管理者 or 指定メンバー） ───

export async function POST(req: NextRequest) {
  try {
    const auth = await authorize();
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
      photos: [], // 写真は132-B
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
    const auth = await authorize();
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
    const auth = await authorize();
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
    // 写真実体を先に削除（132-Bで写真が付いた後も孤児を残さない・失敗時は中断して明示）
    const paths = ev.photos.map((p) => p.path).filter(Boolean);
    if (paths.length > 0) {
      const { error: rmError } = await auth.admin.storage
        .from(STAFF_PHOTOS_BUCKET)
        .remove(paths);
      if (rmError) {
        return NextResponse.json(
          { error: `写真の削除に失敗しました（再試行してください）: ${rmError.message}` },
          { status: 500 }
        );
      }
    }
    const { error } = await auth.admin
      .from(TABLE)
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
    const auth = await authorize();
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
    const { error } = await auth.admin.from(TABLE).upsert({
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
