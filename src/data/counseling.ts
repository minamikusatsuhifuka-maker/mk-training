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
  {
    id: "cg05",
    treatment: "MIINレーザー（美人レーザー）",
    clearChecks: [
      {id:"ml01",text:"日焼けしていないか（照射前の日焼け禁忌）",category:"contraindication",required:true,note:"日焼け肌への照射は火傷・色素沈着リスク"},
      {id:"ml02",text:"光線過敏症・光線過敏を起こす薬を服用していないか",category:"contraindication",required:true},
      {id:"ml03",text:"妊娠中でないか",category:"contraindication",required:true},
      {id:"ml04",text:"肝斑の有無を確認した（高出力禁忌）",category:"history",required:true,note:"肝斑への高出力照射は悪化リスク"},
      {id:"ml05",text:"過去のレーザー治療歴を確認した",category:"history",required:true,note:"直近のレーザー照射との間隔を確認"},
      {id:"ml06",text:"ダウンタイム（かさぶた形成・1-2週剥離）の理解と同意",category:"consent",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"MIINレーザーはシミ・色素斑に対してピンポイントでレーザーを照射し、メラニン色素を破壊する治療です。ターゲットとなるシミの種類に応じて出力を調整します。",tips:"シミ・色素斑へのレーザー治療であることを伝える"},
      {phase:"禁忌確認",script:"安全に施術を行うために確認させてください。最近日焼けをされましたか？光に反応しやすいお薬は飲んでいますか？妊娠の可能性はありませんか？また、頬の広い範囲に肝斑がないか確認させてください。",tips:"肝斑の有無は特に重要"},
      {phase:"施術後説明",script:"照射部位にはかさぶたが形成されます。1〜2週間で自然に剥がれ落ちますので、無理にはがさないでください。かさぶたが取れるまでは保護テープを貼っていただきます。日焼け止めの徹底もお願いいたします。",tips:"かさぶた形成→1-2週剥離の流れを事前説明"},
    ],
    commonQuestions: [
      {question:"1回で取れますか？",answer:"シミの種類・深さによります。浅い老人性色素斑は1回で改善することもありますが、深いシミや複数層にまたがるものは複数回必要です。"},
      {question:"肝斑には使えますか？",answer:"肝斑への高出力照射は禁忌です。低出力トーニング照射で対応する場合がありますが、内服・外用との併用が基本です。"},
    ],
  },
  {
    id: "cg06",
    treatment: "アグネス（絶縁針RF）",
    clearChecks: [
      {id:"ag01",text:"ケロイド体質でないか（既往確認）",category:"contraindication",required:true,note:"ケロイド体質の場合は禁忌"},
      {id:"ag02",text:"活動性のニキビ・感染症が施術部位にないか",category:"contraindication",required:true},
      {id:"ag03",text:"ペースメーカー・電気デバイスを使用していないか",category:"contraindication",required:true,note:"RFエネルギーがデバイスに影響"},
      {id:"ag04",text:"妊娠中でないか",category:"contraindication",required:true},
      {id:"ag05",text:"ダウンタイム（赤み・腫れ）の理解と同意",category:"consent",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"アグネスは絶縁針を用いてRF（高周波）エネルギーを皮脂腺に直接届け、皮脂腺を選択的に破壊する治療です。繰り返すニキビや毛穴の開きに根本的なアプローチが可能です。",tips:"皮脂腺破壊による根本治療であることを伝える"},
      {phase:"施術後説明",script:"施術後は赤みや腫れが出ることがありますが、数日で改善します。施術当日は激しい運動・飲酒・サウナはお控えください。効果を安定させるために複数回の施術をお勧めしています。",tips:"施術後のケアと複数回の必要性を説明"},
    ],
    commonQuestions: [
      {question:"何回必要ですか？",answer:"症状の程度により異なりますが、1〜3回の施術を推奨しています。1回でも皮脂腺が破壊された箇所は再発しにくくなります。"},
    ],
  },
  {
    id: "cg07",
    treatment: "メソナJ（エレクトロポレーション）",
    clearChecks: [
      {id:"mj01",text:"ペースメーカー・電気デバイスを使用していないか",category:"contraindication",required:true,note:"電気パルスがデバイスに影響する可能性"},
      {id:"mj02",text:"施術部位に感染症がないか",category:"contraindication",required:true},
      {id:"mj03",text:"導入成分に対するアレルギーがないか",category:"history",required:true,note:"使用する薬剤の成分を事前に確認"},
      {id:"mj04",text:"ダウンタイム（ほぼなし）の説明と同意",category:"consent",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"メソナJは電気穿孔法（エレクトロポレーション）を用いて、針を使わずに有効成分を肌の深部まで導入する施術です。イオン導入の約20倍の浸透力があり、ヒアルロン酸やビタミンCなど分子の大きい成分も効率的に届けることができます。",tips:"電気穿孔法で有効成分導入する仕組みを説明"},
    ],
    commonQuestions: [
      {question:"針なしで本当に効果はありますか？",answer:"電気パルスで一時的に細胞膜に微細な穴を開けるため、針を使わなくても有効成分を真皮層まで届けることができます。イオン導入より浸透力が高く、痛みやダウンタイムもほぼありません。"},
    ],
  },
  {
    id: "cg08",
    treatment: "キュアジェット（水流ピーリング）",
    clearChecks: [
      {id:"cj01",text:"施術部位に開いた傷がないか",category:"contraindication",required:true},
      {id:"cj02",text:"敏感肌・皮膚トラブルの有無を確認した",category:"history",required:true,note:"極度の敏感肌は刺激に注意"},
      {id:"cj03",text:"妊娠中でないか",category:"contraindication",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"キュアジェットは高圧水流ジェットを用いて肌表面の古い角質や毛穴の汚れを除去するピーリング施術です。薬剤を使わないため肌への負担が少なく、敏感肌の方でも受けやすい治療です。",tips:"高圧水流ジェットピーリングの特徴を説明"},
    ],
    commonQuestions: [
      {question:"通常のピーリングとの違いは何ですか？",answer:"通常のケミカルピーリングは酸で角質を溶解しますが、キュアジェットは水流の物理的な力で角質を除去します。薬剤を使わないため肌への化学的刺激が少なく、敏感肌の方にも適しています。"},
    ],
  },
  {
    id: "cg09",
    treatment: "プラズマペン（スポットレス）",
    clearChecks: [
      {id:"pp01",text:"ケロイド体質でないか（既往確認）",category:"contraindication",required:true,note:"ケロイド体質は禁忌"},
      {id:"pp02",text:"悪性腫瘍の除外を確認した（ダーモスコピー等）",category:"history",required:true,note:"悪性病変でないことを確認してから施術"},
      {id:"pp03",text:"抗凝固薬を服用していないか",category:"contraindication",required:true,note:"出血・治癒遅延リスク"},
      {id:"pp04",text:"かさぶた後のケア（自然剥離まで触らない）に同意した",category:"consent",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"プラズマペンはプラズマエネルギーで表皮を瞬間的に炭化させ、イボやホクロなどの隆起性病変を除去する施術です。メスを使わないため傷跡が残りにくく、ピンポイントで施術できます。",tips:"プラズマで表皮炭化→除去の仕組みを説明"},
      {phase:"施術後説明",script:"施術後はかさぶたが形成されます。自然に剥がれ落ちるまで無理にはがさないでください。通常1〜2週間で剥離します。日焼けを避け、保護テープの使用をお願いします。",tips:"かさぶた自然剥離を待つことが重要"},
    ],
    commonQuestions: [
      {question:"ホクロは全部取れますか？",answer:"小さく浅いホクロは1回で除去できることが多いですが、大きいもの・深いものは複数回必要な場合があります。また、悪性の可能性がある場合は切除生検が優先されます。"},
    ],
  },
  {
    id: "cg10",
    treatment: "AGA治療（男性型脱毛症）",
    clearChecks: [
      {id:"at01",text:"前立腺癌・肝臓病の既往がないか",category:"contraindication",required:true,note:"フィナステリドは前立腺癌マーカー(PSA)に影響。肝機能障害リスク"},
      {id:"at02",text:"女性（特に妊婦）への暴露リスクを説明した",category:"consent",required:true,note:"フィナステリド・デュタステリドは妊婦触れること禁忌。経皮吸収で胎児に影響"},
      {id:"at03",text:"性機能障害の可能性について同意を得た",category:"consent",required:true,note:"リビドー低下・勃起障害等の副作用の可能性"},
      {id:"at04",text:"効果発現まで3〜6ヶ月かかることを説明した",category:"consent",required:true},
      {id:"at05",text:"血液検査（肝機能・PSA等）の実施または予定を確認した",category:"preparation",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"AGA治療ではフィナステリドまたはデュタステリドの内服でDHT（脱毛原因ホルモン）を抑制し、ミノキシジルの外用または内服で発毛を促進します。この2つを組み合わせることで、より高い効果が期待できます。",tips:"フィナステリド/デュタステリド+ミノキシジルの併用を説明"},
      {phase:"禁忌説明",script:"フィナステリド・デュタステリドは女性、特に妊婦の方が触れることは絶対に禁忌です。経皮吸収により胎児の生殖器発達に影響する可能性があります。錠剤は割らずにそのまま服用し、ご家族の女性の手に触れないようご注意ください。",tips:"妊婦触れること禁忌を必ず強調"},
    ],
    commonQuestions: [
      {question:"効果はいつ頃から出ますか？",answer:"一般的に3〜6ヶ月で抜け毛の減少を実感し、6ヶ月〜1年で発毛効果が安定します。初期に一時的な脱毛（初期脱毛）が起こることがありますが、これは薬が効いている証拠です。"},
      {question:"ミノキシジルの内服と外用はどう違いますか？",answer:"外用（塗り薬）は頭皮に直接作用し副作用が少ないですが、内服は全身の血行促進効果があり発毛効果が高い傾向があります。内服は動悸・多毛症・むくみ等の副作用リスクがあるため、医師と相談の上で選択します。"},
    ],
  },
  {
    id: "cg11",
    treatment: "トライフィルプロ（フラクショナルRF）",
    clearChecks: [
      {id:"tf01",text:"ケロイド体質でないか（既往確認）",category:"contraindication",required:true,note:"ケロイド体質は禁忌"},
      {id:"tf02",text:"日焼けしていないか（照射前の日焼け禁忌）",category:"contraindication",required:true},
      {id:"tf03",text:"ペースメーカー・電気デバイスを使用していないか",category:"contraindication",required:true,note:"RFエネルギーがデバイスに影響"},
      {id:"tf04",text:"妊娠中でないか",category:"contraindication",required:true},
      {id:"tf05",text:"ダウンタイム（赤み・腫れ数日〜1週間）の理解と同意",category:"consent",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"トライフィルプロはフラクショナルRF（高周波）を用いて、真皮に微細な熱損傷を与えコラーゲンのリモデリングを促す施術です。毛穴・ニキビ跡・小じわ・肌の引き締めに効果が期待できます。",tips:"フラクショナルRFの作用機序を説明"},
      {phase:"施術後説明",script:"施術後は赤みや軽い腫れが数日〜1週間続くことがあります。メイクは翌日から可能です。施術当日は激しい運動・飲酒・サウナはお控えください。効果は1〜3ヶ月かけて徐々に現れます。",tips:"ダウンタイムとアフターケアを説明"},
    ],
    commonQuestions: [
      {question:"ポテンツァとの違いは何ですか？",answer:"ポテンツァはマイクロニードル＋RFで針を刺して真皮に直接RFを届けます。トライフィルプロはフラクショナルRFで表面から格子状に熱を加えます。ニキビ跡の深い凹みにはポテンツァ、肌全体の引き締め・キメ改善にはトライフィルプロが向いています。"},
    ],
  },
  {
    id: "cg12",
    treatment: "ブルーレーザー（ニキビ治療）",
    clearChecks: [
      {id:"bl01",text:"光線過敏症・光線過敏を起こす薬を服用していないか",category:"contraindication",required:true},
      {id:"bl02",text:"ポルフィリン症でないか",category:"contraindication",required:true,note:"光照射で悪化する代謝疾患"},
      {id:"bl03",text:"活動性の感染症（ヘルペス等）が施術部位にないか",category:"contraindication",required:true},
      {id:"bl04",text:"ダウンタイム（軽度の赤み）の理解と同意",category:"consent",required:true},
    ],
    talkScripts: [
      {phase:"導入",script:"ブルーレーザーは415nmの青色光でアクネ菌が産生するポルフィリンに反応し、活性酸素を発生させてアクネ菌を殺菌する治療です。抗生物質に頼らないニキビ治療として注目されています。",tips:"415nmアクネ菌殺菌の仕組みを説明"},
    ],
    commonQuestions: [
      {question:"抗生物質との違いは何ですか？",answer:"抗生物質は耐性菌のリスクがあり長期使用に制限がありますが、ブルーレーザーは物理的にアクネ菌を殺菌するため耐性の心配がありません。ただし、ニキビの原因（皮脂・毛穴詰まり・ホルモン等）に対しては別途アプローチが必要です。"},
    ],
  },
  {
    id: "cg13",
    treatment: "ターゲットクール（冷却補助）",
    clearChecks: [
      {id:"tc01",text:"寒冷蕁麻疹・レイノー現象の既往がないか",category:"contraindication",required:true,note:"寒冷刺激で症状が誘発されるリスク"},
      {id:"tc02",text:"冷却に対する過敏症がないか",category:"history",required:true,note:"冷却過敏の方は使用を控える"},
    ],
    talkScripts: [
      {phase:"導入",script:"ターゲットクールはレーザーやRF施術時に併用する冷却補助デバイスです。施術部位を効率的に冷却することで痛みを軽減し、表皮へのダメージを最小限に抑えます。",tips:"冷却補助デバイスとしての役割を説明"},
    ],
    commonQuestions: [
      {question:"冷却は必須ですか？",answer:"施術の種類や出力によりますが、冷却を併用することで痛みの軽減と表皮保護の効果があります。特に高出力のレーザー治療では冷却の併用を推奨しています。"},
    ],
  },
];
