import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";

export const maxDuration = 30;

const FIELD_GUIDE: Record<string, string> = {
  description:
    "手順の詳細説明（番号付きリスト形式・①②③または1. 2. 3.で整理）",
  checkpoints:
    "確認ポイント（箇条書き・1行1項目・「〜か」「〜できているか」で統一）",
  cautions: "注意事項（箇条書き・1行1項目・【重要】等のラベル付き）",
  tips: "1〜2文のシンプルなコツ・ポイント",
  purpose: "目的の説明文（読みやすい段落形式）",
  faq: "Q&A形式（Q: 質問\nA: 回答 の形式で統一）",
};

export async function POST(req: NextRequest) {
  // 161: ログイン必須（関門は proxy.ts。ここは関門が外れたときの二重の歯止め）
  const gate = await requireLogin();
  if (gate.response) return gate.response;

  try {
    const { text, fieldType } = (await req.json()) as {
      text: string;
      fieldType: string;
    };

    if (!text || !text.trim()) {
      return NextResponse.json({ formatted: text ?? "" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY が設定されていません" },
        { status: 500 }
      );
    }

    const fieldGuide = FIELD_GUIDE[fieldType] ?? "読みやすい形式";

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
        messages: [
          {
            role: "user",
            content: `以下のテキストを「${fieldGuide}」の形式で読みやすく整形してください。

内容は変えずに、フォーマット・改行・番号・箇条書きだけを整えてください。
整形後のテキストのみを出力してください（説明・コメント不要）。

テキスト:
${text}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `AI API error: ${response.status}`, raw: errText },
        { status: 500 }
      );
    }

    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    const formatted = data.content?.[0]?.text ?? text;
    return NextResponse.json({ formatted });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "整形に失敗しました",
      },
      { status: 500 }
    );
  }
}
