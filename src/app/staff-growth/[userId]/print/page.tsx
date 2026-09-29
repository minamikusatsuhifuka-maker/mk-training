// 育成カルテの印刷用表示（指示書195）— 院長・担当幹部。権限は画面と同じ（API 側でも再判定）

import { notFound } from "next/navigation";
import { authorizeGrowth, canViewStaff } from "@/lib/staff-growth-server";
import { KartePrintView } from "@/components/KartePrintView";

export const dynamic = "force-dynamic";

export default async function StaffGrowthPrintPage({ params }: { params: Promise<{ userId: string }> }) {
  const auth = await authorizeGrowth();
  if (!auth.ok || (!auth.isAdmin && auth.assignedStaffIds.length === 0)) notFound();
  const { userId } = await params;
  const decoded = decodeURIComponent(userId ?? "");
  if (!decoded || !canViewStaff(auth, decoded)) notFound();
  return <KartePrintView userId={decoded} backHref={`/staff-growth/${encodeURIComponent(decoded)}`} />;
}
