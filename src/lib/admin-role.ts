// 管理者ロール判定（指示書39）
// ロールは Supabase Auth の user_metadata.role = 'admin' を正とする
// （app_metadata.role も許容）。クライアント・サーバー両方から import できる純関数のみ。

import type { User } from "@supabase/supabase-js";

export function isAdminUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const meta = user.user_metadata as Record<string, unknown> | null;
  if (meta?.role === "admin") return true;
  const app = user.app_metadata as Record<string, unknown> | null;
  return app?.role === "admin";
}

export function countAdmins(users: User[]): number {
  return users.filter((u) => isAdminUser(u)).length;
}
