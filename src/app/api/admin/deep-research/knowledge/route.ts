/**
 * 知識シート（初心者版/エキスパート版・Markdown）生成 API
 */
import { NextResponse } from "next/server";
import { generateText, stripCodeFence } from "@/lib/deep-research/gemini-research";
import {
  getKnowledgeSheetPrompt,
  type KnowledgeLevel,
} from "@/lib/deep-research/prompts";
import { requireAdminItem } from "@/lib/admin-delegation-server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  // 管理者のみ（指示書39）
  const auth = await requireAdminItem("deep-research");
  if (auth.response) return auth.response;
  // 226への返答（院長の決定）: 数えるのは**リサーチの実行だけ**。
  //   まとめ・クイズなどの生成はここに含めない（回数を減らさない）。
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
    const markdown = stripCodeFence(await generateText(prompt));

    return NextResponse.json({ markdown, level: targetLevel });
  } catch (e) {
    console.error("[knowledge] error:", e);
    const message = e instanceof Error ? e.message : "生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
