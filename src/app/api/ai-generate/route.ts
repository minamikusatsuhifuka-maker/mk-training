import { NextResponse } from "next/server";

type GenerateType = "drug" | "disease" | "quiz" | "contraindication";
type Mode = "fast" | "quality";

const systemPrompts: Record<GenerateType, string> = {
  drug: `あなたは日本の皮膚科専門医です。薬品名から正確な医薬品情報をJSON形式で返してください。
必ず以下のJSON形式のみで返答し、前後に説明文を付けないでください:
{"name":"商品名（一般名）","spec":"規格（例:1錠Xmg, Xg/本）","category":"カテゴリ","indication":"主な適応疾患"}
categoryは以下から選択: 保湿剤/ステロイド外用/タクロリムス外用/JAK阻害薬外用/抗真菌外用/抗真菌内服/抗ウイルス外用/抗ウイルス内服/抗ヒスタミン薬/抗菌薬/外用レチノイド/BPO外用/ざ瘡配合薬/レチノイド内服/生物学的製剤/JAK阻害薬内服/免疫抑制薬/ステロイド内服/神経障害性疼痛薬/NSAIDs/美容内服`,

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
