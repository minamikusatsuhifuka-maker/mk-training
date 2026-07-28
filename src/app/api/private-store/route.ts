// Phase 3 基盤: private_store の認証付きAPI（指示書110）
// - private_store テーブルは RLS 有効＋ポリシーなし（anon / authenticated とも全拒否）。
//   読み書きはこのAPI（Service Role）経由のみ。anon キーでは直読みできない。
// - 認可の既定（基盤は最も厳しく保つ。機能固有の共有ルールは指示書111・112で上に定義する）:
//   本人 = 自分のレコード（owner_id = セッションの userId）を読み書き可。
//   管理者（isAdminUser）= 全レコードを読み書き可（owner 指定・all=1 一覧）。それ以外は 403。
// - 【院長明示要件】非管理者の PUT/DELETE では owner をリクエストから一切受け取らない。
//   body/query の owner 指定は無視し、必ずサーバー側セッションの userId を使用する。
// - 削除は物理削除（機微データは「消したら消える」が誠実。論理削除にしない）。
// - upsert の単位は (owner_id, content_type, record_key) の一意制約。updated_at はAPI側で明示更新。

import { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  ServiceRoleMissingError,
} from "@/lib/supabase-admin";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";

export const runtime = "nodejs";
export const maxDuration = 60;

// content_type ホワイトリスト（当面の2種。追加は各フェーズの指示書で）
const CONTENT_TYPES = ["self_review", "one_on_one"] as const;
type PrivateContentType = (typeof CONTENT_TYPES)[number];

const RECORD_KEY_RE = /^[\w.-]{1,64}$/;
const DATA_MAX_BYTES = 200 * 1024; // 1レコード 200KB（JSON文字列長）

function errorResponse(e: unknown): NextResponse {
  if (e instanceof ServiceRoleMissingError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  const msg = e instanceof Error ? e.message : "処理に失敗しました";
  return NextResponse.json({ error: msg }, { status: 500 });
}

function isContentType(v: unknown): v is PrivateContentType {
  return (
    typeof v === "string" &&
    (CONTENT_TYPES as readonly string[]).includes(v)
  );
}

// DB行 → クライアント返却形（camelCase）
type PrivateStoreRow = {
  id: string;
  owner_id: string;
  content_type: string;
  record_key: string;
  data: unknown;
  created_at: string;
  updated_at: string;
};

function toRecord(row: PrivateStoreRow) {
  return {
    id: row.id,
    ownerId: row.owner_id,
    contentType: row.content_type,
    recordKey: row.record_key,
    data: row.data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── GET: 一覧 / 単一取得 ───
// ?contentType=<type>                     … 自分の一覧
// ?contentType=<type>&recordKey=<key>     … 自分の単一取得（無ければ record: null）
// 管理者のみ: &owner=<userId> で対象者指定・&all=1 で全員分一覧
export async function GET(req: NextRequest) {
  const { user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const contentType = sp.get("contentType");
  if (!isContentType(contentType)) {
    return NextResponse.json(
      { error: "contentType が不正です" },
      { status: 400 }
    );
  }
  const admin = isAdminUser(user);
  const ownerParam = sp.get("owner");
  const all = sp.get("all") === "1";
  // 非管理者が他者指定・全件を要求したら 403（黙って自分に倒さず、権限がないことを明示する）
  if (!admin && (all || (ownerParam && ownerParam !== user.id))) {
    return NextResponse.json({ error: "権限がありません" }, { status: 403 });
  }
  const ownerId = admin && ownerParam ? ownerParam : user.id;

  try {
    const db = createSupabaseAdminClient();
    const recordKey = sp.get("recordKey");
    if (recordKey !== null) {
      if (!RECORD_KEY_RE.test(recordKey)) {
        return NextResponse.json(
          { error: "recordKey が不正です" },
          { status: 400 }
        );
      }
      const { data, error } = await db
        .from("private_store")
        .select("*")
        .eq("content_type", contentType)
        .eq("owner_id", ownerId)
        .eq("record_key", recordKey)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return NextResponse.json({
        record: data ? toRecord(data as PrivateStoreRow) : null,
      });
    }

    let query = db
      .from("private_store")
      .select("*")
      .eq("content_type", contentType)
      .order("updated_at", { ascending: false });
    if (!(admin && all)) {
      query = query.eq("owner_id", ownerId);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({
      records: (data as PrivateStoreRow[]).map(toRecord),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── PUT: upsert ───
// body: { contentType, recordKey, data, owner? }（owner は管理者のみ有効・非管理者は無視）
export async function PUT(req: NextRequest) {
  const { user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const contentType = body.contentType;
  if (!isContentType(contentType)) {
    return NextResponse.json(
      { error: "contentType が不正です" },
      { status: 400 }
    );
  }
  const recordKey = typeof body.recordKey === "string" ? body.recordKey : "";
  if (!RECORD_KEY_RE.test(recordKey)) {
    return NextResponse.json({ error: "recordKey が不正です" }, { status: 400 });
  }
  if (body.data === undefined || body.data === null) {
    return NextResponse.json({ error: "data がありません" }, { status: 400 });
  }
  let size = 0;
  try {
    size = JSON.stringify(body.data).length;
  } catch {
    return NextResponse.json({ error: "data が不正です" }, { status: 400 });
  }
  if (size > DATA_MAX_BYTES) {
    return NextResponse.json(
      { error: "データが大きすぎます（200KBまで）" },
      { status: 413 }
    );
  }
  // 非管理者は body.owner を無視し、必ずセッションの userId を使う（院長明示要件）
  const admin = isAdminUser(user);
  const ownerId =
    admin && typeof body.owner === "string" && body.owner
      ? body.owner
      : user.id;

  try {
    const db = createSupabaseAdminClient();
    const { data, error } = await db
      .from("private_store")
      .upsert(
        {
          owner_id: ownerId,
          content_type: contentType,
          record_key: recordKey,
          data: body.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,content_type,record_key" }
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({
      ok: true,
      record: toRecord(data as PrivateStoreRow),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── DELETE: 物理削除 ───
// body: { contentType, recordKey, owner? }（owner は管理者のみ有効・非管理者は無視）
export async function DELETE(req: NextRequest) {
  const { user } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const contentType = body.contentType;
  if (!isContentType(contentType)) {
    return NextResponse.json(
      { error: "contentType が不正です" },
      { status: 400 }
    );
  }
  const recordKey = typeof body.recordKey === "string" ? body.recordKey : "";
  if (!RECORD_KEY_RE.test(recordKey)) {
    return NextResponse.json({ error: "recordKey が不正です" }, { status: 400 });
  }
  // 非管理者は body.owner を無視し、必ずセッションの userId を使う（院長明示要件）
  const admin = isAdminUser(user);
  const ownerId =
    admin && typeof body.owner === "string" && body.owner
      ? body.owner
      : user.id;

  try {
    const db = createSupabaseAdminClient();
    const { error } = await db
      .from("private_store")
      .delete()
      .eq("owner_id", ownerId)
      .eq("content_type", contentType)
      .eq("record_key", recordKey);
    if (error) throw new Error(error.message);
    // 対象が無くても成功で返す（冪等）
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
