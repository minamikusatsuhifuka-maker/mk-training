"use client";

import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();

  // 145: localStorage クライアントの signOut では Cookie セッションが残り、
  // 画面上ログアウトしても API は認証済みのままだった。Cookie を張る側で signOut する。
  const handleLogout = async () => {
    await getSupabaseBrowserClient().auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} className="w-full text-xs">
      ログアウト
    </Button>
  );
}
