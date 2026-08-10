import { NextRequest, NextResponse } from "next/server";
import { getAiBackgroundBlock } from "@/lib/ai-background";
import { callAI } from "@/lib/ai-provider";
import { requireLogin } from "@/lib/require-login";

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

【件数の上限（厳守）】
- steps は最大5ステップまで
- cautions は最大4件まで
- faq は最大3件まで
- todoItems は5〜8件

【todoItemsについて】
このマニュアルに関連するTodoリスト（日次・週次・月次・都度・初回のみ）を5〜8件生成してください。
- timing: 'daily'（毎日）/ 'weekly'（毎週）/ 'monthly'（毎月）/ 'asneeded'（都度）/ 'initial'（初回のみ）
- priority: 'high'（必須）/ 'normal'（推奨）/ 'optional'（任意）

【整形ルール（厳守）】
- 出力テキストには Markdown 記号（##, ###, **, --- など）を一切使わない
- 平易な日本語で。専門用語には簡単な補足を添える
- description は ① ② ③ ... の番号付きで、各手順を改行（\\n）して記載する。1手順1行を基本に、必要に応じて補足を続ける
- checkpoints の各要素は「〜か」「〜できているか」の疑問形で1文完結に書く（配列形式）
- cautions の各要素も1文完結。1配列要素1事項
- faq の a（回答）は2〜3文。番号付きが必要なら ① ② ③ を使う

必ずJSON形式のみで回答（他のテキスト不要）:
{
  "title": "マニュアルタイトル",
  "purpose": "このマニュアルの目的・なぜ必要か（2〜3文。読みやすく改行可）",
  "category": "${category}",
  "steps": [
    {
      "order": 1,
      "title": "ステップタイトル",
      "description": "手順の詳細説明。①②③の番号付きで各手順を改行して記載。Markdownの##や###は使わない。平易な日本語で。",
      "checkpoints": ["〜できているか", "〜が確認できているか"],
      "tips": "このステップのコツ・ポイント（任意・1〜2文）"
    }
  ],
  "todoItems": [
    {
      "text": "Todoの内容（具体的なアクション）",
      "timing": "daily",
      "priority": "high"
    }
  ],
  "cautions": ["注意事項1（失敗しやすいポイントを1文で）", "注意事項2"],
  "faq": [
    { "q": "よくある質問1", "a": "回答1（具体的に）" }
  ]
}

重要: JSONは必ず完結させてください。途中で切れないよう、各配列の要素数を上限内に収めてください。`;
}

function buildSkillMapPrompt(
  roleName: string,
  theme: string,
  notes: string
): string {
  return `${CLINIC_CONTEXT}

あなたは南草津皮フ科の人材育成専門家です。
以下の条件で簡潔なスキル・知識マップを作成してください。

対象ロール: ${roleName}
テーマ: ${theme || roleName + "のスキルマップ"}
特記事項: ${notes || "なし"}

【スキルマップ作成の原則】
- 各レベルで「何のために」を明確に
- クリニックの実際の業務に即した内容
- 文章は短く簡潔に

【厳守ルール】
- レベルは G1 / G2 / G3 の3つのみ
- 各レベルの skills / knowledge / mindset は各3件以内
- 各itemの howToLearn と checkCriteria は30文字以内
- 各itemの description は50文字以内

必ずJSON形式のみで回答（他のテキスト不要）:
{
  "title": "スキルマップタイトル",
  "description": "概要（50文字以内）",
  "levels": [
    {
      "name": "入職〜3ヶ月",
      "grade": "G1",
      "purpose": "目的（30文字以内）",
      "skills": [
        { "title": "スキル名", "description": "説明（50文字以内）", "howToLearn": "習得方法（30文字以内）", "checkCriteria": "確認基準（30文字以内）", "isRequired": true }
      ],
      "knowledge": [
        { "title": "知識名", "description": "説明（50文字以内）", "howToLearn": "学習方法（30文字以内）", "checkCriteria": "確認基準（30文字以内）", "isRequired": true }
      ],
      "mindset": [
        { "title": "マインドセット名", "description": "説明（50文字以内）", "howToLearn": "実践方法（30文字以内）", "checkCriteria": "判断基準（30文字以内）", "isRequired": true }
      ],
      "milestone": "マイルストーン（50文字以内）"
    },
    {
      "name": "一人前（〜1年）",
      "grade": "G2",
      "purpose": "目的（30文字以内）",
      "skills": [],
      "knowledge": [],
      "mindset": [],
      "milestone": "マイルストーン（50文字以内）"
    },
    {
      "name": "エキスパート（1年〜）",
      "grade": "G3",
      "purpose": "目的（30文字以内）",
      "skills": [],
      "knowledge": [],
      "mindset": [],
      "milestone": "マイルストーン（50文字以内）"
    }
  ]
}

非常に重要: JSONは必ず完結させてください。
各配列は最大3件まで。文章は短く簡潔に。
途中で切れると全体が無効になります。`;
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

【impactの記述ルール（厳守）】
impact フィールドは必ず以下の四方よし形式で記述してください。
「【患者よし】〜【スタッフよし】〜【クリニックよし】〜【社会よし】〜」
- 各セクションは1〜2文で簡潔に。
- 該当しないセクションは省略可。
- 例: 【患者よし】待ち時間が短縮される。【スタッフよし】業務が円滑になる。【クリニックよし】満足度が向上する。

必ずJSON形式のみで回答（他のテキスト不要）:
{
  "title": "ナレッジタイトル",
  "type": "${knowledgeType}",
  "situation": "どんな場面・状況か（具体的に）",
  "content": "内容・気づき・学び（詳細に）",
  "impact": "【患者よし】〜。【スタッフよし】〜。【クリニックよし】〜。【社会よし】〜。",
  "actionItems": ["具体的なアクション1", "具体的なアクション2", "具体的なアクション3"],
  "tags": ["タグ1", "タグ2", "タグ3"]
}

重要: JSONは必ず完結させてください。actionItemsは3件、tagsは3件以内に収めてください。`;
}

