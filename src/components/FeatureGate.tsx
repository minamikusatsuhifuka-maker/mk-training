"use client";

// 機能フラグのアクセスガード（指示書103）
// OFFの機能ページに直URLでアクセスされた場合に「準備中」を表示する。
// 各機能ページは <FeatureGate feature="hiyari">…</FeatureGate> で包むだけでよい。
// ロード前は中身を出さない（既定全OFFのフェイルセーフと同じ向き）。
// ※ 既存ページの公開スイッチ（指示書124・既定ON・fail-open）は PageAccessGate 側。
//   「準備中」表示は FeatureUnavailable として共通化し両者で使う（重複実装禁止）。

import Link from "next/link";
import { useFeatureFlags } from "@/lib/use-feature-flags";
import type { FeatureId } from "@/lib/feature-flags";

// 「準備中」表示（指示書103の文言のまま・FeatureGate と PageAccessGate で共用）
export function FeatureUnavailable() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center gap-3">
      <p className="text-3xl">🌱</p>
      <p className="text-sm font-medium text-gray-800">
        この機能は現在準備中です。
      </p>
      <p className="text-xs text-muted-foreground">
        公開までもうしばらくお待ちください。
      </p>
      <Link
        href="/"
        className="text-xs text-teal-600 underline hover:opacity-70 mt-2"
      >
        ホームに戻る
      </Link>
    </div>
  );
}

export default function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureId;
  children: React.ReactNode;
}) {
  const { flags, loaded } = useFeatureFlags();

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        <span className="animate-pulse">読み込んでいます…</span>
      </div>
    );
  }

  if (!flags[feature]) {
    return <FeatureUnavailable />;
  }

  return <>{children}</>;
}
