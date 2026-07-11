/**
 * リサーチ結果 → 院内マニュアル（org_manuals）へ変換・追加 API
 * ※ Gemini 3.5 Flash で Manual 形式（steps/cautions/faq/todoItems）を抽出 → 下書き（isPublished:false）で保存。
 */
import { NextResponse } from "next/server";
import { generateText, parseJsonLoose } from "@/lib/deep-research/gemini-research";
import { getToManualPrompt } from "@/lib/deep-research/prompts";
import { addManual } from "@/lib/deep-research/store";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

type ParsedManual = {
  title?: string;
  purpose?: string;
  category?: string;
  steps?: { order?: number; title: string; description: string; checkpoints?: string[]; tips?: string }[];
  todoItems?: { text: string; timing?: string; priority?: string }[];
  cautions?: string[];
  faq?: { q: string; a: string }[];
};

export async function POST(request: Request) {
  // 管理者のみ（指示書39）
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  try {
    const { topic, content } = await request.json();
    if (!topic || !content) {
      return NextResponse.json(
        { error: "入力が不足しています（topic / content）" },
        { status: 400 }
      );
    }

    const prompt = getToManualPrompt(topic, content);
    const raw = await generateText(prompt, { temperature: 0.3 });
    const parsed = parseJsonLoose<ParsedManual>(raw);
    if (!parsed) {
      return NextResponse.json(
        { error: "マニュアルJSONの解析に失敗しました" },
        { status: 502 }
      );
    }

    const result = await addManual({
      title: parsed.title || topic,
      purpose: parsed.purpose || "",
      category: parsed.category || "その他",
      steps: Array.isArray(parsed.steps) ? parsed.steps.slice(0, 5) : [],
      todoItems: Array.isArray(parsed.todoItems) ? parsed.todoItems.slice(0, 8) : [],
      cautions: Array.isArray(parsed.cautions) ? parsed.cautions.slice(0, 4) : [],
      faq: Array.isArray(parsed.faq) ? parsed.faq.slice(0, 3) : [],
    });

    return NextResponse.json({ result });
  } catch (e) {
    console.error("[to-manual] error:", e);
    const message = e instanceof Error ? e.message : "変換に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
