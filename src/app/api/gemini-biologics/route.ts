import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { action, drugName, currentData } = await req.json()

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  const today = new Date().toISOString().slice(0, 10)

  const prompt = action === 'verify_all'
    ? `あなたは日本の皮膚科専門医です。以下の皮膚科で使用される生物学的製剤について、
日本の最新の添付文書（2025年以降）に基づいて投与スケジュールとレセプト摘要欄記載事項を確認し、
誤りや古い情報があれば修正してください。

確認する製剤:
${JSON.stringify(currentData, null, 2)}

【確認項目】
1. 薬剤名・一般名の正確性
2. 投与スケジュール（導入・維持）の正確性
3. 適応疾患・効能効果
4. レセプト摘要欄の最新記載要件
5. 自己注射の可否
6. 保険適用条件
7. 高額療養費制度の適用
8. 【重要】禁忌・使用上の注意:
   - 絶対禁忌（活動性感染症・結核・悪性腫瘍・妊娠など）
   - 投与前スクリーニング必須事項（QFT・HBV・HCVなど）
   - 生ワクチン接種の制限
   - 他の免疫抑制薬との併用注意
   - 妊婦・授乳婦への投与
9. レセプト摘要欄の最新記載要件

以下のJSON形式のみで返答してください（マークダウン不可）:
{
  "results": [
    {
      "id": "薬剤ID",
      "name": "薬剤名",
      "hasChanges": true/false,
      "changes": [
        {
          "field": "変更したフィールド名",
          "old": "旧内容",
          "new": "新内容",
          "reason": "変更理由（添付文書の根拠）"
        }
      ],
      "verifiedSchedule": {
        "induction": "正確な導入投与スケジュール",
        "maintenance": "正確な維持投与スケジュール",
        "selfInjection": true/false,
        "note": "補足"
      },
      "lastConfirmed": "${today}"
    }
  ],
  "summary": "全体的な確認結果の要約",
  "updatedAt": "${today}"
}`
    : `あなたは日本の皮膚科専門医です。「${drugName}」について、
日本の最新の添付文書に基づいて以下を正確に教えてください:

現在のデータ:
${JSON.stringify(currentData, null, 2)}

以下のJSON形式のみで返答してください:
{
  "name": "薬剤名",
  "genericName": "一般名",
  "target": "作用標的",
  "schedule": {
    "induction": "導入投与（本数・量・間隔を具体的に）",
    "maintenance": "維持投与（本数・量・間隔を具体的に）",
    "selfInjection": true/false,
    "note": "特記事項"
  },
  "receiptNotes": [
    {
      "disease": "疾患名",
      "required": ["必須記載項目1", "必須記載項目2"],
      "timing": "記載タイミング"
    }
  ],
  "changes": ["変更点の説明"],
  "lastConfirmed": "${today}"
}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
          }
        })
      }
    )

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: err }, { status: response.status })
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // JSONを抽出
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Invalid response from Gemini', raw: text }, { status: 500 })
    }

    const result = JSON.parse(jsonMatch[0])
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
