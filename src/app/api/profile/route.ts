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
import {
  normalizeProfileRoles,
  PROFILE_ROLE_CONFIG_KEY,
} from "@/lib/profile-roles";
import { normalizeNeedsSurvey } from "@/lib/needs-survey";
import type { NeedsSurvey } from "@/lib/needs-survey";
import { normalizeValueKeywords } from "@/lib/value-keywords";

export const runtime = "nodejs";

export async function GET() {
  const { user, db } = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  const profile = await loadProfileServer(db, user.id);
  if (!profile.name) {
    // 初期名の候補。メールアドレスがそのまま名前にならないよう @ 前のローカル部にする（指示書44）
    const dn = displayNameOf(user);
    profile.name = dn.includes("@") ? dn.split("@")[0] : dn;
  }
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

  // 役職は profile_role_config に存在する id のみ許可（指示書51）。
  // hidden の役職も許可する（使用中メンバーが他項目を保存しても役職が消えないように）。
  const { data: roleCfg } = await db
    .from("content_store")
    .select("data")
    .eq("id", PROFILE_ROLE_CONFIG_KEY)
    .maybeSingle();
  const roleDefs = normalizeProfileRoles(
    (roleCfg?.data as { roles?: unknown } | null)?.roles
  );
  const requestedRole = typeof body.role === "string" ? body.role.trim() : "";
  const role =
    requestedRole && roleDefs.some((r) => r.id === requestedRole)
      ? requestedRole
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

  // 開示設定（指示書52）: customFields と同じマージ方式（送られたキーのみ更新）。
  // 'public' は既定値なのでエントリを削除して保存データを増やさない。
  const currentPrivacy =
    current.customFieldsPrivacy && typeof current.customFieldsPrivacy === "object"
      ? current.customFieldsPrivacy
      : {};
  const customFieldsPrivacy: Record<string, "public" | "private"> = {
    ...currentPrivacy,
  };
  if (body.customFieldsPrivacy && typeof body.customFieldsPrivacy === "object") {
    for (const [key, value] of Object.entries(
      body.customFieldsPrivacy as Record<string, unknown>
    )) {
      const id = key.trim().slice(0, 64);
      if (!id) continue;
      if (value === "private") {
        customFieldsPrivacy[id] = "private";
      } else if (value === "public") {
        delete customFieldsPrivacy[id];
      }
    }
  }

  // 5つの基本的欲求サーベイ（指示書58）: 数値・開示・aiParsed(61)は送られた場合のみ更新。
  // imageUrl はアップロードAPIでのみ変更する（クライアント値を信用しない）。
  let needsSurvey: NeedsSurvey | undefined = current.needsSurvey;
  if (body.needsSurvey && typeof body.needsSurvey === "object") {
    const n = normalizeNeedsSurvey(body.needsSurvey);
    needsSurvey = {
      imageUrl: current.needsSurvey?.imageUrl,
      values: n.values,
      details: n.details,
      visibility: n.visibility,
      aiParsed: n.aiParsed,
      updatedAt: new Date().toISOString(),
    };
  }

  // 価値観キーワード（指示書68）: 送られた場合のみ更新。クライアント値を信用せず
  // 必ず normalizeValueKeywords（52語ホワイトリスト・重複除去・最大5個・原本順）を通す。
  const valueKeywords =
    "valueKeywords" in body
      ? normalizeValueKeywords(body.valueKeywords)
      : current.valueKeywords;

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
    customFieldsPrivacy,
    needsSurvey,
    valueKeywords,
    // メール表示の希望（既定OFF）。email はセッションから確定（クライアント値は使わない＝なりすまし防止）
    showEmail: body.showEmail === true,
    email: user.email ?? "",
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
