// スタッフ連絡先の設定（指示書169）
//
// 【なぜ /admin 配下に置かないのか】
// 157と同じ理由。管理画面のレイアウトは非管理者に別の応答を返すため、
// そこに置くと「存在しないパスの404」と差が出てルートの存在が漏れる。
// 独自ゲートを持つこのルートに置き、管理画面からはリンクで導線を作る。
//
// 権限は **管理者のみ**。それ以外は notFound()＝404。

import { notFound } from "next/navigation";
import { authorizeStaffContacts } from "@/lib/staff-contacts-server";
import { StaffContactsAdminPanel } from "@/components/admin/StaffContactsAdminPanel";

export const dynamic = "force-dynamic";

export default async function StaffContactsSettingsPage() {
  const auth = await authorizeStaffContacts();
  if (!auth.ok || !auth.isAdmin) notFound();

  return <StaffContactsAdminPanel />;
}
