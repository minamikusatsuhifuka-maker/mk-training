import { NextResponse } from "next/server";
import { requireLogin } from "@/lib/require-login";
import { callAI } from "@/lib/ai-provider";

export const maxDuration = 30;

// 薬剤候補名の検索API（Step1→Step2用）
// キーワードを受け取り、PMDA添付文書・保険診療に基づく代表的な薬剤名を返す
// 175: Claude 直書きをやめ、共通の callAI（既定 gemini-3.8-flash・管理トグル対応）へ
export async function POST(request: Request) {
  // 161: ログイン必須（関門は proxy.ts。ここは関門が外れたときの二重の歯止め）
  const gate = await requireLogin();
  if (gate.response) return gate.response;

  const body = await request.json();
  const { keyword } = body as { keyword?: string };
  if (!keyword || typeof keyword !== "string") {
    return NextResponse.json({ error: "キーワードが指定されていません" }, { status: 400 });
  }

  const prompt = `日本の皮膚科クリニックで使用される以下のカテゴリの薬剤を全て列挙してください。
キーワード: ${keyword}

PMDA添付文書・日本の保険診療に基づいて、実際に処方される代表的な薬剤を列挙してください。
ジェネリックは含めず、代表的な先発品・採用品を列挙してください。

必ずJSON形式のみで回答（他のテキスト不要）:
{
  "candidates": [
    {
      "name": "商品名（規格も含む）例: パタノール点眼液0.1%",
      "genericName": "一般名 例: オロパタジン塩酸塩",
      "category": "薬剤カテゴリ 例: 抗アレルギー点眼薬"
    }
  ]
}`;

  try {
    const res = await callAI({
      messages: [{ role: "user", content: prompt }],
      maxTokens: 2000,
      json: true,
    });

    if (!res.ok) {
      // 失敗は隠さず返す（別モデルへ切り替えない・利用者が再実行する）
      return NextResponse.json(
        { error: `AI エラー（${res.provider}）: ${(res.error ?? "").slice(0, 200)}`, candidates: [] },
        { status: 500 }
      );
    }

    const cleaned = res.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ candidates: [] });
    }

    try {
      const result = JSON.parse(jsonMatch[0]);
      return NextResponse.json({ candidates: result.candidates ?? [], model: res.model });
    } catch {
      return NextResponse.json({ candidates: [] });
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: `ネットワークエラー: ${e instanceof Error ? e.message : "不明"}`,
        candidates: [],
      },
      { status: 500 }
    );
  }
}
