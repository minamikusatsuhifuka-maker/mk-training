"use client";

// 機能フラグを「自分の立場で」取り直すクライアント側の入口（指示書203 §1）
//
// 役割（院長か・検証用アカウントか）はブラウザでは判定しない。
// /api/feature-flags（サーバーで判定）から受け取るだけにする。
// 取れなかったときは**保存されたフラグそのまま＝プレビューなし**に倒す（fail-close）。

import {
  DEFAULT_FEATURE_FLAGS,
  getFeatureFlags,
  type FeatureFlags,
  type FeatureId,
  type PreviewReason,
} from "./feature-flags";

export type ViewerFlags = {
  flags: FeatureFlags;
  preview: boolean;
  previewReason: PreviewReason;
  previewIds: FeatureId[];
};

export const NO_PREVIEW: Omit<ViewerFlags, "flags"> = {
  preview: false,
  previewReason: "",
  previewIds: [],
};

function isFlagRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

/** サーバーが解決したフラグを取る。失敗したら保存値のまま（プレビューなし） */
export async function fetchViewerFlags(): Promise<ViewerFlags> {
  try {
    const res = await fetch("/api/feature-flags", {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (res.ok) {
      const j = (await res.json()) as Partial<ViewerFlags>;
      if (isFlagRecord(j.flags)) {
        const flags = { ...DEFAULT_FEATURE_FLAGS };
        for (const id of Object.keys(flags) as (keyof FeatureFlags)[]) {
          const v = (j.flags as Record<string, unknown>)[id];
          if (typeof v === "boolean") flags[id] = v;
        }
        return {
          flags,
          preview: j.preview === true,
          previewReason:
            j.previewReason === "admin" || j.previewReason === "test_seed"
              ? j.previewReason
              : "",
          previewIds: Array.isArray(j.previewIds)
            ? (j.previewIds.filter((x) => typeof x === "string") as FeatureId[])
            : [],
        };
      }
    }
  } catch {
    /* 下の保存値そのままへ */
  }
  return { flags: await getFeatureFlags().catch(() => DEFAULT_FEATURE_FLAGS), ...NO_PREVIEW };
}
