// 入口の制御（指示書160: 未ログインはログイン画面へ／指示書158: 管理画面の秘匿）
//
// 【160で直したこと】
// これまで未ログインでも全ページが開けたため、「ログイン画面に入る導線」が
// どこにも出ていなかった（サイドメニューだけが見えている状態）。
// 未ログインのページアクセスは **すべて /login へ送る**。
//
// 【原則】「ログイン画面を出すこと」と「中身を見せること」は別。
// ここで通すのはログインに至るために必要な最小限のパスだけで、
// 中身（院内データ）の保護は各APIのログイン必須チェック（401）が引き続き担保する。
//
// 【158の続き】/admin 配下は管理者以外に **実在しない固定パスへ rewrite**。
// 実在ページも存在しないパスもまったく同じ404本文になり、存在が漏れない。
//
// 【判定できないとき】通さない（ログイン画面へ）。
// 万一セッション判定に失敗しても、利用者はログインし直せば入れる。

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// 判定はアプリ本体と同じ関数を使う（純関数）。
// ここで独自に user_metadata だけを見ると、app_metadata.role で管理者になっている
// アカウントを締め出してしまう。
import { isAdminUser } from "@/lib/admin-role";

/** rewrite 先。実在しないパスなら何でもよいが、固定にして応答を1種類に揃える */
const HIDDEN_PATH = "/__not_found__";

/**
 * 未ログインでも通すパス（ログインに至るための最小限）。
 * - /login          ログイン・パスワード再設定の申し込み
 * - /reset-password 招待メール／再設定メールのリンク先
 * - /join           招待コードでの登録（コードが無ければ登録できない）
 * 上記以外は、ページであれば /login へ送る。
 */
const PUBLIC_PATHS = ["/login", "/reset-password", "/join"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname, search } = request.nextUrl;

  let user = null;
  try {
    const supabase = createServerClient(
      // 環境変数の前後に改行・空白が混ざっていても判定に失敗しないようにする
      //（判定に失敗すると全員がログイン画面に送られてしまうため）
      (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
      (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim(),
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
    user = data.user;
  } catch (e) {
    user = null;
    // 全員が入れない事態に気づけるようログに残す（Vercelのログで確認できる）
    console.error(
      "[proxy] セッション判定に失敗しました:",
      e instanceof Error ? e.message : e
    );
  }

  // 管理画面: 管理者以外は存在しないパスと同じ404にする（158）
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (isAdminUser(user)) return response;
    return NextResponse.rewrite(new URL(HIDDEN_PATH, request.url));
  }

  // ログインに至るためのパスは素通し
  if (isPublicPath(pathname)) return response;

  // それ以外のページは、未ログインならログイン画面へ（元のURLは next で引き継ぐ）
  if (!user) {
    const url = new URL("/login", request.url);
    const target = `${pathname}${search}`;
    if (target && target !== "/") url.searchParams.set("next", target);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // ページだけを対象にする。API（各ルートが自前でログイン必須を判定している）と
  // 静的ファイルは対象外＝二重に判定して遅くしない。
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)",
  ],
};
