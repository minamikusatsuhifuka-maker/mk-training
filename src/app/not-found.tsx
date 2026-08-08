import Link from "next/link";

// 404ページ（指示書158-D）
// 管理画面や指名制のページは、権限が無い人・未ログインの人に対しても
// 「存在しないパス」とまったく同じこの画面を返す（存在を漏らさないため）。
// そのため案内文は **どのパスでも同じ一般文言** にしてある（ここで場合分けをしない）。

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
      <h1 className="text-6xl font-bold text-teal">404</h1>
      <p className="text-muted-foreground">ページが見つかりません</p>
      <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
        ログインが必要なページの可能性があります。ブックマークから開いた場合は、
        トップページから入り直してください。
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/"
          className="rounded-md bg-teal px-4 py-2 text-sm text-teal-foreground hover:opacity-90 transition-opacity"
        >
          ホームに戻る
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors"
        >
          ログイン
        </Link>
      </div>
    </div>
  );
}
