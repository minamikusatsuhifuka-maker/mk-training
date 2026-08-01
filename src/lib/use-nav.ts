"use client";

import { useEffect, useState } from "react";
import { getContentObject } from "@/lib/content-store";
import {
  NAV_CONFIG_KEY,
  resolveNav,
  navLabelOverride,
  type NavConfig,
  type ResolvedCategory,
} from "@/lib/nav";
import {
  getFeatureFlags,
  DEFAULT_FEATURE_FLAGS,
} from "@/lib/feature-flags";

// スタッフ側サイドバー用。まず既定（マスター）で即描画し、その後 content_store の設定を反映する。
// 取得失敗・未設定・不正時は既定にフォールバックするため、メニューが消えない。
// 103: 機能フラグも併読し、OFFの機能項目をナビから除外する。
//   初期描画・取得失敗時は既定（全OFF）＝フラグ付き項目は出ない向きのフェイルセーフ。
// ページ見出しのナビ連動（指示書123）: 管理「サイドバー構成」の「表示名の上書き」を
// ページの見出しにも反映する。上書き解決は navLabelOverride（nav.ts・ナビと同じ正本）。
// フェイルセーフは useResolvedNav と同じ流儀: ロード前・未設定・空・取得失敗は
// defaultTitle（各ページの既定見出し）をそのまま表示し、ブランクにしない。
export function usePageTitle(navKey: string, defaultTitle: string): string {
  const [title, setTitle] = useState(defaultTitle);

  useEffect(() => {
    let active = true;
    getContentObject<NavConfig>(NAV_CONFIG_KEY)
      .then((cfg) => {
        if (!active) return;
        const override = navLabelOverride(cfg, navKey);
        if (override) setTitle(override);
      })
      .catch(() => {
        /* 既定タイトルのまま */
      });
    return () => {
      active = false;
    };
  }, [navKey]);

  return title;
}

export function useResolvedNav(): ResolvedCategory[] {
  const [categories, setCategories] = useState<ResolvedCategory[]>(() =>
    resolveNav(null, DEFAULT_FEATURE_FLAGS)
  );

  useEffect(() => {
    let active = true;
    Promise.all([
      getContentObject<NavConfig>(NAV_CONFIG_KEY).catch(() => null),
      getFeatureFlags().catch(() => DEFAULT_FEATURE_FLAGS),
    ])
      .then(([cfg, flags]) => {
        if (active) setCategories(resolveNav(cfg, flags));
      })
      .catch(() => {
        /* フォールバック維持 */
      });
    return () => {
      active = false;
    };
  }, []);

  return categories;
}
