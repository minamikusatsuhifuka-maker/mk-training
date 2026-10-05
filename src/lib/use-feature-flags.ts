"use client";

// 機能フラグのクライアントフック（指示書103 → 203 §1でプレビュー対応）。
// ロード前は全機能OFF（DEFAULT_FEATURE_FLAGS）＝フェイルセーフ。
// loaded を返すのは、FeatureGate が「読み込み中」と「OFFで非公開」を区別するため。
//
// 203 §1: 院長・検証用アカウントは「準備中」の機能も開ける。
// その判定は**サーバー**（/api/feature-flags）が行い、ここは受け取るだけ。
// preview / previewIds は「帯を出すかどうか」の表示にだけ使う。

import { useEffect, useState } from "react";
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags, type FeatureId, type PreviewReason } from "@/lib/feature-flags";
import { NO_PREVIEW, fetchViewerFlags } from "@/lib/viewer-flags";

export function useFeatureFlags(): {
  flags: FeatureFlags;
  loaded: boolean;
  /** 院長・検証用アカウントとして「準備中」の機能を開けている */
  preview: boolean;
  previewReason: PreviewReason;
  /** 保存はOFFだが、プレビューで開けている機能 */
  previewIds: FeatureId[];
} {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [preview, setPreview] = useState(NO_PREVIEW);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    fetchViewerFlags()
      .then((v) => {
        if (!active) return;
        setFlags(v.flags);
        setPreview({
          preview: v.preview,
          previewReason: v.previewReason,
          previewIds: v.previewIds,
        });
        setLoaded(true);
      })
      .catch(() => {
        // 取得失敗は既定（全OFF）のまま。loaded は立てて「準備中」を表示する
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return { flags, loaded, ...preview };
}
