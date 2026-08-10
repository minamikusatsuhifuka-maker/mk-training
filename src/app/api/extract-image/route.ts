import { NextRequest, NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // 161: ログイン必須（関門は proxy.ts。ここは関門が外れたときの二重の歯止め）
  const gate = await requireLogin();
  if (gate.response) return gate.response;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API key not set" }, { status: 500 });

  try {
    const { base64, mimeType } = (await req.json()) as {
      base64: string;
      mimeType: string;
      fileName?: string;
    };
    if (!base64) return NextResponse.json({ error: "画像データがありません" }, { status: 400 });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType || "image/jpeg", data: base64 },
              },
              {
                type: "text",
                text: "この画像に書かれているテキストを全て抽出してください。手書きも含めて読み取ってください。レイアウト・構造をMarkdown形式で保持してください。余計なコメントは不要です。テキストのみを出力してください。",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "画像OCRエラー" },
      { status: 500 },
    );
  }
}
