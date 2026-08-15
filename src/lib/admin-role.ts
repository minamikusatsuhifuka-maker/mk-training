// 管理者ロール判定（指示書39／2026-08-16 修正）
//
// **見るのは app_metadata.role === "admin" だけ。user_metadata は見ない。**
//
// 【なぜ user_metadata を見てはいけないか】
// user_metadata は**本人が書き換えられる**。ログイン中の利用者がブラウザのコンソールで
//     supabase.auth.updateUser({ data: { role: "admin" } })
// を実行するだけで、自分を管理者にできてしまう。
// そこから到達できるのは管理画面の閲覧にとどまらない:
//   ・/api/admin/staff-accounts/temp-password … **他人の仮パスワードを発行できる**
//   ・スタッフアカウントの無効化、招待コードの設定
//   ・書類進捗ボードの全設定・操作ログ、管理者専用の content_store キー
// つまりアカウントの乗っ取りまで届く。
//
// app_metadata は **service-role キーを持つサーバーからしか変更できない**。
// 判定はこちらだけを見る。
//
// 【「念のため両方許容する」をやめた理由】
// 以前は user_metadata を先に見て、無ければ app_metadata を見ていた。
// 片方でも通る作りは、緩い側の強さしか持たない。**両方見る＝弱い方に合わせる**ことになる。
//
// クライアント・サーバー両方から import できる純関数のみ。
// app_metadata は JWT に含まれるため、proxy.ts でもDBに問い合わせずに判定できる。

import type { User } from "@supabase/supabase-js";

export function isAdminUser(user: User | null | undefined): boolean {
  if (!user) return false;
  const app = user.app_metadata as Record<string, unknown> | null;
  return app?.role === "admin";
}

export function countAdmins(users: User[]): number {
  return users.filter((u) => isAdminUser(u)).length;
}
