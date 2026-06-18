/**
 * クイズ（4択・解説付き・JSON）生成 API
 * ※ 出力は { questions: [{ q, choices[4], answer_index, explanation }] }。
 */
import { NextResponse } from "next/server";
import { generateText, stripCodeFence } from "@/lib/deep-research/gemini-research";
import { getQuizPrompt } from "@/lib/deep-research/prompts";

export const runtime = "nodejs";
export const maxDuration = 120;

type QuizQuestion = {
  q: string;
  choices: string[];
  answer_index: number;
  explanation: string;
};

export async function POST(request: Request) {
  try {
    const { content, topic, numQuestions } = await request.json();
    if (!content || !topic) {
      return NextResponse.json(
        { error: "入力が不足しています（content / topic）" },
        { status: 400 }
      );
    }

    const n =
      Number.isInteger(numQuestions) && numQuestions > 0 && numQuestions <= 30
        ? numQuestions
        : 10;

    const prompt = getQuizPrompt(topic, content, n);
    const raw = stripCodeFence(await generateText(prompt, { temperature: 0.4 }));

    // JSON 抽出（前後に余計な文字があっても { から } までを拾う）
    let parsed: { questions?: QuizQuestion[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        return NextResponse.json(
          { error: "クイズのJSON解析に失敗しました" },
          { status: 502 }
        );
      }
      parsed = JSON.parse(match[0]);
    }

    const questions = Array.isArray(parsed.questions) ? parsed.questions : [];
    if (questions.length === 0) {
      return NextResponse.json(
        { error: "クイズが生成されませんでした" },
        { status: 502 }
      );
    }

    return NextResponse.json({ questions });
  } catch (e) {
    console.error("[quiz] error:", e);
    const message = e instanceof Error ? e.message : "生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
