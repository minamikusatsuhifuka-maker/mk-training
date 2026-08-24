// プロフィール保存のサーバー専用ヘルパ（API route から使用）
// セッション検証（本人一致）を経た上で content_store を読み書きする。
// 読み書きは service-role を優先（RLS構成に依存しない）。未設定時は
// cookie付きサーバークライアントにフォールバックする。

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./supabase-server";
import { createSupabaseAdminClient } from "./supabase-admin";
import { logSignFailure, signPublicUrls } from "./storage-signed";
import {
  STAFF_PROFILES_INDEX_KEY,
  staffProfileKey,
  emptyProfile,
  type StaffProfile,
  type StaffProfileIndexEntry,
} from "./staff-profiles";

// cookie セッションからログインユーザーを取得（未ログインは null）
export async function getSessionUser(): Promise<{
  user: User | null;
  db: SupabaseClient;
}> {
  const db = await createSupabaseServerClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return { user, db };
}

export function displayNameOf(user: User): string {
  const meta = user.user_metadata as Record<string, unknown> | null;
  const name = typeof meta?.display_name === "string" ? meta.display_name : "";
  return name || user.email || "";
}

// content_store の読み書きに使うクライアント（service-role優先）
function contentDb(fallback: SupabaseClient): SupabaseClient {
  try {
    return createSupabaseAdminClient();
  } catch {
    return fallback;
  }
}

export async function loadProfileServer(
  sessionDb: SupabaseClient,
  userId: string
): Promise<StaffProfile> {
  const db = contentDb(sessionDb);
  const { data } = await db
    .from("content_store")
    .select("data")
    .eq("id", staffProfileKey(userId))
    .single();
  const payload = (data?.data ?? null) as StaffProfile | null;
  if (!payload || typeof payload.userId !== "string") {
    return emptyProfile(userId);
  }
  return { ...emptyProfile(userId), ...payload, userId };
}

// プロフィール本体を保存し、一覧用 index も同期する
export async function saveProfileServer(
  sessionDb: SupabaseClient,
  profile: StaffProfile
): Promise<void> {
  const db = contentDb(sessionDb);
  const now = new Date().toISOString();
  const body: StaffProfile = { ...profile, updatedAt: now };

  const { error } = await db.from("content_store").upsert({
    id: staffProfileKey(profile.userId),
    content_type: "staff",
    data: body as unknown as Record<string, unknown>,
    updated_at: now,
  });
  if (error) throw new Error(`プロフィールの保存に失敗しました: ${error.message}`);

  // index を読み込み → 該当エントリを差し替え
  const { data } = await db
    .from("content_store")
    .select("data")
    .eq("id", STAFF_PROFILES_INDEX_KEY)
    .single();
  const payload = (data?.data ?? null) as {
    items?: StaffProfileIndexEntry[];
  } | null;
  const items = Array.isArray(payload?.items) ? payload.items : [];

  const entry: StaffProfileIndexEntry = {
    userId: body.userId,
    name: body.name,
    kana: body.kana || undefined,
    role: body.role || undefined,
    message: body.message || undefined,
    avatarUrl: body.avatarUrl || undefined,
    updatedAt: now,
  };
  const next = [
    ...items.filter((e) => e && e.userId !== body.userId),
    entry,
  ];

  const { error: idxError } = await db.from("content_store").upsert({
    id: STAFF_PROFILES_INDEX_KEY,
    content_type: "staff",
    data: { items: next } as unknown as Record<string, unknown>,
    updated_at: now,
  });
  if (idxError)
    throw new Error(`プロフィール一覧の更新に失敗しました: ${idxError.message}`);
}

// ─── 署名付きURLへの差し替え（指示書163）───
//
// 資料庫と**同じ staff-photos バケット**にプロフィール写真・サーベイ画像が同居している。
// 163でバケットを非公開にすると、資料庫だけでなくこちらも公開URLでは開けなくなる。
// 既存ファイルの移動は指示書163の範囲外なので、**返すときに署名URLへ差し替える**形で追随する。
//
// 差し替える対象は4か所:
//   ① avatarUrl              … アバター（プロフィール本体）
//   ② photos[].url           … 共有写真（1人最大20枚）
//   ③ needsSurvey.imageUrl   … 5つの基本的欲求サーベイの画像
//   ④ index の avatarUrl     … メンバー紹介の一覧カードが見ているのは**こちら**
//
// ④は163で関数（withSignedIndexEntries）だけ用意され、**呼び出しが繋がっていなかった**。
// その結果、一覧カードのアバターだけが公開URLのまま返り、バケット非公開化で全滅した
// （指示書170の真因）。以後、index を返す経路は必ずこの関数を通すこと。
//
// 一覧（/api/members）では人数分まとめて署名するため、1回のAPI呼び出しで済ませる。

