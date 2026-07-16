// 価値観キーワード（指示書68）: 52語から3〜5個選んでメンバー紹介で共有する。
// 5つの基本的欲求サーベイと同じく「相互理解のための共有」であり、評価・優劣付けには使わない。
// 保存先は staff_profile:<userId>.valueKeywords（string[]・専用テーブルなし）。
// 52語はコード固定（管理画面での編集機能は作らない・院長判断）。常に公開（customFieldsPrivacy対象外）。

/** 価値観キーワード（原本の並び順。50音順にしないこと） */
export const VALUE_KEYWORDS = [
  "愛", "いたわり", "援助", "思いやり", "感謝", "完全", "希望", "勤勉", "謙虚", "献身",
  "健全", "向上心", "公平", "最善", "正直", "純粋", "従順", "実践", "信仰", "親切",
  "栄誉", "慎重", "真剣", "真理", "信用", "信頼", "正義", "成長", "誠実", "責任感",
  "善良", "尊敬", "慎み", "忠実", "道徳", "努力", "忍耐", "熱心", "平安", "平穏",
  "平和", "奉仕", "誇り", "真面目", "約束", "優しさ", "安らぎ", "勇気", "喜び", "礼儀正しい",
  "上質", "卓越",
] as const;

export type ValueKeyword = (typeof VALUE_KEYWORDS)[number];

export const VALUE_KEYWORDS_MAX = 5;
export const VALUE_KEYWORDS_MIN_RECOMMENDED = 3;

/** ホワイトリスト検証＋重複除去＋上限カット＋原本順への並べ直し */
export function normalizeValueKeywords(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const allowed = new Set<string>(VALUE_KEYWORDS);
  const picked = Array.from(
    new Set(
      input.filter((v): v is string => typeof v === "string" && allowed.has(v))
    )
  );
  picked.sort(
    (a, b) =>
      VALUE_KEYWORDS.indexOf(a as ValueKeyword) -
      VALUE_KEYWORDS.indexOf(b as ValueKeyword)
  );
  return picked.slice(0, VALUE_KEYWORDS_MAX);
}

export function hasValueKeywords(v: unknown): boolean {
  return normalizeValueKeywords(v).length > 0;
}
