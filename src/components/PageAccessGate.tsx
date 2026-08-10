"use client";

// 公開スイッチの出し分け（指示書161で中身を PageAccessGateInner へ分離）
//
// 本体は MASTER_ITEMS＝**機能一覧** をモジュールスコープで読む。
// レイアウト直下に直接置いていたため、未ログインの人が開ける画面
// （/login・/reset-password・/join）に配られるJSの中にも
// 全機能の名前・説明が入っていた（161 4-3「機能一覧は出さない」に反する）。
//
// 未ログインで開ける画面ではガードそのものが不要なので、
// パスで判定して本体を読み込まない。

import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";

// 未ログインでも開ける画面（proxy.ts の PUBLIC_PATHS と同じ）。
// ここでガードは働かないため、本体のチャンクを要求しない。
const PUBLIC_PATHS = ["/login", "/reset-password", "/join"];

const PageAccessGateInner = dynamic(
  () => import("@/components/PageAccessGateInner")
);

export default function PageAccessGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
  if (isPublic) return <>{children}</>;
  return <PageAccessGateInner>{children}</PageAccessGateInner>;
}
