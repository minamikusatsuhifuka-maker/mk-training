// ポータル機能スイッチ（指示書47）
// content_store `portal_features` に単一オブジェクトで保存。
// OFF でも回答等のデータは保持し、表示だけを消す（ONで元に戻る）。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const PORTAL_FEATURES_KEY = "portal_features";

export type PortalFeatures = {
  weeklyQuestion: boolean;
};

export const DEFAULT_PORTAL_FEATURES: PortalFeatures = {
  weeklyQuestion: true,
};

export async function loadPortalFeatures(): Promise<PortalFeatures> {
  const obj = await loadPortalObject<Partial<PortalFeatures> | null>(
    PORTAL_FEATURES_KEY,
    null
  );
  if (!obj || typeof obj !== "object") return { ...DEFAULT_PORTAL_FEATURES };
  return {
    ...DEFAULT_PORTAL_FEATURES,
    ...(typeof obj.weeklyQuestion === "boolean"
      ? { weeklyQuestion: obj.weeklyQuestion }
      : {}),
  };
}

export async function savePortalFeatures(
  features: PortalFeatures
): Promise<boolean> {
  return savePortalObject(PORTAL_FEATURES_KEY, features);
}
