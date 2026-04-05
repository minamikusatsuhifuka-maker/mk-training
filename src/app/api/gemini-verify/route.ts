import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

    // 一括評価の場合
    if (body.items && Array.isArray(body.items)) {
      const { contentType, items } = body
      const itemsSummary = items.map((item: { id: string; name: string; data: unknown }) => ({
        id: item.id,
        name: item.name,
        data: item.data,
      }))

      const batchPrompt = `あなたは日本の皮膚科専門医・薬剤師・医療専門家です。
以下の${contentType}データについて、最新の医学的知見・添付文書・ガイドライン（2025〜2026年）に基づいて
各項目の正確性を評価してください。

評価対象データ:
${JSON.stringify(itemsSummary, null, 2).slice(0, 6000)}

以下の点を確認してください:
1. 医学的な誤り・古い情報・不正確な記載
2. 2024〜2026年の新しい知見・承認薬・ガイドライン改訂による変更点
3. 日本の添付文書・保険適用との相違

必ずJSON形式のみで回答（マークダウン不可）:
{
  "summary": "全体的な評価サマリー（2〜3文）",
  "totalItems": ${items.length},
  "issuesFound": 問題あり件数,
  "results": [
    {
      "id": "アイテムID",
      "name": "アイテム名",
      "isCorrect": true,
      "severity": "none|low|medium|high",
      "issues": ["問題点1", "問題点2"],
      "newKnowledge": ["新しい知見・変更点"],
      "corrections": {"フィールド名": "修正内容"},
      "confidence": "high|medium|low"
    }
  ]
}`

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: batchPrompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
          }),
        }
      )

      if (!response.ok) {
        const err = await response.text()
        return NextResponse.json({ error: err }, { status: 500 })
      }

      const data = await response.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return NextResponse.json({ error: 'Invalid response', raw: text.slice(0, 500) }, { status: 500 })

      return NextResponse.json({ ...JSON.parse(jsonMatch[0]), model: 'gemini-2.5-pro' })
    }

    // 既存の単一アイテム評価処理
    const { contentType, itemName, currentData } = body

    const prompts: Record<string, string> = {
      drug: `あなたは日本の薬剤師・皮膚科専門医です。
以下の薬剤情報について、日本の最新の添付文書・医薬品インタビューフォーム（2025〜2026年）に基づいて
正確性を厳密に確認してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

【確認項目（全て必ず確認すること）】
1. 薬品名（商品名）の正確性
2. 一般名（成分名）の正確性
3. 規格・含量・剤形の正確性（例：g数・mL数・%濃度・剤形名）
4. カテゴリ分類の適切性
5. 適応疾患・効能効果の正確性（保険適用上の正式病名を使用）
6. 用法用量の正確性（1日回数・使用量・使用期間）
7. 【重要】禁忌事項:
   - 絶対禁忌（使用してはならない患者・疾患・薬剤との併用）
   - 慎重投与（特定の患者群での注意）
   - 妊婦・授乳婦への投与制限
   - 小児への投与制限
   - 高齢者への注意
8. 重要な副作用・警告
9. 主な薬物相互作用
10. 2024〜2026年の新しい知見・適応拡大・添付文書改訂

必ずJSON形式のみで回答（マークダウン不可）:
{
  "name": "薬品名",
  "isCorrect": true,
  "severity": "none|low|medium|high",
  "issues": ["問題点1", "問題点2"],
  "contraindications": {
    "absolute": ["絶対禁忌1（例：妊婦禁忌・〇〇との併用禁忌）"],
    "caution": ["慎重投与1（例：腎機能障害患者）"],
    "pregnancy": "妊娠中の安全性（例：禁忌/有益性投与/比較的安全）",
    "lactation": "授乳中の安全性",
    "pediatric": "小児への注意（例：〇歳未満禁忌）",
    "elderly": "高齢者への注意"
  },
  "newKnowledge": ["新しい知見・変更点"],
  "corrections": {"フィールド名": "修正内容"},
  "confidence": "high|medium|low"
}`,

      disease: `あなたは日本の皮膚科専門医です。
以下の皮膚疾患情報の正確性を確認してください。
疾患名・説明・原因・治療法・患者説明に誤りがないか確認してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

必ずJSON形式のみで回答（マークダウン不可）:
{"name":"疾患名","isCorrect":true,"issues":["問題点"],"corrections":{"field":"修正内容"},"confidence":"high"}`,

      quiz: `あなたは日本の皮膚科専門医・薬剤師です。
以下のクイズ問題の正確性を確認してください。
問題文・選択肢・正解・解説に誤りがないか確認してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

必ずJSON形式のみで回答（マークダウン不可）:
{"question":"問題文","isCorrect":true,"issues":["問題点"],"corrections":{"field":"修正内容"},"confidence":"high"}`,

      contraindication: `あなたは日本の薬剤師・皮膚科専門医です。
以下の禁忌・注意事項の正確性を確認してください。
薬剤名・疾患名・禁忌の理由・対処法に誤りがないか確認してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

必ずJSON形式のみで回答（マークダウン不可）:
{"drug":"薬剤名","isCorrect":true,"issues":["問題点"],"corrections":{"field":"修正内容"},"confidence":"high"}`,

      pregnancy: `あなたは日本の産婦人科医・薬剤師・皮膚科専門医です。
以下の妊娠・授乳中の薬剤安全性情報の正確性を確認してください。
妊娠中・授乳中の安全性レベル・注意事項に誤りがないか確認してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

必ずJSON形式のみで回答（マークダウン不可）:
{"name":"薬品名","isCorrect":true,"issues":["問題点"],"corrections":{"field":"修正内容"},"confidence":"high"}`,

      interaction: `あなたは日本の薬剤師・皮膚科専門医です。
以下の薬剤相互作用情報の正確性を確認してください。
薬剤名・重大度・作用機序・副作用・対処法に誤りがないか確認してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

必ずJSON形式のみで回答（マークダウン不可）:
{"drugs":"薬剤の組み合わせ","isCorrect":true,"issues":["問題点"],"corrections":{"field":"修正内容"},"confidence":"high"}`,

      medical_fee: `あなたは日本の医療事務専門家・皮膚科専門医です。
以下の保険診療算定点数情報の正確性を確認してください（2024年度診療報酬）。
算定コード・点数・カテゴリ・説明・注意点に誤りがないか確認してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

必ずJSON形式のみで回答（マークダウン不可）:
{"name":"算定項目名","isCorrect":true,"issues":["問題点"],"corrections":{"field":"修正内容"},"confidence":"high"}`,

      counseling: `あなたは日本の美容皮膚科専門家・カウンセラーです。
以下のカウンセリングガイドの正確性と適切性を確認してください。
施術名・クリアチェック項目・トークスクリプトに誤りがないか確認してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

必ずJSON形式のみで回答（マークダウン不可）:
{"treatment":"施術名","isCorrect":true,"issues":["問題点"],"corrections":{"field":"修正内容"},"confidence":"high"}`,

      skincare: `あなたは日本の美容皮膚科専門家・薬剤師です。
以下のスキンケア製品情報の正確性を確認してください。
製品名・成分・効果・使い方・妊娠安全性に誤りがないか確認してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

必ずJSON形式のみで回答（マークダウン不可）:
{"name":"製品名","isCorrect":true,"issues":["問題点"],"corrections":{"field":"修正内容"},"confidence":"high"}`,
    }

    const prompt = prompts[contentType] || prompts.drug

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        })
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      return NextResponse.json({ error: `Gemini error: ${response.status}`, detail: errText }, { status: 500 })
    }

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return NextResponse.json({ error: 'Invalid response', raw: text.slice(0, 300) }, { status: 500 })

    const result = JSON.parse(jsonMatch[0])
    result.model = 'gemini-2.5-pro'
    result.checkedAt = new Date().toISOString()
    return NextResponse.json(result)

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
