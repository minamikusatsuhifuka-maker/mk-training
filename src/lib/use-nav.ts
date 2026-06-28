"use client";

import { useEffect, useState } from "react";
import { getContentObject } from "@/lib/content-store";
import {
  NAV_CONFIG_KEY,
  resolveNav,
  type NavConfig,
  type ResolvedCategory,
} from "@/lib/nav";

// スタッフ側サイドバー用。まず既定（マスター）で即描画し、その後 content_store の設定を反映する。
// 取得失敗・未設定・不正時は既定にフォールバックするため、メニューが消えない。
export function useResolvedNav(): ResolvedCategory[] {
  const [categories, setCategories] = useState<ResolvedCategory[]>(() => resolveNav(null));

  useEffect(() => {
    let active = true;
    getContentObject<NavConfig>(NAV_CONFIG_KEY)
      .then((cfg) => {
        if (active) setCategories(resolveNav(cfg));
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
