// 院長の振り返り記録（指示書173）
//
// /admin 配下に置かない理由は149・169と同じ: admin/layout.tsx と proxy の /admin 秘匿は
// 管理者のみを通す作りで、157の menu_access（指名制）を流用する余地が無くなる。
// 独自ゲートを持つ独立ルートにし、管理画面からはリンクで導線を作る。
//
// 非許可・未ログインには notFound()（Next の標準404）。赤裸々な内容を書く場所なので
// 機能の存在自体を伏せる（173-1）。

import { notFound } from "next/navigation";
import { authorizeDirectorRetrospective } from "@/lib/director-retrospective-server";
import { DirectorRetrospectiveBoard } from "@/components/DirectorRetrospectiveBoard";

// セッション依存のため常に動的レンダリング
export const dynamic = "force-dynamic";

export default async function DirectorRetrospectivePage() {
  const auth = await authorizeDirectorRetrospective();
  if (!auth.ok) notFound();

  // 編集・出力できるのは管理者のみ。表示の出し分けはここで渡した値に従うが、
  // 実際の可否はAPI側でも管理者判定をやり直している。
  return <DirectorRetrospectiveBoard isAdmin={auth.isAdmin} />;
}
