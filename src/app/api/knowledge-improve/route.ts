import { NextRequest, NextResponse } from "next/server";
import { getAiBackgroundBlock } from "@/lib/ai-background";
import { callAI } from "@/lib/ai-provider";
import { requireLogin } from "@/lib/require-login";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // 161: ログイン必須（関門は proxy.ts。ここは関門が外れたときの二重の歯止め）
  const gate = await requireLogin();
  if (gate.response) return gate.response;

  try {
    const { type, content, instruction } = (await req.json()) as {
      type: "manual" | "skillmap" | "knowledge";
      content: unknown;
      instruction?: string;
    };

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

    const result = await callAI({
      claudeModel: "claude-sonnet-4-6",
      maxTokens: 6000,
      json: true,
      messages: [{ role: "user", content: (await getAiBackgroundBlock()) + prompt }],
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: `AI API error: ${(result.error || "").slice(0, 200)}` },
        { status: 500 }
      );
    }

    const text = result.text;
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
