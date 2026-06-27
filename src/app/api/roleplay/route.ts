import { NextRequest, NextResponse } from "next/server";
import { buildFullKnowledgeContext } from "@/lib/knowledge-server";
import { AI_JUDGMENT_AXES } from "@/lib/clinic-philosophy";
import { getAiBackgroundBlock } from "@/lib/ai-background";

export const maxDuration = 60;

const scenarioPrompts: Record<string, string> = {
  biologics: `あなたは30代女性の患者です。重症アトピー性皮膚炎で悩んでいます。
医師からデュピクセントを勧められましたが、注射が怖く、費用も心配です。
自然な患者として、以下のような質問や不安を順番に表現してください:
1. 注射は痛いですか？頻度は？
2. 費用はどれくらいかかりますか？
3. 副作用はありますか？
4. 効果はいつ出ますか？
5. ずっと続けないといけませんか？
スタッフの説明に対して自然に反応してください。`,

  shimmi: `あなたは40代女性の患者です。頬のシミが気になっています。
初めて美容施術を検討していて、不安と期待が混在しています。
以下のような質問や不安を自然に表現してください:
1. どんな施術がありますか？
2. 痛みはありますか？ダウンタイムは？
3. 費用はどれくらい？保険は効きますか？
4. 何回くらいで効果が出ますか？
5. 肌に悪い影響はありませんか？`,

  acne_red: `あなたは20代女性の患者です。ニキビ跡の赤みで悩んでいます。
以下のような質問を自然に表現してください:
1. 赤みを消す治療法は何がありますか？
2. IPLとレーザーの違いは？
3. 施術後の過ごし方は？
4. 費用と回数は？
5. ファンデーションで隠せているけど根本的に治したい`,

  acne_scar: `あなたは20代男性の患者です。ニキビ跡の凹みが気になっています。
以下のような質問を自然に表現してください:
1. 凹みを改善できますか？
2. ポテンツァとは何ですか？
3. 痛みはどれくらい？
4. 費用と効果の持続期間は？
5. 何回通えばいいですか？`,

  datsumou: `あなたは30代女性の患者です。脱毛に興味があります。
以下のような質問を自然に表現してください:
1. 医療脱毛と美容脱毛の違いは？
2. 痛みはありますか？
3. 費用と回数は？
4. 肌が弱いですが大丈夫ですか？
5. 効果はどれくらい続きますか？`,

  skincare: `あなたは30代女性の患者です。スキンケアを見直したいと思っています。
以下のような質問を自然に表現してください:
1. 自分の肌に合う製品を教えてほしい
2. 市販品との違いは？
3. 費用はどれくらい？
4. 使い方を教えてください
5. アレルギーが心配です`,

  insurance: `あなたは40代男性の患者です。保険診療と自由診療の違いがよくわかりません。
以下のような質問を自然に表現してください:
1. 保険が効く治療と効かない治療の違いは？
2. 自由診療はなぜ高いのですか？
3. 同じ治療でも保険と自由診療で内容が違うの？
4. どちらを選べばいいですか？
5. 支払い方法は？`,
};

export async function POST(req: NextRequest) {
  const { action, scenario, messages, staffResponses } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "No API key" }, { status: 500 });

  // 理念 + 追加ドキュメントを取得（全アクションで共通）
  const knowledgeContext = await buildFullKnowledgeContext();
  const bgBlock = await getAiBackgroundBlock();

  if (action === "start") {
    const systemPrompt = scenarioPrompts[scenario] || scenarioPrompts.biologics;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        system:
          bgBlock +
          systemPrompt +
          "\n\n最初の一言から始めてください。短めに（1〜2文）。" +
          knowledgeContext,
        messages: [
          {
            role: "user",
            content: "患者として最初の質問や挨拶をしてください。",
          },
        ],
      }),
    });
    const data = await response.json();
    return NextResponse.json({ message: data.content?.[0]?.text || "" });
  }

  if (action === "continue") {
    const systemPrompt = scenarioPrompts[scenario] || scenarioPrompts.biologics;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 200,
        system:
          bgBlock +
          systemPrompt +
          "\n\nスタッフの説明に対して自然に反応し、次の質問や不安を述べてください。短めに（1〜3文）。" +
          knowledgeContext,
        messages: messages,
      }),
    });
    const data = await response.json();
    return NextResponse.json({ message: data.content?.[0]?.text || "" });
  }

  if (action === "feedback") {
    const feedbackPrompt = `あなたは皮膚科クリニックのカウンセリング指導者です。
以下のロールプレイのスタッフの対応を評価してください。

シナリオ: ${scenario}

スタッフの返答履歴:
${staffResponses.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n")}

【評価軸】
- 医学的・施術内容説明の正確さ
- 患者への寄り添い・共感（南草津皮フ科の「素直・傾聴・共感」の行動指針）
- 凡事徹底（あいさつ・感謝・丁寧な言葉遣い）
- 倫理観をもった誠実な対応ができていたか
- クリニックの理念・行動指針に沿った対応であったか

フィードバックは外的コントロール（批判・命令）ではなくリードマネジメント（承認・問いかけ・共感）で行ってください。
スタッフの可能性・成長を引き出す言葉を使ってください。
${AI_JUDGMENT_AXES}

必ずJSON形式のみで回答:
{
  "score": 4,
  "scoreMax": 5,
  "goodPoints": ["良かった点1", "良かった点2"],
  "improvements": ["改善点1", "改善点2"],
  "nextQuestions": ["患者が次に聞きそうな質問1", "患者が次に聞きそうな質問2"],
  "overallComment": "総評コメント（2〜3文）"
}
${knowledgeContext}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        messages: [{ role: "user", content: bgBlock + feedbackPrompt }],
      }),
    });
    const data = await response.json();
    const text: string = data.content?.[0]?.text || "";
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
      return NextResponse.json({ error: "Invalid response" }, { status: 500 });
    return NextResponse.json(JSON.parse(jsonMatch[0]));
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
