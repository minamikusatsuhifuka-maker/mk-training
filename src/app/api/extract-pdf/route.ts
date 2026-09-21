import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { callGeminiParts } from "@/lib/ai-provider";

export const maxDuration = 60;

// PDFテキスト抽出。175: Claude の document 入力をやめ、Gemini（gemini-3.8-flash）の inline_data で読み取る
export async function POST(req: NextRequest) {
  // 161: ログイン必須（関門は proxy.ts。ここは関門が外れたときの二重の歯止め）
  const gate = await requireLogin();
  if (gate.response) return gate.response;

  try {
    const arrayBuffer = await req.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const res = await callGeminiParts({
      parts: [
        { inline_data: { mime_type: "application/pdf", data: base64 } },
        {
          text: "このPDFの全テキスト内容を抽出してください。レイアウトは無視してよいですが、内容は全て含めてください。見出し・箇条書きなどの構造はMarkdown形式で保持してください。余計なコメントは不要です。テキストのみを出力してください。",
        },
      ],
      maxTokens: 8000,
    });

    if (!res.ok) {
      return NextResponse.json({ error: res.error || "PDF抽出に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ text: res.text, model: res.model });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "PDF抽出エラー" },
      { status: 500 },
    );
  }
}
