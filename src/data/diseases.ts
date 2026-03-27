export type Disease = {
  id: string;
  name: string;
  nameEn: string;
  badge: string;
  badgeColor: "blue" | "teal" | "amber" | "red" | "purple";
  description: string;
  cause: string;
  treatment: string;
  patientExplanation: string;
};

export const diseases: Disease[] = [
  {
    id: "atopic",
    name: "アトピー性皮膚炎",
    nameEn: "Atopic Dermatitis",
    badge: "アレルギー",
    badgeColor: "blue",
    description:
      "皮膚バリア機能低下とアレルギー炎症による慢性・再発性の湿疹疾患。当院では保険診療と美容診療を組み合わせたハイブリッド治療を提供。",
    cause: "フィラグリン遺伝子異常・ダニ・食物アレルギー・乾燥・ストレス。ドロップスクリーンでアレルゲン特定も可能。",
    treatment:
      "保湿剤でバリア補強。ステロイド外用・タクロリムス・JAK阻害薬外用(コレクチム)。重症例にデュピクセント・オルミエント。光線療法も実施。",
    patientExplanation:
      "お肌の防御壁が弱く、アレルギー反応で炎症が起きやすい状態です。保湿を毎日行い、症状が出たら早めに薬で抑えることが大切です。注射薬という選択肢もあります。",
  },
  {
    id: "acne",
    name: "尋常性ざ瘡（ニキビ）",
    nameEn: "Acne Vulgaris",
    badge: "炎症",
    badgeColor: "teal",
    description:
      "毛包・皮脂腺の慢性炎症疾患。当院はニキビ跡（凹み・赤み）も自由診療で対応。",
    cause: "皮脂過剰＋アクネ菌増殖＋毛穴閉塞。ホルモン・食事・ストレスも関与。",
    treatment:
      "保険：アダパレン・過酸化ベンゾイル・クリンダマイシン・ドキシサイクリン。自由診療：イソトレチノイン・ポテンツァ・キュアジェット・マッサージピール・サリチル酸ピーリング。",
    patientExplanation:
      "皮脂が毛穴に詰まり菌が増えて炎症が起きた状態です。塗り薬で原因を抑えます。跡が残っている場合はレーザーや機器での治療もご相談ください。",
  },
  {
    id: "rosacea",
    name: "酒さ",
    nameEn: "Rosacea",
    badge: "炎症",
    badgeColor: "teal",
    description:
      "顔面中央部の慢性炎症性疾患。紅斑・毛細血管拡張・丘疹が特徴。当院ではIPLノーリスやポテンツァで治療可能。",
    cause: "Demodex毛包虫・バリア機能低下・神経血管調節異常。日光・辛食・アルコールで悪化。",
    treatment:
      "保険：メトロニダゾール外用・イベルメクチン外用・ドキシサイクリン内服。自由診療：IPLノーリス・ポテンツァ・ブルーレーザー・アグネス。",
    patientExplanation:
      "顔が赤くなりやすい慢性の皮膚炎です。塗り薬で炎症を抑えつつ、光や機器での施術で赤みを改善することもできます。",
  },
  {
    id: "contact",
    name: "接触性皮膚炎",
    nameEn: "Contact Dermatitis",
    badge: "アレルギー",
    badgeColor: "blue",
    description:
      "皮膚への接触によるアレルギー性・刺激性の炎症反応。パッチテストで原因特定が可能。",
    cause: "アレルギー性(ニッケル・染料・植物)と刺激性(洗剤・化学物質)の2種。",
    treatment:
      "原因物質の特定と除去が最優先。ステロイド外用薬で炎症鎮静。パッチテスト・ドロップスクリーンで精査。",
    patientExplanation:
      "特定の物質に触れてかぶれています。原因を特定して避けることと、炎症を抑える塗り薬で治療します。",
  },
  {
    id: "urticaria",
    name: "蕁麻疹",
    nameEn: "Urticaria",
    badge: "アレルギー",
    badgeColor: "blue",
    description:
      "皮膚に突然出現する膨疹と強いかゆみ。6週間以上を慢性蕁麻疹と定義。",
    cause: "食物・薬剤・感染症・物理的刺激。慢性例はゾレア適応を検討。",
    treatment:
      "第二世代抗ヒスタミン薬(セチリジン・フェキソフェナジン・ルパフィン)。慢性難治例にゾレア皮下注。",
    patientExplanation:
      "皮膚にヒスタミンが放出されて起こる反応です。飲み薬でかゆみと腫れを抑えます。繰り返す場合はアレルギー検査も検討します。",
  },
  {
    id: "zoster",
    name: "帯状疱疹",
    nameEn: "Herpes Zoster",
    badge: "ウイルス",
    badgeColor: "red",
    description:
      "VZV再活性化による片側性帯状の水疱と強い神経痛。ワクチン予防(シングリックス)も当院で対応。",
    cause: "幼少期の水ぼうそう後にウイルスが神経節に潜伏し、免疫低下時に再活性化。",
    treatment:
      "バラシクロビル(発症72時間以内に開始が重要)。神経痛にはプレガバリン・NSAIDs。後遺症予防にワクチン推奨。",
    patientExplanation:
      "昔かかった水ぼうそうのウイルスが再び活動した病気です。早めの抗ウイルス薬で神経痛が残るリスクを下げられます。",
  },
  {
    id: "tinea",
    name: "白癬（水虫・爪白癬）",
    nameEn: "Tinea / Onychomycosis",
    badge: "真菌",
    badgeColor: "amber",
    description: "皮膚糸状菌による感染症。足白癬・爪白癬が代表的。",
    cause: "Trichophyton属の真菌。感染源は銭湯・プール・共用マット。",
    treatment:
      "足白癬：テルビナフィン・ルリコナゾール外用(最低4週間)。爪白癬：テルビナフィン・イトラコナゾール内服(パルス療法)。",
    patientExplanation:
      "カビの一種が皮膚や爪に感染した病気です。根気よく塗り薬を続けることが大切で、爪の場合は飲み薬も効果的です。",
  },
  {
    id: "psoriasis",
    name: "尋常性乾癬",
    nameEn: "Psoriasis",
    badge: "免疫",
    badgeColor: "purple",
    description:
      "免疫異常による皮膚の過剰増殖・慢性炎症疾患。銀白色鱗屑を伴う紅斑が全身に出現。当院では生物学的製剤も対応。",
    cause: "Th17細胞の活性化による自己免疫疾患。遺伝的素因にストレス・感染・薬剤が引き金。",
    treatment:
      "軽〜中等症：ビタミンD3外用・ステロイド外用・ナローバンドUVB光線療法。重症：シクロスポリン・メトトレキサート・生物学的製剤(スキリージ等)。",
    patientExplanation:
      "皮膚が早く作られすぎて白い鱗が積み重なる病気です。塗り薬・光治療・注射薬でコントロールします。",
  },
  {
    id: "ppp",
    name: "掌蹠膿疱症",
    nameEn: "Palmoplantar Pustulosis",
    badge: "免疫",
    badgeColor: "purple",
    description:
      "手のひら・足の裏に無菌性膿疱が繰り返し出現。扁桃炎・歯科金属・喫煙が関与。",
    cause: "自己免疫関与。扁桃炎・金属アレルギー・喫煙が誘発・悪化因子。",
    treatment:
      "ビタミンD3外用・ステロイド外用。難治例：シクロスポリン・生物学的製剤。扁桃摘出・金属除去が奏効する場合あり。",
    patientExplanation:
      "手のひらと足の裏に膿が繰り返し出る病気です。喫煙や扁桃炎との関係があるため、生活習慣も一緒に見直します。",
  },
  {
    id: "vitiligo",
    name: "白斑",
    nameEn: "Vitiligo",
    badge: "自己免疫",
    badgeColor: "purple",
    description:
      "メラノサイトへの自己免疫反応による後天性の色素脱失斑。",
    cause: "T細胞によるメラノサイト破壊。遺伝的素因・酸化ストレスが関与。",
    treatment:
      "タクロリムス外用・ステロイド外用。ナローバンドUVB光線療法。重症例にJAK阻害薬内服。",
    patientExplanation:
      "皮膚の色素細胞が失われて白くなる病気です。塗り薬や光治療で少しずつ色が戻ることを目指します。",
  },
  {
    id: "alopecia",
    name: "円形脱毛症",
    nameEn: "Alopecia Areata",
    badge: "免疫",
    badgeColor: "purple",
    description:
      "毛包への自己免疫反応による非瘢痕性脱毛症。当院ではオルミエント(バリシチニブ)も対応。",
    cause: "T細胞が毛包を攻撃する自己免疫疾患。ストレスが誘発因子になることも。",
    treatment:
      "ステロイド局所注射・外用。難治例：JAK阻害薬(オルミエント4mg)・DPCP感作療法。",
    patientExplanation:
      "免疫が毛根を間違えて攻撃している状態です。注射や塗り薬で免疫反応を抑えることで毛が生えてきます。",
  },
  {
    id: "seborrheic",
    name: "脂漏性皮膚炎",
    nameEn: "Seborrheic Dermatitis",
    badge: "真菌",
    badgeColor: "amber",
    description:
      "マラセチア酵母が関与する慢性炎症性疾患。頭皮・顔のT字帯に鱗屑を伴う紅斑。",
    cause: "マラセチア属真菌への炎症反応。皮脂分泌過多の部位に好発。",
    treatment:
      "ニゾラール(ケトコナゾール)外用＋弱〜中程度ステロイド外用。フケ症には抗真菌シャンプー。",
    patientExplanation:
      "頭皮や顔のフケが多く出る炎症です。抗真菌薬の塗り薬と保湿ケアで改善します。",
  },
  {
    id: "cellulitis",
    name: "蜂窩織炎",
    nameEn: "Cellulitis",
    badge: "細菌",
    badgeColor: "red",
    description:
      "皮膚〜皮下組織の急性細菌感染症。下肢に多く発赤・腫脹・熱感が急速に拡大。",
    cause: "溶連菌・黄色ブドウ球菌。傷・虫刺され・足白癬が入口になることが多い。",
    treatment:
      "抗菌薬(セフジトレン・アモキシシリン)内服〜点滴。重症例は入院管理。入口となった白癬も並行治療。",
    patientExplanation:
      "皮膚の奥まで菌が入った感染症です。抗生物質でしっかり治療し、水虫など入口となった部分も同時に治します。",
  },
  {
    id: "eczema",
    name: "湿疹・皮脂欠乏性湿疹",
    nameEn: "Eczema / Xerotic Eczema",
    badge: "皮膚機能",
    badgeColor: "teal",
    description:
      "乾燥や刺激による皮膚炎。特に冬季・高齢者・入浴過多で皮脂欠乏性湿疹が多い。",
    cause: "皮膚バリア機能低下・乾燥・過度な洗浄。腎不全・肝疾患・糖尿病の除外も必要。",
    treatment:
      "ヘパリン類似物質(ヒルドイド)・尿素含有保湿剤(ウレパール)。かゆみに抗ヒスタミン薬。入浴指導も重要。",
    patientExplanation:
      "お肌の乾燥で炎症が起きている状態です。保湿剤を毎日こまめに塗ることが最も重要な治療です。",
  },
  {
    id: "drug_eruption",
    name: "薬疹",
    nameEn: "Drug Eruption",
    badge: "薬剤",
    badgeColor: "purple",
    description:
      "薬剤に対する皮膚の過敏反応。軽症の多形紅斑から重症のStevens-Johnson症候群まで幅広い。",
    cause: "抗菌薬・NSAIDs・抗てんかん薬・造影剤など多数。",
    treatment:
      "原因薬剤の即時中止が最優先。ステロイド全身投与。SJSはICU管理が必要。",
    patientExplanation:
      "飲んでいる薬に対してアレルギー反応が起きています。原因の薬をすぐに中止することが最も重要です。",
  },
  {
    id: "wart",
    name: "いぼ・水いぼ",
    nameEn: "Warts / Molluscum",
    badge: "ウイルス",
    badgeColor: "red",
    description:
      "HPVによる尋常性疣贅(いぼ)とMCV感染による伝染性軟属腫(水いぼ)。子供に多い。",
    cause: "HPV(いぼ)・MCV(水いぼ)感染。免疫低下・アトピー患者に多発。",
    treatment:
      "いぼ：液体窒素凍結療法・プラズマペン。水いぼ：ピンセット除去・乳酸外用。難治いぼにはブレオマイシン局注。",
    patientExplanation:
      "ウイルスが皮膚に感染してできたものです。液体窒素や機器で治療します。お子さんの水いぼは除去で対応します。",
  },
  {
    id: "cyst",
    name: "粉瘤（アテローム）",
    nameEn: "Epidermoid Cyst",
    badge: "良性腫瘍",
    badgeColor: "teal",
    description:
      "表皮嚢腫。皮膚の下に袋状の構造ができ角質が蓄積。感染すると発赤・疼痛・腫脹が起きる。",
    cause: "毛穴閉塞・外傷による表皮細胞の皮下迷入。",
    treatment:
      "根治には外科的全摘が必要。感染時は切開排膿(根治ではない)。当院で日帰り小手術が可能。",
    patientExplanation:
      "皮膚の下に袋ができた状態です。根本から取り除くには手術が必要ですが、当院で日帰りで対応できます。",
  },
  {
    id: "tumor",
    name: "皮膚腫瘍（良性・悪性）",
    nameEn: "Skin Tumors",
    badge: "腫瘍",
    badgeColor: "red",
    description:
      "脂漏性角化症などの良性腫瘍から基底細胞癌・有棘細胞癌・悪性黒色腫まで多様。ダーモスコピーで精査。",
    cause: "良性：加齢・紫外線。悪性：累積紫外線・慢性炎症・遺伝的素因。",
    treatment:
      "良性：液体窒素・プラズマペン。悪性：外科的切除・生検病理確認が必須。",
    patientExplanation:
      "皮膚のできものは良性か悪性かの判断が重要です。専用の機器(ダーモスコープ)で詳しく確認し、必要なら取り除きます。",
  },
  {
    id: "herpes",
    name: "単純ヘルペス",
    nameEn: "Herpes Simplex",
    badge: "ウイルス",
    badgeColor: "red",
    description:
      "HSV-1/2感染による口唇・外陰部ヘルペス。疲労・ストレスで再発しやすい。",
    cause: "HSVの初感染・再活性化。神経節に潜伏。",
    treatment:
      "アシクロビル外用・バラシクロビル内服。再発頻回例には長期抑制療法。",
    patientExplanation:
      "ヘルペスウイルスによる皮疹です。早めに抗ウイルス薬を使うことで早く治ります。再発しやすいため予防的な治療もあります。",
  },
  {
    id: "ak",
    name: "日光角化症・皮膚がん",
    nameEn: "Actinic Keratosis / Skin Cancer",
    badge: "前癌・悪性",
    badgeColor: "red",
    description:
      "長年の紫外線暴露による有棘細胞癌の前癌病変と皮膚悪性腫瘍。早期発見が予後を左右する。",
    cause: "累積紫外線暴露。高齢者・農業・屋外労働者に多い。",
    treatment:
      "日光角化症：液体窒素・5-FU外用・イミキモド外用・PDT。悪性：外科的切除＋病理確認。",
    patientExplanation:
      "長年の紫外線でできた病変で、皮膚がんになりうるものもあります。早めに治療して予防することが大切です。",
  },
];
