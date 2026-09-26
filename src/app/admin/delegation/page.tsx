// 委任の設定（指示書183）— **院長のみ**。
// admin/layout は委任された幹部も通すため、権限の設定そのものはこのページでもう一度 app_metadata の管理者判定を行う
//（proxy でも "delegation" は委任不可の項目として実在しないパスと同じ応答にしている）。

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";
import { DelegationPanel } from "@/components/admin/DelegationPanel";

export const dynamic = "force-dynamic";

export default async function DelegationPage() {
  const { user } = await getSessionUser();
  if (!user || !isAdminUser(user)) notFound();
  return <DelegationPanel />;
}
