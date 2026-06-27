import { NextRequest, NextResponse } from "next/server";
import { getAiBackgroundBlock } from "@/lib/ai-background";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const { type, content, instruction } = (await req.json()) as {
      type: "manual" | "skillmap" | "knowledge";
      content: unknown;
      instruction?: string;
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY が設定されていません" },
        { status: 500 }
      );
    }

    const typeName =
      type === "manual"
        ? "マニュアル"
        : type === "skillmap"
        ? "スキルマップ"
        : "ナレッジ";

    const prompt = `あなたは南草津皮フ科の業務改善・人材育成コンサルタントです。
以下の${typeName}を改善してください。

現在の内容:
${JSON.stringify(content, null, 2).slice(0, 3000)}

改善の指示: ${instruction || "全体的により実践的・具体的に改善してください"}

【改善の観点】
- より具体的で実行可能な内容に
- 南草津皮フ科の理念（四方よし・凡事徹底）と接続
- 現場で即使えるレベルの具体性
- 読みやすく・覚えやすい表現

同じJSON形式で改善版を返してください。
構造（フィールド構成）は元データと完全に一致させてください。
内容は改善した方がよい部分のみブラッシュアップしてください。
JSON以外のテキストは絶対に含めないでください。`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 6000,
        messages: [{ role: "user", content: (await getAiBackgroundBlock()) + prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Anthropic API error: ${errText.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    const text = data.content?.[0]?.text ?? "";
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Parse error", raw: text.slice(0, 200) },
        { status: 500 }
      );
    }

    try {
      return NextResponse.json(JSON.parse(jsonMatch[0]));
    } catch {
      return NextResponse.json(
        { error: "JSON parse failed", raw: text.slice(0, 200) },
        { status: 500 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
