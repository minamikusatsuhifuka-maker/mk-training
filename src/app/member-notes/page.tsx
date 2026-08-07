// メンバーノート（指示書149）
//
// /admin 配下に置かない理由: admin/layout.tsx が「管理者のみ」で弾くため、
// 指定アカウントに非管理者（例: マネージャー）を含められなくなる。
// 「指定アカウントでのみ表示」を満たすには、独自ゲートを持つ独立ルートが必要。
// 管理画面からの導線は、許可されたユーザーにだけサイドナビにリンクを出す形で用意する。
//
// 非許可・未ログインには notFound()（Next の標準404）を返し、機能の存在を知らせない。

import { notFound } from "next/navigation";
import { authorizeMemberNotes } from "@/lib/member-notes-server";
import { MemberNotesEditor } from "@/components/MemberNotesEditor";

// セッション依存のため常に動的レンダリング
export const dynamic = "force-dynamic";

export default async function MemberNotesPage() {
  const auth = await authorizeMemberNotes();
  if (!auth.ok) notFound();

  return <MemberNotesEditor isAdmin={auth.isAdmin} />;
}
