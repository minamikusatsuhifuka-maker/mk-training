"use client";

// 管理者ログイン中のみ children を表示するラッパー（指示書39）
// サイドバー等の「⚙ 管理画面」リンクの出し分けに使う。
// ※ 表示制御のみ。実際のアクセス制御は admin/layout.tsx とAPI側のサーバー検証で行う。

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { isAdminUser } from "@/lib/admin-role";

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setIsAdmin(isAdminUser(data.user)))
      .catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAdmin(isAdminUser(session?.user ?? null));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!isAdmin) return null;
  return <>{children}</>;
}
