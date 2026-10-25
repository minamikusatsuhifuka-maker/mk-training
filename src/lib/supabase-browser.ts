"use client";

// Cookieベースのセッションを持つブラウザ用 Supabase クライアント（@supabase/ssr）。
// ログイン状態をサーバーAPI（createSupabaseServerClient）と共有するため、
// 認証系の操作（ログイン/ログアウト/パスワード設定/getUser）は必ずこちらを使う。
// ※ src/lib/supabase.ts（localStorage保存）はコンテンツ読み書き専用で認証には使わない。

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * 速度の指示書: 画面の表示のための getUser()（ログインしている人を Supabase に問い合わせる）を、このタブの中で30秒だけ使い回す。
 *   ・画面を開くたびに問い合わせていた（スマホの回線では1回で約0.5秒）。
 *   ・ログイン・ログアウト・ユーザー情報の更新・トークンの更新の知らせが来たら、すぐ捨てる。失敗した答えは使い回さない。
 *   ・使うのは画面の表示（名前・管理者の印など）だけ。中身を見せる・保存するの判定はサーバー（proxy.ts・各API）が毎回行う＝弱めていない。
 *   ・引数（JWT）を渡した呼び出しは使い回さない。
 */
const USER_CACHE_MS = 30_000;
let userCache: { at: number; promise: ReturnType<SupabaseClient["auth"]["getUser"]> } | null = null;

function withUserCache(c: SupabaseClient): SupabaseClient {
  const original = c.auth.getUser.bind(c.auth);
  c.auth.getUser = ((jwt?: string) => {
    if (jwt) return original(jwt);
    if (userCache && Date.now() - userCache.at < USER_CACHE_MS) return userCache.promise;
    const promise = original();
    const entry = { at: Date.now(), promise };
    userCache = entry;
    promise
      .then((r) => {
        if (r.error || !r.data.user) {
          if (userCache === entry) userCache = null;
        }
      })
      .catch(() => {
        if (userCache === entry) userCache = null;
      });
    return promise;
  }) as SupabaseClient["auth"]["getUser"];
  c.auth.onAuthStateChange((event) => {
    if (event !== "INITIAL_SESSION") userCache = null;
  });
  return c;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    client = withUserCache(
      createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
    );
  }
  return client;
}
