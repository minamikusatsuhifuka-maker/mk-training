/**
 * 「必須のまとめ」（約1000字・プレーンテキスト整形）生成 API
 * ※ 出力は Markdown 記号を使わないプレーンテキスト（◆/・/【】整形）。表示は whitespace-pre-wrap。
 */
import { NextResponse } from "next/server";
import { generateText, stripCodeFence } from "@/lib/deep-research/gemini-research";
import { getEssentialsPrompt } from "@/lib/deep-research/prompts";
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
    const { content, topic } = await request.json();
    if (!content || !topic) {
      return NextResponse.json(
        { error: "入力が不足しています（content / topic）" },
        { status: 400 }
      );
    }

    const prompt = getEssentialsPrompt(topic, content);
    const text = stripCodeFence(await generateText(prompt));

    return NextResponse.json({ markdown: text });
  } catch (e) {
    console.error("[essentials] error:", e);
    const message = e instanceof Error ? e.message : "必須のまとめの生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
