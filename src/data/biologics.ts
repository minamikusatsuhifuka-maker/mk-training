export type BiologicDrug = {
  id: string
  name: string
  genericName: string
  target: string
  diseases: string[]
  dosage: {
    form: string
    strength: string
  }[]
  schedule: {
    induction: string
    maintenance: string
    selfInjection: boolean
    note?: string
  }
  receiptNotes: {
    disease: string
    required: string[]
    timing: string
  }[]
  lastUpdated: string
}

export const biologicDrugs: BiologicDrug[] = [

  /* ===アトピー性皮膚炎=== */
  {
    id: "dupixent",
    name: "デュピクセント",
    genericName: "デュピルマブ（遺伝子組換え）",
    target: "IL-4受容体α（IL-4・IL-13シグナルを同時阻害）",
    diseases: ["アトピー性皮膚炎", "結節性痒疹", "慢性特発性蕁麻疹"],
    dosage: [
      { form: "シリンジ", strength: "300mg/2mL" },
      { form: "ペン（オートインジェクター）", strength: "300mg/2mL" },
      { form: "シリンジ（小児用）", strength: "200mg/1.14mL" },
    ],
    schedule: {
      induction: "初回600mg（300mg×2本）皮下注",
      maintenance: "以降300mgを2週ごとに1本皮下注（自己注射可）",
      selfInjection: true,
      note: "小児（6ヶ月〜12歳未満）：体重に応じて200mgまたは300mgを2〜4週ごと。15歳以上（蕁麻疹）：300mgを2週ごと。結節性痒疹：600mg初回→300mg/2週"
    },
    receiptNotes: [
      {
        disease: "アトピー性皮膚炎",
        required: [
          "①医師要件の該当区分（「5年以上の皮膚科診療臨床研修」または「6年以上の臨床経験かつ3年以上のアレルギー診療臨床研修」）",
          "②IGAスコア（0〜4のいずれか）",
          "③全身または頭頸部のEASIスコア（数値）",
          "④体表面積に占めるアトピー性皮膚炎病変の割合（%）",
          "⑤既存治療（ステロイド外用・タクロリムス外用等）で効果不十分であった旨",
          "⑥既存治療の種類と期間",
        ],
        timing: "投与開始時および継続投与ごとに記載。16週後に効果評価必須。"
      },
      {
        disease: "慢性特発性蕁麻疹（CSU）",
        required: [
          "①医師要件の該当区分",
          "②H1抗ヒスタミン薬（増量含む）で効果不十分であった旨",
          "③オマリズマブ（ゾレア）使用歴の有無（使用経験ありの場合は効果不十分の記載）",
          "④UAS7スコア（週間蕁麻疹活動性スコア）",
        ],
        timing: "投与開始時および継続投与ごと。12週時点で効果評価。"
      }
    ],
    lastUpdated: "2025-04-01"
  },

  {
    id: "mitiga",
    name: "ミチーガ",
    genericName: "ネモリズマブ（遺伝子組換え）",
    target: "IL-31受容体A（IL-31シグナルを阻害・かゆみ特異的）",
    diseases: ["アトピー性皮膚炎（そう痒）", "結節性痒疹"],
    dosage: [
      { form: "シリンジ（60mg）", strength: "60mg/mL" },
      { form: "バイアル（30mg）", strength: "30mg/mL（院内投与専用）" },
    ],
    schedule: {
      induction: "【60mgシリンジ・アトピー成人】初回60mg皮下注\n【30mgバイアル・結節性痒疹13歳以上】初回60mg（2バイアル）皮下注",
      maintenance: "【60mgシリンジ】以降60mgを4週ごと皮下注（自己注射可）\n【30mgバイアル・結節性痒疹】以降30mgを4週ごと皮下注（院内投与）",
      selfInjection: true,
      note: "60mgシリンジと30mgバイアルは生物学的同等性が示されていないため互換使用不可。アトピー性皮膚炎には60mgシリンジのみ。結節性痒疹には30mgバイアル（13歳以上）。"
    },
    receiptNotes: [
      {
        disease: "アトピー性皮膚炎",
        required: [
          "①医師要件（皮膚科専門医またはアレルギー専門医）",
          "②既存治療（ステロイド外用・タクロリムス外用等）で効果不十分のそう痒が持続している旨",
          "③そう痒NRS（数値0〜10）",
          "④IGAスコアまたはEASIスコア",
        ],
        timing: "投与開始時および継続投与ごと。"
      },
      {
        disease: "結節性痒疹",
        required: [
          "①医師要件",
          "②既存治療（ステロイド外用Strongest〜Very Strong等）で効果不十分の旨",
          "③そう痒NRS（数値）",
          "④結節の数・分布",
          "⑤30mgバイアル使用の場合：院内投与である旨",
        ],
        timing: "投与開始時および継続投与ごと。"
      }
    ],
    lastUpdated: "2025-04-01"
  },

  {
    id: "ebglyss",
    name: "イブグリース",
    genericName: "レブリキズマブ（遺伝子組換え）",
    target: "IL-13選択的阻害",
    diseases: ["アトピー性皮膚炎"],
    dosage: [
      { form: "シリンジ", strength: "250mg/2mL" },
      { form: "オートインジェクター", strength: "250mg/2mL" },
    ],
    schedule: {
      induction: "初回500mg（250mg×2本）皮下注→2週後500mg（2本）皮下注",
      maintenance: "4週目以降250mgを2週ごと皮下注。反応良好時は4週ごと250mgに延長可。",
      selfInjection: false,
      note: "現時点では自己注射不可（院内投与のみ）。4週ごとへの延長は患者状態に応じて医師判断。逆に2週ごとへの戻しも可。"
    },
    receiptNotes: [
      {
        disease: "アトピー性皮膚炎",
        required: [
          "①医師要件（皮膚科専門医またはアレルギー専門医）",
          "②既存治療で効果不十分である旨",
          "③IGAスコア（数値）",
          "④EASIスコア（数値）",
          "⑤体表面積に占める病変の割合（%）",
          "⑥投与間隔変更の場合：変更理由（延長：良好な治療反応、短縮：症状増悪）",
        ],
        timing: "投与開始時・16週評価時・継続投与ごと。"
      }
    ],
    lastUpdated: "2025-04-01"
  },

  {
    id: "adtralza",
    name: "アドトラーザ",
    genericName: "トラロキヌマブ（遺伝子組換え）",
    target: "IL-13選択的阻害",
    diseases: ["アトピー性皮膚炎"],
    dosage: [
      { form: "シリンジ", strength: "150mg/mL" },
    ],
    schedule: {
      induction: "初回600mg（150mg×4本）皮下注",
      maintenance: "以降300mg（2本）を2週ごと皮下注。反応良好時は4週ごと300mgに延長可（16週以降）。",
      selfInjection: true,
      note: "4週ごとへの延長はEASI-75達成などの治療効果が確認できた場合。"
    },
    receiptNotes: [
      {
        disease: "アトピー性皮膚炎",
        required: [
          "①医師要件",
          "②既存治療で効果不十分である旨",
          "③IGAスコア（数値）",
          "④EASIスコア（数値）",
          "⑤既存治療歴（種類・期間）",
          "⑥4週間隔延長時：治療反応良好の評価根拠",
        ],
        timing: "投与開始時・継続投与ごと。16週時点で効果評価必須。"
      }
    ],
    lastUpdated: "2025-04-01"
  },

  /* ===乾癬=== */
  {
    id: "skyrizi",
    name: "スキリージ",
    genericName: "リサンキズマブ（遺伝子組換え）",
    target: "IL-23（p19サブユニット）阻害",
    diseases: ["尋常性乾癬", "関節症性乾癬", "膿疱性乾癬", "乾癬性紅皮症", "掌蹠膿疱症"],
    dosage: [
      { form: "シリンジ", strength: "75mg/0.83mL" },
    ],
    schedule: {
      induction: "0週・4週・16週に75mg皮下注（計3本）",
      maintenance: "以降12週ごとに75mg皮下注（年4回）",
      selfInjection: true,
      note: "掌蹠膿疱症は2023年承認。維持投与の12週ごとは3ヶ月ごとと同義。"
    },
    receiptNotes: [
      {
        disease: "尋常性乾癬",
        required: [
          "①施設要件（日本皮膚科学会乾癬生物学的製剤使用承認施設）",
          "②既存治療（外用療法・光線療法・内服療法）で効果不十分または施行困難の旨",
          "③BSA（体表面積に占める病変の割合）",
          "④PASIスコア（数値）またはIGAスコア",
          "⑤既存治療歴（種類・期間・効果不十分の理由）",
        ],
        timing: "投与開始時・16週評価時・継続投与ごと。"
      },
      {
        disease: "掌蹠膿疱症",
        required: [
          "①施設要件",
          "②既存治療（外用療法・内服療法）で効果不十分の旨",
          "③PPASIスコア（掌蹠膿疱症面積重症度指数）または病変部位・重症度の記載",
          "④既存治療歴",
        ],
        timing: "投与開始時・継続投与ごと。"
      }
    ],
    lastUpdated: "2025-04-01"
  },

  {
    id: "humira",
    name: "ヒュミラ",
    genericName: "アダリムマブ（遺伝子組換え）",
    target: "TNF-α阻害",
    diseases: ["尋常性乾癬", "関節症性乾癬", "膿疱性乾癬", "乾癬性紅皮症", "化膿性汗腺炎", "ベーチェット病"],
    dosage: [
      { form: "シリンジ", strength: "40mg/0.4mL・40mg/0.8mL" },
      { form: "ペン（オートインジェクター）", strength: "40mg/0.8mL" },
    ],
    schedule: {
      induction: "初回80mg（40mg×2本）皮下注",
      maintenance: "以降40mg（1本）を2週ごと皮下注",
      selfInjection: true,
      note: "化膿性汗腺炎：初回160mg→2週後80mg→4週後以降40mgを1週ごと。"
    },
    receiptNotes: [
      {
        disease: "尋常性乾癬",
        required: [
          "①施設要件",
          "②既存治療で効果不十分の旨",
          "③BSAまたはPASIスコア",
          "④既存治療歴（種類・期間）",
        ],
        timing: "投与開始時・継続投与ごと。"
      },
      {
        disease: "化膿性汗腺炎",
        required: [
          "①既存治療（抗菌薬内服等）で効果不十分の旨",
          "②IHS4スコア（国際化膿性汗腺炎重症度スコア）またはHurley分類",
          "③病変部位・個数",
          "④既存治療歴",
        ],
        timing: "投与開始時・継続投与ごと。"
      }
    ],
    lastUpdated: "2025-04-01"
  },

  {
    id: "cosentyx",
    name: "コセンティクス",
    genericName: "セクキヌマブ（遺伝子組換え）",
    target: "IL-17A阻害",
    diseases: ["尋常性乾癬", "関節症性乾癬", "膿疱性乾癬", "乾癬性紅皮症"],
    dosage: [
      { form: "シリンジ", strength: "150mg/mL" },
      { form: "ペン（オートインジェクター）", strength: "150mg/mL" },
    ],
    schedule: {
      induction: "0・1・2・3・4週に150mgを皮下注（計5本）",
      maintenance: "以降150mgを4週ごと皮下注",
      selfInjection: true,
      note: "効果不十分時は300mgに増量可。小児（6歳以上）の適応あり（体重に応じて75mgまたは150mg）。"
    },
    receiptNotes: [
      {
        disease: "尋常性乾癬",
        required: [
          "①施設要件",
          "②既存治療で効果不十分の旨",
          "③PASIスコアまたはBSA",
          "④既存治療歴",
          "⑤増量の場合：150mg投与での効果不十分の評価",
        ],
        timing: "投与開始時・継続投与ごと。"
      }
    ],
    lastUpdated: "2025-04-01"
  },

  {
    id: "tremfya",
    name: "トレムフィア",
    genericName: "グセルクマブ（遺伝子組換え）",
    target: "IL-23（p19サブユニット）阻害",
    diseases: ["尋常性乾癬", "関節症性乾癬", "膿疱性乾癬", "乾癬性紅皮症"],
    dosage: [
      { form: "シリンジ", strength: "100mg/mL" },
    ],
    schedule: {
      induction: "0週・4週に100mg皮下注（計2本）",
      maintenance: "以降100mgを8週ごと皮下注（年6〜7回）",
      selfInjection: true,
      note: "維持投与は8週ごと（スキリージの12週より頻繁）。"
    },
    receiptNotes: [
      {
        disease: "尋常性乾癬",
        required: [
          "①施設要件",
          "②既存治療で効果不十分の旨",
          "③PASIスコアまたはBSA",
          "④既存治療歴（種類・期間）",
        ],
        timing: "投与開始時・継続投与ごと。"
      }
    ],
    lastUpdated: "2025-04-01"
  },

  {
    id: "bimzelx",
    name: "ビンゼレックス",
    genericName: "ビメキズマブ（遺伝子組換え）",
    target: "IL-17A・IL-17F二重阻害",
    diseases: ["尋常性乾癬", "関節症性乾癬"],
    dosage: [
      { form: "シリンジ（オートインジェクター）", strength: "160mg/mL" },
    ],
    schedule: {
      induction: "0〜16週：320mg（160mg×2本）を2週ごとに皮下注（計9回）",
      maintenance: "16週以降：160mg（1本）を4週ごと皮下注",
      selfInjection: true,
      note: "IL-17AとIL-17Fを二重阻害する唯一の製剤。口腔カンジダ症の発現に注意。"
    },
    receiptNotes: [
      {
        disease: "尋常性乾癬",
        required: [
          "①施設要件",
          "②既存治療で効果不十分の旨",
          "③PASIスコアおよびBSA",
          "④既存治療歴",
          "⑤導入期（0〜16週）継続の場合：2週ごと投与の理由",
        ],
        timing: "投与開始時・継続投与ごと。"
      }
    ],
    lastUpdated: "2025-04-01"
  },

  {
    id: "ilumya",
    name: "イルミア",
    genericName: "チルドラキズマブ（遺伝子組換え）",
    target: "IL-23（p19サブユニット）阻害",
    diseases: ["尋常性乾癬", "膿疱性乾癬", "乾癬性紅皮症"],
    dosage: [
      { form: "シリンジ", strength: "200mg/mL" },
    ],
    schedule: {
      induction: "0週・4週に200mg皮下注（計2本）",
      maintenance: "以降200mgを12週ごと皮下注（年4〜5回）",
      selfInjection: true,
      note: "維持投与はスキリージと同じく12週ごと（3ヶ月ごと）。"
    },
    receiptNotes: [
      {
        disease: "尋常性乾癬",
        required: [
          "①施設要件",
          "②既存治療で効果不十分の旨",
          "③PASIスコアまたはBSA",
          "④既存治療歴",
        ],
        timing: "投与開始時・継続投与ごと。"
      }
    ],
    lastUpdated: "2025-04-01"
  },

  /* ===慢性蕁麻疹=== */
  {
    id: "xolair",
    name: "ゾレア",
    genericName: "オマリズマブ（遺伝子組換え）",
    target: "IgE阻害（抗IgE抗体）",
    diseases: ["慢性特発性蕁麻疹（CSU）"],
    dosage: [
      { form: "シリンジ", strength: "75mg/0.5mL・150mg/mL" },
    ],
    schedule: {
      induction: "体重とIgE値による用量設定表に基づき75mg・150mg・300mgから選択。初回から維持量を投与。",
      maintenance: "4週ごとに皮下注（通常300mg）。症状コントロール後は休薬も検討。",
      selfInjection: false,
      note: "CSUでは通常300mgを使用。用量は体重×IgE値の対応表で決定（75・150・300mgの3種）。蕁麻疹の場合はIgE値に関わらず300mgが推奨されることが多い。"
    },
    receiptNotes: [
      {
        disease: "慢性特発性蕁麻疹",
        required: [
          "①H1抗ヒスタミン薬（通常用量および増量）で効果不十分の旨",
          "②UAS7スコア（週間蕁麻疹活動性スコア：0〜42）",
          "③投与量の根拠（体重・IgE値）",
          "④既存治療（抗ヒスタミン薬の種類・用量・期間）",
        ],
        timing: "投与開始時・継続投与ごと。12週時点での効果評価が推奨。"
      }
    ],
    lastUpdated: "2025-04-01"
  },
]

/* 最終更新情報 */
export const biologicsLastUpdated = "2025-04-01"
export const biologicsNextUpdate = "2025-06-01"

/* 疾患カテゴリ（フィルタ用） */
export const biologicsDiseaseCategories = [
  "すべて",
  "アトピー性皮膚炎",
  "乾癬",
  "慢性蕁麻疹",
  "結節性痒疹",
  "化膿性汗腺炎",
] as const

export type BiologicsDiseaseCategory = (typeof biologicsDiseaseCategories)[number]
