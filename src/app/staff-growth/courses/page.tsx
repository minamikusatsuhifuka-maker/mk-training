// 講座マスタ・設定（指示書179 B-2／B-3）— **管理者のみ**。非許可は404

import { notFound } from "next/navigation";
import { authorizeGrowth } from "@/lib/staff-growth-server";
import { CourseMasterPanel } from "@/components/CourseMasterPanel";

export const dynamic = "force-dynamic";

export default async function CourseMasterPage() {
  const auth = await authorizeGrowth();
  if (!auth.ok || !auth.isAdmin) notFound();
  return <CourseMasterPanel />;
}
