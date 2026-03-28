export type DrugCategory =
  | '保湿剤'
  | 'ステロイド外用'
  | 'タクロリムス外用'
  | 'JAK阻害薬外用'
  | '抗真菌外用'
  | '抗真菌内服'
  | '抗ウイルス外用'
  | '抗ウイルス内服'
  | '抗ヒスタミン薬'
  | '抗菌薬外用'
  | '抗菌薬内服'
  | '外用レチノイド'
  | 'BPO外用'
  | 'ざ瘡配合薬'
  | 'レチノイド内服'
  | '生物学的製剤'
  | 'JAK阻害薬内服'
  | '免疫抑制薬'
  | 'ステロイド内服'
  | '神経障害性疼痛薬'
  | 'NSAIDs'
  | '美容内服'
  | 'ビタミンD3外用'
  | '活性型ビタミンD3内服'
  | '抗アレルギー薬'
  | '止痒薬'
  | '抗腫瘍外用'
  | 'その他外用'
  | 'その他内服'

export type Drug = {
  id: string
  name: string
  spec: string
  category: DrugCategory
  indication: string
}

export const drugCategories: DrugCategory[] = [
  '保湿剤','ステロイド外用','タクロリムス外用','JAK阻害薬外用',
  '抗真菌外用','抗真菌内服','抗ウイルス外用','抗ウイルス内服',
  '抗ヒスタミン薬','抗菌薬外用','抗菌薬内服','外用レチノイド',
  'BPO外用','ざ瘡配合薬','レチノイド内服','生物学的製剤',
  'JAK阻害薬内服','免疫抑制薬','ステロイド内服','神経障害性疼痛薬',
  'NSAIDs','美容内服','ビタミンD3外用','活性型ビタミンD3内服',
  '抗アレルギー薬','止痒薬','抗腫瘍外用','その他外用','その他内服'
]

