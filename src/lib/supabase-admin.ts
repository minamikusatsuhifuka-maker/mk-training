// service-role キーで動くサーバー専用 Supabase クライアント。
// 招待（auth.admin）・Storage アップロードなど管理操作に使う。
// クライアントコンポーネントから import しないこと。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export class ServiceRoleMissingError extends Error {
  constructor() {
    super(
      "SUPABASE_SERVICE_ROLE_KEY が未設定です。Vercel の環境変数に追加してください。"
    );
    this.name = "ServiceRoleMissingError";
  }
}

export function createSupabaseAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new ServiceRoleMissingError();
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
