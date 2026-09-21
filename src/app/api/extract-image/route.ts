import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { callGeminiParts } from "@/lib/ai-provider";

export const maxDuration = 60;

// 画像OCR。175: Claude 直書きをやめ、Gemini（gemini-3.8-flash）の inline_data で読み取る
export async function POST(req: NextRequest) {
  // 161: ログイン必須（関門は proxy.ts。ここは関門が外れたときの二重の歯止め）
  const gate = await requireLogin();
  if (gate.response) return gate.response;

  try {
    const { base64, mimeType } = (await req.json()) as {
      base64: string;
      mimeType: string;
      fileName?: string;
    };
    if (!base64) return NextResponse.json({ error: "画像データがありません" }, { status: 400 });

    const res = await callGeminiParts({
      parts: [
        { inline_data: { mime_type: mimeType || "image/jpeg", data: base64 } },
        {
          text: "この画像に書かれているテキストを全て抽出してください。手書きも含めて読み取ってください。レイアウト・構造をMarkdown形式で保持してください。余計なコメントは不要です。テキストのみを出力してください。",
        },
      ],
      maxTokens: 4000,
    });

    if (!res.ok) {
      return NextResponse.json({ error: res.error || "画像OCRに失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ text: res.text, model: res.model });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "画像OCRエラー" },
      { status: 500 },
    );
  }
}
