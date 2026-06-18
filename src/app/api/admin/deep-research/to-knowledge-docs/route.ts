/**
 * リサーチ結果 → AI参照資料（knowledge_docs）へ追加 API
 * ※ Gemini変換なし。本文をそのまま1件として追加（AIチャット等で参照される）。
 * ※ category: 既定 'other'、perspective が medical のとき 'drug_detail'。
 */
import { NextResponse } from "next/server";
import { addKnowledgeDoc } from "@/lib/deep-research/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { topic, content, perspective } = await request.json();
    if (!topic || !content) {
      return NextResponse.json(
        { error: "入力が不足しています（topic / content）" },
        { status: 400 }
      );
    }

    const category = perspective === "medical" ? "drug_detail" : "other";
    const doc = await addKnowledgeDoc({
      title: topic,
      category,
      content,
      fileType: "research",
    });

    return NextResponse.json({ result: doc });
  } catch (e) {
    console.error("[to-knowledge-docs] error:", e);
    const message = e instanceof Error ? e.message : "追加に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
