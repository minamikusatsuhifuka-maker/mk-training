// 院長の四象限マトリクス（指示書201 A）
//
// **院長のみ**。183の委任対象外（🔒・admin-items.ts の delegable: false）。
// /admin 配下なので proxy.ts と admin/layout.tsx が管理者以外を404にするが、
// 「関門が外れても素通りさせない」ため、ここでもう一度判定する（161の方針）。

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";
import { PriorityMatrixBoard } from "@/components/admin/PriorityMatrixBoard";

// セッション依存のため常に動的レンダリング
export const dynamic = "force-dynamic";

export default async function PriorityMatrixPage() {
  const { user } = await getSessionUser();
  if (!isAdminUser(user)) notFound();
  return <PriorityMatrixBoard />;
}
