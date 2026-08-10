import { NextResponse } from "next/server";
import { getAiBackgroundBlock } from "@/lib/ai-background";
import { callAI } from "@/lib/ai-provider";
import { requireLogin } from "@/lib/require-login";

export const maxDuration = 60;

type ExpertItem = {
  id?: string;
  title: string;
  detail: string;
  level?: string;
  category?: string;
};

// エキスパート要件のAI改善・項目追加API
export async function POST(request: Request) {
  // 161: ログイン必須（関門は proxy.ts。ここは関門が外れたときの二重の歯止め）
  const gate = await requireLogin();
  if (gate.response) return gate.response;

  const body = await request.json();
  const { action, role, section, item, existingItems } = body as {
    action?: string;
    role?: string;
    section?: string;
    item?: ExpertItem;
    existingItems?: ExpertItem[];
  };

  let prompt = "";

  if (action === "improve") {
    if (!item) {
      return NextResponse.json({ error: "itemが指定されていません" }, { status: 400 });
    }
    prompt = `南草津皮フ科クリニック（滋賀県）の${role}として、以下の「エキスパートに求められる要件」の内容を改善してください。

セクション: ${section}
タイトル: ${item.title}
現在の詳細: ${item.detail}
レベル: ${item.level ?? "intermediate"}

【改善の観点】
- 南草津皮フ科の理念（四方よし・リードマネジメント・ティール組織・凡事徹底）に沿っているか
- 具体的な行動・状態が描かれているか
- スタッフが「どうすればよいか」が明確か
- 患者・チームへの価値が伝わるか

以下のJSON形式のみで回答（マークダウン・前後の説明は付けない）:
{
  "improvedTitle": "改善されたタイトル",
  "improvedDetail": "改善された詳細説明（100-150文字）",
  "suggestion": "改善のポイントの説明（50文字以内）"
}`;
  } else if (action === "add_items") {
    prompt = `南草津皮フ科クリニック（滋賀県）の${role}の「${section}」セクションに追加すべき要件を3件提案してください。

既存の項目:
${existingItems?.map((i) => `- ${i.title}`).join("\n") || "なし"}

【追加の観点】
- 既存項目と重複しない
- 南草津皮フ科の理念（四方よし・リードマネジメント・ティール組織・凡事徹底）に沿っている
- 実際の皮膚科・美容皮膚科クリニックで必要なスキル・知識・マインド
- 具体的で実践的な内容

以下のJSON形式のみで回答（マークダウン・前後の説明は付けない）:
{
  "newItems": [
    {
      "title": "タイトル",
      "detail": "詳細説明（100-150文字）",
      "level": "basic|intermediate|advanced",
      "category": "knowledge|skill|mindset|action"
    }
  ]
}`;
  } else {
    return NextResponse.json({ error: "actionが不正です" }, { status: 400 });
  }

  try {
    const result = await callAI({
      claudeModel: "claude-sonnet-4-6",
      maxTokens: 1500,
      json: true,
      messages: [{ role: "user", content: (await getAiBackgroundBlock()) + prompt }],
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: `API エラー: ${(result.error || "").slice(0, 200)}` },
        { status: 500 }
      );
    }

    const text: string = result.text;
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "JSON解析エラー" }, { status: 500 });
    }
    try {
      return NextResponse.json(JSON.parse(jsonMatch[0]));
    } catch {
      return NextResponse.json({ error: "JSON解析エラー" }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json(
      { error: `ネットワークエラー: ${e instanceof Error ? e.message : "不明"}` },
      { status: 500 }
    );
  }
}
