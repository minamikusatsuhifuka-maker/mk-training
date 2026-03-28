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
  | '多汗症治療薬'
  | 'ビタミン剤内服'
  | '創傷治療外用薬'
  | '漢方薬'

export type Drug = {
  id: string
  name: string
  genericName?: string
  spec: string
  category: DrugCategory
  indication: string
  usage?: string
}

export const drugCategories: DrugCategory[] = [
  '保湿剤','ステロイド外用','タクロリムス外用','JAK阻害薬外用',
  '抗真菌外用','抗真菌内服','抗ウイルス外用','抗ウイルス内服',
  '抗ヒスタミン薬','抗菌薬外用','抗菌薬内服','外用レチノイド',
  'BPO外用','ざ瘡配合薬','レチノイド内服','生物学的製剤',
  'JAK阻害薬内服','免疫抑制薬','ステロイド内服','神経障害性疼痛薬',
  'NSAIDs','美容内服','ビタミンD3外用','活性型ビタミンD3内服',
  '抗アレルギー薬','止痒薬','抗腫瘍外用','その他外用','その他内服',
  '多汗症治療薬','ビタミン剤内服','創傷治療外用薬','漢方薬'
]

export const drugs: Drug[] = [
  /* 保湿剤 */
  {id:"d001",name:"ヒルドイドソフト軟膏0.3%",genericName:"ヘパリン類似物質",spec:"25g/本・150g/本",category:"保湿剤",indication:"乾燥肌・皮脂欠乏性湿疹・アトピー性皮膚炎・瘢痕・ケロイド"},
  {id:"d002",name:"ヒルドイドクリーム0.3%",genericName:"ヘパリン類似物質",spec:"25g/本・150g/本",category:"保湿剤",indication:"乾燥肌・皮脂欠乏性湿疹・アトピー性皮膚炎"},
  {id:"d003",name:"ヒルドイドローション0.3%",genericName:"ヘパリン類似物質",spec:"25mL/本・150mL/本",category:"保湿剤",indication:"乾燥肌・血行障害性皮膚炎・アトピー性皮膚炎"},
  {id:"d004",name:"ウレパールクリーム10%",genericName:"尿素",spec:"30g/本・100g/本",category:"保湿剤",indication:"乾燥肌・魚鱗癬・掻痒症"},
  {id:"d005",name:"ウレパールローション10%",genericName:"尿素",spec:"100mL/本",category:"保湿剤",indication:"乾燥肌・魚鱗癬・老人性乾皮症"},
  {id:"d006",name:"パスタロンソフト軟膏10%",genericName:"尿素",spec:"100g/本",category:"保湿剤",indication:"乾燥肌・魚鱗癬・老人性乾皮症・手荒れ"},
  {id:"d007",name:"ケラチナミンコーワクリーム20%",genericName:"尿素",spec:"30g/本・100g/本",category:"保湿剤",indication:"老人性乾皮症・進行性指掌角皮症・魚鱗癬"},
  {id:"d008",name:"プロペトチューブ",genericName:"白色ワセリン",spec:"50g/本",category:"保湿剤",indication:"乾燥肌・皮膚保護・アトピー性皮膚炎のスキンケア"},
  /* ステロイド外用 */
  {id:"d009",name:"デルモベート軟膏0.05%",genericName:"クロベタゾールプロピオン酸エステル",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"乾癬・扁平苔癬・掌蹠膿疱症・肥厚性瘢痕（Strongest級）"},
  {id:"d010",name:"デルモベートクリーム0.05%",genericName:"クロベタゾールプロピオン酸エステル",spec:"5g/本",category:"ステロイド外用",indication:"乾癬・扁平苔癬（Strongest級）"},
  {id:"d011",name:"ジフラール軟膏0.05%",genericName:"ジフロラゾン酢酸エステル",spec:"10g/本",category:"ステロイド外用",indication:"乾癬・アトピー性皮膚炎重症（Strongest級）"},
  {id:"d012",name:"アンテベート軟膏0.05%",genericName:"ベタメタゾン酪酸エステルプロピオン酸エステル",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"乾癬・湿疹・皮膚炎・掌蹠膿疱症（Very Strong級）"},
  {id:"d013",name:"マイザー軟膏0.05%",genericName:"ジフルプレドナート",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"湿疹・皮膚炎・乾癬（Very Strong級）"},
  {id:"d014",name:"フルメタ軟膏0.02%",genericName:"モメタゾンフランカルボン酸エステル",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"湿疹・皮膚炎（Very Strong級）"},
  {id:"d015",name:"リンデロンV軟膏0.12%",genericName:"ベタメタゾン吉草酸エステル",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"湿疹・皮膚炎・接触性皮膚炎・乾癬（Strong級）"},
  {id:"d016",name:"リンデロンVG軟膏0.12%",genericName:"ベタメタゾン吉草酸エステル・ゲンタマイシン硫酸塩",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"湿疹・皮膚炎・感染合併例（Strong級・抗菌薬配合）"},
  {id:"d017",name:"フルコートF軟膏",genericName:"フルオシノロンアセトニド・フラジオマイシン硫酸塩",spec:"10g/本",category:"ステロイド外用",indication:"湿疹・感染合併例（Strong級・フラジオマイシン配合）"},
  {id:"d018",name:"ロコイド軟膏0.1%",genericName:"ヒドロコルチゾン酪酸エステル",spec:"5g/本・10g/本",category:"ステロイド外用",indication:"顔・小児の湿疹・皮膚炎・アトピー（Medium級）"},
  {id:"d019",name:"キンダベート軟膏0.05%",genericName:"クロベタゾン酪酸エステル",spec:"5g/本",category:"ステロイド外用",indication:"乳幼児・顔面の湿疹・アトピー性皮膚炎（Weak-Medium級）"},
  {id:"d020",name:"メサデルムクリーム0.1%",genericName:"デキサメタゾンプロピオン酸エステル",spec:"10g/本",category:"ステロイド外用",indication:"湿疹・皮膚炎・蕁麻疹（Medium級）"},
  /* タクロリムス・JAK阻害薬外用 */
  {id:"d021",name:"プロトピック軟膏0.1%（成人用）",genericName:"タクロリムス水和物",spec:"10g/本・30g/本",category:"タクロリムス外用",indication:"アトピー性皮膚炎（2歳以上・顔・首・皮膚屈曲部）"},
  {id:"d022",name:"プロトピック軟膏0.03%（小児用）",genericName:"タクロリムス水和物",spec:"10g/本",category:"タクロリムス外用",indication:"アトピー性皮膚炎（2〜15歳）"},
  {id:"d023",name:"コレクチム軟膏0.5%（成人用）",genericName:"デルゴシチニブ",spec:"5g/本・15g/本",category:"JAK阻害薬外用",indication:"アトピー性皮膚炎（成人・2歳以上）"},
  {id:"d024",name:"コレクチム軟膏0.25%（小児用）",genericName:"デルゴシチニブ",spec:"5g/本",category:"JAK阻害薬外用",indication:"アトピー性皮膚炎（生後6ヶ月〜2歳未満）"},
  /* 抗真菌外用 */
  {id:"d025",name:"ラミシールクリーム1%",genericName:"テルビナフィン塩酸塩",spec:"10g/本",category:"抗真菌外用",indication:"足白癬・体部白癬・股部白癬"},
  {id:"d026",name:"ルリコンクリーム1%",genericName:"ルリコナゾール",spec:"10g/本",category:"抗真菌外用",indication:"足白癬・体部白癬・カンジダ症"},
  {id:"d027",name:"ニゾラールクリーム2%",genericName:"ケトコナゾール",spec:"10g/本",category:"抗真菌外用",indication:"脂漏性皮膚炎・カンジダ症・癜風"},
  {id:"d028",name:"ネイリン爪外用液0.5%",genericName:"ホスラブコナゾール",spec:"2.5g/本",category:"抗真菌外用",indication:"爪白癬（ホスラブコナゾール・1日1回塗布）"},
  {id:"d029",name:"クレナフィン爪外用液10%",genericName:"エフィナコナゾール",spec:"4g/本",category:"抗真菌外用",indication:"爪白癬（エフィナコナゾール・1日1回塗布）"},
  {id:"d030",name:"ルコナック爪外用液5%",genericName:"ルリコナゾール",spec:"4g/本",category:"抗真菌外用",indication:"爪白癬（ルリコナゾール・1日1回塗布）"},
  {id:"d031",name:"マイコスポールクリーム1%",genericName:"ビホナゾール",spec:"10g/本",category:"抗真菌外用",indication:"足白癬・体部白癬・カンジダ症・癜風"},
  /* 抗真菌内服 */
  {id:"d032",name:"ラミシール錠125mg",genericName:"テルビナフィン塩酸塩",spec:"1錠125mg",category:"抗真菌内服",indication:"爪白癬（1日1回125mg・6ヶ月）・難治性体部白癬"},
  {id:"d033",name:"イトリゾールカプセル50mg",genericName:"イトラコナゾール",spec:"1カプセル50mg",category:"抗真菌内服",indication:"爪白癬（パルス療法：1回200mg×2回/日×1週・3週休薬×3サイクル）"},
  {id:"d034",name:"フルコナゾールカプセル50mg",genericName:"フルコナゾール",spec:"1カプセル50mg",category:"抗真菌内服",indication:"カンジダ症・クリプトコッカス症（1日1回）"},
  /* 抗ウイルス外用・内服 */
  {id:"d035",name:"ゾビラックスクリーム5%",genericName:"アシクロビル",spec:"2g/本",category:"抗ウイルス外用",indication:"口唇・外陰部単純ヘルペス（アシクロビル）"},
  {id:"d036",name:"バラシクロビル錠500mg",genericName:"バラシクロビル塩酸塩",spec:"1錠500mg",category:"抗ウイルス内服",indication:"帯状疱疹（1回1000mg×3回/日×7日）・単純ヘルペス（1回500mg×2回/日×5日）"},
  {id:"d037",name:"アメナリーフ錠200mg",genericName:"アメナメビル",spec:"1錠200mg",category:"抗ウイルス内服",indication:"帯状疱疹（1回400mg×3回/日×7日・アメナメビル）"},
  {id:"d038",name:"ファムビル錠250mg",genericName:"ファムシクロビル",spec:"1錠250mg",category:"抗ウイルス内服",indication:"帯状疱疹（1回500mg×3回/日×7日）・単純ヘルペス再発抑制"},
  /* 抗ヒスタミン薬 */
  {id:"d039",name:"ジルテック錠10mg",genericName:"セチリジン塩酸塩",spec:"1錠10mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アトピー性皮膚炎・花粉症（セチリジン・1日1回）"},
  {id:"d040",name:"アレグラ錠60mg",genericName:"フェキソフェナジン塩酸塩",spec:"1錠60mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（フェキソフェナジン・1回1錠×2回/日）"},
  {id:"d041",name:"ルパフィン錠10mg",genericName:"ルパタジンフマル酸塩",spec:"1錠10mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（ルパタジン・1日1回）"},
  {id:"d042",name:"ビラノア錠20mg",genericName:"ビラスチン",spec:"1錠20mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（ビラスチン・空腹時1日1回）"},
  {id:"d043",name:"アレロック錠5mg",genericName:"オロパタジン塩酸塩",spec:"1錠5mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アトピー性皮膚炎・花粉症（オロパタジン・1日2回）"},
  {id:"d044",name:"タリオン錠10mg",genericName:"ベポタスチンベシル酸塩",spec:"1錠10mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（ベポタスチン・1日2回）"},
  {id:"d045",name:"クラリチン錠10mg",genericName:"ロラタジン",spec:"1錠10mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（ロラタジン・1日1回）"},
  {id:"d046",name:"アレジオン錠20mg",genericName:"エピナスチン塩酸塩",spec:"1錠20mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（エピナスチン・1日1回）"},
  {id:"d047",name:"ザイザル錠5mg",genericName:"レボセチリジン塩酸塩",spec:"1錠5mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アトピー性皮膚炎・花粉症（レボセチリジン・1日1回）"},
  {id:"d048",name:"ポララミン錠2mg",genericName:"クロルフェニラミンマレイン酸塩",spec:"1錠2mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・湿疹・皮膚炎（クロルフェニラミン・第一世代・眠気あり）"},
  /* 抗菌薬外用・内服 */
  {id:"d049",name:"アクアチムクリーム1%",genericName:"ナジフロキサシン",spec:"10g/本",category:"抗菌薬外用",indication:"とびひ・毛嚢炎・皮膚感染症（ナジフロキサシン）"},
  {id:"d050",name:"ダラシンTゲル1%",genericName:"クリンダマイシンリン酸エステル",spec:"16g/本",category:"抗菌薬外用",indication:"ざ瘡（クリンダマイシン）"},
  {id:"d051",name:"フシジンレオ軟膏2%",genericName:"フシジン酸ナトリウム",spec:"10g/本",category:"抗菌薬外用",indication:"とびひ・毛嚢炎・細菌性皮膚感染症（フシジン酸）"},
  {id:"d052",name:"ドキシサイクリン100mg錠",genericName:"ドキシサイクリン塩酸塩水和物",spec:"1錠100mg",category:"抗菌薬内服",indication:"ざ瘡・酒さ・マイコプラズマ感染症（1日1〜2回）"},
  {id:"d053",name:"ミノマイシン錠50mg",genericName:"ミノサイクリン塩酸塩",spec:"1錠50mg",category:"抗菌薬内服",indication:"ざ瘡・皮膚軟部組織感染症（1日2〜4錠分2）"},
  {id:"d054",name:"セフジトレンピボキシル錠100mg",genericName:"セフジトレンピボキシル",spec:"1錠100mg",category:"抗菌薬内服",indication:"とびひ・蜂窩織炎・丹毒（メイアクト・1回1錠×3回/日）"},
  {id:"d055",name:"アモキシシリンカプセル250mg",genericName:"アモキシシリン水和物",spec:"1カプセル250mg",category:"抗菌薬内服",indication:"蜂窩織炎・丹毒・とびひ（サワシリン・1日3〜4回）"},
  /* 外用レチノイド・BPO・ざ瘡配合薬 */
  {id:"d056",name:"ディフェリンゲル0.1%",genericName:"アダパレン",spec:"15g/本",category:"外用レチノイド",indication:"ざ瘡（アダパレン・コメド溶解・1日1回夜塗布）"},
  {id:"d057",name:"ベピオゲル2.5%",genericName:"過酸化ベンゾイル",spec:"15g/本",category:"BPO外用",indication:"ざ瘡（過酸化ベンゾイル・殺菌・1日1〜2回）"},
  {id:"d058",name:"エピデュオゲル",genericName:"アダパレン・過酸化ベンゾイル",spec:"15g/本",category:"ざ瘡配合薬",indication:"ざ瘡（アダパレン+過酸化ベンゾイル配合・1日1回夜）"},
  {id:"d059",name:"デュアック配合ゲル",genericName:"クリンダマイシンリン酸エステル・過酸化ベンゾイル",spec:"25g/本",category:"ざ瘡配合薬",indication:"ざ瘡（クリンダマイシン+過酸化ベンゾイル配合・1日1回）"},
  /* レチノイド内服 */
  {id:"d060",name:"ロアキュテイン10mgカプセル",genericName:"イソトレチノイン",spec:"1カプセル10mg",category:"レチノイド内服",indication:"重症ざ瘡・難治性ニキビ（イソトレチノイン・妊婦絶対禁忌）"},
  /* 生物学的製剤 */
  {id:"d061",name:"デュピクセント300mgシリンジ",genericName:"デュピルマブ（遺伝子組換え）",spec:"1シリンジ300mg/2mL",category:"生物学的製剤",indication:"アトピー性皮膚炎中等症〜重症・好酸球性喘息（デュピルマブ・2週ごと皮下注）"},
  {id:"d062",name:"スキリージ75mgシリンジ",genericName:"リサンキズマブ（遺伝子組換え）",spec:"1シリンジ75mg/0.83mL",category:"生物学的製剤",indication:"乾癬・掌蹠膿疱症（リサンキズマブ・0/4/16週後12週ごと皮下注）"},
  {id:"d063",name:"ヒュミラ40mgシリンジ",genericName:"アダリムマブ（遺伝子組換え）",spec:"1シリンジ40mg/0.4mL",category:"生物学的製剤",indication:"乾癬・関節症性乾癬（アダリムマブ・TNF-α阻害薬・2週ごと皮下注）"},
  {id:"d064",name:"コセンティクス150mgシリンジ",genericName:"セクキヌマブ（遺伝子組換え）",spec:"1シリンジ150mg/1mL",category:"生物学的製剤",indication:"乾癬・関節症性乾癬（セクキヌマブ・IL-17A阻害薬）"},
  {id:"d065",name:"トレムフィア100μgシリンジ",genericName:"グセルクマブ（遺伝子組換え）",spec:"1シリンジ100μg/1mL",category:"生物学的製剤",indication:"乾癬（グセルクマブ・IL-23阻害薬・0/4週後8週ごと皮下注）"},
  {id:"d066",name:"ゾレア75mgシリンジ",genericName:"オマリズマブ（遺伝子組換え）",spec:"1シリンジ75mg/0.5mL",category:"生物学的製剤",indication:"慢性特発性蕁麻疹（オマリズマブ・4週ごと皮下注）"},
  /* JAK阻害薬内服 */
  {id:"d067",name:"タリクスタ錠100mg",genericName:"アブロシチニブ",spec:"1錠100mg",category:"JAK阻害薬内服",indication:"アトピー性皮膚炎中等症〜重症（アブロシチニブ・JAK1阻害・1日1回）"},
  {id:"d068",name:"オルミエント4mg錠",genericName:"バリシチニブ",spec:"1錠4mg",category:"JAK阻害薬内服",indication:"アトピー性皮膚炎・円形脱毛症（バリシチニブ・JAK1/2阻害・1日1回）"},
  {id:"d069",name:"サイバインコ錠200mg",genericName:"デュークラバシチニブ",spec:"1錠200mg",category:"JAK阻害薬内服",indication:"円形脱毛症（デュークラバシチニブ・TYK2阻害薬）"},
  /* 免疫抑制薬 */
  {id:"d070",name:"ネオーラルカプセル25mg",genericName:"シクロスポリン",spec:"1カプセル25mg",category:"免疫抑制薬",indication:"アトピー性皮膚炎重症例・乾癬（シクロスポリン・体重kg×3mg/日分2）"},
  {id:"d071",name:"ネオーラルカプセル50mg",genericName:"シクロスポリン",spec:"1カプセル50mg",category:"免疫抑制薬",indication:"アトピー性皮膚炎重症例・乾癬（シクロスポリン）"},
  {id:"d072",name:"メソトレキセート錠2mg",genericName:"メトトレキサート",spec:"1錠2mg",category:"免疫抑制薬",indication:"乾癬・関節症性乾癬（週1回投与・連日投与厳禁）"},
  /* ステロイド内服・注射 */
  {id:"d073",name:"プレドニン錠5mg",genericName:"プレドニゾロン",spec:"1錠5mg",category:"ステロイド内服",indication:"重症薬疹・天疱瘡・SJS・自己免疫性水疱症（プレドニゾロン）"},
  {id:"d074",name:"メドロール錠4mg",genericName:"メチルプレドニゾロン",spec:"1錠4mg",category:"ステロイド内服",indication:"重症皮膚疾患・自己免疫疾患（メチルプレドニゾロン）"},
  {id:"d075",name:"ケナコルトA注10mg/mL",genericName:"トリアムシノロンアセトニド",spec:"1バイアル40mg/4mL",category:"ステロイド内服",indication:"ケロイド・肥厚性瘢痕・円形脱毛症（トリアムシノロン・局所注射）"},
  /* ビタミンD3外用 */
  {id:"d076",name:"ドボネックス軟膏0.005%",genericName:"カルシポトリオール水和物",spec:"1本30g",category:"ビタミンD3外用",indication:"乾癬（カルシポトリオール・1日2回）"},
  {id:"d077",name:"ボンアルファ軟膏0.002%",genericName:"タカルシトール水和物",spec:"1本10g",category:"ビタミンD3外用",indication:"乾癬（タカルシトール・1日2回）"},
  {id:"d078",name:"ドボベット軟膏",genericName:"カルシポトリオール水和物・ベタメタゾンジプロピオン酸エステル",spec:"1本30g",category:"ビタミンD3外用",indication:"乾癬（カルシポトリオール+ベタメタゾン配合・1日1回）"},
  {id:"d079",name:"マーデュオックス軟膏",genericName:"マキサカルシトール・ベタメタゾン酪酸エステルプロピオン酸エステル",spec:"1本15g・30g",category:"ビタミンD3外用",indication:"乾癬（マキサカルシトール+ベタメタゾン配合・1日1回）"},
  /* 神経障害性疼痛・NSAIDs */
  {id:"d080",name:"リリカカプセル75mg",genericName:"プレガバリン",spec:"1カプセル75mg",category:"神経障害性疼痛薬",indication:"帯状疱疹後神経痛・神経障害性疼痛（プレガバリン・1日2回）"},
  {id:"d081",name:"サインバルタカプセル30mg",genericName:"デュロキセチン塩酸塩",spec:"1カプセル30mg",category:"神経障害性疼痛薬",indication:"帯状疱疹後神経痛・うつ病（デュロキセチン・1日1回）"},
  {id:"d082",name:"ロキソプロフェン錠60mg",genericName:"ロキソプロフェンナトリウム水和物",spec:"1錠60mg",category:"NSAIDs",indication:"帯状疱疹急性期疼痛・炎症性疾患（ロキソニン・1回1錠×3回/日）"},
  {id:"d083",name:"カロナール錠500mg",genericName:"アセトアミノフェン",spec:"1錠500mg",category:"NSAIDs",indication:"帯状疱疹急性期疼痛・発熱（アセトアミノフェン・妊婦も使用可）"},
  /* 抗アレルギー薬・止痒薬 */
  {id:"d084",name:"トラネキサム酸錠250mg",genericName:"トラネキサム酸",spec:"1錠250mg",category:"抗アレルギー薬",indication:"肝斑・色素沈着・蕁麻疹・皮膚の炎症（1日3〜6錠分3）"},
  {id:"d085",name:"ヒベルナ錠25mg",genericName:"プロメタジン塩酸塩",spec:"1錠25mg",category:"止痒薬",indication:"掻痒症・蕁麻疹（プロメタジン・第一世代・眠気強）"},
  {id:"d086",name:"オイラックスクリーム10%",genericName:"クロタミトン",spec:"25g/本",category:"止痒薬",indication:"湿疹・蕁麻疹・虫刺されのかゆみ（クロタミトン外用）"},
  {id:"d087",name:"レスタミンコーワクリーム1%",genericName:"ジフェンヒドラミン塩酸塩",spec:"10g/本",category:"止痒薬",indication:"虫刺され・湿疹・蕁麻疹（ジフェンヒドラミン外用）"},
  /* 抗腫瘍外用 */
  {id:"d088",name:"ベセルナクリーム5%",genericName:"イミキモド",spec:"1包250mg（1回使い切り）",category:"抗腫瘍外用",indication:"尖圭コンジローマ・日光角化症（イミキモド・週3回就寝前）"},
  {id:"d089",name:"5-FUクリーム5%",genericName:"フルオロウラシル",spec:"1本20g",category:"抗腫瘍外用",indication:"日光角化症・老人性疣贅・多発性基底細胞癌（フルオロウラシル）"},
  /* 美容内服 */
  {id:"d090",name:"ハイチオール錠80mg",genericName:"L-システイン",spec:"1錠80mg",category:"美容内服",indication:"しみ・そばかす・肝斑・にきび（L-システイン・1回2錠×3回/日）"},
  {id:"d091",name:"シナール錠200mg",genericName:"アスコルビン酸・パントテン酸カルシウム",spec:"1錠200mg",category:"美容内服",indication:"しみ・そばかす・出血傾向（アスコルビン酸+パントテン酸・美白）"},
  /* その他外用 */
  {id:"d092",name:"スピール膏Mソフト",genericName:"サリチル酸",spec:"1枚（サリチル酸絆創膏）",category:"その他外用",indication:"たこ・魚の目・いぼ（サリチル酸40%・角質軟化）"},
  {id:"d093",name:"モーラステープL40mg",genericName:"ケトプロフェン",spec:"1枚70×100mm",category:"その他外用",indication:"帯状疱疹後神経痛・腰痛（ケトプロフェン・光線過敏症注意）"},
  {id:"d094",name:"フシジン酸ナトリウム軟膏2%",genericName:"フシジン酸ナトリウム",spec:"10g/本",category:"その他外用",indication:"細菌性皮膚感染症・とびひ（フシジンレオ同成分）"},
  {id:"d095",name:"ポビドンヨード軟膏10%",genericName:"ポビドンヨード",spec:"10g/本",category:"その他外用",indication:"外傷・熱傷・皮膚感染症（イソジン・消毒・創傷処置）"},
  /* その他内服 */
  {id:"d096",name:"ファモチジン錠20mg",genericName:"ファモチジン",spec:"1錠20mg",category:"その他内服",indication:"重症蕁麻疹（H2ブロッカー・抗ヒスタミン薬と併用・1日2回）"},
  {id:"d097",name:"エバスチン錠10mg",genericName:"エバスチン",spec:"1錠10mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（1日1回・空腹時でも可）"},
  {id:"d098",name:"フェキソフェナジン錠60mg（後発）",genericName:"フェキソフェナジン塩酸塩",spec:"1錠60mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（アレグラGE・1日2回）"},
  {id:"d099",name:"デザレックス錠5mg",genericName:"デスロラタジン",spec:"1錠5mg",category:"抗ヒスタミン薬",indication:"蕁麻疹・アレルギー性鼻炎（デスロラタジン・1日1回）"},
  {id:"d100",name:"ゾレア150mgシリンジ",genericName:"オマリズマブ（遺伝子組換え）",spec:"1シリンジ150mg/1mL",category:"生物学的製剤",indication:"慢性特発性蕁麻疹（オマリズマブ・体重・IgE値により用量調整）"},
  /* 生物学的製剤（アトピー追加） */
  {id:"d_mit01",name:"ミチーガ皮下注用60mgシリンジ",genericName:"ネモリズマブ（遺伝子組換え）",spec:"1シリンジ60mg/1mL",category:"生物学的製剤",indication:"アトピー性皮膚炎に伴うそう痒（6歳以上）・結節性痒疹（13歳以上）（ネモリズマブ・IL-31RA阻害・世界初・4週ごと皮下注・自己注射可）"},
  {id:"d_mit02",name:"ミチーガ皮下注用30mgバイアル",genericName:"ネモリズマブ（遺伝子組換え）",spec:"1バイアル30mg",category:"生物学的製剤",indication:"アトピー性皮膚炎（6歳以上13歳未満）・結節性痒疹（13歳以上・初回60mg→以降30mg）（ネモリズマブ・IL-31RA阻害・院内投与）"},
  {id:"d_ibg01",name:"イブグリース125mgシリンジ",genericName:"レブリキズマブ（遺伝子組換え）",spec:"1シリンジ125mg/1mL",category:"生物学的製剤",indication:"アトピー性皮膚炎中等症〜重症（レブリキズマブ・IL-13単独阻害・初回250mg×2回→4週ごと125mg）"},
  {id:"d_adt01",name:"アドトラーザ150mgシリンジ",genericName:"トラロキヌマブ（遺伝子組換え）",spec:"1シリンジ150mg/1mL",category:"生物学的製剤",indication:"アトピー性皮膚炎中等症〜重症・成人（トラロキヌマブ・選択的IL-13阻害・初回600mg→2週ごと300mg）"},
  /* 多汗症治療薬 */
  {id:"d_sw01",name:"エクロックゲル5%",genericName:"ソフピロニウム臭化物",spec:"20g/本・40g/本",category:"多汗症治療薬",indication:"原発性腋窩多汗症（12歳以上・ソフピロニウム臭化物・1日1回両わき塗布・緑内障/前立腺肥大禁忌）"},
  {id:"d_sw02",name:"ラピフォートワイプ2.5%",genericName:"グリコピロニウムトシル酸塩水和物",spec:"1包使い切り×14包/箱",category:"多汗症治療薬",indication:"原発性腋窩多汗症（9歳以上・グリコピロニウムトシル酸塩・1日1回拭き取り・緑内障/前立腺肥大禁忌）"},
  {id:"d_sw03",name:"アポハイドローション20%",genericName:"グリコピロニウム臭化物",spec:"30mL/本",category:"多汗症治療薬",indication:"原発性手掌多汗症（6歳以上・グリコピロニウム臭化物・日本初の手汗専用薬・1日1回就寝前塗布）"},
  {id:"d_sw04",name:"プロ・バンサイン錠15mg",genericName:"プロパンテリン臭化物",spec:"1錠15mg",category:"多汗症治療薬",indication:"多汗症（全身性・プロパンテリン臭化物・抗コリン内服薬・1回1〜2錠×3〜4回/日・口渇/便秘注意）"},
  /* ビタミン剤内服 */
  {id:"d_vit01",name:"ノイロビタン錠",genericName:"ビタミンB1・B2・B6・B12配合",spec:"1錠（B1:3mg・B6:1mg・B12:1μg・B2:1mg配合）",category:"ビタミン剤内服",indication:"帯状疱疹後神経痛・末梢神経炎・皮膚炎（ビタミンB複合・1回1〜2錠×3回/日）"},
  {id:"d_vit02",name:"メチコバール錠500μg",genericName:"メコバラミン",spec:"1錠500μg",category:"ビタミン剤内服",indication:"末梢神経障害・帯状疱疹後神経痛（メコバラミン・活性型B12・1回1錠×3回/日）"},
  {id:"d_vit03",name:"ビタミンC注射（アスコルビン酸注）",genericName:"アスコルビン酸",spec:"1管500mg/5mL",category:"ビタミン剤内服",indication:"色素沈着・美白・壊血病（アスコルビン酸・1日1〜3g注射）"},
  {id:"d_vit04",name:"チョコラBBプラス",genericName:"リボフラビン酪酸エステル・ピリドキシン塩酸塩・アスコルビン酸",spec:"1錠（B2:5mg・B6:10mg・C:50mg）",category:"ビタミン剤内服",indication:"口内炎・口角炎・にきび・皮膚炎（B2/B6/C配合・1回2錠×3回/日）"},
  {id:"d_vit05",name:"フラビタン錠5mg",genericName:"リボフラビン",spec:"1錠5mg",category:"ビタミン剤内服",indication:"口内炎・口角炎・脂漏性皮膚炎（リボフラビン・B2・1回1錠×2〜3回/日）"},
  {id:"d_vit06",name:"パントシン錠100mg",genericName:"パンテノール",spec:"1錠100mg",category:"ビタミン剤内服",indication:"皮脂欠乏症・湿疹皮膚炎・脱毛症補助（パンテノール・パントテン酸・1回1〜2錠×3回/日）"},
  {id:"d_vit07",name:"ユベラ軟膏",genericName:"トコフェロール酢酸エステル",spec:"30g/本・100g/本",category:"ビタミン剤内服",indication:"老人性乾皮症・進行性指掌角皮症（トコフェロール酢酸エステル・ビタミンE外用・1日数回）"},
  /* 創傷治療外用薬 */
  {id:"d_wd01",name:"アズノール軟膏0.033%",genericName:"ジメチルイソプロピルアズレン",spec:"25g/本・100g/本",category:"創傷治療外用薬",indication:"外傷・熱傷・湿疹・皮膚潰瘍・術後創傷（ジメチルイソプロピルアズレン・抗炎症・肉芽形成促進）"},
  {id:"d_wd02",name:"プロスタンディン軟膏0.003%",genericName:"アルプロスタジルアルファデクス",spec:"5g/本・10g/本",category:"創傷治療外用薬",indication:"褥瘡・皮膚潰瘍（アルプロスタジルアルファデクス・PGE1・血流改善・1日1〜2回）"},
  {id:"d_wd03",name:"ユーパスタコーワ軟膏",genericName:"精製白糖・ポビドンヨード",spec:"10g/本・100g/本",category:"創傷治療外用薬",indication:"感染性皮膚潰瘍・褥瘡（精製白糖+ポビドンヨード・消毒+壊死組織除去・1日1〜2回）"},
  {id:"d_wd04",name:"イソジンゲル10%",genericName:"ポビドンヨード",spec:"25g/本",category:"創傷治療外用薬",indication:"外傷・熱傷・手術創の消毒（ポビドンヨード・長期使用注意）"},
  {id:"d_wd05",name:"イソジン液10%",genericName:"ポビドンヨード",spec:"30mL/本・500mL/本",category:"創傷治療外用薬",indication:"外傷・手術前皮膚消毒・感染創洗浄（ポビドンヨード）"},
  {id:"d_wd06",name:"ゲーベンクリーム1%",genericName:"スルファジアジン銀",spec:"50g/本・500g/本",category:"創傷治療外用薬",indication:"熱傷・皮膚潰瘍・感染予防（スルファジアジン銀・広域抗菌・1日1〜2回厚く塗布）"},
  {id:"d_wd07",name:"オルセノン軟膏0.25%",genericName:"トレチノイントコフェリル",spec:"5g/本・25g/本",category:"創傷治療外用薬",indication:"褥瘡・難治性皮膚潰瘍（トレチノイントコフェリル・コラーゲン合成促進・1日1〜2回）"},
  {id:"d_wd08",name:"フィブラストスプレー250",genericName:"トラフェルミン（遺伝子組換え）",spec:"1瓶250μg（凍結乾燥）",category:"創傷治療外用薬",indication:"褥瘡・難治性皮膚潰瘍（トラフェルミン・bFGF・1日1回噴霧・強力な肉芽形成促進）"},
  {id:"d_wd09",name:"デブリサンペースト",genericName:"デキストラノマー",spec:"10g/袋",category:"創傷治療外用薬",indication:"感染性潰瘍・褥瘡（デキストラノマー・物理的に滲出液/壊死組織/細菌を吸着除去）"},
  {id:"d_wd10",name:"ブロメライン軟膏",genericName:"ブロメライン",spec:"5g/本",category:"創傷治療外用薬",indication:"褥瘡・熱傷の壊死組織除去（ブロメライン・タンパク分解酵素デブリードマン・1日1〜2回）"},
  {id:"d_wd11",name:"アクトシン軟膏3%",genericName:"ブクラデシンナトリウム",spec:"5g/本・25g/本",category:"創傷治療外用薬",indication:"褥瘡・皮膚潰瘍（ブクラデシンナトリウム・cAMP上昇・肉芽形成促進・1日1〜2回）"},
  {id:"d_wd12",name:"リフラップシート",genericName:"ジメチルイソプロピルアズレン・酸化亜鉛",spec:"5cm×5cm/枚・10cm×10cm/枚",category:"創傷治療外用薬",indication:"外傷・熱傷・褥瘡（ジメチルイソプロピルアズレン+酸化亜鉛・非固着性・湿潤環境維持）"},
  {id:"d_wd13",name:"アルギン酸Naドレッシング（カルトスタット等）",genericName:"アルギン酸ナトリウム",spec:"各種サイズ（5cm×5cm・10cm×10cm）",category:"創傷治療外用薬",indication:"滲出液の多い創傷・褥瘡・腔洞創（アルギン酸Na・ゲル化で湿潤環境維持・止血効果）"},
  {id:"d_wd14",name:"デュオアクティブ（ハイドロコロイド）",genericName:"カルボキシメチルセルロースナトリウム",spec:"各種サイズ",category:"創傷治療外用薬",indication:"浅い褥瘡・皮膚潰瘍（ハイドロコロイド・自己融解促進・湿潤環境維持）"},
  {id:"d_wd15",name:"ポリウレタンフォームドレッシング（アレビン等）",genericName:"ポリウレタンフォーム",spec:"各種サイズ",category:"創傷治療外用薬",indication:"滲出液中〜多量の褥瘡・皮膚潰瘍（高い滲出液吸収・湿潤環境維持）"},
  /* 漢方薬 */
  {id:"d_hb01",name:"防風通聖散エキス顆粒",genericName:"防風通聖散",spec:"2.5g/包×42包",category:"漢方薬",indication:"肥満・便秘・むくみ・皮膚病（高血圧傾向の肥満・1回1包×3回/日食前）"},
  {id:"d_hb02",name:"防已黄耆湯エキス顆粒",genericName:"防已黄耆湯",spec:"2.5g/包×42包",category:"漢方薬",indication:"多汗症・むくみ・関節痛（水太り・疲れやすい人の多汗・1回1包×3回/日食前）"},
  {id:"d_hb03",name:"当帰飲子エキス顆粒",genericName:"当帰飲子",spec:"2.5g/包×42包",category:"漢方薬",indication:"老人性乾皮症・慢性湿疹・皮膚掻痒症（乾燥・かゆみ・1回1包×3回/日食前）"},
  {id:"d_hb04",name:"黄連解毒湯エキス顆粒",genericName:"黄連解毒湯",spec:"2.5g/包×42包",category:"漢方薬",indication:"赤ら顔・酒皶・のぼせ・湿疹（充血・炎症が強い場合・1回1包×3回/日食前）"},
  {id:"d_hb05",name:"消風散エキス顆粒",genericName:"消風散",spec:"2.5g/包×42包",category:"漢方薬",indication:"慢性湿疹・蕁麻疹・アトピー性皮膚炎（分泌物多い・かゆみ強い・1回1包×3回/日食前）"},
]

export default drugs
