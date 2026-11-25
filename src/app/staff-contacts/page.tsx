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

export default async function StaffContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const auth = await authorizeStaffContacts();
  if (!auth.ok) notFound();

  // 第6便: 👥スタッフ管理の行から「📇 連絡先」で来たとき、?q=氏名 で検索欄を埋めて
  // その人をすぐ開けるようにする（スタッフ管理 → 対象者 → 編集 → 保存、の一本道）。
  const { q } = await searchParams;

  // 登録・修正は管理者と「編集も任せる人」（第5便）。削除・家族構成の表示は管理者のみ。
  // 表示の出し分けはここで渡した値に従うが、実際の可否はAPI側でも判定をやり直している。
  return (
    <StaffContactsBoard
      isAdmin={auth.isAdmin}
      canEdit={auth.canEdit}
      initialKeyword={(q ?? "").trim()}
    />
  );
}
