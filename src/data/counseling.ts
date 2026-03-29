export type ClearCheckItem = {
  id: string;
  text: string;
  category: "contraindication" | "history" | "consent" | "preparation";
  required: boolean;
  note?: string;
};

export type TalkScript = {
  phase: string;
  script: string;
  tips?: string;
};

export type CounselingGuide = {
  id: string;
  treatment: string;
  clearChecks: ClearCheckItem[];
  talkScripts: TalkScript[];
  commonQuestions: { question: string; answer: string }[];
};

export const counselingGuides: CounselingGuide[] = [
  {
    id: "cg01",
    treatment: "医療脱毛（ジェントルマックスプロプラス）",
    clearChecks: [
      {id:"dc01",text:"日焼けしていないか（4週間以内の日焼け禁忌）",category:"contraindication",required:true,note:"日焼け肌への照射は火傷・色素沈着リスク大"},
      {id:"dc02",text:"光線過敏症・光線過敏を起こす薬を服用していないか",category:"contraindication",required:true,note:"テトラサイクリン系・フルオロキノロン系・利尿薬等"},
      {id:"dc03",text:"妊娠中・授乳中でないか",category:"contraindication",required:true,note:"妊娠中の医療脱毛は原則禁忌"},
      {id:"dc04",text:"施術部位にステロイド外用を使用していないか",category:"contraindication",required:false,note:"ステロイドで皮膚が薄くなっている場合は注意"},
      {id:"dc05",text:"白毛・金毛・赤毛の割合を確認した",category:"history",required:true,note:"メラニンのない毛は効果不十分であることを事前説明"},
      {id:"dc06",text:"他院での脱毛歴・前回照射からの期間",category:"history",required:true,note:"同部位への連続照射は皮膚ダメージリスク"},
      {id:"dc07",text:"施術前の自己処理（剃毛）を確認した",category:"preparation",required:true,note:"毛が長いと熱が表面に集中し火傷リスク"},
      {id:"dc08",text:"同意書の記入・署名を確認した",category:"consent",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"本日は医療脱毛にご来院いただきありがとうございます。当院ではジェントルマックスプロプラスという厚生省承認の医療用レーザーを使用しております。エステ脱毛と異なり、医師の管理のもとで行う医療行為ですので、安全性と効果の両面で高い水準を維持しています。",tips:"クリニックへの信頼感を最初に伝える"},
      {phase:"効果説明",script:"毛根のメラニン色素にレーザーが反応して熱で毛包を破壊します。そのため、白毛・金毛・産毛への効果は出にくいこと、そして日焼けした肌への照射はできないことを覚えておいてください。効果には個人差がありますが、顔・VIOを含む全身で6〜10回程度を目安にお考えください。",tips:"効果の限界と回数の目安を正直に伝える"},
      {phase:"禁忌確認",script:"安全に施術を行うために、いくつか確認させてください。最後に日焼けをされたのはいつ頃ですか？光線過敏症や、光に反応しやすいお薬は服用されていますか？妊娠の可能性はありませんか？",tips:"必ず問診票と口頭確認の両方で確認"},
      {phase:"施術後説明",script:"施術後は赤みや毛嚢炎が出ることがありますが、1〜3日で落ち着くことがほとんどです。施術後4週間は日焼けを避け、SPF50以上の日焼け止めを使用してください。保湿もしっかり行ってください。次回は4〜8週後にご来院いただきます。",tips:"アフターケアは書面でも渡す"},
    ],
    commonQuestions: [
      {question:"何回で終わりますか？",answer:"個人差がありますが、顔・VIOを含む全身で6〜10回が目安です。毛の周期に合わせて4〜8週間隔で来院いただきます。"},
      {question:"痛みはありますか？",answer:"輪ゴムで弾かれる程度の痛みを感じる方が多いです。VIOはやや強く感じやすいです。麻酔クリームの使用についてご相談ください。"},
      {question:"エステ脱毛との違いは？",answer:"医療脱毛は医師の管理のもとで行う医療行為で、使用できるレーザーの出力が高く、エステより少ない回数で効果が期待できます。"},
    ],
  },
  {
    id: "cg02",
    treatment: "ポテンツァ（RFマイクロニードル）",
    clearChecks: [
      {id:"pc01",text:"ケロイド体質でないか（既往確認）",category:"contraindication",required:true,note:"ケロイド体質の場合は絶対禁忌"},
      {id:"pc02",text:"活動性のニキビ・感染症が施術部位にないか",category:"contraindication",required:true},
      {id:"pc03",text:"凝固障害・抗凝固薬（ワーファリン・DOAC等）を服用していないか",category:"contraindication",required:true,note:"出血リスクの増大"},
      {id:"pc04",text:"ペースメーカー・電気デバイスを使用していないか",category:"contraindication",required:true,note:"RFエネルギーがデバイスに影響"},
      {id:"pc05",text:"妊娠中・授乳中でないか",category:"contraindication",required:true},
      {id:"pc06",text:"金属アレルギー（チタン以外）の確認",category:"history",required:false,note:"針はチタン製。金・銀・ニッケルアレルギーは原則問題なし"},
      {id:"pc07",text:"直近の日焼けの有無",category:"contraindication",required:true,note:"炎症後色素沈着リスク"},
      {id:"pc08",text:"ダウンタイム（赤み3〜7日）の理解と同意",category:"consent",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"ポテンツァは微細な針（マイクロニードル）から高周波（RF）エネルギーを直接真皮に届けることで、コラーゲンの産生を促す施術です。毛穴・ニキビ跡の凹み・肌のキメを改善する効果が期待できます。",tips:"作用機序をわかりやすく説明する"},
      {phase:"禁忌確認",script:"安全に施術を受けていただくために確認させてください。過去に傷がケロイド状に盛り上がったことはありますか？血液をさらさらにするお薬を飲んでいますか？ペースメーカーや体内に電気的なデバイスを入れていますか？",tips:"ケロイド確認が最重要"},
      {phase:"ダウンタイム説明",script:"施術後3〜7日間、赤みと軽い腫れが出ることがあります。メイクは翌日から可能ですが、施術当日は激しい運動・飲酒・サウナはお控えください。効果が出るまで1〜3ヶ月かかることをご承知おきください。",tips:"ダウンタイムは施術前に必ず説明"},
    ],
    commonQuestions: [
      {question:"ニキビ跡の凹みに効果はありますか？",answer:"ローリング型・ボックスカー型には効果が期待できます。アイスピック型は効きにくい場合があります。複数回施術で改善が期待できます。"},
      {question:"何回必要ですか？",answer:"1〜3ヶ月に1回を3〜5回繰り返すことで効果が安定します。"},
    ],
  },
  {
    id: "cg03",
    treatment: "IPLノーリス（光治療・フォトフェイシャル）",
    clearChecks: [
      {id:"ic01",text:"光線過敏症・光線過敏を起こす薬を服用していないか",category:"contraindication",required:true,note:"テトラサイクリン系・NSAIDs・利尿薬等"},
      {id:"ic02",text:"日焼け（4週間以内）していないか",category:"contraindication",required:true},
      {id:"ic03",text:"妊娠中でないか",category:"contraindication",required:true},
      {id:"ic04",text:"ポルフィリン症でないか",category:"contraindication",required:true,note:"光照射で悪化する代謝疾患"},
      {id:"ic05",text:"てんかん・光過敏性発作の既往がないか",category:"contraindication",required:true},
      {id:"ic06",text:"施術部位に入れ墨・タトゥーがないか",category:"contraindication",required:false,note:"タトゥー部位は照射禁忌"},
      {id:"ic07",text:"肝斑の有無を確認した（高出力禁忌）",category:"history",required:true,note:"肝斑への高出力IPL照射は悪化リスク"},
      {id:"ic08",text:"期待値の確認（5〜6回コース推奨）",category:"consent",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"IPLノーリスは複数の波長の光を同時に照射することで、シミ・そばかす・赤み・毛穴・小じわなど複数のお悩みを一度にアプローチできる光治療です。ダウンタイムがほとんどなく、お仕事の前後にも受けやすい施術です。",tips:"IPLの総合的な効果とダウンタイムの少なさをアピール"},
      {phase:"肝斑確認",script:"頬の広い範囲に均一な褐色のシミがある場合、肝斑の可能性があります。肝斑には通常の高出力照射は逆効果になることがあるため、特別な低出力設定で対応します。シミの様子を詳しく教えてください。",tips:"肝斑の確認は必須"},
      {phase:"コース説明",script:"IPL光治療は1回でも効果を感じていただけますが、5〜6回のコース施術で効果が安定します。1ヶ月に1回のペースで受けていただくことをお勧めしています。施術後は必ずSPF50以上の日焼け止めをお使いください。",tips:"コース推奨と日焼け止めの重要性を説明"},
    ],
    commonQuestions: [
      {question:"シミが全部なくなりますか？",answer:"IPLで改善しやすいシミ（老人性色素斑・そばかす）と改善しにくいシミ（肝斑・深いシミ）があります。カウンセリングでシミの種類を確認してからご提案します。"},
      {question:"肝斑にはどうですか？",answer:"肝斑には高出力のIPL照射は禁忌です。当院ではMIINレーザーの低出力トーニング照射や、美白内服・外用を組み合わせた治療を行っています。"},
    ],
  },
  {
    id: "cg04",
    treatment: "マッサージピール（PRX-T33）",
    clearChecks: [
      {id:"mp01",text:"活動性の炎症性ニキビが施術部位にないか",category:"contraindication",required:true},
      {id:"mp02",text:"開いた傷・湿疹・皮膚炎がないか",category:"contraindication",required:true},
      {id:"mp03",text:"ケロイド体質でないか",category:"contraindication",required:false},
      {id:"mp04",text:"妊娠中でないか",category:"contraindication",required:true,note:"TCA33%の安全性データなし"},
      {id:"mp05",text:"過去のケミカルピーリングの反応・トラブルの有無",category:"history",required:false},
      {id:"mp06",text:"施術後の日焼け止め使用の約束",category:"consent",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"マッサージピールはTCA（トリクロロ酢酸）33%と過酸化水素を配合した特殊なピーリング剤で、マッサージしながら浸透させる独自技術です。ダウンタイムがほとんどなく、コラーゲン産生促進・毛穴改善・くすみ改善が期待できます。",tips:"ダウンタイムが少ない点が大きなメリット"},
      {phase:"施術後説明",script:"施術後は軽い赤みが出ることがありますが、数時間で改善します。皮むけはほとんどありません。紫外線に対して肌が敏感になりますので、日焼け止め（SPF50以上）を必ずお使いください。翌日からメイクも可能です。",tips:"シンプルなアフターケアで患者満足度を高める"},
    ],
    commonQuestions: [
      {question:"サリチル酸ピーリングとどう違いますか？",answer:"サリチル酸ピーリングは皮脂溶解・コメド除去に特化。マッサージピールはコラーゲン産生促進効果が高く、ニキビ跡・くすみ・ハリ改善に向いています。"},
    ],
  },
];
