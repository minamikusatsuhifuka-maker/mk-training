// メンバー紹介カードの表示項目設定（指示書32、38で上限撤廃、45で列数追加）
// content_store `members_card_config` に保存:
//   { fieldIds: string[](順序付き・上限なし), showKana, showRole, showMessage, columns(2〜4) }
// fieldIds には基本項目（bio/hobbies）と profile_field_config のカスタム項目 id が入る。
// 設定が未保存なら「全カスタム項目＋自己紹介・趣味特技」（書いたものは全部出る）が既定。
// 値が入っている項目はすべてカードに表示する（指示書38・表示数上限なし）。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const MEMBERS_CARD_CONFIG_KEY = "members_card_config";

// カードの列数（広い画面での最大値。狭い画面ではクランプで自動減）
export type MembersCardColumns = 2 | 3 | 4;

export type MembersCardConfig = {
  fieldIds: string[];
  showKana: boolean;
  showRole: boolean;
  showMessage: boolean;
  /** 「今週の質問」の回答履歴（最新2件）をカードに表示（指示書50・既定ON）。
   *  portal_features.weeklyQuestion OFF 時は設定に関わらず非表示。 */
  showWeeklyAnswers: boolean;
  columns: MembersCardColumns;
};

// fieldIds に使える基本項目（StaffProfile の固定フィールド）
export const BASIC_CARD_FIELDS: { id: string; label: string }[] = [
  { id: "bio", label: "自己紹介" },
  { id: "hobbies", label: "趣味・特技" },
];

export const DEFAULT_MEMBERS_CARD_CONFIG: MembersCardConfig = {
  fieldIds: ["hobbies"],
  showKana: true,
  showRole: true,
  showMessage: true,
  showWeeklyAnswers: true,
  columns: 2,
};

// 未保存時の既定 fieldIds:「全カスタム項目＋自己紹介・趣味特技」（書いたものは全部出る）
export function defaultCardFieldIds(customFieldIds: string[]): string[] {
  return [...customFieldIds, ...BASIC_CARD_FIELDS.map((f) => f.id)];
}

export function normalizeMembersCardConfig(raw: unknown): MembersCardConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MEMBERS_CARD_CONFIG };
  const o = raw as Record<string, unknown>;
  const fieldIds = Array.isArray(o.fieldIds)
    ? o.fieldIds
        .filter((id): id is string => typeof id === "string" && !!id.trim())
        .map((id) => id.trim())
    : DEFAULT_MEMBERS_CARD_CONFIG.fieldIds;
  return {
    fieldIds: [...new Set(fieldIds)],
    showKana:
      typeof o.showKana === "boolean"
        ? o.showKana
        : DEFAULT_MEMBERS_CARD_CONFIG.showKana,
    showRole:
      typeof o.showRole === "boolean"
        ? o.showRole
        : DEFAULT_MEMBERS_CARD_CONFIG.showRole,
    showMessage:
      typeof o.showMessage === "boolean"
        ? o.showMessage
        : DEFAULT_MEMBERS_CARD_CONFIG.showMessage,
    showWeeklyAnswers:
      typeof o.showWeeklyAnswers === "boolean"
        ? o.showWeeklyAnswers
        : DEFAULT_MEMBERS_CARD_CONFIG.showWeeklyAnswers,
    columns:
      o.columns === 2 || o.columns === 3 || o.columns === 4
        ? o.columns
        : DEFAULT_MEMBERS_CARD_CONFIG.columns,
  };
}

// 保存済み設定を返す。未保存・不正な形なら null（呼び出し側で全項目既定を組み立てる）
export async function loadMembersCardConfigOrNull(): Promise<MembersCardConfig | null> {
  const payload = await loadPortalObject<unknown>(MEMBERS_CARD_CONFIG_KEY, null);
  if (!payload || typeof payload !== "object") return null;
  return normalizeMembersCardConfig(payload);
}

export async function loadMembersCardConfig(): Promise<MembersCardConfig> {
  const payload = await loadPortalObject<unknown>(MEMBERS_CARD_CONFIG_KEY, null);
  return normalizeMembersCardConfig(payload);
}

export async function saveMembersCardConfig(
  config: MembersCardConfig
): Promise<boolean> {
  return savePortalObject(MEMBERS_CARD_CONFIG_KEY, normalizeMembersCardConfig(config));
}
