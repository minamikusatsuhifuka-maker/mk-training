import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { callAI } from "@/lib/ai-provider";

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

// テキスト整形。175: Claude 直書きをやめ、共通の callAI（既定 gemini-3.8-flash・管理トグル対応）へ
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

    const fieldGuide = FIELD_GUIDE[fieldType] ?? "読みやすい形式";

    const res = await callAI({
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
      maxTokens: 1000,
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `AI API error（${res.provider}）`, raw: (res.error ?? "").slice(0, 300) },
        { status: 500 }
      );
    }

    const formatted = res.text.trim() || text;
    return NextResponse.json({ formatted, model: res.model });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "整形に失敗しました",
      },
      { status: 500 }
    );
  }
}
