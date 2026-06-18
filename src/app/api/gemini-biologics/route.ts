import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSelectedGeminiModel, GEMINI_THINKING_CONFIG } from '@/lib/gemini-models'

const SYSTEM_INSTRUCTION = `【重要な指示】
あなたは日本の医療情報を厳密に評価する専門AIです。
以下のルールを必ず守ってください:

1. 参照する情報源の優先順位（必ずこの順序で確認すること）:
   ① PMDA（医薬品医療機器総合機構）電子添付文書 https://www.pmda.go.jp/
   ② 製薬メーカー公式サイト・医療関係者向けページ
   ③ 日本皮膚科学会ガイドライン・使用ガイダンス https://www.dermatol.or.jp/
   ④ 厚生労働省・最適使用推進ガイドライン

2. 絶対に守ること:
   - 添付文書に記載のない内容を「可能」と言わない
   - 自己注射の可否は添付文書の「自己投与」項目のみで判断する
   - 投与量・投与間隔は添付文書の用法用量のみで判断する
   - 不確かな場合は hasChanges: true として変更を提案する

3. エビデンスレベルの明示:
   - 各回答に evidenceSource（参照した情報源）を記載する`

export async function POST(req: NextRequest) {
  const { action, drugName, currentData } = await req.json()

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })
  }

  // 管理画面で選択中のGeminiモデルを取得（未設定時はデフォルト）
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const model = await getSelectedGeminiModel(supabase)

  const today = new Date().toISOString().slice(0, 10)

  const prompt = action === 'verify_all'
    ? `${SYSTEM_INSTRUCTION}

あなたは日本の皮膚科専門医・生物学的製剤専門家です。
以下の生物学的製剤情報をPMDA添付文書・メーカー公式情報・日本皮膚科学会使用ガイダンスに基づいて
厳密に評価・修正してください。

確認する製剤:
${JSON.stringify(currentData, null, 2)}

【最重要確認事項】
1. 自己注射の可否:
   - 必ずPMDA添付文書の「自己投与」記載を確認すること
   - 記載がなければ「不可」と判定する
   - 「医師が判断する場合〜」という曖昧な表現は「不可」と判定する
   - 現在自己注射が可能な皮膚科生物学的製剤（2025年時点）:
     デュピクセント✅ ミチーガ60mg✅ アドトラーザ✅
     ヒュミラ✅ コセンティクス✅ トレムフィア✅
     ビンゼレックス✅ イルミア✅ ゾレア❌ スキリージ❌ イブグリース❌

2. 投与スケジュール（添付文書の用法用量と完全一致させること）
3. レセプト摘要欄（最適使用推進ガイドライン・留意事項通知より）
4. 投与前スクリーニング必須事項
5. 禁忌・重要な警告・注意事項

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
        "selfInjectionBasis": "添付文書の自己投与記載の有無",
        "note": "補足"
      },
      "evidenceSource": "PMDA添付文書（改訂年月）・メーカー公式情報",
      "lastConfirmed": "${today}"
    }
  ],
  "summary": "全体的な確認結果の要約",
  "updatedAt": "${today}"
}`
    : `${SYSTEM_INSTRUCTION}

あなたは日本の皮膚科専門医・生物学的製剤専門家です。
「${drugName}」についてPMDA添付文書・メーカー公式情報に基づいて正確に評価してください。

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
    "selfInjectionBasis": "添付文書の自己投与記載の根拠",
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
  "evidenceSource": "PMDA添付文書（改訂年月）",
  "lastConfirmed": "${today}"
}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            thinkingConfig: GEMINI_THINKING_CONFIG,
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
