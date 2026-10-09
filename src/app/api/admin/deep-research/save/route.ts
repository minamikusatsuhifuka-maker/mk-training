/**
 * ディープリサーチ結果の保存 API
 * ※ content_store（案A: インデックス＋本体分離）へ store.saveResearch 経由で保存。
 */
import { NextResponse } from "next/server";
import { saveResearch } from "@/lib/deep-research/store";
import { requireAdminItem } from "@/lib/admin-delegation-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // 管理者のみ（指示書39）
  const auth = await requireAdminItem("deep-research");
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    const { topic, mode, content, sources, model } = body;

    if (!topic || !content) {
      return NextResponse.json(
        { error: "必須項目（topic / content）が不足しています" },
        { status: 400 }
      );
    }

    // 226 §3: 作った人を記録する（一覧で分かるようにする）
    const meta = auth.user.user_metadata as Record<string, unknown> | null;
    const createdByName =
      (typeof meta?.display_name === "string" && meta.display_name.trim()) ||
      auth.user.email ||
      "名前未設定";

    const result = await saveResearch({
      topic,
      mode: mode || null,
      model: model || null,
      content,
      sources: Array.isArray(sources) ? sources : [],
      createdByName,
      createdById: auth.user.id,
    });

    return NextResponse.json({ result });
  } catch (e) {
    console.error("Deep Research save error:", e);
    const message = e instanceof Error ? e.message : "保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
