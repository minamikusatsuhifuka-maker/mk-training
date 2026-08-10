"use client";

// 既存ページの公開スイッチ（指示書124）— 直URLガード
// MASTER_ITEMS の page_*/group_* フラグ付きルートを、レイアウトの1箇所で一括ガードする
// （29ページを個別に包まない＝重複実装禁止）。10機能（指示書103・既定OFF）は
// 各ページ内の FeatureGate が従来どおり担当し、ここでは対象にしない。
//
// 161: 機能一覧（MASTER_ITEMS）をモジュールスコープで読むため、
// ここは PageAccessGate.tsx から dynamic import で切り離してある。
// レイアウト直下に置いたままだと、ログイン画面に配るJSにも全機能名が入ってしまう。
//
// フェイルセーフの向きが10機能と逆であることが最重要（院長決定）:
// - page系の既定はON。ロード前・取得失敗・保存データにID欠落 → すべて「表示」に倒す
//   （デプロイ直後・設定未操作で既存ページが「準備中」になる事故を起こさない）。
// - OFF確定時のみ「準備中」。見出しはナビ名（表示名の上書き反映=123整合）を出す。
// - サブパス（例 /tasks/history）は親ルートのスイッチに連動する。

import { usePathname } from "next/navigation";
import { useFeatureFlags } from "@/lib/use-feature-flags";
import { usePageTitle } from "@/lib/use-nav";
import { FeatureUnavailable } from "@/components/FeatureGate";
import { PageHeader } from "@/components/PageHeader";
import { MASTER_ITEMS } from "@/lib/nav";
import { FEATURE_IDS, type PageFlagId } from "@/lib/feature-flags";

// ルート→page系フラグの索引（モジュールスコープで1回構築）。
// 10機能のID・外部リンク・ルートでないkeyは対象外。
const FEATURE_ID_SET = new Set<string>(FEATURE_IDS);
const GUARDS: { path: string; flag: PageFlagId; label: string }[] =
  MASTER_ITEMS.filter(
    (m) =>
      !m.external &&
      !!m.featureId &&
      !FEATURE_ID_SET.has(m.featureId) &&
      m.key.startsWith("/") &&
      m.key !== "/"
  ).map((m) => ({
    path: m.key,
    flag: m.featureId as PageFlagId,
    label: m.label,
  }));

function GuardedPage({
  guard,
  children,
}: {
  guard: { path: string; flag: PageFlagId; label: string };
  children: React.ReactNode;
}) {
  const { flags, loaded } = useFeatureFlags();
  // 見出しはナビと同じ名前（「表示名の上書き」反映・指示書123と整合）
  const navTitle = usePageTitle(guard.path, guard.label);

  // fail-open: ロード前は中身を表示（10機能のfail-closeと逆向き・指示書124の要）
  if (!loaded || flags[guard.flag]) return <>{children}</>;

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader title={navTitle} />
      <FeatureUnavailable />
    </div>
  );
}

export default function PageAccessGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const guard = GUARDS.find(
    (g) => pathname === g.path || pathname.startsWith(`${g.path}/`)
  );
  // 対象外ルート（ホーム・管理画面・ログイン等）は素通し。
  // ガード対象でも GuardedPage 側でフラグ確定OFFの時だけ「準備中」になる
  if (!guard) return <>{children}</>;
  return <GuardedPage guard={guard}>{children}</GuardedPage>;
}
