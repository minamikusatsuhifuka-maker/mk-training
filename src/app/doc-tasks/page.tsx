// 書類進捗ボード（指示書154 / 154-2）
//
// /admin 配下に置かない理由は149と同じ: admin/layout.tsx が管理者のみで弾くため、
// 指名アカウント（医療クラーク等の非管理者）を含められなくなる。独自ゲートの独立ルートにする。
//
// 非許可・未ログインには notFound()（Next の標準404）。カルテ番号を扱うため、
// 機能の存在自体を伏せる（403だと「そういうページがある」と分かってしまう）。

import { notFound } from "next/navigation";
import { authorizeDocTasks } from "@/lib/doc-tasks-server";
import { DocTasksBoard } from "@/components/DocTasksBoard";

// セッション依存のため常に動的レンダリング
export const dynamic = "force-dynamic";

export default async function DocTasksPage() {
  const auth = await authorizeDocTasks();
  if (!auth.ok) notFound();

  return <DocTasksBoard isAdmin={auth.isAdmin} />;
}
