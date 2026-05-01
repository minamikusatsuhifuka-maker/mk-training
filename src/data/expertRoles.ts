// エキスパートに求められる働き方の初期データ
// 5ロール × 専門知識/スキル・行動/マインドセットの3セクション

export type ExpertLevel = "basic" | "intermediate" | "advanced";
export type ExpertCategory = "knowledge" | "skill" | "mindset" | "action";

export type ExpertItem = {
  id: string;
  title: string;
  detail: string;
  level: ExpertLevel;
  category: ExpertCategory;
};

export type ExpertSection = {
  id: string;
  title: string;
  items: ExpertItem[];
};

export type ExpertRole = {
  id: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  sections: ExpertSection[];
};

export const EXPERT_ROLES: ExpertRole[] = [
  {
    id: "medical-office",
    title: "医療事務",
    icon: "💼",
    color: "blue",
    description:
      "保険診療の要として、正確・迅速・丁寧な事務処理でクリニックを支える",
    sections: [
      {
        id: "knowledge",
        title: "専門知識",
        items: [
          {
            id: "mo-k1",
            title: "保険診療の算定ルール完全習得",
            detail:
              "初診料・再診料・処置料・薬剤料など全算定項目を正確に理解し、漏れなく算定できる。2年ごとの改定にも対応できる。",
            level: "advanced",
            category: "knowledge",
          },
          {
            id: "mo-k2",
            title: "レセプト審査対策の知識",
            detail:
              "返戻・査定の原因パターンを把握し、事前に防げる。生物学的製剤の摘要欄記載事項を完璧に理解している。",
            level: "advanced",
            category: "knowledge",
          },
          {
            id: "mo-k3",
            title: "皮膚科特有の算定知識",
            detail:
              "光線療法・アレルギー検査・生物学的製剤加算・美容と保険の区分など皮膚科特有の算定を熟知している。",
            level: "intermediate",
            category: "knowledge",
          },
          {
            id: "mo-k4",
            title: "医療制度・保険制度の理解",
            detail:
              "高額療養費制度・限度額適用認定証・各種公費負担制度を理解し、患者に適切に案内できる。",
            level: "intermediate",
            category: "knowledge",
          },
        ],
      },
      {
        id: "skill",
        title: "スキル・行動",
        items: [
          {
            id: "mo-s1",
            title: "電子カルテ・レセコンの高速・正確な操作",
            detail:
              "電子カルテへの入力・修正・照会を迅速かつ正確に行える。ショートカットキーを活用し業務効率を最大化している。",
            level: "advanced",
            category: "skill",
          },
          {
            id: "mo-s2",
            title: "レセプト点検の徹底",
            detail:
              "毎月の請求前に全レセプトを点検し、記載漏れ・算定誤りを自ら発見・修正できる。",
            level: "advanced",
            category: "skill",
          },
          {
            id: "mo-s3",
            title: "患者対応（受付・会計）の質",
            detail:
              "患者を笑顔で迎え、待ち時間・費用・次回予約などの案内を丁寧かつ的確に行える。クレームも冷静に対応できる。",
            level: "intermediate",
            category: "skill",
          },
          {
            id: "mo-s4",
            title: "後輩・新人への指導",
            detail:
              "算定ルール・電子カルテ操作・患者対応を新人に分かりやすく教えられる。マニュアルの整備・更新も担える。",
            level: "advanced",
            category: "skill",
          },
        ],
      },
      {
        id: "mindset",
        title: "マインドセット",
        items: [
          {
            id: "mo-m1",
            title: "正確性へのこだわり",
            detail:
              "算定ミス・入力ミスは患者・クリニック双方に損害を与えるという意識を持ち、確認を怠らない。",
            level: "basic",
            category: "mindset",
          },
          {
            id: "mo-m2",
            title: "医療チームの一員としての自覚",
            detail:
              "事務だけでなく医療チーム全体の動きを理解し、医師・看護師・カウンセラーと連携できる。",
            level: "intermediate",
            category: "mindset",
          },
        ],
      },
    ],
  },
  {
    id: "clerk",
    title: "医療クラーク",
    icon: "📋",
    color: "teal",
    description:
      "医師の右腕として診療を補助し、保険・美容両面でクリニックの診療品質を高める",
    sections: [
      {
        id: "knowledge",
        title: "専門知識",
        items: [
          {
            id: "cl-k1",
            title: "医師事務作業補助の法的範囲の完全理解",
            detail:
              "医師の指示のもとで行える業務範囲（代行入力・文書作成補助等）を正確に理解し、逸脱しない。",
            level: "basic",
            category: "knowledge",
          },
          {
            id: "cl-k2",
            title: "皮膚科疾患・治療の知識",
            detail:
              "アトピー・乾癬・蕁麻疹など主要疾患の病態・治療法・使用薬剤を理解し、カルテ入力補助に活かせる。",
            level: "intermediate",
            category: "knowledge",
          },
          {
            id: "cl-k3",
            title: "生物学的製剤の投与管理知識",
            detail:
              "デュピクセント・スキリージ等の投与スケジュール・レセプト摘要欄記載事項を完全に習得している。",
            level: "advanced",
            category: "knowledge",
          },
          {
            id: "cl-k4",
            title: "美容施術の知識",
            detail:
              "院内の全美容施術（IPL・レーザー・ポテンツァ等）の適応・禁忌・ダウンタイムを理解している。",
            level: "intermediate",
            category: "knowledge",
          },
        ],
      },
      {
        id: "skill",
        title: "スキル・行動",
        items: [
          {
            id: "cl-s1",
            title: "カルテ代行入力の速度と正確性",
            detail:
              "医師の口述・メモを正確にカルテに入力できる。入力後の医師確認を必ず取り、承認を得るフローを徹底する。",
            level: "advanced",
            category: "skill",
          },
          {
            id: "cl-s2",
            title: "各種文書作成補助",
            detail:
              "紹介状・返書・診断書・同意書の作成補助を医師の指示のもとで行える。書式・敬語を熟知している。",
            level: "intermediate",
            category: "skill",
          },
          {
            id: "cl-s3",
            title: "美容カウンセリングの実施",
            detail:
              "施術前のカウンセリングを独立して行える。禁忌確認・施術説明・同意取得・料金説明まで一貫して対応できる。",
            level: "advanced",
            category: "skill",
          },
        ],
      },
      {
        id: "mindset",
        title: "マインドセット",
        items: [
          {
            id: "cl-m1",
            title: "医師のパートナーとしての自覚",
            detail:
              "医師の負担を軽減し、診療に集中できる環境を作ることが自分の使命であると理解している。",
            level: "basic",
            category: "mindset",
          },
          {
            id: "cl-m2",
            title: "保険×美容のハイブリッド対応力",
            detail:
              "同一患者が保険診療と美容診療を受ける場合の対応を理解し、シームレスに案内できる。",
            level: "advanced",
            category: "mindset",
          },
        ],
      },
    ],
  },
  {
    id: "counselor",
    title: "カウンセラー",
    icon: "💬",
    color: "orange",
    description:
      "患者の心に寄り添い、最適な施術提案と信頼関係構築で美容診療の価値を最大化する",
    sections: [
      {
        id: "knowledge",
        title: "専門知識",
        items: [
          {
            id: "co-k1",
            title: "全美容施術の完全習得",
            detail:
              "院内の全施術（IPL・MIINレーザー・ポテンツァ・トライフィル・脱毛等）の適応・禁忌・効果・回数・料金を完全に習得している。",
            level: "advanced",
            category: "knowledge",
          },
          {
            id: "co-k2",
            title: "皮膚科学の基礎知識",
            detail:
              "肌の構造・メラニン生成・ニキビのメカニズム・老化のプロセスを理解し、患者への説明に活かせる。",
            level: "intermediate",
            category: "knowledge",
          },
          {
            id: "co-k3",
            title: "スキンケア製品の知識",
            detail:
              "院内販売の全スキンケア製品の成分・効果・使用方法・適する肌タイプを理解し、適切に提案できる。",
            level: "intermediate",
            category: "knowledge",
          },
        ],
      },
      {
        id: "skill",
        title: "スキル・行動",
        items: [
          {
            id: "co-s1",
            title: "ヒアリング・共感力",
            detail:
              "患者の悩みを深くヒアリングし、感情的なニーズ（なぜ改善したいのか）まで引き出せる。「まず理解に徹する」姿勢を実践している。",
            level: "advanced",
            category: "skill",
          },
          {
            id: "co-s2",
            title: "施術提案とクロージング",
            detail:
              "患者のニーズに合わせた最適な施術を提案し、納得感のある形でクロージングできる。押し売りではなく、四方よしの精神で提案する。",
            level: "advanced",
            category: "skill",
          },
          {
            id: "co-s3",
            title: "アフターフォロー",
            detail:
              "施術後の経過確認・次回提案を自発的に行い、リピーター育成に貢献できる。患者との長期的な信頼関係を構築している。",
            level: "advanced",
            category: "skill",
          },
          {
            id: "co-s4",
            title: "トラブル・クレーム対応",
            detail:
              "施術結果への不満・副作用等のクレームを冷静に受け止め、医師と連携して適切に解決できる。",
            level: "intermediate",
            category: "skill",
          },
        ],
      },
      {
        id: "mindset",
        title: "マインドセット",
        items: [
          {
            id: "co-m1",
            title: "患者の人生を豊かにするという意識",
            detail:
              "美容施術は「見た目を変える」だけでなく「患者の自信・笑顔・人生を豊かにする」という意識で関わる。",
            level: "basic",
            category: "mindset",
          },
          {
            id: "co-m2",
            title: "自分自身が美しくあること",
            detail:
              "美容を提案するプロとして、自身のスキンケア・身だしなみ・表情に気を配る。説得力のある提案者であること。",
            level: "basic",
            category: "mindset",
          },
        ],
      },
    ],
  },
  {
    id: "nurse",
    title: "看護師",
    icon: "👩‍⚕️",
    color: "pink",
    description:
      "高度な医療知識と技術で安全な診療を支え、患者の不安を和らげる医療のプロ",
    sections: [
      {
        id: "knowledge",
        title: "専門知識",
        items: [
          {
            id: "nu-k1",
            title: "皮膚科疾患・治療の高度な知識",
            detail:
              "アトピー・乾癬・蕁麻疹・ニキビ・帯状疱疹等の疾患の病態・治療・薬剤を医療職として深く理解している。",
            level: "advanced",
            category: "knowledge",
          },
          {
            id: "nu-k2",
            title: "生物学的製剤の完全習得",
            detail:
              "デュピクセント・スキリージ・コセンティクス等の全生物学的製剤の投与方法・副作用・観察点・自己注射指導を習得している。",
            level: "advanced",
            category: "knowledge",
          },
          {
            id: "nu-k3",
            title: "アナフィラキシー対応",
            detail:
              "アナフィラキシーの症状・対応手順・エピペン使用・緊急連絡体制を完全に理解し、即座に行動できる。定期的に訓練している。",
            level: "advanced",
            category: "knowledge",
          },
          {
            id: "nu-k4",
            title: "美容施術の医学的知識",
            detail:
              "レーザー・IPL・注射系施術の機序・禁忌・リスク・アフターケアを医療職として深く理解している。",
            level: "intermediate",
            category: "knowledge",
          },
        ],
      },
      {
        id: "skill",
        title: "スキル・行動",
        items: [
          {
            id: "nu-s1",
            title: "確実・安全な医療処置",
            detail:
              "注射・採血・処置を正確かつ迅速に行える。無菌操作・感染対策を徹底している。患者の苦痛を最小化する技術を持つ。",
            level: "advanced",
            category: "skill",
          },
          {
            id: "nu-s2",
            title: "自己注射指導の質",
            detail:
              "デュピクセント等の自己注射指導を患者の理解度に合わせて丁寧に行える。手技確認・保管方法・副作用説明まで一貫して指導できる。",
            level: "advanced",
            category: "skill",
          },
          {
            id: "nu-s3",
            title: "患者観察・異常の早期発見",
            detail:
              "投与後の観察・バイタル測定を確実に行い、異常の早期発見・医師への迅速な報告ができる。",
            level: "advanced",
            category: "skill",
          },
          {
            id: "nu-s4",
            title: "スキンケア・服薬指導",
            detail:
              "FTU(フィンガーチップユニット)を用いたステロイド外用指導・保湿剤の正しい塗り方指導を実践できる。",
            level: "intermediate",
            category: "skill",
          },
        ],
      },
      {
        id: "mindset",
        title: "マインドセット",
        items: [
          {
            id: "nu-m1",
            title: "患者安全を最優先にする意識",
            detail:
              "医療事故・インシデントを防ぐため、指差し確認・ダブルチェック・報告・連絡・相談を徹底する。",
            level: "basic",
            category: "mindset",
          },
          {
            id: "nu-m2",
            title: "継続的な学習",
            detail:
              "生物学的製剤・美容医療は進化が速い。自主的に最新情報を収集し、チームに還元する姿勢を持つ。",
            level: "intermediate",
            category: "mindset",
          },
        ],
      },
    ],
  },
  {
    id: "all",
    title: "全スタッフ共通",
    icon: "🌱",
    color: "teal",
    description:
      "ロールを超えて南草津皮フ科のスタッフ全員に求められる姿勢・行動・マインドセット",
    sections: [
      {
        id: "philosophy",
        title: "クリニック理念の体現",
        items: [
          {
            id: "al-p1",
            title: "ミッション・ビジョンの体現",
            detail:
              "「患者様の人生好転・物心両面の幸福への貢献」というミッションを言葉ではなく行動で示す。全ての判断軸がここに戻ってくる。",
            level: "basic",
            category: "mindset",
          },
          {
            id: "al-p2",
            title: "四方よしの実践",
            detail:
              "患者様・スタッフ・クリニック・社会の四方にとって良い選択をする。自分だけ・患者だけが得をする判断はしない。",
            level: "basic",
            category: "mindset",
          },
          {
            id: "al-p3",
            title: "成功の八原則の実践",
            detail:
              "ビジョン・コミットメント・冒険・パートナーシップ・正直・シェア・責任・凡事徹底を日々の行動で実践する。",
            level: "intermediate",
            category: "mindset",
          },
        ],
      },
      {
        id: "behavior",
        title: "凡事徹底",
        items: [
          {
            id: "al-b1",
            title: "挨拶・笑顔・感謝の徹底",
            detail:
              "スタッフ同士・患者への挨拶、笑顔の応対、感謝の言葉を当たり前のこととして徹底する。これが全ての基盤。",
            level: "basic",
            category: "action",
          },
          {
            id: "al-b2",
            title: "時間を守る・報連相の徹底",
            detail:
              "遅刻・無断欠勤をしない。問題が起きたら隠さず速やかに報告・連絡・相談する。チームへの信頼が基本。",
            level: "basic",
            category: "action",
          },
          {
            id: "al-b3",
            title: "清潔感・身だしなみ",
            detail:
              "医療・美容のプロとして清潔感のある外見を保つ。患者の目に映る全てが「クリニックの品質」である。",
            level: "basic",
            category: "action",
          },
        ],
      },
      {
        id: "growth",
        title: "自己成長",
        items: [
          {
            id: "al-g1",
            title: "学習するクリニックの一員として学び続ける",
            detail:
              "このアプリのクイズ・症例学習・ロールプレイを活用し、日々の学習を習慣にする。知識は患者への貢献に直結する。",
            level: "basic",
            category: "action",
          },
          {
            id: "al-g2",
            title: "先払いの姿勢",
            detail:
              "見返りを求めずに貢献する先払いの姿勢を持つ。学んだことをシェアする、困っている同僚を助ける、が豊かさを生む。",
            level: "intermediate",
            category: "mindset",
          },
          {
            id: "al-g3",
            title: "インサイドアウト",
            detail:
              "環境や他者のせいにせず、「自分が変わる」ことを出発点にする。主体的に考え・選択し・行動する。",
            level: "intermediate",
            category: "mindset",
          },
        ],
      },
    ],
  },
];
