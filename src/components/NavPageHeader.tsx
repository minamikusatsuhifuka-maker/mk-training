"use client";

// ページ見出しのナビ連動版（指示書123）
// 管理「サイドバー構成」の「表示名の上書き」があれば、ナビと同じ名前を見出しにも出す。
// - navKey = MASTER_ITEMS の key（＝ルート）。
// - title = 既定見出し（上書き未設定・ロード前・取得失敗時はこれを表示＝フェイルセーフ）。
// - description（サブタイトル）は上書き対象外＝固定のまま（指示書123）。
// 上書き解決の正本は lib/nav.ts の navLabelOverride（usePageTitle 経由・重複実装禁止）。

import { PageHeader } from "@/components/PageHeader";
import { usePageTitle } from "@/lib/use-nav";

export default function NavPageHeader({
  navKey,
  title,
  description,
  badge,
}: {
  navKey: string;
  title: string;
  description?: string;
  badge?: string;
}) {
  const resolvedTitle = usePageTitle(navKey, title);
  return (
    <PageHeader title={resolvedTitle} description={description} badge={badge} />
  );
}
