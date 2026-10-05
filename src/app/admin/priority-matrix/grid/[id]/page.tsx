// 9マスの専用画面（指示書202 §3）— **院長のみ**
//
// 四象限の1項目、または9マス帳の1冊を、モーダルの外の専用画面で開く。
// 何段目を見ているかは ?p=（例 ?p=2.5）で持つ。道筋から各段に戻れる。
//
// /admin 配下なので proxy.ts と admin/layout.tsx が管理者以外を404にするが、
// 「関門が外れても素通りさせない」ため、ここでもう一度判定する（161の方針）。

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";
import { NineGridScreen } from "@/components/admin/NineGridScreen";

// セッション依存のため常に動的レンダリング
export const dynamic = "force-dynamic";

export default async function PriorityGridPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await getSessionUser();
  if (!isAdminUser(user)) notFound();
  const { id } = await params;
  const recordId = decodeURIComponent(id ?? "");
  if (!recordId) notFound();
  const sp = await searchParams;
  const p = typeof sp.p === "string" ? sp.p : "";
  return <NineGridScreen recordId={recordId} pathParam={p} />;
}
