// スタッフ育成カルテ 一覧（指示書179 A）— **管理者のみ**
//
// /admin 配下に置かない理由は149・169・173と同じ（admin/layout と proxy の /admin 秘匿の作りに
// 依存せず、独自ゲートを持つ独立ルートにして管理画面からリンクで導線を作る）。
// 非許可・未ログインには notFound()（Next の標準404）＝149・158と同じ。

import { notFound } from "next/navigation";
import { authorizeGrowth } from "@/lib/staff-growth-server";
import { StaffGrowthKarte } from "@/components/StaffGrowthKarte";

export const dynamic = "force-dynamic";

export default async function StaffGrowthPage() {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) notFound();
  return <StaffGrowthKarte />;
}
