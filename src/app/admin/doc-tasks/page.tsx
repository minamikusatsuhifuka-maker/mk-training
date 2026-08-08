// 書類進捗ボードの設定（指示書157-A・管理画面へ移設）
//
// スタッフが開く /doc-tasks からは設定を撤去し、この画面に集約した。
// 権限は **管理者のみ**（未設定時に開ける方向へ倒さない）。
// 権限が無い場合は notFound()＝**404**。403だと機能の存在が漏れるため（149の原則）。

import { notFound } from "next/navigation";
import { authorizeDocTasks } from "@/lib/doc-tasks-server";
import { DocTasksAdminPanel } from "@/components/admin/DocTasksAdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminDocTasksPage() {
  const auth = await authorizeDocTasks();
  if (!auth.ok || !auth.isAdmin) notFound();

  return <DocTasksAdminPanel />;
}
