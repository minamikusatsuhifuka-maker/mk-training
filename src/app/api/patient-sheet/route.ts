/**
 * 患者向け説明書 生成 API
 * ※ ディープリサーチ本文を Gemini 3.5 Flash で患者向けの平易な説明書（Markdown）に変換。
 * ※ 既存 /api/patient-sheet は未実装だったため新規作成（grounding無しの通常生成）。
 */
import { NextResponse } from "next/server";
import { generateText, stripCodeFence } from "@/lib/deep-research/gemini-research";
import { getPatientSheetPrompt } from "@/lib/deep-research/prompts";
import { getAiBackgroundBlock } from "@/lib/ai-background";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const { topic, content } = await request.json();
    if (!topic || !content) {
      return NextResponse.json(
        { error: "入力が不足しています（topic / content）" },
        { status: 400 }
      );
    }

    const prompt =
      (await getAiBackgroundBlock()) + getPatientSheetPrompt(topic, content);
    const markdown = stripCodeFence(await generateText(prompt, { temperature: 0.4 }));

    return NextResponse.json({ markdown });
  } catch (e) {
    console.error("[patient-sheet] error:", e);
    const message = e instanceof Error ? e.message : "患者説明書の生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
