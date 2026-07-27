"use client";

import { useEffect, useState } from "react";
import { getContentObject } from "@/lib/content-store";
import {
  NAV_CONFIG_KEY,
  resolveNav,
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