/** プロフィール1件に含まれる公開URLを集める */
function profileUrls(p: StaffProfile): string[] {
  const urls: string[] = [];
  if (p.avatarUrl) urls.push(p.avatarUrl);
  for (const ph of p.photos ?? []) if (ph.url) urls.push(ph.url);
  if (p.needsSurvey?.imageUrl) urls.push(p.needsSurvey.imageUrl);
  return urls;
}

/** 複数のプロフィールのURLを一括で署名URLに差し替える */
export async function withSignedProfiles(
  profiles: StaffProfile[]
): Promise<StaffProfile[]> {
  const all = profiles.flatMap(profileUrls);
  if (all.length === 0) return profiles;
  let signed: Map<string, string>;
  try {
    signed = await signPublicUrls(createSupabaseAdminClient(), all);
  } catch (e) {
    signed = new Map(); // service-role が無い環境では差し替えない
    logSignFailure("withSignedProfiles", {
      profileCount: profiles.length,
      urlCount: all.length,
      reason: e instanceof Error ? e.message : String(e),
    });
  }
  // fail-close（空文字に倒す）は維持。ただし**倒した事実は必ず残す**（170 §4-3）
  const swap = (url: string, userId: string, field: string): string => {
    if (!url || !url.includes("/storage/v1/object/public/")) return url;
    const s = signed.get(url);
    if (s) return s;
    logSignFailure("withSignedProfiles（差し替え不可）", { userId, field });
    return "";
  };

  return profiles.map((p) => ({
    ...p,
    avatarUrl: swap(p.avatarUrl, p.userId, "avatarUrl"),
    photos: (p.photos ?? []).map((ph) => ({
      ...ph,
      url: swap(ph.url, p.userId, "photos[].url"),
    })),
    ...(p.needsSurvey
      ? {
          needsSurvey: {
            ...p.needsSurvey,
            ...(p.needsSurvey.imageUrl
              ? {
                  imageUrl: swap(
                    p.needsSurvey.imageUrl,
                    p.userId,
                    "needsSurvey.imageUrl"
                  ),
                }
              : {}),
          },
        }
      : {}),
  }));
}

/** 1件だけ署名する */
export async function withSignedProfile(
  profile: StaffProfile
): Promise<StaffProfile> {
  return (await withSignedProfiles([profile]))[0] ?? profile;
}

/**
 * 一覧の軽量データ（avatarUrl のみ）を署名URLに差し替える。
 *
 * **メンバー紹介のカードが表示に使っているのはこの index の avatarUrl**（170）。
 * index を画面へ返す経路は、必ずここを通すこと。
 */
export async function withSignedIndexEntries(
  items: StaffProfileIndexEntry[]
): Promise<StaffProfileIndexEntry[]> {
  const all = items.map((i) => i.avatarUrl ?? "").filter(Boolean);
  if (all.length === 0) return items;
  let signed: Map<string, string>;
  try {
    signed = await signPublicUrls(createSupabaseAdminClient(), all);
  } catch (e) {
    signed = new Map();
    logSignFailure("withSignedIndexEntries", {
      itemCount: items.length,
      urlCount: all.length,
      reason: e instanceof Error ? e.message : String(e),
    });
  }
  return items.map((i) => {
    if (!i.avatarUrl || !i.avatarUrl.includes("/storage/v1/object/public/")) {
      return i;
    }
    const s = signed.get(i.avatarUrl);
    if (s) return { ...i, avatarUrl: s };
    // fail-close は維持（公開URLには戻さない）。消えた事実だけログに残す
    logSignFailure("withSignedIndexEntries（差し替え不可）", {
      userId: i.userId,
      field: "index.avatarUrl",
    });
    return { ...i, avatarUrl: "" };
  });
}
