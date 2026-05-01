import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

type GeneratedQuiz = {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  category: string;
};

const DIFFICULTY_LABELS: Record<string, string> = {
  easy: "易（基本知識・初学者向け）",
  medium: "中（標準的な臨床知識）",
  hard: "難（専門知識・応用問題）",
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API key not set" }, { status: 500 });

  try {
    const { content, count = 10, difficulty = "medium" } = (await req.json()) as {
      content: string;
      count?: number;
      difficulty?: "easy" | "medium" | "hard";
    };

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "資料の内容が空です" }, { status: 400 });
    }

    const truncated = content.length > 12000 ? content.slice(0, 12000) : content;
    const difficultyLabel = DIFFICULTY_LABELS[difficulty] || DIFFICULTY_LABELS.medium;

    const prompt = `以下の資料からクイズを${count}問作成してください。
難易度: ${difficultyLabel}
対象: 皮膚科クリニックスタッフ（医師・看護師・受付・クラーク・カウンセラー）

資料:
"""
${truncated}
"""

必ず以下のJSON形式のみで出力してください。前後に説明文・コードブロックは付けないでください:
{
  "quizzes": [
    {
      "question": "問題文",
      "options": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"],
      "correct": 0,
      "explanation": "解説文。なぜその答えなのか・他の選択肢がなぜ違うのかを簡潔に",
      "category": "疾患/薬剤/美容/業務 から最も近いもの"
    }
  ]
}

注意:
- 必ず4択
- correctは正解の選択肢のインデックス(0-3)
- 解説は学習に役立つ内容を必ず含める
- 資料に書かれていない内容は問題にしない`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text || "";

    // JSON抽出（コードブロックや前後のテキストを除去）
    let jsonText = text.trim();
    const fenceMatch = jsonText.match(/```json\s*([\s\S]+?)\s*```/);
    if (fenceMatch) jsonText = fenceMatch[1];
    else {
      const fence2 = jsonText.match(/```\s*([\s\S]+?)\s*```/);
      if (fence2) jsonText = fence2[1];
    }
    const firstBrace = jsonText.indexOf("{");
    const lastBrace = jsonText.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      jsonText = jsonText.slice(firstBrace, lastBrace + 1);
    }

    let parsed: { quizzes?: GeneratedQuiz[] };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json(
        { error: "AI応答のJSON解析に失敗しました", raw: text },
        { status: 500 },
      );
    }

    const quizzes = (parsed.quizzes || []).filter(
      (q): q is GeneratedQuiz =>
        !!q &&
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correct === "number" &&
        q.correct >= 0 &&
        q.correct <= 3,
    );

    return NextResponse.json({ quizzes });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "クイズ生成エラー" },
      { status: 500 },
    );
  }
}
