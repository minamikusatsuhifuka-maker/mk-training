// 機能フラグ基盤（指示書103）
// 新機能を「実装済みだが非表示」の状態で安全に保持するためのフラグ集。
// content_store の単一キー portal_feature_flags に { features, updatedAt } で保存。
// - キー未存在時は全機能OFF（フェイルセーフ）。
// - features 内の未知IDは無視・欠けているIDはOFF扱い（前方互換）。
// - 既存の portal_features（実装済みUIの表示スイッチ・既定ON）とは別物で併存する。
//   こちらは「未リリース機能の解禁」用で既定OFF。実装パターンは portal-features.ts を踏襲。
// 管理UIは /admin/portal「⚙ 機能」タブ下部の「機能の表示設定」セクション。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const FEATURE_FLAGS_KEY = "portal_feature_flags";

// 機能ID（指示書103で固定・以後のフェーズ（指示書104〜114想定）で変更禁止）
export const FEATURE_IDS = [
  "hiyari",
  "kizuki",
  "thanks",
  "manual_draft",
  "chorei",
  "benkyokai",
  "self_review",
  "one_on_one",
  "onboarding",
  "calendar",
] as const;
export type FeatureId = (typeof FEATURE_IDS)[number];

export type FeatureFlags = Record<FeatureId, boolean>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  hiyari: false,
  kizuki: false,
  thanks: false,
  manual_draft: false,
  chorei: false,
  benkyokai: false,
  self_review: false,
  one_on_one: false,
  onboarding: false,
  calendar: false,
};

// 機能定義一覧（管理画面と将来のナビ登録の両方がここを参照する。二重定義禁止）
export type FeatureMeta = {
  id: FeatureId;
  label: string;
  description: string;
  phase: 1 | 2 | 3 | 4;
};

export const FEATURE_META: FeatureMeta[] = [
  { id: "hiyari", label: "ヒヤリハット報告", description: "気づいた人が組織を救う、安全の分かち合い", phase: 1 },
  { id: "kizuki", label: "日々の気づき投稿", description: "小さな「あれ?」を言葉にする場", phase: 1 },
  { id: "thanks", label: "サンクスカード", description: "感謝を見える形で贈り合う", phase: 1 },
  { id: "manual_draft", label: "マニュアル下書き", description: "未来の仲間への贈り物を書く場", phase: 2 },
  { id: "chorei", label: "朝礼サポート", description: "輪番と学び共有の記録", phase: 2 },
  { id: "benkyokai", label: "勉強会アーカイブ", description: "月1勉強会の資料と学びの蓄積", phase: 2 },
  { id: "self_review", label: "自己評価シート", description: "半期面談・年次対話の入口", phase: 3 },
  { id: "one_on_one", label: "1on1ノート", description: "伴走の対話を記録する場", phase: 3 },
  { id: "onboarding", label: "オンボーディング", description: "新しい仲間の最初の道しるべ", phase: 4 },
  { id: "calendar", label: "院内カレンダー", description: "勉強会・イベントの予定共有", phase: 4 },
];

// 実装済み機能の集合。各フェーズの実装指示書でIDを追加していく。
// ここに無いIDは管理画面に「未実装」バッジが付く（トグル自体は保存できる）。
export const IMPLEMENTED_FEATURES: ReadonlySet<FeatureId> = new Set<FeatureId>([
  "kizuki", // 指示書104: 日々の気づき投稿（/kizuki）
]);

type StoredFeatureFlags = {
  features?: Record<string, unknown>;
  updatedAt?: string;
};

// content_store から取得してデフォルト規則を適用（未知ID無視・欠落ID/boolean以外はOFF）
export async function getFeatureFlags(): Promise<FeatureFlags> {
  const obj = await loadPortalObject<StoredFeatureFlags | null>(
    FEATURE_FLAGS_KEY,
    null
  );
  const next = { ...DEFAULT_FEATURE_FLAGS };
  const src =
    obj && typeof obj === "object" && obj.features && typeof obj.features === "object"
      ? obj.features
      : null;
  if (src) {
    for (const id of FEATURE_IDS) {
      const v = src[id];
      if (typeof v === "boolean") next[id] = v;
    }
  }
  return next;
}

// 単一機能の有効判定
export async function isFeatureEnabled(id: FeatureId): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[id];
}

// キーを丸ごと更新（updatedAt は現在時刻）。初回保存でキーが自動作成される（SQL投入不要）。
export async function saveFeatureFlags(flags: FeatureFlags): Promise<boolean> {
  return savePortalObject(FEATURE_FLAGS_KEY, {
    features: flags,
    updatedAt: new Date().toISOString(),
  });
}
