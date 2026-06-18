import { NextResponse } from "next/server";

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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "dummy_key_please_replace") {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY が設定されていません" }, { status: 500 });
  }

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
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `API エラー (${response.status}): ${errBody.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "";
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
