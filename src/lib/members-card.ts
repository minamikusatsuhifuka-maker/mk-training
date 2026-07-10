// メンバー紹介カードの表示項目設定（指示書32）
// content_store `members_card_config` に保存:
//   { fieldIds: string[](順序付き・最大5), showKana, showRole, showMessage }
// fieldIds には基本項目（bio/hobbies）と profile_field_config のカスタム項目 id が入る。
// 設定が無い・不正なら既定（ふりがな/役職/ひとことON＋趣味・特技1つ）にフォールバック。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const MEMBERS_CARD_CONFIG_KEY = "members_card_config";

// 選択できる fieldIds の上限
export const MAX_CARD_FIELD_IDS = 5;

// 1枚のカードに実際に表示する項目数の上限（値が空の項目は数えない）
export const MAX_CARD_FIELDS_SHOWN = 3;

export type MembersCardConfig = {
  fieldIds: string[];
  showKana: boolean;
  showRole: boolean;
  showMessage: boolean;
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
};

export function normalizeMembersCardConfig(raw: unknown): MembersCardConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MEMBERS_CARD_CONFIG };
  const o = raw as Record<string, unknown>;
  const fieldIds = Array.isArray(o.fieldIds)
    ? o.fieldIds
        .filter((id): id is string => typeof id === "string" && !!id.trim())
        .map((id) => id.trim())
        .slice(0, MAX_CARD_FIELD_IDS)
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
  };
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
