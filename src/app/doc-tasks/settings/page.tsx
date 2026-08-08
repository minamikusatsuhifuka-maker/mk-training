// 書類進捗ボードの設定（指示書157-A）
//
// 【なぜ /admin 配下に置かないのか】
// admin/layout.tsx は未ログイン・非管理者に「ログインが必要です／権限がありません」を
// **200で** 返す（page まで到達しない）。そのため /admin/doc-tasks に置くと、
// 存在しないパスが404を返すのと差が出て **ルートの存在が漏れる**（実測で確認）。
// 157-A-2 の「直URLは404」を満たすため、独自ゲートを持つこのルートに置く。
// 管理画面からの導線は AdminShell のメニューにリンクを出す形で用意する（149と同じ流儀）。
//
// 権限は **管理者のみ**。それ以外は notFound()＝404。

import { notFound } from "next/navigation";
import { authorizeDocTasks } from "@/lib/doc-tasks-server";
import { DocTasksAdminPanel } from "@/components/admin/DocTasksAdminPanel";

export const dynamic = "force-dynamic";

export default async function DocTasksSettingsPage() {
  const auth = await authorizeDocTasks();
  if (!auth.ok || !auth.isAdmin) notFound();

  return <DocTasksAdminPanel />;
}
