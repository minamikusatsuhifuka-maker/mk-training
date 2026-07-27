"use client";

// 機能フラグのクライアントフック（指示書103）。use-nav.ts と同じ流儀。
// ロード前は全機能OFF（DEFAULT_FEATURE_FLAGS）＝フェイルセーフ。
// loaded を返すのは、FeatureGate が「読み込み中」と「OFFで非公開」を区別するため。

import { useEffect, useState } from "react";
import {
  getFeatureFlags,
  DEFAULT_FEATURE_FLAGS,
  type FeatureFlags,
} from "@/lib/feature-flags";

export function useFeatureFlags(): { flags: FeatureFlags; loaded: boolean } {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getFeatureFlags()
      .then((f) => {
        if (active) {
          setFlags(f);
          setLoaded(true);
        }
      })
      .catch(() => {
        // 取得失敗は既定（全OFF）のまま。loaded は立てて「準備中」を表示する
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return { flags, loaded };
}
