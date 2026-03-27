export type DrugCategory =
  | "保湿剤"
  | "ステロイド外用"
  | "タクロリムス外用"
  | "JAK阻害薬外用"
  | "抗真菌外用"
  | "抗真菌内服"
  | "抗ウイルス外用"
  | "抗ウイルス内服"
  | "抗ヒスタミン薬"
  | "抗菌薬"
  | "外用レチノイド"
  | "BPO外用"
  | "ざ瘡配合薬"
  | "レチノイド内服"
  | "生物学的製剤"
  | "JAK阻害薬内服"
  | "免疫抑制薬"
  | "ステロイド内服"
  | "神経障害性疼痛薬"
  | "NSAIDs"
  | "美容内服";

export type Drug = {
  id: string;
  name: string;
  spec: string;
  category: DrugCategory;
  indication: string;
};

export const drugs: Drug[] = [
  { id: "d01", name: "ヒルドイドソフト軟膏0.3%", spec: "25g/本", category: "保湿剤", indication: "乾燥肌・皮脂欠乏性湿疹・アトピー性皮膚炎" },
  { id: "d02", name: "ヒルドイドローション0.3%", spec: "25mL・150mL/本", category: "保湿剤", indication: "乾燥肌・血行障害性皮膚炎" },
  { id: "d03", name: "ウレパールクリーム10%", spec: "30g・100g/本", category: "保湿剤", indication: "乾燥肌・魚鱗癬・掻痒症" },
  { id: "d04", name: "デルモベート軟膏0.05%", spec: "5g/本", category: "ステロイド外用", indication: "乾癬・扁平苔癬・肥厚性瘢痕（最強クラス）" },
  { id: "d05", name: "アンテベート軟膏0.05%", spec: "5g・10g/本", category: "ステロイド外用", indication: "乾癬・湿疹・皮膚炎（Very Strong）" },
  { id: "d06", name: "リンデロンVG軟膏0.12%", spec: "5g・10g/本", category: "ステロイド外用", indication: "湿疹・皮膚炎・接触性皮膚炎（Strong）" },
  { id: "d07", name: "ロコイド軟膏0.1%", spec: "5g・10g/本", category: "ステロイド外用", indication: "顔・小児の湿疹・皮膚炎（Medium）" },
  { id: "d08", name: "キンダベート軟膏0.05%", spec: "5g/本", category: "ステロイド外用", indication: "乳幼児・顔の湿疹（Weak-Medium）" },
  { id: "d09", name: "プロトピック軟膏0.1%（小児用0.03%）", spec: "10g・30g/本", category: "タクロリムス外用", indication: "アトピー性皮膚炎（顔・首）2歳以上" },
  { id: "d10", name: "コレクチム軟膏0.5%（小児用0.25%）", spec: "5g・15g/本", category: "JAK阻害薬外用", indication: "アトピー性皮膚炎（2歳以上）" },
  { id: "d11", name: "ラミシールクリーム1%", spec: "10g/本", category: "抗真菌外用", indication: "足白癬・体部白癬" },
  { id: "d12", name: "ルリコンクリーム1%", spec: "10g/本", category: "抗真菌外用", indication: "足白癬・爪白癬・カンジダ症" },
  { id: "d13", name: "ニゾラールクリーム2%", spec: "10g/本", category: "抗真菌外用", indication: "脂漏性皮膚炎・カンジダ症" },
  { id: "d14", name: "ラミシール錠125mg", spec: "1錠125mg", category: "抗真菌内服", indication: "爪白癬（1日1回）・難治性体部白癬" },
  { id: "d15", name: "イトリゾールカプセル50mg", spec: "1カプセル50mg", category: "抗真菌内服", indication: "爪白癬（パルス療法：1回4Cap×2回/日×1週）" },
  { id: "d16", name: "ゾビラックスクリーム5%", spec: "2g/本", category: "抗ウイルス外用", indication: "単純ヘルペス（口唇・陰部）" },
  { id: "d17", name: "バラシクロビル錠500mg", spec: "1錠500mg", category: "抗ウイルス内服", indication: "帯状疱疹（1回1000mg×3回/日）・単純ヘルペス" },
  { id: "d18", name: "ジルテック錠10mg", spec: "1錠10mg", category: "抗ヒスタミン薬", indication: "蕁麻疹・アトピー性皮膚炎・花粉症" },
  { id: "d19", name: "アレグラ錠60mg", spec: "1錠60mg", category: "抗ヒスタミン薬", indication: "蕁麻疹・アレルギー性鼻炎（1回1錠×2回/日）" },
  { id: "d20", name: "ルパフィン錠10mg", spec: "1錠10mg", category: "抗ヒスタミン薬", indication: "蕁麻疹・アレルギー性鼻炎" },
  { id: "d21", name: "ビラノア錠20mg", spec: "1錠20mg", category: "抗ヒスタミン薬", indication: "蕁麻疹・アレルギー性鼻炎（空腹時服用）" },
  { id: "d22", name: "ドキシサイクリン100mg錠", spec: "1錠100mg", category: "抗菌薬", indication: "ざ瘡・酒さ・マイコプラズマ感染症" },
  { id: "d23", name: "ミノマイシン錠50mg", spec: "1錠50mg", category: "抗菌薬", indication: "ざ瘡・皮膚軟部組織感染症" },
  { id: "d24", name: "ディフェリンゲル0.1%", spec: "15g/本", category: "外用レチノイド", indication: "ざ瘡（コメド・炎症性ニキビ）" },
  { id: "d25", name: "ベピオゲル2.5%", spec: "15g/本", category: "BPO外用", indication: "ざ瘡（軽〜中等症）" },
  { id: "d26", name: "エピデュオゲル（アダパレン+BPO）", spec: "15g/本", category: "ざ瘡配合薬", indication: "ざ瘡（コメド・炎症性）" },
  { id: "d27", name: "ロアキュテイン10mg（イソトレチノイン）", spec: "1カプセル10mg", category: "レチノイド内服", indication: "重症ざ瘡・難治性ニキビ（要厳格管理・妊婦禁忌）" },
  { id: "d28", name: "デュピクセント300mgシリンジ", spec: "1シリンジ300mg/2mL", category: "生物学的製剤", indication: "アトピー性皮膚炎（中等症〜重症）・好酸球性喘息" },
  { id: "d29", name: "スキリージ75mgシリンジ", spec: "1シリンジ75mg/0.83mL", category: "生物学的製剤", indication: "尋常性乾癬・掌蹠膿疱症" },
  { id: "d30", name: "タリクスタ錠100mg（アブロシチニブ）", spec: "1錠100mg", category: "JAK阻害薬内服", indication: "アトピー性皮膚炎（中等症〜重症・成人）" },
  { id: "d31", name: "オルミエント4mg（バリシチニブ）", spec: "1錠4mg", category: "JAK阻害薬内服", indication: "アトピー性皮膚炎・円形脱毛症" },
  { id: "d32", name: "ネオーラルカプセル25mg（シクロスポリン）", spec: "1カプセル25mg", category: "免疫抑制薬", indication: "アトピー重症例・乾癬・掌蹠膿疱症" },
  { id: "d33", name: "メソトレキセート2mg", spec: "1錠2mg", category: "免疫抑制薬", indication: "乾癬・関節症性乾癬（週1回投与）" },
  { id: "d34", name: "プレドニン5mg", spec: "1錠5mg", category: "ステロイド内服", indication: "重症薬疹・天疱瘡・自己免疫疾患" },
  { id: "d35", name: "プレガバリン75mgカプセル", spec: "1カプセル75mg", category: "神経障害性疼痛薬", indication: "帯状疱疹後神経痛・神経障害性疼痛" },
  { id: "d36", name: "ロキソプロフェン60mg錠", spec: "1錠60mg", category: "NSAIDs", indication: "帯状疱疹急性期疼痛・炎症性皮膚疾患" },
  { id: "d37", name: "AZAクリアクリーム（アゼライン酸20%）", spec: "30g/本", category: "BPO外用", indication: "ざ瘡・酒さ・くすみ・色素沈着（自由診療）" },
  { id: "d38", name: "スキンマリア（ビタミンC・Lシスチン・ビオチン）", spec: "30粒入り/箱", category: "美容内服", indication: "美白・抗酸化・毛髪改善（自由診療）" },
];

export const drugCategories: DrugCategory[] = [
  "保湿剤",
  "ステロイド外用",
  "タクロリムス外用",
  "JAK阻害薬外用",
  "抗真菌外用",
  "抗真菌内服",
  "抗ウイルス外用",
  "抗ウイルス内服",
  "抗ヒスタミン薬",
  "抗菌薬",
  "外用レチノイド",
  "BPO外用",
  "ざ瘡配合薬",
  "レチノイド内服",
  "生物学的製剤",
  "JAK阻害薬内服",
  "免疫抑制薬",
  "ステロイド内服",
  "神経障害性疼痛薬",
  "NSAIDs",
  "美容内服",
];
