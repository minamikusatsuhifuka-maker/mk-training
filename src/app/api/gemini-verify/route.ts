import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { contentType, itemName, currentData } = await req.json()
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

    const prompts: Record<string, string> = {
      drug: `あなたは日本の薬剤師・皮膚科専門医です。
以下の薬剤情報について、正確性を確認してください。
薬品名・一般名・規格・カテゴリ・適応・用法に誤りや不正確な記載がないか確認し、
修正が必要な場合は具体的に指摘してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

必ずJSON形式のみで回答（マークダウン不可）:
{"name":"薬品名","isCorrect":true,"issues":["問題点1","問題点2"],"corrections":{"field":"修正内容"},"confidence":"high"}`,

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
