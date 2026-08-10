// ログイン必須のAPIルート用ヘルパ（指示書161・サーバー専用）
//
// 関門は proxy.ts に一本化したが、**ここでもう一度だけ確認する**。
// 理由: matcher の書き換え・Vercel側の設定変更・将来の移設などで関門が外れたとき、
// 何も守るものが無い状態にしないため（161はまさにその状態だった）。
//
// 使い方:
//   const gate = await requireLogin();
//   if (gate.response) return gate.response;
//   // 以降 gate.user はログイン済みユーザー

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSessionUser } from "./staff-profiles-server";

export async function requireLogin(): Promise<
  { user: User; response: null } | { user: null; response: NextResponse }
> {
  const { user } = await getSessionUser();
  if (!user) {
    return {
      user: null,
      // proxy が返す未認証応答と同じ形にそろえる
      response: NextResponse.json(
        { error: "ログインが必要です" },
        { status: 401 }
      ),
    };
  }
  return { user, response: null };
}
