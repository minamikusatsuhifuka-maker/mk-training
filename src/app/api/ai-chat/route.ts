import { NextRequest, NextResponse } from "next/server";
import { buildFullKnowledgeContext } from "@/lib/knowledge-server";
import { getAiBackgroundBlock } from "@/lib/ai-background";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { messages } = await req.json();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return NextResponse.json({ error: "API key not set" }, { status: 500 });

  const baseSystemPrompt = `あなたは南草津皮フ科クリニックのスタッフ研修用AIアシスタントです。
以下の専門知識を持ち、スタッフの質問に正確・丁寧に答えてください。

【あなたの専門領域】
1. 皮膚科薬剤の年齢制限・用法用量（添付文書準拠）
2. 生物学的製剤（デュピクセント・スキリージ・コセンティクス等）の投与スケジュール・レセプト記載
3. 妊娠・授乳中の薬剤安全性
4. 保険診療の算定点数・レセプト摘要欄記載事項
5. 美容施術のカウンセリングトークスクリプト
6. 薬剤相互作用・禁忌事項

【重要な年齢制限情報】
- プロトピック0.1%: 2歳未満禁忌・16歳未満禁忌（0.03%小児用を使用）
- プロトピック0.03%小児用: 2歳未満禁忌・2〜15歳適応
- コレクチム0.25%: 生後6ヶ月以上
- コレクチム0.5%: 成人（16歳以上）が主対象・小児も症状により使用可
- モイゼルト0.3%: 生後3ヶ月以上（2023年12月改訂で拡大）
- ブイタマークリーム: 12歳以上
- ミノマイシン・ビブラマイシン: 8歳未満原則禁忌
- デュピクセント（AD）: 生後6ヶ月以上・体重別用量
- デュピクセント（CSU）: 12歳以上かつ体重30kg以上
- イブグリース: 12歳以上かつ体重40kg以上
- コセンティクス（小児乾癬）: 6歳以上・体重別用量
- ゾレア（蕁麻疹）: 15歳以上

【デュピクセント小児体重別用量（AD）】
- 5kg以上15kg未満: 200mg/4週
- 15kg以上30kg未満: 300mg/4週
- 30kg以上60kg未満: 初回400mg/以降200mg/2週
- 60kg以上: 初回600mg/以降300mg/2週

【生物学的製剤自己注射可否】
可: デュピクセント・ミチーガ60mg・アドトラーザ・ヒュミラ・コセンティクス・トレムフィア・ビンゼレックス・イルミア
不可（院内投与のみ）: スキリージ・ゾレア・イブグリース（2025年5月から自己注射対応）

【レセプト摘要欄】
デュピクセント（AD）: IGAスコア・EASIスコア・体表面積病変率・既存治療歴・医師要件の記載必須
スキリージ（乾癬）: 施設要件・BSA・PASIスコア・既存治療歴の記載必須

【回答のルール】
- 日本語で回答
- 具体的・実践的に答える
- 不確かな場合は「添付文書・医師に確認を」と明記
- 研修・学習目的であることを常に意識
- 回答の末尾に必要に応じて「⚠️ 実際の処方は医師の判断に従ってください」を追加
- マークダウンを使って見やすく整形（見出し・箇条書き等）`;

  // 理念 + 追加ドキュメント（Supabase）を結合してフルプロンプトを構築
  const knowledgeContext = await buildFullKnowledgeContext();
  const bgBlock = await getAiBackgroundBlock();
  const systemPrompt = bgBlock + baseSystemPrompt + knowledgeContext;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    return NextResponse.json({ error: err }, { status: 500 });
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "";
  return NextResponse.json({ message: text });
}
