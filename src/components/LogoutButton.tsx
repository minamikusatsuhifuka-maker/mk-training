"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { reloadTo } from "@/lib/auth-navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  // 145: localStorage クライアントの signOut では Cookie セッションが残り、
  // 画面上ログアウトしても API は認証済みのままだった。Cookie を張る側で signOut する。
  //
  // 162: 遷移は画面ごと読み込み直す。router.push だとログイン中に読み込んだ画面が
  // クライアント側に残り、ログアウト後に戻る操作で中身が見えうる。
  const handleLogout = async () => {
    await getSupabaseBrowserClient().auth.signOut();
    reloadTo("/login");
  };

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} className="w-full text-xs">
      ログアウト
    </Button>
  );
}
