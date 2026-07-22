/**
 * 要約（500〜700字・Markdown）生成 API
 */
import { NextResponse } from "next/server";
import { generateText, stripCodeFence } from "@/lib/deep-research/gemini-research";
import { getSummaryPrompt } from "@/lib/deep-research/prompts";
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

    const prompt = getSummaryPrompt(topic, content);
    const markdown = stripCodeFence(await generateText(prompt));

    return NextResponse.json({ markdown });
  } catch (e) {
    console.error("[summarize] error:", e);
    const message = e instanceof Error ? e.message : "要約に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
