// 🧭 欲求の一覧（指示書276）— 院長だけ
// 院長でなければ、存在しない画面と同じ 404（ほかの管理者・委任された幹部も）。
// 委任された幹部は proxy.ts の段階で止まる（ADMIN_ITEMS に無い項目＝誰にも委任できない）。

import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/staff-profiles-server";
import { isDirectorUser } from "@/lib/people-training-server";
import { NeedsOverview } from "@/components/admin/needs-overview/NeedsOverview";

export const dynamic = "force-dynamic";

export default async function NeedsOverviewPage() {
  const { user } = await getSessionUser();
  if (!isDirectorUser(user)) notFound();
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">読み込み中…</p>}>
      <NeedsOverview />
    </Suspense>
  );
}
