import { NextRequest, NextResponse } from "next/server";
import { getAiBackgroundBlock } from "@/lib/ai-background";
import { callAI } from "@/lib/ai-provider";
import { requireLogin } from "@/lib/require-login";

export const maxDuration = 60;

type DialogMessage = {
  role: "ai" | "user";
  content: string;
};

const ROLE_LABELS: Record<string, string> = {
  "multi-office": "マルチタスク医療事務（医療事務・クラーク・カウンセラーの3役）",
  nurse: "看護師",
  all: "全スタッフ共通",
};

export async function POST(req: NextRequest) {
  // 161: ログイン必須（関門は proxy.ts。ここは関門が外れたときの二重の歯止め）
  const gate = await requireLogin();
  if (gate.response) return gate.response;

  try {
    const { messages, role, customRole, dialogStep } = (await req.json()) as {
      messages: DialogMessage[];
      role: string;
      customRole?: string;
      dialogStep: number;
    };

    const roleName =
      role === "custom"
        ? customRole?.trim() || "カスタムロール"
        : ROLE_LABELS[role] ?? role;

    const systemPrompt = `あなたは南草津皮フ科クリニックの人材育成コーチです。
スタッフの成長ロードマップを作るために、温かく・的確に対話をリードしてください。

対象ロール: ${roleName}
現在の対話ステップ: ${dialogStep}

【対話の目的】
スタッフの現状・課題・目標を把握し、以下の6種類の資料生成に必要な情報を収集する:
1. 何のために（パーパス・存在意義）
2. やってほしいことリスト（ToDo）
3. 初心者脱却に必要なスキル・知識（〜3ヶ月）
4. エキスパートに必要なスキル・知識（1〜2年）
5. マニュアル（業務手順書）
6. マインドセット（理念・考え方）

【対話の進め方】
- Step 0: 現状確認（入職時期、今の業務内容、自信の度合い）
- Step 1: 課題・困りごと
- Step 2: 目指したいレベル・理想の姿
- Step 3: 特に重点を置きたい領域
- Step 4: クリニックの理念との接点
- Step 5以降: 「十分な情報が集まりました。下のボタンから資料を生成しますか？」と案内

【対話のルール】
- リードマネジメントの精神で関わる（外的コントロールをしない）
- 質問は1回に1つだけ
- スタッフの言葉を肯定・承認してから次の質問へ
- クリニックの理念（四方よし・凡事徹底・成功の八原則・先払い・インサイドアウト）を自然に織り交ぜる
- 返答は200文字以内で簡潔に
- Markdownの**太字**は使ってよいが、箇条書きは最小限に`;

    const result = await callAI({
      claudeModel: "claude-sonnet-4-6",
      maxTokens: 500,
      system: (await getAiBackgroundBlock()) + systemPrompt,
      messages: messages.map((m) => ({
        role: (m.role === "ai" ? "assistant" : "user") as
          | "assistant"
          | "user",
        content: m.content,
      })),
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: `AI API error: ${(result.error || "").slice(0, 200)}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: result.text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
