import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const ROLE_LABELS: Record<string, string> = {
  "multi-office":
    "マルチタスク医療事務（医療事務・クラーク・カウンセラーの3役）",
  nurse: "看護師",
  all: "全スタッフ共通",
};

const CLINIC_CONTEXT = `
【クリニック情報】
- クリニック名: 南草津皮フ科
- 診療内容: 保険診療（皮膚科）× 美容診療のハイブリッド
- 理念: 患者様の人生好転・物心両面の幸福への貢献・四方よし
- 組織: ティール組織を目指す自律型組織
- 主な治療: アトピー・乾癬・ニキビ・シミ・脱毛・生物学的製剤`;

function buildManualPrompt(
  roleName: string,
  theme: string,
  category: string,
  notes: string
): string {
  return `${CLINIC_CONTEXT}

あなたは南草津皮フ科の業務改善コンサルタントです。
以下の条件で実践的な業務マニュアルを作成してください。

対象ロール: ${roleName}
テーマ: ${theme}
カテゴリ: ${category}
特記事項: ${notes || "なし"}

【マニュアル作成の原則】
- 誰が見ても同じ品質で実行できるレベルの具体性
- なぜそうするのか（目的・理念との接点）を必ず記載
- 失敗しやすいポイント・注意事項を明記
- 患者への配慮・四方よしの視点を含める

必ずJSON形式のみで回答（他のテキスト不要）:
{
  "title": "マニュアルタイトル",
  "purpose": "このマニュアルの目的・なぜ必要か（2〜3文）",
  "category": "${category}",
  "steps": [
    {
      "order": 1,
      "title": "ステップタイトル",
      "description": "詳細な手順の説明（具体的に）",
      "checkpoints": ["確認ポイント1", "確認ポイント2"],
      "tips": "このステップのコツ・ポイント（任意）"
    }
  ],
  "cautions": ["注意事項1（失敗しやすいポイント）", "注意事項2"],
  "faq": [
    { "q": "よくある質問1", "a": "回答1（具体的に）" }
  ]
}`;
}

function buildSkillMapPrompt(
  roleName: string,
  theme: string,
  notes: string
): string {
  return `${CLINIC_CONTEXT}

あなたは南草津皮フ科の人材育成専門家です。
以下の条件でスキル・知識マップを作成してください。

対象ロール: ${roleName}
テーマ: ${theme || roleName + "のスキルマップ"}
特記事項: ${notes || "なし"}

【スキルマップ作成の原則】
- 各レベルで「何のために」を明確に
- 具体的で測定可能な習得基準
- 理念（四方よし・成功の八原則・7つの実）と接続
- クリニックの実際の業務に即した内容

必ずJSON形式のみで回答（他のテキスト不要）:
{
  "title": "スキルマップタイトル",
  "description": "このスキルマップの目的と概要",
  "levels": [
    {
      "name": "入職〜3ヶ月（一人前への準備）",
      "grade": "G1",
      "purpose": "このレベルの目的・なぜ必要か",
      "skills": [
        { "title": "スキル名", "description": "スキルの説明", "howToLearn": "習得方法（具体的に）", "checkCriteria": "習得確認基準（測定可能な形で）", "isRequired": true }
      ],
      "knowledge": [
        { "title": "知識名", "description": "知識の内容", "howToLearn": "学習方法", "checkCriteria": "理解確認基準", "isRequired": true }
      ],
      "mindset": [
        { "title": "マインドセット", "description": "なぜこの考え方が必要か", "howToLearn": "日常での実践方法", "checkCriteria": "体現できているかの判断基準", "isRequired": true }
      ],
      "milestone": "このレベルをクリアした状態の定義（具体的に）"
    },
    {
      "name": "一人前（〜1年）",
      "grade": "G2",
      "purpose": "...",
      "skills": [],
      "knowledge": [],
      "mindset": [],
      "milestone": "..."
    },
    {
      "name": "エキスパート（1年〜）",
      "grade": "G3",
      "purpose": "...",
      "skills": [],
      "knowledge": [],
      "mindset": [],
      "milestone": "..."
    }
  ]
}`;
}

function buildKnowledgePrompt(
  category: string,
  theme: string,
  notes: string
): string {
  const typeMap: Record<string, string> = {
    改善提案: "improvement",
    成功事例: "success",
    失敗から学ぶ: "learning",
    ベストプラクティス: "bestpractice",
  };
  const knowledgeType = typeMap[category] ?? "bestpractice";

  return `${CLINIC_CONTEXT}

あなたは南草津皮フ科の組織開発コンサルタントです。
以下のカテゴリで組織発展に役立つナレッジを生成してください。

カテゴリ: ${category}（改善提案/成功事例/失敗から学ぶ/ベストプラクティス）
テーマ: ${theme || "皮膚科クリニックの業務全般"}
特記事項: ${notes || "なし"}

必ずJSON形式のみで回答（他のテキスト不要）:
{
  "title": "ナレッジタイトル",
  "type": "${knowledgeType}",
  "situation": "どんな場面・状況か（具体的に）",
  "content": "内容・気づき・学び（詳細に）",
  "impact": "組織への影響・価値（四方よしの観点から）",
  "actionItems": ["具体的なアクション1", "具体的なアクション2", "具体的なアクション3"],
  "tags": ["タグ1", "タグ2", "タグ3"]
}`;
}

export async function POST(req: NextRequest) {
  try {
    const { type, role, customRole, theme, category, notes } =
      (await req.json()) as {
        type: "manual" | "skillmap" | "knowledge";
        role?: string;
        customRole?: string;
        theme?: string;
        category?: string;
        notes?: string;
      };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY が設定されていません" },
        { status: 500 }
      );
    }

    const roleName =
      role === "custom"
        ? customRole?.trim() || "カスタムロール"
        : ROLE_LABELS[role ?? ""] ?? role ?? "全スタッフ共通";

    let prompt = "";
    if (type === "manual") {
      prompt = buildManualPrompt(
        roleName,
        theme ?? "",
        category ?? "その他",
        notes ?? ""
      );
    } else if (type === "skillmap") {
      prompt = buildSkillMapPrompt(roleName, theme ?? "", notes ?? "");
    } else if (type === "knowledge") {
      prompt = buildKnowledgePrompt(
        category ?? "ベストプラクティス",
        theme ?? "",
        notes ?? ""
      );
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 6000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Anthropic API error: ${errText.slice(0, 200)}` },
        { status: 500 }
      );
    }

    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    const text = data.content?.[0]?.text ?? "";
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "Parse error", raw: text.slice(0, 200) },
        { status: 500 }
      );
    }

    try {
      return NextResponse.json(JSON.parse(jsonMatch[0]));
    } catch {
      return NextResponse.json(
        { error: "JSON parse failed", raw: text.slice(0, 200) },
        { status: 500 }
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
