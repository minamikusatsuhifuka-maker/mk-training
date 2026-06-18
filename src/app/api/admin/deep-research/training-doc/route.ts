/**
 * 研修資料（スタッフ向け要点整理・Markdown）生成 API
 * ※ 生成は Gemini 3.5 Flash（grounding無しの通常生成）。store/モデルは STEP 1 のヘルパ流用。
 */
import { NextResponse } from "next/server";
import { generateText, stripCodeFence } from "@/lib/deep-research/gemini-research";
import { getTrainingDocPrompt } from "@/lib/deep-research/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { content, topic } = await request.json();
    if (!content || !topic) {
      return NextResponse.json(
        { error: "入力が不足しています（content / topic）" },
        { status: 400 }
      );
    }

    const prompt = getTrainingDocPrompt(topic, content);
    const markdown = stripCodeFence(await generateText(prompt, { temperature: 0.5 }));

    return NextResponse.json({ markdown });
  } catch (e) {
    console.error("[training-doc] error:", e);
    const message = e instanceof Error ? e.message : "生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
