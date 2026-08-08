// 管理画面の秘匿（指示書158-D）
//
// 要件は「404を返すこと」ではなく **「全パスで応答が同一であること」**。
// ページ側で notFound() を返すだけでは、実在ページはレイアウトのスクリプトを含む
// 大きな404、存在しないパスは小さな404となり **本文の大きさで実在が分かってしまう**
// （157→158の実測: 79KB と 28KB）。
//
// そこで管理者以外の /admin/* へのアクセスは、ページに到達させる前に
// **実在しない固定パスへ rewrite** する。こうすると実在ページも存在しないパスも
// まったく同じ404本文になり、区別する手がかりが残らない。
//
// - 管理者のみ通過（user_metadata.role === "admin"）
// - 未ログインと非管理者を分けない（分けると分けた側から存在が漏れる）
// - 判定できないときは通さない（fail-close）
//
// 注意: 管理者が0人の状態からの復旧は、この経路では行えない
// （/admin の初回セットアップ画面にも到達しなくなる）。復旧は Supabase 側で
// user_metadata.role に "admin" を入れるか、/api/admin/staff-accounts の
// ブートストラップAPI（middleware の対象外）を使う。

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// 判定はアプリ本体と同じ関数を使う（純関数）。
// ここで独自に user_metadata だけを見ると、app_metadata.role で管理者になっている
// アカウントを締め出してしまう。
import { isAdminUser } from "@/lib/admin-role";

/** rewrite 先。実在しないパスなら何でもよいが、固定にして応答を1種類に揃える */
const HIDDEN_PATH = "/__not_found__";

// Next.js 16 では middleware は proxy に改称された（middleware のままだと非推奨警告が出る）
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  let isAdmin = false;
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );
    const { data } = await supabase.auth.getUser();
    isAdmin = isAdminUser(data.user);
  } catch {
    isAdmin = false; // 判定できない＝通さない
  }

  if (isAdmin) return response;
  return NextResponse.rewrite(new URL(HIDDEN_PATH, request.url));
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
