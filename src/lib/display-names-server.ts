// 表示名の解決（指示書211 A）— サーバー専用・**名前の引き方の正本**
//
// 【なぜ1か所にまとめたか】
// 211の実測で、同じ人の名前が画面によって「名前未設定」「担当者さん」になっていた。
// 原因は引き方が3通りに分かれていたこと。
//   1. 画面が自分で名簿（staff_profiles_index）を読む
//      … `/api/content-store` は **検証用アカウントを名簿から外す**（191 B。一般スタッフの
//        画面に出さないための処理）。そのため検証用の本人が**自分の名前を引けない**。
//      … プロフィールを一度も保存していない実在のスタッフも引けない。
//   2. 回答一覧の API が名簿の形を読み違えていた（`row.data` は配列ではなく `{ items: [...] }`。
//      `Array.isArray(row.data)` が常に false ＝ **全員が「名前未設定」になっていた**）。
//   3. 1on1ノートに保存済みの名前へ退避する（これだけ正しく出ていた）。
//
// これ以降、**サーバーが名前を解決してから画面に渡す**。画面は名簿を引き直さない。
//
// 【探す順】
//   1. 名簿（staff_profiles_index）… service-role で読むので検証用も含めて全員ぶんある
//   2. アカウントの表示名（user_metadata.display_name）… プロフィール未作成でも入っている
//   3. メールアドレスの @ の前（指示書44と同じ扱い）
//   4. それでも分からなければ呼び出し側の控え（1on1ノートに残した名前など）→ 空文字を返す
//
// 2・3は Auth を1回だけ読む（名簿で足りるときは読まない）。クライアントから import しないこと。

import { createSupabaseAdminClient } from "./supabase-admin";
import { loadProfilesIndexServer } from "./staff-growth-roster-server";

/** userId → 表示名。見つからない人は入らない（呼び出し側で控えを使う） */
export type DisplayNames = Map<string, string>;

function fromAccount(u: {
  user_metadata?: Record<string, unknown> | null;
  email?: string | null;
}): string {
  const meta = (u.user_metadata ?? null) as Record<string, unknown> | null;
  const dn = typeof meta?.display_name === "string" ? meta.display_name.trim() : "";
  if (dn) return dn;
  const email = (u.email ?? "").trim();
  // 指示書44: メールアドレスがそのまま名前にならないよう @ の前だけにする
  return email ? email.split("@")[0] : "";
}

/**
 * 指定した人たちの表示名を解決する。
 * ids を省略すると名簿にいる全員を返す（Auth は読まない）。
 */
export async function resolveDisplayNames(ids?: readonly string[]): Promise<DisplayNames> {
  const out: DisplayNames = new Map();
  for (const r of await loadProfilesIndexServer()) {
    if (r.userId && r.name) out.set(r.userId, r.name);
  }
  if (!ids) return out;

  const missing = ids.filter((id) => id && !out.get(id));
  if (missing.length === 0) return out;

  // 名簿で足りない人だけ、アカウント側から引く
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const want = new Set(missing);
    for (const u of data?.users ?? []) {
      if (!want.has(u.id)) continue;
      const name = fromAccount(u);
      if (name) out.set(u.id, name);
    }
  } catch {
    /* アカウントが読めないときは名簿の分だけで返す */
  }
  return out;
}

/** 1人ぶん。見つからなければ fallback（既定は空文字） */
export async function resolveDisplayName(userId: string, fallback = ""): Promise<string> {
  if (!userId) return fallback;
  const m = await resolveDisplayNames([userId]);
  return m.get(userId) || fallback;
}
