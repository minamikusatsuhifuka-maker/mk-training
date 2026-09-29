"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { reloadTo } from "@/lib/auth-navigation";
import { clearDraftsIfTerminal } from "@/lib/terminal-client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  // 145: localStorage クライアントの signOut では Cookie セッションが残り、
  // 画面上ログアウトしても API は認証済みのままだった。Cookie を張る側で signOut する。
  //
  // 162: 遷移は画面ごと読み込み直す。router.push だとログイン中に読み込んだ画面が
  // クライアント側に残り、ログアウト後に戻る操作で中身が見えうる。
  const handleLogout = async () => {
    // 192 D: 院内端末では、そのタブの下書き（176-補）をログアウト時に消す（次に使う人に見せない）
    clearDraftsIfTerminal();
    await getSupabaseBrowserClient().auth.signOut();
    reloadTo("/login");
  };

  return (
    <Button variant="outline" size="sm" onClick={handleLogout} className="w-full text-xs">
      ログアウト
    </Button>
  );
}
