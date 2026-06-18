/**
 * ディープリサーチ結果の保存 API
 * ※ content_store（案A: インデックス＋本体分離）へ store.saveResearch 経由で保存。
 */
import { NextResponse } from "next/server";
import { saveResearch } from "@/lib/deep-research/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { topic, mode, content, sources, model } = body;

    if (!topic || !content) {
      return NextResponse.json(
        { error: "必須項目（topic / content）が不足しています" },
        { status: 400 }
      );
    }

    const result = await saveResearch({
      topic,
      mode: mode || null,
      model: model || null,
      content,
      sources: Array.isArray(sources) ? sources : [],
    });

    return NextResponse.json({ result });
  } catch (e) {
    console.error("Deep Research save error:", e);
    const message = e instanceof Error ? e.message : "保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