export const drugs: Drug[] = [
  /* 保湿剤 */
  {id:"d001",name:"ヒルドイドソフト軟膏0.3%",spec:"25g/本・150g/本",category:"保湿剤",indication:"乾燥肌・皮脂欠乏性湿疹・アトピー性皮膚炎・瘢痕・ケロイド"},
  {id:"d002",name:"ヒルドイドクリーム0.3%",spec:"25g/本・150g/本",category:"保湿剤",indication:"乾燥肌・皮脂欠乏性湿疹・アトピー性皮膚炎"},
  {id:"d003",name:"ヒルドイドローション0.3%",spec:"25mL/本・150mL/本",category:"保湿剤",indication:"乾燥肌・血行障害性皮膚炎・アトピー性皮膚炎"},
  {id:"d004",name:"ウレパールクリーム10%",spec:"30g/本・100g/本",category:"保湿剤",indication:"乾燥肌・魚鱗癬・掻痒症"},
  {id:"d005",name:"ウレパールローション10%",spec:"100mL/本",category:"保湿剤",indication:"乾燥肌・魚鱗癬・老人性乾皮症"},
  {id:"d006",name:"パスタロンソフト軟膏10%",spec:"100g/本",category:"保湿剤",indication:"乾燥肌・魚鱗癬・老人性乾皮症・手荒れ"},
  {id:"d007",name:"ケラチナミンコーワクリーム20%",spec:"30g/本・100g/本",category:"保湿剤",indication:"老人性乾皮症・進行性指掌角皮症・魚鱗癬"},
  {id:"d008",name:"プロペトチューブ",spec:"50g/本",category:"保湿剤",indication:"乾燥肌・皮膚保護・アトピー性皮膚炎のスキンケア"},
  /* ステロイド外用 */
  {id:"d009",name:"デルモベート軟膏0.05%",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"乾癬・扁平苔癬・掌蹠膿疱症・肥厚性瘢痕（Strongest級）"},
  {id:"d010",name:"デルモベートクリーム0.05%",spec:"5g/本",category:"ステロイド外用",indication:"乾癬・扁平苔癬（Strongest級）"},
  {id:"d011",name:"ジフラール軟膏0.05%",spec:"10g/本",category:"ステロイド外用",indication:"乾癬・アトピー性皮膚炎重症（Strongest級）"},
  {id:"d012",name:"アンテベート軟膏0.05%",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"乾癬・湿疹・皮膚炎・掌蹠膿疱症（Very Strong級）"},
  {id:"d013",name:"マイザー軟膏0.05%",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"湿疹・皮膚炎・乾癬（Very Strong級）"},
  {id:"d014",name:"フルメタ軟膏0.02%",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"湿疹・皮膚炎（Very Strong級）"},
  {id:"d015",name:"リンデロンV軟膏0.12%",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"湿疹・皮膚炎・接触性皮膚炎・乾癬（Strong級）"},
  {id:"d016",name:"リンデロンVG軟膏0.12%",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"湿疹・皮膚炎・感染合併例（Strong級・抗菌薬配合）"},
  {id:"d017",name:"フルコートF軟膏",spec:"10g/本",category:"ステロイド外用",indication:"湿疹・感染合併例（Strong級・フラジオマイシン配合）"},
  {id:"d018",name:"ロコイド軟膏0.1%",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"顔・小児の湿疹・皮膚炎・アトピー（Medium級）"},
  {id:"d019",name:"キンダベート軟膏0.05%",spec:"5g/本",category:"ステロイド外用",indication:"乳幼児・顔面の湿疹・アトピー性皮膚炎（Weak-Medium級）"},
  {id:"d020",name:"メサデルムクリーム0.1%",spec:"10g/本",category:"ステロイド外用",indication:"湿疹・皮膚炎・蕁麻疹（Medium級）"},
  /* タクロリムス・JAK阻害薬外用 */
  {id:"d021",name:"プロトピック軟膏0.1%（成人用）",spec:"10g/本・30g/本",category:"タクロリムス外用",indication:"アトピー性皮膚炎（2歳以上・顔・首・皮膚屈曲部）"},
  {id:"d022",name:"プロトピック軟膏0.03%（小児用）",spec:"10g/本",category:"タクロリムス外用",indication:"アトピー性皮膚炎（2〜15歳）"},
  {id:"d023",name:"コレクチム軟膏0.5%（成人用）",spec:"5g/本・15g/本",category:"JAK阻害薬外用",indication:"アトピー性皮膚炎（成人・2歳以上）"},
  {id:"d024",name:"コレクチム軟膏0.25%（小児用）",spec:"5g/本",category:"JAK阻害薬外用",indication:"アトピー性皮膚炎（生後6ヶ月〜2歳未満）"},
  /* 抗真菌外用 */
  {id:"d025",name:"ラミシールクリーム1%",spec:"10g/本",category:"抗真菌外用",indication:"足白癬・体部白癬・股部白癬"},
  {id:"d026",name:"ルリコンクリーム1%",spec:"10g/本",category:"抗真菌外用",indication:"足白癬・体部白癬・カンジダ症"},
  {id:"d027",name:"ニゾラールクリーム2%",spec:"10g/本",category:"抗真菌外用",indication:"脂漏性皮膚炎・カンジダ症・癜風"},
  {id:"d028",name:"ネイリン爪外用液0.5%",spec:"2.5g/本",category:"抗真菌外用",indication:"爪白癬（ホスラブコナゾール・1日1回塗布）"},
  {id:"d029",name:"クレナフィン爪外用液10%",spec:"4g/本",category:"抗真菌外用",indication:"爪白癬（エフィナコナゾール・1日1回塗布）"},
  {id:"d030",name:"ルコナック爪外用液5%",spec:"4g/本",category:"抗真菌外用",indication:"爪白癬（ルリコナゾール・1日1回塗布）"},
  {id:"d031",name:"マイコスポールクリーム1%",spec:"10g/本",category:"抗真菌外用",indication:"足白癬・体部白癬・カンジダ症・癜風"},
  /* 抗真菌内服 */
  {id:"d032",name:"ラミシール錠125mg",spec:"1錠125mg",category:"抗真菌内服",indication:"爪白癬（1日1回125mg・6ヶ月）・難治性体部白癬"},
  {id:"d033",name:"イトリゾールカプセル50mg",spec:"1カプセル50mg",category:"抗真菌内服",indication:"爪白癬（パルス療法：1回200mg×2回/日×1週・3週休薬×3サイクル）"},
  {id:"d034",name:"フルコナゾールカプセル50mg",spec:"1カプセル50mg",category:"抗真菌内服",indication:"カンジダ症・クリプトコッカス症（1日1回）"},
  /* 抗ウイルス外用・内服 */
  {id:"d035",name:"ゾビラックスクリーム5%",spec:"2g/本",category:"抗ウイルス外用",indication:"口唇・外陰部単純ヘルペス（アシクロビル）"},
  {id:"d036",name:"バラシクロビル錠500mg",spec:"1錠500mg",category:"抗ウイルス内服",indication:"帯状疱疹（1回1000mg×3回/日×7日）・単純ヘルペス（1回500mg×2回/日×5日）"},
  {id:"d037",name:"アメナリーフ錠200mg",spec:"1錠200mg",category:"抗ウイルス内服",indication:"帯状疱疹（1回400mg×3回/日×7日・アメナメビル）"},
  {id:"d038",name:"ファムビル錠250mg",spec:"1錠250mg",category:"抗ウイルス内服",indication:"帯状疱疹（1回500mg×3回/日×7日）・単純ヘルペス再発抑制"},
  /* 抗ヒスタミン薬 */
  {id:"d039",name:"ジルテック錠10mg",spec:"1錠10mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アトピー性皮膚炎・花粉症（セチリジン・1日1回）"},
  {id:"d040",name:"アレグラ錠60mg",spec:"1錠60mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（フェキソフェナジン・1回1錠×2回/日）"},
  {id:"d041",name:"ルパフィン錠10mg",spec:"1錠10mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（ルパタジン・1日1回）"},
  {id:"d042",name:"ビラノア錠20mg",spec:"1錠20mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（ビラスチン・空腹時1日1回）"},
  {id:"d043",name:"アレロック錠5mg",spec:"1錠5mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アトピー性皮膚炎・花粉症（オロパタジン・1日2回）"},
  {id:"d044",name:"タリオン錠10mg",spec:"1錠10mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（ベポタスチン・1日2回）"},
  {id:"d045",name:"クラリチン錠10mg",spec:"1錠10mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（ロラタジン・1日1回）"},
  {id:"d046",name:"アレジオン錠20mg",spec:"1錠20mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（エピナスチン・1日1回）"},
  {id:"d047",name:"ザイザル錠5mg",spec:"1錠5mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アトピー性皮膚炎・花粉症（レボセチリジン・1日1回）"},
  {id:"d048",name:"ポララミン錠2mg",spec:"1錠2mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・湿疹・皮膚炎（クロルフェニラミン・第一世代・眠気あり）"},
  /* 抗菌薬外用・内服 */
  {id:"d049",name:"アクアチムクリーム1%",spec:"10g/本",category:"抗菌薬外用",indication:"とびひ・毛嚢炎・皮膚感染症（ナジフロキサシン）"},
  {id:"d050",name:"ダラシンTゲル1%",spec:"16g/本",category:"抗菌薬外用",indication:"ざ瘡（クリンダマイシン）"},
  {id:"d051",name:"フシジンレオ軟膏2%",spec:"10g/本",category:"抗菌薬外用",indication:"とびひ・毛嚢炎・細菌性皮膚感染症（フシジン酸）"},
  {id:"d052",name:"ドキシサイクリン100mg錠",spec:"1錠100mg",category:"抗菌薬内服",indication:"ざ瘡・酒さ・マイコプラズマ感染症（1日1〜2回）"},
  {id:"d053",name:"ミノマイシン錠50mg",spec:"1錠50mg",category:"抗菌薬内服",indication:"ざ瘡・皮膚軟部組織感染症（1日2〜4錠分2）"},
  {id:"d054",name:"セフジトレンピボキシル錠100mg",spec:"1錠100mg",category:"抗菌薬内服",indication:"とびひ・蜂窩織炎・丹毒（メイアクト・1回1錠×3回/日）"},
  {id:"d055",name:"アモキシシリンカプセル250mg",spec:"1カプセル250mg",category:"抗菌薬内服",indication:"蜂窩織炎・丹毒・とびひ（サワシリン・1日3〜4回）"},
  /* 外用レチノイド・BPO・ざ瘡配合薬 */
  {id:"d056",name:"ディフェリンゲル0.1%",spec:"15g/本",category:"外用レチノイド",indication:"ざ瘡（アダパレン・コメド溶解・1日1回夜塗布）"},
  {id:"d057",name:"ベピオゲル2.5%",spec:"15g/本",category:"BPO外用",indication:"ざ瘡（過酸化ベンゾイル・殺菌・1日1〜2回）"},
  {id:"d058",name:"エピデュオゲル",spec:"15g/本",category:"ざ瘡配合薬",indication:"ざ瘡（アダパレン+過酸化ベンゾイル配合・1日1回夜）"},
  {id:"d059",name:"デュアック配合ゲル",spec:"25g/本",category:"ざ瘡配合薬",indication:"ざ瘡（クリンダマイシン+過酸化ベンゾイル配合・1日1回）"},
  /* レチノイド内服 */
  {id:"d060",name:"ロアキュテイン10mgカプセル",spec:"1カプセル10mg",category:"レチノイド内服",indication:"重症ざ瘡・難治性ニキビ（イソトレチノイン・妊婦絶対禁忌）"},
  /* 生物学的製剤 */
  {id:"d061",name:"デュピクセント300mgシリンジ",spec:"1シリンジ300mg/2mL",category:"生物学的製剤",indication:"アトピー性皮膚炎中等症〜重症・好酸球性喘息（デュピルマブ・2週ごと皮下注）"},
  {id:"d062",name:"スキリージ75mgシリンジ",spec:"1シリンジ75mg/0.83mL",category:"生物学的製剤",indication:"乾癬・掌蹠膿疱症（リサンキズマブ・0/4/16週後12週ごと皮下注）"},
  {id:"d063",name:"ヒュミラ40mgシリンジ",spec:"1シリンジ40mg/0.4mL",category:"生物学的製剤",indication:"乾癬・関節症性乾癬（アダリムマブ・TNF-α阻害薬・2週ごと皮下注）"},
  {id:"d064",name:"コセンティクス150mgシリンジ",spec:"1シリンジ150mg/1mL",category:"生物学的製剤",indication:"乾癬・関節症性乾癬（セクキヌマブ・IL-17A阻害薬）"},
  {id:"d065",name:"トレムフィア100μgシリンジ",spec:"1シリンジ100μg/1mL",category:"生物学的製剤",indication:"乾癬（グセルクマブ・IL-23阻害薬・0/4週後8週ごと皮下注）"},
  {id:"d066",name:"ゾレア75mgシリンジ",spec:"1シリンジ75mg/0.5mL",category:"生物学的製剤",indication:"慢性特発性蕁麻疹（オマリズマブ・4週ごと皮下注）"},
  /* JAK阻害薬内服 */
  {id:"d067",name:"タリクスタ錠100mg",spec:"1錠100mg",category:"JAK阻害薬内服",indication:"アトピー性皮膚炎中等症〜重症（アブロシチニブ・JAK1阻害・1日1回）"},
  {id:"d068",name:"オルミエント4mg錠",spec:"1錠4mg",category:"JAK阻害薬内服",indication:"アトピー性皮膚炎・円形脱毛症（バリシチニブ・JAK1/2阻害・1日1回）"},
  {id:"d069",name:"サイバインコ錠200mg",spec:"1錠200mg",category:"JAK阻害薬内服",indication:"円形脱毛症（デュークラバシチニブ・TYK2阻害薬）"},
  /* 免疫抑制薬 */
  {id:"d070",name:"ネオーラルカプセル25mg",spec:"1カプセル25mg",category:"免疫抑制薬",indication:"アトピー性皮膚炎重症例・乾癬（シクロスポリン・体重kg×3mg/日分2）"},
  {id:"d071",name:"ネオーラルカプセル50mg",spec:"1カプセル50mg",category:"免疫抑制薬",indication:"アトピー性皮膚炎重症例・乾癬（シクロスポリン）"},
  {id:"d072",name:"メソトレキセート錠2mg",spec:"1錠2mg",category:"免疫抑制薬",indication:"乾癬・関節症性乾癬（週1回投与・連日投与厳禁）"},
  /* ステロイド内服・注射 */
  {id:"d073",name:"プレドニン錠5mg",spec:"1錠5mg",category:"ステロイド内服",indication:"重症薬疹・天疱瘡・SJS・自己免疫性水疱症（プレドニゾロン）"},
  {id:"d074",name:"メドロール錠4mg",spec:"1錠4mg",category:"ステロイド内服",indication:"重症皮膚疾患・自己免疫疾患（メチルプレドニゾロン）"},
  {id:"d075",name:"ケナコルトA注10mg/mL",spec:"1バイアル40mg/4mL",category:"ステロイド内服",indication:"ケロイド・肥厚性瘢痕・円形脱毛症（トリアムシノロン・局所注射）"},
  /* ビタミンD3外用 */
  {id:"d076",name:"ドボネックス軟膏0.005%",spec:"1本30g",category:"ビタミンD3外用",indication:"乾癬（カルシポトリオール・1日2回）"},
  {id:"d077",name:"ボンアルファ軟膏0.002%",spec:"1本10g",category:"ビタミンD3外用",indication:"乾癬（タカルシトール・1日2回）"},
  {id:"d078",name:"ドボベット軟膏",spec:"1本30g",category:"ビタミンD3外用",indication:"乾癬（カルシポトリオール+ベタメタゾン配合・1日1回）"},
  {id:"d079",name:"マーデュオックス軟膏",spec:"1本15g・30g",category:"ビタミンD3外用",indication:"乾癬（マキサカルシトール+ベタメタゾン配合・1日1回）"},
  /* 神経障害性疼痛・NSAIDs */
  {id:"d080",name:"リリカカプセル75mg",spec:"1カプセル75mg",category:"神経障害性疼痛薬",indication:"帯状疱疹後神経痛・神経障害性疼痛（プレガバリン・1日2回）"},
  {id:"d081",name:"サインバルタカプセル30mg",spec:"1カプセル30mg",category:"神経障害性疼痛薬",indication:"帯状疱疹後神経痛・うつ病（デュロキセチン・1日1回）"},
  {id:"d082",name:"ロキソプロフェン錠60mg",spec:"1錠60mg",category:"NSAIDs",indication:"帯状疱疹急性期疼痛・炎症性疾患（ロキソニン・1回1錠×3回/日）"},
  {id:"d083",name:"カロナール錠500mg",spec:"1錠500mg",category:"NSAIDs",indication:"帯状疱疹急性期疼痛・発熱（アセトアミノフェン・妊婦も使用可）"},
  /* 抗アレルギー薬・止痒薬 */
  {id:"d084",name:"トラネキサム酸錠250mg",spec:"1錠250mg",category:"抗アレルギー薬",indication:"肝斑・色素沈着・蕁麻疹・皮膚の炎症（1日3〜6錠分3）"},
  {id:"d085",name:"ヒベルナ錠25mg",spec:"1錠25mg",category:"止痒薬",indication:"掻痒症・蕁麻疹（プロメタジン・第一世代・眠気強）"},
  {id:"d086",name:"オイラックスクリーム10%",spec:"25g/本",category:"止痒薬",indication:"湿疹・蕁麻疹・虫刺されのかゆみ（クロタミトン外用）"},
  {id:"d087",name:"レスタミンコーワクリーム1%",spec:"10g/本",category:"止痒薬",indication:"虫刺され・湿疹・蕁麻疹（ジフェンヒドラミン外用）"},
  /* 抗腫瘍外用 */
  {id:"d088",name:"ベセルナクリーム5%",spec:"1包250mg（1回使い切り）",category:"抗腫瘍外用",indication:"尖圭コンジローマ・日光角化症（イミキモド・週3回就寝前）"},
  {id:"d089",name:"5-FUクリーム5%",spec:"1本20g",category:"抗腫瘍外用",indication:"日光角化症・老人性疣贅・多発性基底細胞癌（フルオロウラシル）"},
  /* 美容内服 */
  {id:"d090",name:"ハイチオール錠80mg",spec:"1錠80mg",category:"美容内服",indication:"しみ・そばかす・肝斑・にきび（L-システイン・1回2錠×3回/日）"},
  {id:"d091",name:"シナール錠200mg",spec:"1錠200mg",category:"美容内服",indication:"しみ・そばかす・出血傾向（アスコルビン酸+パントテン酸・美白）"},
  /* その他外用 */
  {id:"d092",name:"スピール膏Mソフト",spec:"1枚（サリチル酸絆創膏）",category:"その他外用",indication:"たこ・魚の目・いぼ（サリチル酸40%・角質軟化）"},
  {id:"d093",name:"モーラステープL40mg",spec:"1枚70×100mm",category:"その他外用",indication:"帯状疱疹後神経痛・腰痛（ケトプロフェン・光線過敏症注意）"},
  {id:"d094",name:"フシジン酸ナトリウム軟膏2%",spec:"10g/本",category:"その他外用",indication:"細菌性皮膚感染症・とびひ（フシジンレオ同成分）"},
  {id:"d095",name:"ポビドンヨード軟膏10%",spec:"10g/本",category:"その他外用",indication:"外傷・熱傷・皮膚感染症（イソジン・消毒・創傷処置）"},
  /* その他内服 */
  {id:"d096",name:"ファモチジン錠20mg",spec:"1錠20mg",category:"その他内服",indication:"重症蕁麻疹（H2ブロッカー・抗ヒスタミン薬と併用・1日2回）"},
  {id:"d097",name:"エバスチン錠10mg",spec:"1錠10mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（1日1回・空腹時でも可）"},
  {id:"d098",name:"フェキソフェナジン錠60mg（後発）",spec:"1錠60mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（アレグラGE・1日2回）"},
  {id:"d099",name:"デザレックス錠5mg",spec:"1錠5mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（デスロラタジン・1日1回）"},
  {id:"d100",name:"ゾレア150mgシリンジ",spec:"1シリンジ150mg/1mL",category:"生物学的製剤",indication:"慢性特発性蕁麻疹（オマリズマブ・体重・IgE値により用量調整）"},
]

export default drugs
