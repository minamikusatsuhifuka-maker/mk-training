/**
 * リサーチ結果 → 組織ナレッジ（org_knowledges）へ変換・追加 API
 * ※ Gemini 3.5 Flash で OrgKnowledge 形式（四方よし）を抽出 → 承認待ち（isApproved:false）で保存。
 */
import { NextResponse } from "next/server";
import { generateText, parseJsonLoose } from "@/lib/deep-research/gemini-research";
import { getToOrgKnowledgePrompt } from "@/lib/deep-research/prompts";
import { addOrgKnowledge } from "@/lib/deep-research/store";
import { requireAdminItem } from "@/lib/admin-delegation-server";
import { consumeDeepResearchQuota } from "@/lib/deep-research/quota-server";

export const runtime = "nodejs";
export const maxDuration = 120;

type ParsedKnowledge = {
  title?: string;
  situation?: string;
  content?: string;
  impact?: string;
  actionItems?: string[];
  tags?: string[];
};

export async function POST(request: Request) {
  // 管理者のみ（指示書39）
  const auth = await requireAdminItem("deep-research");
  if (auth.response) return auth.response;
  // 226 §3: 回数の上限（院長は上限なし／任された幹部は1人 月◯回まで）。判定はサーバーで行う
  const quota = await consumeDeepResearchQuota(auth.user);
  if (!quota.ok) {
    return NextResponse.json({ error: quota.message, code: "quota" }, { status: 429 });
  }
  try {
    const { topic, content } = await request.json();
    if (!topic || !content) {
      return NextResponse.json(
        { error: "入力が不足しています（topic / content）" },
        { status: 400 }
      );
    }

    const prompt = getToOrgKnowledgePrompt(topic, content);
    const raw = await generateText(prompt);
    const parsed = parseJsonLoose<ParsedKnowledge>(raw);
    if (!parsed) {
      return NextResponse.json(
        { error: "ナレッジJSONの解析に失敗しました" },
        { status: 502 }
      );
    }

    const result = await addOrgKnowledge({
      title: parsed.title || topic,
      situation: parsed.situation || "",
      content: parsed.content || "",
      impact: parsed.impact || "",
      actionItems: Array.isArray(parsed.actionItems) ? parsed.actionItems.slice(0, 5) : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
    });

    return NextResponse.json({ result });
  } catch (e) {
    console.error("[to-knowledge] error:", e);
    const message = e instanceof Error ? e.message : "変換に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
