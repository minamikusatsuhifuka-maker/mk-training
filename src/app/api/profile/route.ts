// マイプロフィール API（要ログイン・本人のみ）
// GET: 自分のプロフィール取得（未作成なら表示名入りの空プロフィール）
// PUT: テキスト項目＋写真キャプションの保存。
//      avatarUrl / photos のURLはアップロードAPIでのみ変更する（ここでは書き換え不可）。

import { NextRequest, NextResponse } from "next/server";
import {
  getSessionUser,
  displayNameOf,
  loadProfileServer,
  saveProfileServer,
} from "@/lib/staff-profiles-server";
import { PROFILE_ROLES } from "@/lib/staff-profiles";

export const runtime = "nodejs";

export async function GET() {
  const { user, db } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  const profile = await loadProfileServer(db, user.id);
  if (!profile.name) profile.name = displayNameOf(user);
  return NextResponse.json({ profile, email: user.email ?? "" });
}

const MAX_LEN: Record<string, number> = {
  name: 60,
  kana: 60,
  bio: 2000,
  hobbies: 1000,
  message: 200,
};

function cleanText(v: unknown, field: string): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, MAX_LEN[field] ?? 500);
}

export async function PUT(req: NextRequest) {
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

  // 対象 userId が指定されている場合は本人一致を検証（クライアント判定に頼らない）
  if (typeof body.userId === "string" && body.userId !== user.id) {
    return NextResponse.json(
      { error: "他のスタッフのプロフィールは編集できません" },
      { status: 403 }
    );
  }

  const name = cleanText(body.name, "name");
  if (!name) {
    return NextResponse.json({ error: "名前は必須です" }, { status: 400 });
  }

  const role =
    typeof body.role === "string" &&
    (PROFILE_ROLES as readonly string[]).includes(body.role)
      ? body.role
      : "";

  const current = await loadProfileServer(db, user.id);

  // 写真キャプション: { url: caption } の形で受け取り、既存URLにのみ適用
  const captions =
    body.photoCaptions && typeof body.photoCaptions === "object"
      ? (body.photoCaptions as Record<string, unknown>)
      : {};
  const photos = current.photos.map((p) => {
    const c = captions[p.url];
    return typeof c === "string"
      ? { ...p, caption: c.trim().slice(0, 100) || undefined }
      : p;
  });

  // カスタム項目: 送られたキーだけを更新（空文字は削除）。
  // 送られなかったキー（非表示・設定から削除済みの回答）はそのまま保持する。
  const currentCustom =
    current.customFields && typeof current.customFields === "object"
      ? current.customFields
      : {};
  const customFields: Record<string, string> = { ...currentCustom };
  if (body.customFields && typeof body.customFields === "object") {
    for (const [key, value] of Object.entries(
      body.customFields as Record<string, unknown>
    )) {
      const id = key.trim().slice(0, 64);
      if (!id || typeof value !== "string") continue;
      const v = value.trim().slice(0, 2000);
      if (v) {
        customFields[id] = v;
      } else {
        delete customFields[id];
      }
    }
  }

  const next = {
    ...current,
    userId: user.id,
    name,
    kana: cleanText(body.kana, "kana"),
    role,
    bio: cleanText(body.bio, "bio"),
    hobbies: cleanText(body.hobbies, "hobbies"),
    message: cleanText(body.message, "message"),
    photos,
    customFields,
  };

  try {
    await saveProfileServer(db, next);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗しました" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
