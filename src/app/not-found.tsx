import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-6xl font-bold text-teal">404</h1>
      <p className="text-muted-foreground">ページが見つかりません</p>
      <Link
        href="/"
        className="mt-2 rounded-md bg-teal px-4 py-2 text-sm text-teal-foreground hover:opacity-90 transition-opacity"
      >
        ホームに戻る
      </Link>
    </div>
  );
}
