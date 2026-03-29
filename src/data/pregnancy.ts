export type SafetyLevel = "safe" | "caution" | "avoid" | "contraindicated";

export type PregnancyDrug = {
  id: string;
  name: string;
  genericName: string;
  category: string;
  pregnancy: SafetyLevel;
  pregnancyNote: string;
  lactation: SafetyLevel;
  lactationNote: string;
  evidence?: string;
};

export const pregnancyDrugs: PregnancyDrug[] = [
  /* 抗ヒスタミン薬 */
  {id:"p01",name:"クラリチン錠10mg",genericName:"ロラタジン",category:"抗ヒスタミン薬",pregnancy:"safe",pregnancyNote:"妊娠中の第一選択薬。使用経験が豊富で先天異常の増加なし。妊娠全期間を通じて使用可能",lactation:"safe",lactationNote:"国立成育医療研究センター「安全に使用できる薬」リストに収載。母乳移行量が少なく◎評価",evidence:"妊娠と薬情報センター推奨・国立成育医療研究センター授乳安全薬リスト収載"},
  {id:"p02",name:"ジルテック錠10mg",genericName:"セチリジン塩酸塩",category:"抗ヒスタミン薬",pregnancy:"safe",pregnancyNote:"妊娠中の第一選択薬。約1000人の妊婦曝露研究で先天異常増加なし。妊娠全期間で使用可能",lactation:"safe",lactationNote:"妊娠と授乳（改訂3版）で「安全」評価。母乳移行量は少量",evidence:"妊娠と薬情報センター推奨"},
  {id:"p03",name:"ザイザル錠5mg",genericName:"レボセチリジン塩酸塩",category:"抗ヒスタミン薬",pregnancy:"safe",pregnancyNote:"セチリジンの光学異性体。理論的に同等の安全性。妊娠と授乳（改訂3版）で「安全」評価",lactation:"safe",lactationNote:"妊娠と授乳（改訂3版）で「安全」評価。授乳中の使用可能",evidence:"妊娠と薬情報センター参考"},
  {id:"p04",name:"アレグラ錠60mg",genericName:"フェキソフェナジン塩酸塩",category:"抗ヒスタミン薬",pregnancy:"caution",pregnancyNote:"妊娠中は有益性投与（添付文書）。奇形リスクなしとの報告が多い。必要時は使用可能",lactation:"safe",lactationNote:"国立成育医療研究センター授乳安全薬リスト収載。母乳移行量少なく◎評価",evidence:"国立成育医療研究センター授乳安全薬リスト収載"},
  {id:"p05",name:"デザレックス錠5mg",genericName:"デスロラタジン",category:"抗ヒスタミン薬",pregnancy:"safe",pregnancyNote:"ロラタジンの活性代謝物。妊娠中・授乳中ともに安全性が最も高い薬剤の一つ",lactation:"safe",lactationNote:"国立成育医療研究センター授乳安全薬リスト収載。母乳移行ほぼなし",evidence:"国立成育医療研究センター授乳安全薬リスト収載"},
  {id:"p06",name:"アレロック錠5mg",genericName:"オロパタジン塩酸塩",category:"抗ヒスタミン薬",pregnancy:"caution",pregnancyNote:"有益性投与。妊娠中の大規模データ少ないが催奇形性の報告はない",lactation:"caution",lactationNote:"母乳移行あり。添付文書では授乳回避推奨。必要時は授乳直後に服用",evidence:"添付文書：有益性投与"},
  {id:"p07",name:"ルパフィン錠10mg",genericName:"ルパタジン",category:"抗ヒスタミン薬",pregnancy:"caution",pregnancyNote:"有益性投与。妊娠中の使用経験少ない。必要時のみ使用",lactation:"caution",lactationNote:"母乳移行データ少ない。添付文書では授乳回避推奨",evidence:"添付文書：有益性投与"},
  {id:"p08",name:"ビラノア錠20mg",genericName:"ビラスチン",category:"抗ヒスタミン薬",pregnancy:"caution",pregnancyNote:"有益性投与。妊娠中の使用経験が少なく、クラリチン・ジルテックを優先",lactation:"caution",lactationNote:"母乳移行データ少ない。授乳中は実績のある薬剤を優先",evidence:"添付文書：有益性投与"},
  {id:"p09",name:"ポララミン錠2mg",genericName:"d-クロルフェニラミンマレイン酸塩",category:"抗ヒスタミン薬（第一世代）",pregnancy:"caution",pregnancyNote:"第一世代として経験的に安全性が確認されている。眠気・抗コリン作用が強いため第二世代を優先",lactation:"caution",lactationNote:"母乳移行あり。眠気・抗コリン作用が赤ちゃんに影響する可能性。できれば第二世代を選択",evidence:"経験的安全性あり"},
  {id:"p10",name:"タリオン錠10mg",genericName:"ベポタスチンベシル酸塩",category:"抗ヒスタミン薬",pregnancy:"caution",pregnancyNote:"有益性投与。妊娠中の大規模データ不足。クラリチン・ジルテックを優先",lactation:"caution",lactationNote:"添付文書では授乳回避推奨。実績のある薬剤を優先",evidence:"添付文書：有益性投与"},
  /* ロイコトリエン受容体拮抗薬 */
  {id:"p11",name:"シングレア錠10mg / キプレス錠10mg",genericName:"モンテルカストナトリウム",category:"ロイコトリエン受容体拮抗薬",pregnancy:"safe",pregnancyNote:"妊娠中・授乳中ともに安全性が高い。妊娠前から服用中なら継続可能。催奇形性の報告なし",lactation:"safe",lactationNote:"妊娠と授乳（改訂3版）で「安全」評価。授乳中も継続使用可能",evidence:"妊娠と薬情報センター推奨"},
  /* ステロイド外用 */
  {id:"p12",name:"ステロイド外用薬（Weak〜Strong）全般",genericName:"各種ステロイド外用薬",category:"ステロイド外用",pregnancy:"safe",pregnancyNote:"通常使用量・限局使用であれば妊娠全期間で安全。現在まで胎児への悪影響の報告なし。我慢によるストレスの方がリスク",lactation:"safe",lactationNote:"局所使用では母乳移行量は極めて少ない。通常量使用は安全。乳房への使用は授乳前に拭き取ること",evidence:"アトピー性皮膚炎診療ガイドライン2024・国立成育医療研究センター"},
  {id:"p13",name:"ステロイド外用薬（Strongest：デルモベート等）",genericName:"クロベタゾールプロピオン酸エステル等",category:"ステロイド外用",pregnancy:"caution",pregnancyNote:"大量・長期・広範囲使用は出生体重低下のリスクあり。局所・短期間使用は可能。必要最小限に",lactation:"caution",lactationNote:"大量使用は避ける。通常量の局所使用なら問題ない",evidence:"アトピー性皮膚炎診療ガイドライン2024"},
  /* タクロリムス外用 */
  {id:"p14",name:"プロトピック軟膏（タクロリムス外用）",genericName:"タクロリムス水和物",category:"タクロリムス外用",pregnancy:"caution",pregnancyNote:"2018年7月に添付文書改訂：禁忌→「有益性が危険性上回る場合のみ使用」に変更。必要時は使用可能",lactation:"caution",lactationNote:"母乳移行報告あり。授乳中は有益性を考慮した上で使用。乳房への使用は避ける",evidence:"厚労省添付文書改訂（2018年7月）"},
  /* 保湿剤 */
  {id:"p15",name:"ヒルドイド（ヘパリン類似物質）",genericName:"ヘパリン類似物質",category:"保湿剤",pregnancy:"safe",pregnancyNote:"妊娠全期間で安全に使用可能。皮膚への局所作用のみで全身移行なし",lactation:"safe",lactationNote:"授乳中も安全。乳房への使用時は授乳前に拭き取ること",evidence:"安全性確立"},
  {id:"p16",name:"白色ワセリン・プロペト",genericName:"白色ワセリン",category:"保湿剤",pregnancy:"safe",pregnancyNote:"最も安全な保湿剤。妊娠全期間・授乳中ともに問題なし",lactation:"safe",lactationNote:"完全に安全。量の制限なし",evidence:"安全性確立"},
  /* 抗ウイルス薬 */
  {id:"p17",name:"バラシクロビル錠500mg（帯状疱疹）",genericName:"バラシクロビル塩酸塩",category:"抗ウイルス内服",pregnancy:"caution",pregnancyNote:"帯状疱疹・重症単純ヘルペスでは有益性が危険性上回れば使用可。先天異常増加の報告なし",lactation:"caution",lactationNote:"母乳移行あり。重症例では有益性を考慮して使用",evidence:"添付文書：有益性投与"},
  /* 抗菌薬 */
  {id:"p18",name:"アモキシシリン（サワシリン）",genericName:"アモキシシリン水和物",category:"抗菌薬内服",pregnancy:"safe",pregnancyNote:"ペニシリン系は妊娠全期間で安全。蜂窩織炎・とびひに使用可能",lactation:"safe",lactationNote:"母乳移行少量。授乳中も安全に使用可能",evidence:"妊娠中の安全性確立"},
  {id:"p19",name:"セフジトレンピボキシル（メイアクト）",genericName:"セフジトレンピボキシル",category:"抗菌薬内服",pregnancy:"caution",pregnancyNote:"セフェム系。有益性投与。先天異常リスクは低いが大規模データ少ない",lactation:"caution",lactationNote:"母乳移行少量。有益性を考慮して使用",evidence:"添付文書：有益性投与"},
  {id:"p20",name:"ドキシサイクリン・ミノマイシン",genericName:"テトラサイクリン系抗菌薬",category:"抗菌薬内服",pregnancy:"contraindicated",pregnancyNote:"【絶対禁忌】歯牙着色・骨発育障害リスク。妊婦・8歳未満禁忌。ざ瘡治療中の妊娠発覚時は即中止し他剤へ変更",lactation:"contraindicated",lactationNote:"【禁忌】母乳移行し乳児の歯牙着色リスク。授乳中は使用不可",evidence:"添付文書：妊婦・8歳未満禁忌"},
  /* 保湿以外の外用薬 */
  {id:"p21",name:"抗真菌外用薬（ルリコン・ラミシール外用等）",genericName:"各種抗真菌外用薬",category:"抗真菌外用",pregnancy:"caution",pregnancyNote:"局所外用は全身移行少なく比較的安全。添付文書では有益性投与。白癬の症状が強い場合は使用可",lactation:"caution",lactationNote:"局所使用では母乳移行極めて少ない。有益性を考慮して使用可",evidence:"添付文書：有益性投与"},
  {id:"p22",name:"爪白癬外用薬（ネイリン・クレナフィン・ルコナック）",genericName:"ホスラブコナゾール・エフィナコナゾール・ルリコナゾール",category:"抗真菌外用（爪）",pregnancy:"avoid",pregnancyNote:"妊婦への安全性データ不足。催奇形性は報告なし。非緊急の場合は出産後まで治療延期を推奨",lactation:"avoid",lactationNote:"安全性データ不足。授乳終了後まで治療延期を推奨",evidence:"安全性データ不十分"},
  /* 絶対禁忌 */
  {id:"p23",name:"ロアキュテイン（イソトレチノイン）",genericName:"イソトレチノイン",category:"レチノイド内服",pregnancy:"contraindicated",pregnancyNote:"【絶対禁忌】催奇形性の発生率20〜35%。服用中・服用後1ヶ月間は厳格避妊必須。妊娠発覚時は即中止",lactation:"contraindicated",lactationNote:"【禁忌】授乳中も使用不可",evidence:"添付文書：妊婦絶対禁忌・催奇形性"},
  {id:"p24",name:"ディフェリンゲル（アダパレン外用）",genericName:"アダパレン",category:"外用レチノイド",pregnancy:"contraindicated",pregnancyNote:"【禁忌】レチノイド系。動物実験で催奇形性。妊娠中・妊娠可能性のある女性は使用禁忌",lactation:"avoid",lactationNote:"使用を避けること。安全性データ不十分",evidence:"添付文書：妊婦禁忌"},
  {id:"p25",name:"メソトレキサート（MTX）",genericName:"メトトレキサート",category:"免疫抑制薬",pregnancy:"contraindicated",pregnancyNote:"【絶対禁忌】催奇形性あり（MTX胎児症候群）。妊娠前に少なくとも1月経周期前に中止。男女ともに妊娠中は禁忌",lactation:"contraindicated",lactationNote:"【禁忌】授乳中も使用不可",evidence:"添付文書：妊婦絶対禁忌"},
  {id:"p26",name:"NSAIDs内服（ロキソプロフェン等）",genericName:"ロキソプロフェン等NSAIDs",category:"NSAIDs",pregnancy:"avoid",pregnancyNote:"妊娠後期は胎児動脈管早期閉鎖リスクのため禁忌。妊娠初期・中期は有益性投与。カロナールを優先",lactation:"caution",lactationNote:"短期使用は可能。長期使用は避ける。イブプロフェンは授乳中比較的安全",evidence:"添付文書：妊娠後期禁忌"},
  {id:"p27",name:"カロナール（アセトアミノフェン）",genericName:"アセトアミノフェン",category:"NSAIDs・鎮痛薬",pregnancy:"safe",pregnancyNote:"妊娠全期間を通じて最も安全な鎮痛薬。NSAIDsの代替薬として第一選択",lactation:"safe",lactationNote:"授乳中も安全に使用可能",evidence:"妊娠・授乳中の鎮痛薬第一選択"},
  /* 生物学的製剤 */
  {id:"p28",name:"デュピクセント（デュピルマブ）",genericName:"デュピルマブ",category:"生物学的製剤",pregnancy:"caution",pregnancyNote:"IgG型。妊娠中の安全性データ蓄積中。EULAR 2024ではnon-TNF bDMARDは必要に応じて使用可能。治療上必要な場合は継続可",lactation:"caution",lactationNote:"IgG型生物学的製剤は母乳移行量少ない。EULAR 2024では全てのbDMARDは授乳と併用可能としている",evidence:"EULAR 2024推奨・添付文書：有益性投与"},
  {id:"p29",name:"TNF-α阻害薬（ヒュミラ等）",genericName:"アダリムマブ等",category:"生物学的製剤",pregnancy:"caution",pregnancyNote:"EULAR 2024では妊娠期間を通じて使用可能。妊娠後期投与は新生児免疫抑制に注意（出生後6ヶ月は生ワクチン接種延期）",lactation:"caution",lactationNote:"EULAR 2024では授乳中も使用可能。母乳移行量は少ない",evidence:"EULAR 2024：妊娠中TNF阻害剤は使用可能"},
  {id:"p30",name:"ミチーガ（ネモリズマブ）",genericName:"ネモリズマブ",category:"生物学的製剤",pregnancy:"caution",pregnancyNote:"有益性が危険性上回る場合のみ使用。妊娠中の安全性データ不十分。結節性痒疹・重症アトピーのかゆみが激烈な場合は要相談",lactation:"caution",lactationNote:"IgG型。母乳移行は理論的に少量。有益性を考慮した上で使用",evidence:"添付文書：有益性投与"},
  /* 多汗症治療薬 */
  {id:"p31",name:"エクロックゲル・ラピフォートワイプ・アポハイドローション",genericName:"ソフピロニウム・グリコピロニウム系",category:"多汗症治療薬",pregnancy:"avoid",pregnancyNote:"妊娠中の安全性データなし。抗コリン薬のため原則使用を避ける",lactation:"avoid",lactationNote:"授乳中の安全性データなし。使用を避けることが望ましい",evidence:"安全性データ不十分"},
  /* 美容外用薬 */
  {id:"p32",name:"ゼオスキンヘルス・レチノール含有外用薬",genericName:"レチノール・トレチノイン外用",category:"美容外用薬",pregnancy:"avoid",pregnancyNote:"外用レチノールの催奇形性リスクを示す報告はないが、安全性の確実な根拠がないため中止を推奨",lactation:"avoid",lactationNote:"授乳中も使用を避けることが望ましい",evidence:"安全性の大規模試験なし・予防的に避けることを推奨"},
  {id:"p33",name:"ハイドロキノン外用（コジブライト等）",genericName:"ハイドロキノン",category:"美容外用薬",pregnancy:"avoid",pregnancyNote:"局所吸収は少ないが全身移行の可能性。妊娠中は使用を避けること。シミ治療は産後に延期",lactation:"avoid",lactationNote:"授乳中も使用を避けること",evidence:"予防的に使用回避を推奨"},
];
