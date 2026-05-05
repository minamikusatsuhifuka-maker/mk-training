import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const ROLE_LABELS: Record<string, string> = {
  "multi-office":
    "マルチタスク医療事務（医療事務・クラーク・カウンセラーの3役）",
  nurse: "看護師",
  all: "全スタッフ共通",
};

export async function POST(req: NextRequest) {
  try {
    const { role, customRole, dialogContext, mode } = (await req.json()) as {
      role: string;
      customRole?: string;
      dialogContext?: Record<string, string> | string;
      mode?: "dialog" | "template";
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
        : ROLE_LABELS[role] ?? role;

    const contextSummary =
      mode === "dialog" && dialogContext
        ? `\n\n【対話で収集した情報】\n${
            typeof dialogContext === "string"
              ? dialogContext
              : JSON.stringify(dialogContext, null, 2)
          }`
        : "";

    const prompt = `あなたは南草津皮フ科クリニックの人材育成の専門家です。
以下のロールのスタッフ向けに、6種類の成長支援資料を作成してください。

対象ロール: ${roleName}${contextSummary}

クリニックの理念・哲学:
- ミッション: 患者様の人生好転・物心両面の幸福への貢献
- 四方よし: 患者・スタッフ・クリニック・社会全員にとって良い選択
- 成功の八原則: ビジョン・コミットメント・冒険・パートナーシップ・正直・シェア・責任・凡事徹底
- リードマネジメント: 外的コントロールをせず内発的動機を引き出す
- 7つの実: 実行・実績・実力・実現・充実・誠実・結実

以下の6つの資料を作成してください。
各資料は実践的・具体的で、スタッフがすぐに使えるレベルにしてください。

必ずJSON形式のみで回答（他のテキスト不要）:
{
  "purpose": "## 🎯 何のために（パーパス・存在意義）\\n\\n### このロールの使命\\n（このロールが存在する理由・患者への価値・チームへの価値を3〜5段落で記述）\\n\\n### 四方よしの観点から\\n（患者・スタッフ・クリニック・社会それぞれへの貢献を記述）\\n\\n### 理念との接点\\n（クリニックの理念とこのロールのつながりを記述）",
  "todo": "## ✅ やってほしいことリスト\\n\\n### 毎日やること（日次）\\n- [ ] （具体的なタスク1）\\n- [ ] （具体的なタスク2）\\n\\n### 毎週やること（週次）\\n- [ ] （具体的なタスク）\\n\\n### 毎月やること（月次）\\n- [ ] （具体的なタスク）\\n\\n### 優先度の考え方\\n（何を最優先にすべきかの指針）",
  "beginner": "## 📚 初心者脱却に必要なスキル・知識（〜3ヶ月）\\n\\n### 必須スキル（まず習得すること）\\n- [ ] （スキル1）: （習得の目安・方法）\\n\\n### 必須知識（まず覚えること）\\n- [ ] （知識1）: （覚え方・確認方法）\\n\\n### 3ヶ月後の目指す姿\\n（具体的にどんな状態になっていれば初心者脱却か）\\n\\n### 学習リソース\\n（このアプリのどのページを使えばよいか）",
  "expert": "## ⭐ エキスパートに必要なスキル・知識（1〜2年）\\n\\n### 高度なスキル\\n- [ ] （スキル1）: （エキスパートレベルの定義）\\n\\n### 専門知識\\n- [ ] （知識1）: （深化のポイント）\\n\\n### エキスパートの行動特性\\n（エキスパートはどんな場面でどう動くか・具体的な行動例）\\n\\n### 7つの実との対応\\n（実行・実績・実力・実現・充実・誠実・結実それぞれをこのロールでどう体現するか）",
  "manual": "## 📖 業務マニュアル（手順書）\\n\\n### 基本業務フロー\\n1. （ステップ1）\\n   - 注意点: （具体的な注意点）\\n2. （ステップ2）\\n\\n### よくあるシーン別の対応\\n#### （シーン1: 例「患者からクレームがあったとき」）\\n手順:\\n1. ...\\n\\n### よくある質問（FAQ）\\nQ: （質問）\\nA: （回答）\\n\\n### 重要な注意事項\\n（ミスが起きやすい点・必ず確認すべき点）",
  "mindset": "## 💡 大切にしてほしいマインドセット\\n\\n### このロールの核心にある考え方\\n（2〜3段落で、このロールで最も大切なマインドを記述）\\n\\n### 成功の八原則の実践\\n1. 明確なビジョン: （このロールでのビジョンの持ち方）\\n2. コミットメント: （このロールでのコミットメントの意味）\\n3. 冒険: （安全圏から出ることの具体例）\\n4. パートナーシップ: （誰とどう連携するか）\\n5. 正直: （正直さを実践する場面）\\n6. シェアする: （何を共有するか）\\n7. 責任（自分が源）: （自責で考える場面）\\n8. 凡事徹底: （このロールの凡事とは何か）\\n\\n### 日々の実践チェック\\n- 今日、四方よしの選択ができましたか？\\n- 今日、誰かの役に立てましたか？\\n- 今日、一つでも新しいことを学びましたか？\\n- 今日、感謝を伝えましたか？"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
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
      const result = JSON.parse(jsonMatch[0]);
      return NextResponse.json(result);
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
