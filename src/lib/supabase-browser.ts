"use client";

// Cookieベースのセッションを持つブラウザ用 Supabase クライアント（@supabase/ssr）。
// ログイン状態をサーバーAPI（createSupabaseServerClient）と共有するため、
// 認証系の操作（ログイン/ログアウト/パスワード設定/getUser）は必ずこちらを使う。
// ※ src/lib/supabase.ts（localStorage保存）はコンテンツ読み書き専用で認証には使わない。

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return client;
}
