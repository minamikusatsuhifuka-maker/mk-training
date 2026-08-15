// 入口の制御（指示書161: 唯一の関門／160: 未ログインはログイン画面へ／158: 管理画面の秘匿）
//
// 【161で直したこと】
// 160まで、APIはこの関門の対象外で「各ルートが自前でログイン必須を判定する」方式だった。
// 実測の結果、58本中18本にその判定が**入っていなかった**（AI系ルート）。
// 未認証で /api/ai-chat が院内の理念・人事制度を注入したAIとして応答していた。
//
// 個々のルートに足していく方式は足し忘れが必ず起きる。よって
// **ページもAPIもこの1箇所を通す。既定は拒否。通すものだけを下に列挙する。**
// 各ルート側のチェックは残す（この関門が万一無効化されても素通りさせないため）。
//
// 【原則】「ログイン画面を出すこと」と「中身を見せること」は別。
// ここで通すのはログインに至るために必要な最小限のパスだけ。
//
// 【158の続き】/admin 配下は管理者以外に **実在しない固定パスへ rewrite**。
// 実在ページも存在しないパスもまったく同じ404本文になり、存在が漏れない。
//
// 【判定できないとき】通さない（ページ=ログイン画面へ／API=401）。
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
 * 159-D: /api/admin 配下の rewrite 先（**実在しないAPIパス**）。
 *
 * 158でページ側は区別不能になったが、APIが401/403を返していると、
 * そこから「そのルートが実在すること」が漏れる。ページだけ閉じてAPIが開いていては
 * 片手落ちなので、非管理者には**存在しないAPIパスと同じ応答**を返す。
 *
 * 要件の本体は「404を返すこと」ではなく **「全パスで応答が同一であること」**（159-D-2）。
 * 実在するAPIも存在しないAPIも、ここへ rewrite された同じ結果になる。
 */
const HIDDEN_API_PATH = "/api/__not_found__";

/**
 * 未ログインでも通すパス（ログインに至るための最小限）。
 * - /login          ログイン・パスワード再設定の申し込み
 * - /reset-password 招待メール／再設定メールのリンク先
 * - /join           招待コードでの登録（コードが無ければ登録できない）
 * 上記以外は、ページであれば /login へ送る。
 */
const PUBLIC_PATHS = ["/login", "/reset-password", "/join"];

/**
 * 未ログインでも通す **API**（161）。ここに無いAPIはすべて401で止まる。
 * 追加するときは「なぜCookieセッションで守れないのか」を必ず書くこと。
 *
 * - /api/join
 *     招待コードでの登録。ログイン前にしか呼ばれない。
 *     コード一致が必須＋同一IPのレート制限あり（route.ts 側）。
 * - /api/cron/
 *     Vercel Cron からの呼び出し。**Cookieを持たない**ためセッションで守れない。
 *     CRON_SECRET 必須（未設定なら誰も実行できない fail-closed）。
 * - /api/hr-chat-knowledge
 *     ai-incho からのサーバー間呼び出し。同じくCookieを持たない。
 *     HR_CHAT_KNOWLEDGE_TOKEN 必須（未設定=404・不一致=401 の fail-close）。
 */
const PUBLIC_API_PATHS = [
  "/api/join",
  "/api/cron/",
  "/api/hr-chat-knowledge",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** 159-D: 管理者専用API（/api/admin 配下） */
function isAdminApiPath(pathname: string): boolean {
  return pathname === "/api/admin" || pathname.startsWith("/api/admin/");
}

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`)
  );
}

// 未認証のAPI応答。**全APIで同一**にする（応答の違いからルートの存在を推測させない）。
const apiUnauthorized = () =>
  NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

/**
 * getUser() が更新したセッションCookieを、これから返す応答に引き継ぐ（162）。
 *
 * getUser() は有効期限が近いトークンをその場で更新することがある。更新すると
 * **前のリフレッシュトークンは使えなくなる**（Supabaseは更新のたびに入れ替える）。
 * 更新後のCookieは NextResponse.next() の側に書かれるため、redirect や rewrite、
 * 401 を返す経路では **書き戻しが捨てられ、利用者の手元には無効になった古い
 * トークンだけが残る**＝次の操作から突然ログアウトする。
 *
 * どの応答を返す場合も、必ずここを通して更新分を引き継ぐ。
 */
function withSession<T extends NextResponse>(from: NextResponse, to: T): T {
  for (const cookie of from.cookies.getAll()) to.cookies.set(cookie);
  return to;
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

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

  // API（161）: 明示した例外以外は、未ログインなら一律401でここで止める。
  // ルートの中身（存在秘匿の404など）はログイン済みの人にだけ見せる。
  if (isApi) {
    if (isPublicApiPath(pathname)) return response;
    if (!user) return withSession(response, apiUnauthorized());
    // 159-D: /api/admin 配下は、管理者以外には**実在しないAPIと同じ応答**にする。
    // ページ側（/admin）と同じ手法。ここを通さないと、ログイン済みの非管理者に対して
    // 実在ルートは401/403・非実在ルートは404となり、応答の違いから存在が分かる。
    if (isAdminApiPath(pathname) && !isAdminUser(user)) {
      return withSession(
        response,
        NextResponse.rewrite(new URL(HIDDEN_API_PATH, request.url))
      );
    }
    return response;
  }

  // 管理画面: 管理者以外は存在しないパスと同じ404にする（158）
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (isAdminUser(user)) return response;
    return withSession(
      response,
      NextResponse.rewrite(new URL(HIDDEN_PATH, request.url))
    );
  }

  // ログインに至るためのパスは素通し
  if (isPublicPath(pathname)) return response;

  // それ以外のページは、未ログインならログイン画面へ（元のURLは next で引き継ぐ）
  if (!user) {
    const url = new URL("/login", request.url);
    const target = `${pathname}${search}`;
    if (target && target !== "/") url.searchParams.set("next", target);
    const redirect = NextResponse.redirect(url);
    // 162: 「ログインが必要」という判定を保存させない。
    // この応答が先読み（プリフェッチ）で取得されて残ると、ログイン後も
    // その判定が使われて締め出しが続く（詳細は src/lib/auth-navigation.ts）。
    redirect.headers.set("Cache-Control", "no-store, must-revalidate");
    return withSession(response, redirect);
  }

  return response;
}

export const config = {
  // 161: **APIもここを通す**（160までは api/ を除外していた＝18本が素通りだった）。
  // 除外は静的アセットのみ。
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json|webmanifest)$).*)",
  ],
};