export async function POST(req: NextRequest) {
  // 161: ログイン必須（関門は proxy.ts。ここは関門が外れたときの二重の歯止め）
  const gate = await requireLogin();
  if (gate.response) return gate.response;

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
      console.log("Generating skillmap for:", { role, theme });
    } else if (type === "knowledge") {
      prompt = buildKnowledgePrompt(
        category ?? "ベストプラクティス",
        theme ?? "",
        notes ?? ""
      );
    } else {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }

    const maxTokens = type === "skillmap" ? 10000 : 8000;

    const aiResult = await callAI({
      claudeModel: "claude-sonnet-4-6",
      maxTokens,
      json: true,
      messages: [{ role: "user", content: (await getAiBackgroundBlock()) + prompt }],
    });

    if (!aiResult.ok) {
      return NextResponse.json(
        { error: `AI API error: ${(aiResult.error || "").slice(0, 200)}` },
        { status: 500 }
      );
    }

    const text = aiResult.text;

    // デバッグ用ログ（Vercelのログで確認）
    console.log("Response length:", text.length);
    console.log("First 200 chars:", text.slice(0, 200));
    console.log("Last 200 chars:", text.slice(-200));

    let result: unknown = null;

    // パターン1: ```json ... ``` ブロック
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      try {
        result = JSON.parse(jsonBlockMatch[1].trim());
        console.log("Parsed via json block");
      } catch (e) {
        console.log("json block parse failed:", e);
      }
    }

    // パターン2: 最初の { から最後の } まで（必要なら不完全なJSONを修復）
    if (!result) {
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const jsonStr = text.slice(firstBrace, lastBrace + 1);
        try {
          result = JSON.parse(jsonStr);
          console.log("Parsed via brace matching");
        } catch (e) {
          console.log("brace match parse failed, trying to fix...", e);
          try {
            // 開いている配列・オブジェクトを閉じて修復を試みる
            let fixedJson = jsonStr;
            const openBrackets = (fixedJson.match(/\[/g) || []).length;
            const closeBrackets = (fixedJson.match(/\]/g) || []).length;
            const openBraces = (fixedJson.match(/\{/g) || []).length;
            const closeBraces = (fixedJson.match(/\}/g) || []).length;
            for (let i = 0; i < openBrackets - closeBrackets; i++)
              fixedJson += "]";
            for (let i = 0; i < openBraces - closeBraces; i++) fixedJson += "}";
            result = JSON.parse(fixedJson);
            console.log("Parsed via fixed json");
          } catch (e2) {
            console.log("Fix failed:", e2);
          }
        }
      }
    }

    // パターン3: 末尾切れの不完全JSONを正面突破（最初の { から）
    if (!result) {
      const firstBrace = text.indexOf("{");
      if (firstBrace !== -1) {
        let jsonStr = text.slice(firstBrace);
        // 末尾のカンマを除去
        jsonStr = jsonStr.replace(/,\s*$/, "");
        const openBrackets = (jsonStr.match(/\[/g) || []).length;
        const closeBrackets = (jsonStr.match(/\]/g) || []).length;
        const openBraces = (jsonStr.match(/\{/g) || []).length;
        const closeBraces = (jsonStr.match(/\}/g) || []).length;
        for (let i = 0; i < openBrackets - closeBrackets; i++) jsonStr += "]";
        for (let i = 0; i < openBraces - closeBraces; i++) jsonStr += "}";
        try {
          result = JSON.parse(jsonStr);
          console.log("Parsed via aggressive fix");
        } catch (e3) {
          console.log("Aggressive fix failed:", e3);
        }
      }
    }

    if (!result && type === "skillmap") {
      console.warn("Skillmap parse failed, returning fallback skillmap");
      result = {
        title: theme || `${roleName}スキルマップ`,
        description: `${roleName}の成長に必要なスキル・知識・マインドセット`,
        levels: [
          {
            name: "入職〜3ヶ月",
            grade: "G1",
            purpose: "基礎を固める",
            skills: [
              {
                title: "基本業務の習得",
                description: "担当業務の基本を習得する",
                howToLearn: "OJT",
                checkCriteria: "一人でできる",
                isRequired: true,
              },
            ],
            knowledge: [
              {
                title: "クリニック概要",
                description: "診療内容を把握する",
                howToLearn: "マニュアル",
                checkCriteria: "説明できる",
                isRequired: true,
              },
            ],
            mindset: [
              {
                title: "凡事徹底",
                description: "基本を徹底する",
                howToLearn: "日々実践",
                checkCriteria: "習慣化している",
                isRequired: true,
              },
            ],
            milestone: "一人で基本業務をこなせる",
          },
        ],
      };
    }

    if (!result) {
      console.error("All parse attempts failed. Full text:", text);
      return NextResponse.json(
        {
          error: "JSON parse failed",
          raw: text.slice(0, 1000),
          hint: "Check Vercel logs for full response",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
