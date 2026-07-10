// プロフィールのカスタム項目定義（指示書31）
// 項目定義は content_store `profile_field_config` に { fields: [...] } で保存し、
// 回答は staff_profile:<userId> の customFields: { [fieldId]: string } に保存する。
// 設定が無い・不正な場合は DEFAULT_PROFILE_FIELDS にフォールバック。
// 設定から削除された fieldId の回答データは消さない（表示されなくなるだけ）。

import { loadPortalObject, savePortalObject } from "./portal-store";

export const PROFILE_FIELD_CONFIG_KEY = "profile_field_config";

export type ProfileFieldType = "text" | "textarea";

export type ProfileFieldDef = {
  id: string;
  label: string;
  placeholder?: string;
  type: ProfileFieldType;
  order: number;
  hidden?: boolean;
};

// 既定の項目セット（すべて任意入力）
export const DEFAULT_PROFILE_FIELDS: ProfileFieldDef[] = [
  {
    id: "nickname",
    label: "ニックネーム・呼ばれたい名前",
    placeholder: "例：のぶさん",
    type: "text",
    order: 1,
  },
  {
    id: "hometown",
    label: "出身地",
    placeholder: "例：滋賀県草津市",
    type: "text",
    order: 2,
  },
  {
    id: "favorite_food",
    label: "好きな食べ物・苦手な食べ物",
    placeholder: "例：好き＝お寿司／苦手＝パクチー",
    type: "text",
    order: 3,
  },
  {
    id: "holiday",
    label: "休日の過ごし方",
    placeholder: "例：家族と出かける、カフェで読書",
    type: "text",
    order: 4,
  },
  {
    id: "hooked",
    label: "最近ハマっていること",
    placeholder: "例：韓国ドラマ、筋トレ",
    type: "text",
    order: 5,
  },
  {
    id: "strength",
    label: "得意なこと・任せてほしいこと",
    placeholder: "例：Excel整理、飾り付け、力仕事",
    type: "text",
    order: 6,
  },
  {
    id: "proud",
    label: "ちょっとした自慢",
    placeholder: "例：早起きが得意、皿洗いが速い",
    type: "text",
    order: 7,
  },
  {
    id: "motto",
    label: "座右の銘・大切にしている言葉",
    placeholder: "例：当たり前のことを特別熱心に",
    type: "text",
    order: 8,
  },
  {
    id: "manual",
    label: "私の取扱説明書（こうしてもらえると嬉しい）",
    placeholder: "例：朝は静かめです／頼み事は早めに言ってもらえると助かります",
    type: "textarea",
    order: 9,
  },
  {
    id: "talk_ok",
    label: "こんな話題ふってください",
    placeholder: "例：犬の話、ラーメン屋さん情報",
    type: "text",
    order: 10,
  },
];

// 保存データを検証して安全な項目配列にする（不正なら既定セット）
export function normalizeProfileFields(raw: unknown): ProfileFieldDef[] {
  if (!Array.isArray(raw)) return DEFAULT_PROFILE_FIELDS;
  const fields: ProfileFieldDef[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const o = f as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id.trim()) continue;
    if (typeof o.label !== "string" || !o.label.trim()) continue;
    fields.push({
      id: o.id.trim(),
      label: o.label.trim(),
      placeholder:
        typeof o.placeholder === "string" && o.placeholder.trim()
          ? o.placeholder.trim()
          : undefined,
      type: o.type === "textarea" ? "textarea" : "text",
      order: typeof o.order === "number" ? o.order : fields.length + 1,
      hidden: o.hidden === true ? true : undefined,
    });
  }
  return fields.length > 0 ? fields : DEFAULT_PROFILE_FIELDS;
}

// 項目定義の読み込み（order昇順で返す。設定が無ければ既定セット）
export async function loadProfileFieldConfig(): Promise<ProfileFieldDef[]> {
  const payload = await loadPortalObject<{ fields?: unknown } | null>(
    PROFILE_FIELD_CONFIG_KEY,
    null
  );
  const fields = normalizeProfileFields(payload?.fields);
  return [...fields].sort((a, b) => a.order - b.order);
}

// 項目定義の保存（orderを1から振り直して保存）
export async function saveProfileFieldConfig(
  fields: ProfileFieldDef[]
): Promise<boolean> {
  const body = fields.map((f, i) => ({ ...f, order: i + 1 }));
  return savePortalObject(PROFILE_FIELD_CONFIG_KEY, { fields: body });
}

// 表示対象（hidden除外・order昇順）
export function visibleProfileFields(
  fields: ProfileFieldDef[]
): ProfileFieldDef[] {
  return fields.filter((f) => !f.hidden).sort((a, b) => a.order - b.order);
}
