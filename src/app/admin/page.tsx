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
import type { PurposeCard } from "@/components/admin/AdminPurposeHub";
import { authorizeStaffContacts } from "@/lib/staff-contacts-server";
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

  // 第8便: 任された幹部にも「やりたいことから選ぶ」入口を出す（任されている範囲・開ける画面だけ）
  let contactsOk = false;
  try {
    contactsOk = (await authorizeStaffContacts()).ok;
  } catch {
    contactsOk = false;
  }
  const has = (k: string) => delegated.includes(k);
  const hub: PurposeCard[] = [
    {
      icon: "👥",
      title: "スタッフを管理する",
      desc: "名簿・氏名の統一・在籍区分、住所や緊急連絡先の登録。新しいスタッフを迎える順番①〜⑤はスタッフ管理の先頭に出ます。",
      share: "admin",
      links: [
        ...(has("staff-members") ? [{ label: "👥 スタッフ管理", href: "/admin/staff-members" }] : []),
        ...(contactsOk ? [{ label: "📇 スタッフ連絡先", href: "/staff-contacts" }] : []),
      ],
    },
    {
      icon: "🌱",
      title: "育てる・1on1",
      desc: "流れ: 🗓 日程で1on1を登録 → 本人の画面に予定と事前アンケートが出る → 回答は「事前アンケートの回答」で確認。",
      share: "personal",
      links: [
        ...(has("one-on-one-slots") ? [{ label: "🗓 1on1の日程", href: "/admin/one-on-one-slots" }] : []),
        ...(has("presurvey-answers") ? [{ label: "📝 事前アンケートの回答", href: "/admin/presurvey-answers" }] : []),
        ...(has("presurvey") ? [{ label: "📝 事前アンケートの質問", href: "/admin/presurvey" }] : []),
      ],
    },
    {
      icon: "📣",
      title: "スタッフに見せるものを作る",
      desc: "ここで保存した内容はスタッフ画面にそのまま出ます。",
      share: "staff",
      links: [
        ...(has("portal") ? [{ label: "🏠 ポータル管理", href: "/admin/portal" }] : []),
        ...(has("notice-attendance") ? [{ label: "📣 イベントの出欠", href: "/admin/notice-attendance" }] : []),
        ...(has("nav") ? [{ label: "🧭 サイドバー構成", href: "/admin/nav" }] : []),
      ],
    },
  ];

  return <AdminDelegateDashboard cards={cards} hub={hub} />;
}
