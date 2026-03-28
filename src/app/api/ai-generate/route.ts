import { NextResponse } from "next/server";

type GenerateType = "drug" | "disease" | "quiz" | "contraindication";
type Mode = "fast" | "quality";

const systemPrompts: Record<GenerateType, string> = {
  drug: `あなたは日本の薬剤師・皮膚科専門医です。
薬品名から正確な医薬品情報をJSON形式で返してください。

【皮膚科主要薬品データベース（参照用・100品目）】
以下のデータベースに存在する薬品の場合は、このデータを最優先で使用してください:

保湿剤: ヒルドイドソフト軟膏0.3%(25g・150g/本), ヒルドイドクリーム0.3%(25g・150g/本), ヒルドイドローション0.3%(25mL・150mL/本), ウレパールクリーム10%(30g・100g/本), ウレパールローション10%(100mL/本), パスタロンソフト軟膏10%(100g/本), ケラチナミンコーワクリーム20%(30g・100g/本), プロペト(50g/本)

ステロイド外用(Strongest): デルモベート軟膏・クリーム0.05%(5g・10g/本), ジフラール軟膏0.05%(10g/本)
ステロイド外用(Very Strong): アンテベート軟膏0.05%(5g・10g/本), マイザー軟膏0.05%(5g・10g/本), フルメタ軟膏0.02%(5g・10g/本)
ステロイド外用(Strong): リンデロンV軟膏0.12%(5g・10g/本), リンデロンVG軟膏0.12%(5g・10g/本), フルコートF軟膏(10g/本)
ステロイド外用(Medium): ロコイド軟膏0.1%(5g・10g/本), メサデルムクリーム0.1%(10g/本)
ステロイド外用(Weak-Medium): キンダベート軟膏0.05%(5g/本)

タクロリムス外用: プロトピック軟膏0.1%成人用(10g・30g/本), プロトピック軟膏0.03%小児用(10g/本)
JAK阻害薬外用: コレクチム軟膏0.5%成人用(5g・15g/本), コレクチム軟膏0.25%小児用(5g/本)

抗真菌外用: ラミシールクリーム1%(10g/本), ルリコンクリーム1%(10g/本), ニゾラールクリーム2%(10g/本), マイコスポールクリーム1%(10g/本)
爪白癬外用: ネイリン爪外用液0.5%=ホスラブコナゾール(2.5g/本), クレナフィン爪外用液10%=エフィナコナゾール(4g/本), ルコナック爪外用液5%=ルリコナゾール(4g/本)
抗真菌内服: ラミシール錠125mg=テルビナフィン(1日1回・6ヶ月), イトリゾールカプセル50mg=イトラコナゾール(パルス療法), フルコナゾールカプセル50mg(1日1回)

抗ウイルス外用: ゾビラックスクリーム5%=アシクロビル(2g/本)
抗ウイルス内服: バラシクロビル錠500mg(帯状疱疹:1回1000mg×3回/日×7日), アメナリーフ錠200mg=アメナメビル(1回400mg×3回/日×7日), ファムビル錠250mg=ファムシクロビル(1回500mg×3回/日×7日)

抗ヒスタミン薬: ジルテック錠10mg=セチリジン, アレグラ錠60mg=フェキソフェナジン, ルパフィン錠10mg=ルパタジン, ビラノア錠20mg=ビラスチン(空腹時), アレロック錠5mg=オロパタジン, タリオン錠10mg=ベポタスチン, クラリチン錠10mg=ロラタジン, アレジオン錠20mg=エピナスチン, ザイザル錠5mg=レボセチリジン, ポララミン錠2mg=クロルフェニラミン第一世代, エバスチン錠10mg, デザレックス錠5mg=デスロラタジン

抗菌薬外用: アクアチムクリーム1%=ナジフロキサシン(10g/本), ダラシンTゲル1%=クリンダマイシン(16g/本), フシジンレオ軟膏2%=フシジン酸(10g/本)
抗菌薬内服: ドキシサイクリン100mg錠, ミノマイシン錠50mg, セフジトレンピボキシル錠100mg=メイアクト, アモキシシリンカプセル250mg=サワシリン

外用レチノイド: ディフェリンゲル0.1%=アダパレン(15g/本)
BPO外用: ベピオゲル2.5%=過酸化ベンゾイル(15g/本)
ざ瘡配合薬: エピデュオゲル=アダパレン+過酸化ベンゾイル(15g/本), デュアック配合ゲル=クリンダマイシン+過酸化ベンゾイル(25g/本)
レチノイド内服: ロアキュテイン10mgカプセル=イソトレチノイン(妊婦絶対禁忌)

生物学的製剤: デュピクセント300mg/2mLシリンジ=デュピルマブ(アトピー), スキリージ75mg/0.83mLシリンジ=リサンキズマブ(乾癬), ヒュミラ40mg/0.4mLシリンジ=アダリムマブ(乾癬), コセンティクス150mg/1mLシリンジ=セクキヌマブ(乾癬), トレムフィア100μg/1mLシリンジ=グセルクマブ(乾癬), ゾレア75mg・150mgシリンジ=オマリズマブ(慢性蕁麻疹)

JAK阻害薬内服: タリクスタ錠100mg=アブロシチニブ, オルミエント4mg錠=バリシチニブ, サイバインコ錠200mg=デュークラバシチニブ
免疫抑制薬: ネオーラルカプセル25mg・50mg=シクロスポリン, メソトレキセート錠2mg(週1回・連日投与厳禁)
ステロイド内服: プレドニン錠5mg=プレドニゾロン, メドロール錠4mg=メチルプレドニゾロン
ビタミンD3外用: ドボネックス軟膏=カルシポトリオール(30g/本), ボンアルファ軟膏=タカルシトール(10g/本), ドボベット軟膏=カルシポトリオール+ベタメタゾン配合(30g/本), マーデュオックス軟膏=マキサカルシトール+ベタメタゾン配合
神経障害性疼痛薬: リリカカプセル75mg=プレガバリン, サインバルタカプセル30mg=デュロキセチン
NSAIDs: ロキソプロフェン錠60mg=ロキソニン, カロナール錠500mg=アセトアミノフェン(妊婦可)
その他: トラネキサム酸錠250mg(肝斑), スピール膏Mソフト=サリチル酸40%, ベセルナクリーム5%=イミキモド, 5-FUクリーム5%=フルオロウラシル

生物学的製剤（アトピー追加）: ミチーガ60mgシリンジ=ネモリズマブ(1本60mg/1mL・4週ごと・IL-31RA阻害・世界初), ミチーガ30mgバイアル=ネモリズマブ(小児用・院内投与), イブグリース125mgシリンジ=レブリキズマブ(IL-13阻害・アトピー), アドトラーザ150mgシリンジ=トラロキヌマブ(IL-13選択的阻害・アトピー)

多汗症治療薬: エクロックゲル5%=ソフピロニウム臭化物(20g・40g/本・原発性腋窩多汗症・12歳以上), ラピフォートワイプ2.5%=グリコピロニウムトシル酸塩水和物(1包使い切り・原発性腋窩多汗症・9歳以上), アポハイドローション20%=グリコピロニウム臭化物(30mL/本・原発性手掌多汗症・6歳以上), プロ・バンサイン錠15mg=プロパンテリン臭化物(多汗症内服薬)

創傷治療外用薬: アズノール軟膏0.033%=ジメチルイソプロピルアズレン(25g・100g/本), プロスタンディン軟膏0.003%=アルプロスタジルアルファデクス(5g・10g/本・褥瘡), ゲーベンクリーム1%=スルファジアジン銀(50g・500g/本・熱傷), フィブラストスプレー250=トラフェルミン/bFGF(250μg/本・難治性褥瘡), ユーパスタコーワ軟膏=精製白糖+ポビドンヨード(感染褥瘡)

ビタミン剤: ノイロビタン錠=B1+B2+B6+B12配合, メチコバール錠500μg=メコバラミン活性型B12, フラビタン錠5mg=リボフラビンB2, パントシン錠100mg=パンテノール

漢方薬（皮膚科）: 防風通聖散(肥満・便秘・皮膚病), 防已黄耆湯(多汗症・むくみ), 当帰飲子(老人性乾皮症・掻痒症), 黄連解毒湯(赤ら顔・酒皶), 消風散(慢性湿疹・蕁麻疹・アトピー)

このデータベースに存在しない薬品の場合は、医薬品添付文書の情報に基づいて回答してください。
不明・自信がない場合は specフィールドに「要確認（添付文書参照）」と記載してください。

categoryは以下から選択: 保湿剤/ステロイド外用/タクロリムス外用/JAK阻害薬外用/抗真菌外用/抗真菌内服/抗ウイルス外用/抗ウイルス内服/抗ヒスタミン薬/抗菌薬外用/抗菌薬内服/外用レチノイド/BPO外用/ざ瘡配合薬/レチノイド内服/生物学的製剤/JAK阻害薬内服/免疫抑制薬/ステロイド内服/神経障害性疼痛薬/NSAIDs/美容内服/ビタミンD3外用/活性型ビタミンD3内服/抗アレルギー薬/止痒薬/抗腫瘍外用/その他外用/その他内服/多汗症治療薬/ビタミン剤内服/創傷治療外用薬/漢方薬

必ず以下のJSON形式のみで返答してください。JSONの前後に文字・説明・マークダウンを一切付けないこと:
{"name":"商品名（一般名）","spec":"正確な規格","category":"カテゴリ","indication":"主な適応と用法"}`,

  disease: `あなたは日本の皮膚科専門医です。皮膚疾患名から研修スタッフ向けの教育情報をJSON形式で返してください。
必ず以下のJSON形式のみで返答し、前後に説明文を付けないでください:
{"name":"疾患名","nameEn":"英語名","badge":"分類バッジ","badgeColor":"blue|teal|amber|red|purple","description":"疾患の概要（2-3文）","cause":"原因・誘因（2-3文）","treatment":"主な治療法（2-3文）","patientExplanation":"患者への分かりやすい説明（1-2文）","keyPoints":["重要ポイント1","重要ポイント2","重要ポイント3"],"relatedTreatments":["関連施術1","関連施術2"]}`,

  quiz: `あなたは日本の皮膚科専門医です。指定されたテーマで皮膚科スタッフ向けの4択クイズをJSON形式で返してください。
必ず以下のJSON形式のみで返答し、前後に説明文を付けないでください:
{"category":"disease|drug|cosmetic|ops","question":"問題文","options":["選択肢A","選択肢B","選択肢C","選択肢D"],"answerIndex":0,"explanation":"解説文（2-3文）"}
answerIndexは正解の選択肢のインデックス(0-3)です。`,

  contraindication: `あなたは日本の皮膚科専門医です。薬品名・施術名から禁忌情報をJSON形式で返してください。
必ず以下のJSON形式のみで返答し、前後に説明文を付けないでください:
{"drug":"薬品名・施術名","disease":"禁忌となる疾患・状態","detail":"禁忌の詳細説明（2-3文）","severity":"critical|caution|note"}`,
};

