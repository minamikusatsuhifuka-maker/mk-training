// スタッフ育成カルテ 個人のカルテ（指示書179 A-4）— **管理者のみ**。非許可は404

import { notFound } from "next/navigation";
import { authorizeGrowth, canViewStaff } from "@/lib/staff-growth-server";
import { StaffGrowthDetail } from "@/components/StaffGrowthDetail";

export const dynamic = "force-dynamic";

export default async function StaffGrowthDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const auth = await authorizeGrowth();
  if (!auth.ok || (!auth.isAdmin && auth.assignedStaffIds.length === 0)) notFound();
  const { userId } = await params;
  const decoded = decodeURIComponent(userId ?? "");
  if (!decoded) notFound();
  // 183 A-2: 幹部は担当スタッフ以外（自分自身・実在しないIDを含む）はすべて同じ404
  if (!canViewStaff(auth, decoded)) notFound();
  return <StaffGrowthDetail userId={decoded} />;
}
