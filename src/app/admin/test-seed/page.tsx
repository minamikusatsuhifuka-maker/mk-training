// 検証用データ（指示書191）— **院長のみ**。183の委任対象外（admin-items で delegable: false ＝ proxy が幹部に404）。
// admin/layout は委任された幹部も通すため、ここでもう一度 app_metadata の管理者判定を行う。

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";
import { TestSeedPanel } from "@/components/admin/TestSeedPanel";

export const dynamic = "force-dynamic";

export default async function TestSeedPage() {
  const { user } = await getSessionUser();
  if (!user || !isAdminUser(user)) notFound();
  return <TestSeedPanel />;
}
