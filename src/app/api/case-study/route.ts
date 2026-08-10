import { NextRequest, NextResponse } from "next/server";
import { buildFullKnowledgeContext } from "@/lib/knowledge-server";
import { AI_JUDGMENT_AXES } from "@/lib/clinic-philosophy";
import { getAiBackgroundBlock } from "@/lib/ai-background";
import { callAI } from "@/lib/ai-provider";
import { requireLogin } from "@/lib/require-login";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 161: ログイン必須（関門は proxy.ts。ここは関門が外れたときの二重の歯止め）
  const gate = await requireLogin();
  if (gate.response) return gate.response;

  const { action, difficulty, category, userAnswer, caseContent } =
    await req.json();

  // 理念 + 追加ドキュメント（生成・採点プロンプト末尾に付与）
  const knowledgeContext = await buildFullKnowledgeContext();
  const bgBlock = await getAiBackgroundBlock();
  let prompt = "";

  if (action === "generate") {
    const difficultyMap: Record<string, string> = {
      easy: "新人スタッフ向け・基本的な知識を問う",
      medium: "中堅スタッフ向け・応用的な判断を問う",
      hard: "ベテランスタッフ向け・複合的な知識を問う",
    };
    const categoryMap: Record<string, string> = {
      biologics:
        "生物学的製剤（デュピクセント・スキリージ等）の投与・レセプト・適応確認",
      age: "年齢注意薬剤（プロトピック・コレクチム等）の処方確認・疑義照会対応",
      receipt: "保険診療の算定・レセプト摘要欄記載事項",
      safety: "薬の安全性（妊婦・授乳婦・相互作用・禁忌）",
      cosmetic: "美容施術のカウンセリング・適応確認",
    };
    prompt = `あなたは皮膚科クリニックの研修担当医師です。
以下の条件で症例問題を1問作成してください。

難易度: ${difficultyMap[difficulty] || difficultyMap.easy}
カテゴリ: ${categoryMap[category] || categoryMap.biologics}

【症例の形式】
患者情報（年齢・性別・主訴・現病歴・現在の治療）を具体的に記載し、
スタッフが考えるべき質問を1〜2問提示してください。

必ずJSON形式のみで回答（マークダウン不可）:
{
  "title": "症例タイトル",
  "patient": "患者情報（年齢・性別・主訴など）",
  "situation": "状況説明（何を確認・対応すべき場面か）",
  "question": "スタッフへの質問（何を答えるべきか）",
  "hint": "ヒント（正解に近づくためのヒント）",
  "difficulty": "${difficulty}",
  "category": "${category}"
}
${knowledgeContext}`;
  } else if (action === "evaluate") {
    prompt = `あなたは皮膚科クリニックの研修担当医師です。
以下の症例に対するスタッフの回答を採点・解説してください。

【症例】
${caseContent}

【スタッフの回答】
${userAnswer}

【採点基準】
- 医学的な正確性・知識の深さ
- 患者への寄り添い・共感の姿勢（南草津皮フ科の理念に基づく）
- スタッフ行動指針（素直・傾聴・共感、誠実な対応）に沿っているか
- 添付文書・ガイドラインに準拠しているか

評価の際は以下の観点も含めてください:
- リードマネジメントの精神（外的コントロールではなく内発的動機）
- 患者への寄り添い・四方よしの精神
- 7つの実（特に誠実・充実・実行）
${AI_JUDGMENT_AXES}

必ずJSON形式のみで回答（マークダウン不可）:
{
  "score": 85,
  "grade": "B",
  "goodPoints": ["良かった点1", "良かった点2"],
  "missingPoints": ["不足していた点1", "不足していた点2"],
  "explanation": "正しい知識の解説（添付文書・ガイドライン根拠を含む）",
  "keyLearning": "この症例の最重要ポイント（1文で）",
  "relatedInfo": "関連して覚えておくべき情報"
}
${knowledgeContext}`;
  }

  const result = await callAI({
    maxTokens: 1500,
    json: true,
    messages: [{ role: "user", content: bgBlock + prompt }],
  });

  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: 500 });
  const text: string = result.text;
  const cleaned = text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch)
    return NextResponse.json(
      { error: "Invalid response", raw: text },
      { status: 500 }
    );
  return NextResponse.json(JSON.parse(jsonMatch[0]));
}
