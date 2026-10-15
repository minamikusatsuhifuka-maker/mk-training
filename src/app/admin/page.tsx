// 管理ダッシュボード（/admin）
//
// 255: どのカードを出すかはサーバーが決める。
//   院長（管理者） → 今までどおりの全部のダッシュボード（AdminFullDashboard）
//   任された幹部   → 任された機能のカードだけ（AdminDelegateDashboard）。任されていない機能のカード・件数は描かない
// 入れるかどうか（404）は今までどおり admin/layout.tsx と proxy.ts が決める。ここは見せ方だけ。

import { getSessionUser } from "@/lib/staff-profiles-server";
import { isAdminUser } from "@/lib/admin-role";
import { loadDelegatedItems } from "@/lib/admin-delegation-server";
import { ADMIN_ITEMS, PEOPLE_TRAINING_ITEM_KEY } from "@/lib/admin-items";
import { canSeePeopleTraining } from "@/lib/people-training-server";
import { AdminFullDashboard } from "@/components/admin/AdminFullDashboard";
import { AdminDelegateDashboard, type DelegateCard } from "@/components/admin/AdminDelegateDashboard";
import { diseases } from "@/data/diseases";
import { drugs } from "@/data/drugs";
import { quizQuestions } from "@/data/quiz";
import { contraindications } from "@/data/contraindications";

export const dynamic = "force-dynamic";

/** 件数を添える項目（院長のダッシュボードの件数と同じ数） */
const COUNTS: Record<string, string> = {
  diseases: `${diseases.length}件`,
  drugs: `${drugs.length}件`,
  quiz: `${quizQuestions.length}問`,
  contraindications: `${contraindications.length}件`,
};

export default async function AdminDashboardPage() {
  const { user } = await getSessionUser();
  if (user && isAdminUser(user)) return <AdminFullDashboard />;
  // ここに来るのは layout を通った「任された幹部」だけ
  const delegated = user ? await loadDelegatedItems(user.id) : [];
  const cards: DelegateCard[] = [];
  for (const it of ADMIN_ITEMS) {
    if (it.key === "dashboard" || !it.delegable || !delegated.includes(it.key)) continue;
    // 人材育成研修は、受講者として見られる人だけ（今までの判定のまま）
    if (it.key === PEOPLE_TRAINING_ITEM_KEY && !(user && (await canSeePeopleTraining({ user, isAdmin: false })))) continue;
    cards.push({ key: it.key, label: it.label, href: it.href, description: it.reason, ...(COUNTS[it.key] ? { count: COUNTS[it.key] } : {}) });
  }
  return <AdminDelegateDashboard cards={cards} />;
}