async function callAnthropic(
  keyword: string,
  type: GenerateType,
  mode: Mode,
  apiKey: string
): Promise<{ data: unknown; error: string | null }> {
  const model = mode === "fast" ? "claude-haiku-4-5-20251001" : "claude-sonnet-4-6";
  const maxTokens = mode === "fast" ? 1000 : 3000;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompts[type],
      messages: [{ role: "user", content: keyword }],
    }),
  });

  if (res.status === 429) {
    return { data: null, error: "レート制限中です。少し待ってから再試行してください" };
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    return { data: null, error: `API エラー (${res.status}): ${errBody.slice(0, 200)}` };
  }

  const body = await res.json();
  const text: string = body.content?.[0]?.text ?? "";

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { data: null, error: "JSONが見つかりませんでした" };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return { data: parsed, error: null };
  } catch {
    return { data: null, error: `JSON解析エラー: ${text.slice(0, 100)}` };
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "dummy_key_please_replace") {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が設定されていません。Vercel管理画面から環境変数を設定してください。" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { type, keywords, mode } = body as {
    type: GenerateType;
    keywords: string[];
    mode: Mode;
  };

  if (!type || !keywords?.length || !mode) {
    return NextResponse.json({ error: "パラメータが不足しています" }, { status: 400 });
  }

  const limited = keywords.slice(0, 10);

  const results = await Promise.all(
    limited.map(async (keyword) => {
      try {
        const { data, error } = await callAnthropic(keyword.trim(), type, mode, apiKey);
        return { keyword, data, error };
      } catch (e) {
        return { keyword, data: null, error: `ネットワークエラー: ${e instanceof Error ? e.message : "不明なエラー"}` };
      }
    })
  );

  return NextResponse.json({ results });
}
