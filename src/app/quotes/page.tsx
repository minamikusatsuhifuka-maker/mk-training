// 格言（quotes_port・AirLink から移植）
//
// 【社内限定】未ログインでは中身を見せない。既存のスタッフ画面はクライアント描画で
// 外枠だけ返る作りだが、格言は本文そのものが資産なので**サーバー側でログインを確認**し、
// 未ログインならログインへ誘導する（本文はAPI経由でしか配らないので二重に守る）。
// 検索エンジンに拾われないよう noindex。外部共有・書き出しの導線は作らない。

import Link from "next/link";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { QuotesView } from "@/components/QuotesView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "格言",
  robots: { index: false, follow: false, nocache: true },
};

export default async function QuotesPage() {
  const { user } = await getSessionUser();

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
          <h1 className="text-lg font-bold text-gray-900">🔒 格言</h1>
          <p className="text-sm text-gray-700 leading-relaxed">
            このページはスタッフ専用です。閲覧するにはログインしてください。
          </p>
          <Link
            href="/login?next=/quotes"
            className="inline-block px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            ログインページへ
          </Link>
        </div>
      </div>
    );
  }

  return <QuotesView />;
}
