/**
 * 知識シート（初心者版/エキスパート版・Markdown）生成 API
 */
import { NextResponse } from "next/server";
import { generateText, stripCodeFence } from "@/lib/deep-research/gemini-research";
import {
  getKnowledgeSheetPrompt,
  type KnowledgeLevel,
} from "@/lib/deep-research/prompts";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  // 管理者のみ（指示書39）
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const { content, topic, level } = await request.json();
    if (!content || !topic) {
      return NextResponse.json(
        { error: "入力が不足しています（content / topic）" },
        { status: 400 }
      );
    }
    if (level && !["basic", "expert"].includes(level)) {
      return NextResponse.json({ error: "level が不正です" }, { status: 400 });
    }

    const targetLevel: KnowledgeLevel = level === "expert" ? "expert" : "basic";
    const prompt = getKnowledgeSheetPrompt(topic, content, targetLevel);
    const markdown = stripCodeFence(await generateText(prompt, { temperature: 0.3 }));

    return NextResponse.json({ markdown, level: targetLevel });
  } catch (e) {
    console.error("[knowledge] error:", e);
    const message = e instanceof Error ? e.message : "生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
