// 院内端末（指示書192・192-補）— **院長のみ**。183の委任対象外（admin-items で delegable: false ＝ proxy が幹部に404）。

import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";
import { TerminalsPanel } from "@/components/admin/TerminalsPanel";

export const dynamic = "force-dynamic";

export default async function TerminalsPage() {
  const { user } = await getSessionUser();
  if (!user || !isAdminUser(user)) notFound();
  return <TerminalsPanel />;
}
