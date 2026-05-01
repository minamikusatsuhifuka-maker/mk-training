import { NextResponse } from "next/server";

export const maxDuration = 30;

// 薬剤候補名の検索API（Step1→Step2用）
// キーワードを受け取り、PMDA添付文書・保険診療に基づく代表的な薬剤名を返す
export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "dummy_key_please_replace") {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY が設定されていません" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { keyword } = body as { keyword?: string };
  if (!keyword || typeof keyword !== "string") {
    return NextResponse.json({ error: "キーワードが指定されていません" }, { status: 400 });
  }

  const prompt = `日本の皮膚科クリニックで使用される以下のカテゴリの薬剤を全て列挙してください。
キーワード: ${keyword}

PMDA添付文書・日本の保険診療に基づいて、実際に処方される代表的な薬剤を列挙してください。
ジェネリックは含めず、代表的な先発品・採用品を列挙してください。

必ずJSON形式のみで回答（他のテキスト不要）:
{
  "candidates": [
    {
      "name": "商品名（規格も含む）例: パタノール点眼液0.1%",
      "genericName": "一般名 例: オロパタジン塩酸塩",
      "category": "薬剤カテゴリ 例: 抗アレルギー点眼薬"
    }
  ]
}`;

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
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `API エラー (${response.status}): ${errBody.slice(0, 200)}`, candidates: [] },
        { status: 500 }
      );
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "";
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ candidates: [] });
    }

    try {
      const result = JSON.parse(jsonMatch[0]);
      return NextResponse.json({ candidates: result.candidates ?? [] });
    } catch {
      return NextResponse.json({ candidates: [] });
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: `ネットワークエラー: ${e instanceof Error ? e.message : "不明"}`,
        candidates: [],
      },
      { status: 500 }
    );
  }
}
