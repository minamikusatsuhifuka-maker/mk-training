// ポータル機能スイッチ（指示書47・46Rで3機能に拡張）
// content_store `portal_features` に単一オブジェクトで保存。
// OFF でも回答等のデータは保持し、表示だけを消す（ONで元に戻る）。
// トグルUIは /admin/portal「⚙ 機能」タブ。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const PORTAL_FEATURES_KEY = "portal_features";

export type PortalFeatures = {
  weeklyQuestion: boolean; // 今週の質問（ホーム/履歴/アーカイブ）
  thanksShowcase: boolean; // ありがとうの見える化（ホーム常時表示・/profileの📮）
  commonPoints: boolean; // 共通点バッジ（/members）
};

export const DEFAULT_PORTAL_FEATURES: PortalFeatures = {
  weeklyQuestion: true,
  thanksShowcase: true,
  commonPoints: true,
};

export const PORTAL_FEATURE_META: {
  key: keyof PortalFeatures;
  label: string;
  description: string;
}[] = [
  {
    key: "weeklyQuestion",
    label: "❓ 今週の質問",
    description:
      "ホームの「今週の質問」セクション・メンバー紹介の回答履歴・アーカイブページ（/weekly-questions）を表示します。",
  },
  {
    key: "thanksShowcase",
    label: "📮 ありがとうの見える化",
    description:
      "ホームに最新のありがとうカードを常時表示し、ログイン中は /profile に「今月あなたに届いたありがとう」を表示します（OFFでも「＋送る」の投稿機能は従来どおり）。",
  },
  {
    key: "commonPoints",
    label: "🤝 共通点バッジ",
    description:
      "ログイン中、メンバー紹介の他の人のカード・詳細に「あなたとの共通点」を表示します。",
  },
];

export async function loadPortalFeatures(): Promise<PortalFeatures> {
  const obj = await loadPortalObject<Partial<PortalFeatures> | null>(
    PORTAL_FEATURES_KEY,
    null
  );
  if (!obj || typeof obj !== "object") return { ...DEFAULT_PORTAL_FEATURES };
  const next = { ...DEFAULT_PORTAL_FEATURES };
  for (const { key } of PORTAL_FEATURE_META) {
    if (typeof obj[key] === "boolean") next[key] = obj[key];
  }
  return next;
}

export async function savePortalFeatures(
  features: PortalFeatures
): Promise<boolean> {
  return savePortalObject(PORTAL_FEATURES_KEY, features);
}
