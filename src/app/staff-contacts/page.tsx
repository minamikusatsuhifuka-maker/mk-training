// スタッフ連絡先（指示書169）
//
// /admin 配下に置かない理由は149・157と同じ: admin/layout.tsx は管理者のみを通すため、
// 指名アカウント（非管理者）を含められなくなる。独自ゲートを持つ独立ルートにする。
//
// 非許可・未ログインには notFound()（Next の標準404）。住所・電話番号と
// 本人以外（家族・保証人）の情報を扱うため、機能の存在自体を伏せる。

import { notFound } from "next/navigation";
import { authorizeStaffContacts } from "@/lib/staff-contacts-server";
import { StaffContactsBoard } from "@/components/StaffContactsBoard";

// セッション依存のため常に動的レンダリング
export const dynamic = "force-dynamic";

export default async function StaffContactsPage() {
  const auth = await authorizeStaffContacts();
  if (!auth.ok) notFound();

  // 編集できるのは管理者のみ（169-1-2）。表示の出し分けはここで渡した値に従うが、
  // 実際の可否はAPI側でも管理者判定をやり直している。
  return <StaffContactsBoard isAdmin={auth.isAdmin} />;
}
