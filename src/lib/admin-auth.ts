// 管理系APIルートの管理者検証ヘルパ（指示書39・サーバー専用）
// 使い方:
//   const auth = await requireAdmin();
//   if (auth.response) return auth.response;
//   // 以降 auth.user は管理者ユーザー

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getSessionUser } from "./staff-profiles-server";
import { isAdminUser } from "./admin-role";

export async function requireAdmin(): Promise<
  { user: User; response: null } | { user: null; response: NextResponse }
> {
  const { user } = await getSessionUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "この操作にはログインが必要です" },
        { status: 401 }
      ),
    };
  }
  if (!isAdminUser(user)) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "この操作には管理者権限が必要です" },
        { status: 403 }
      ),
    };
  }
  return { user, response: null };
}
