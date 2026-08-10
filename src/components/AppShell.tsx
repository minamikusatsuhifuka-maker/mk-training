"use client";

// 画面の外枠の出し分け（指示書161で中身を AppShellInner へ分離）
//
// ログイン画面・管理画面では外枠を出さない。従来と同じ挙動だが、
// 161では **出さないだけでなく読み込みもしない** ようにした。
// 外枠は機能一覧（メニュー定義）を持つため、同じチャンクに同居していると
// 未ログインの人に配られるJSの中に全機能の名前が入ってしまう。

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

// dynamic: /login・/reset-password ではこのチャンクを要求させない。
// ssr は既定（true）のまま＝サーバー描画は従来どおりで、分かれるのはクライアントの
// チャンクだけ。ssr:false にすると中身が初回描画で消えて体感が悪くなる。
const AppShellInner = dynamic(() => import("@/components/AppShellInner"));

// 未ログインでも開ける画面（proxy.ts の PUBLIC_PATHS と同じ）。
// 161: /join がこの一覧から漏れていた＝**招待コードの登録画面に
// スタッフ用サイドメニューが出ていた**（未ログインで機能一覧が見える状態）。
const PUBLIC_PATHS = ["/login", "/reset-password", "/join"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (isAdmin || isPublic) {
    return <>{children}</>;
  }

  return <AppShellInner>{children}</AppShellInner>;
}
