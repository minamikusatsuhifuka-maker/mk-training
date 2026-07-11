/**
 * 「必須のまとめ」（約1000字・プレーンテキスト整形）生成 API
 * ※ 出力は Markdown 記号を使わないプレーンテキスト（◆/・/【】整形）。表示は whitespace-pre-wrap。
 */
import { NextResponse } from "next/server";
import { generateText, stripCodeFence } from "@/lib/deep-research/gemini-research";
import { getEssentialsPrompt } from "@/lib/deep-research/prompts";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  // 管理者のみ（指示書39）
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const { content, topic } = await request.json();
    if (!content || !topic) {
      return NextResponse.json(
        { error: "入力が不足しています（content / topic）" },
        { status: 400 }
      );
    }

    const prompt = getEssentialsPrompt(topic, content);
    const text = stripCodeFence(await generateText(prompt, { temperature: 0.4 }));

    return NextResponse.json({ markdown: text });
  } catch (e) {
    console.error("[essentials] error:", e);
    const message = e instanceof Error ? e.message : "必須のまとめの生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
