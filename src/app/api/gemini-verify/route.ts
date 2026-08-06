import { NextRequest, NextResponse } from 'next/server'
import { getSelectedGeminiModel, GEMINI_THINKING_CONFIG } from '@/lib/gemini-models'

export const maxDuration = 60

const SYSTEM_INSTRUCTION = `【重要な指示】
あなたは日本の医療情報を厳密に評価する専門AIです。
以下のルールを必ず守ってください:

1. 参照する情報源の優先順位（必ずこの順序で確認すること）:
   ① PMDA（医薬品医療機器総合機構）電子添付文書 https://www.pmda.go.jp/
   ② 製薬メーカー公式サイト・医療関係者向けページ
   ③ 日本皮膚科学会ガイドライン・使用ガイダンス https://www.dermatol.or.jp/
   ④ 今日の臨床サポート・日経メディカル等の医療専門データベース
   ⑤ 厚生労働省・最適使用推進ガイドライン

2. 絶対に守ること:
   - 添付文書に記載のない内容を「可能」と言わない
   - 自己注射の可否は添付文書の「自己投与」項目のみで判断する
   - 投与量・投与間隔は添付文書の用法用量のみで判断する
   - 「〜できる場合もある」「〜の可能性がある」という曖昧な表現で
     自己注射可と誤解させる表現は禁止
   - 不確かな場合は isCorrect: false として issues に記載する

3. エビデンスレベルの明示:
   - 各回答に evidenceSource（参照した情報源）を記載する
   - 「添付文書（20XX年X月改訂）」「〇〇ガイドライン20XX年版」等を具体的に記載`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 })

    // 管理画面で選択中のGeminiモデルを取得（未設定時はデフォルト）
    const model = await getSelectedGeminiModel()

    // 一括評価の場合
    if (body.items && Array.isArray(body.items)) {
      const { contentType, items } = body
      const itemsSummary = items.map((item: { id: string; name: string; data: unknown }) => ({
        id: item.id,
        name: item.name,
        data: item.data,
      }))

      const batchPrompt = `${SYSTEM_INSTRUCTION}

あなたは日本の皮膚科専門医・薬剤師・医療専門家です。
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
      "issues": ["問題点（出典を明記）"],
      "newKnowledge": ["新しい知見・変更点"],
      "corrections": {"フィールド名": "修正内容"},
      "evidenceSource": "参照した添付文書・ガイドライン",
      "confidence": "high|medium|low"
    }
  ]
}`

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: batchPrompt }] }],
            generationConfig: {
              maxOutputTokens: 8192,
              thinkingConfig: GEMINI_THINKING_CONFIG,
            },
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

      return NextResponse.json({ ...JSON.parse(jsonMatch[0]), model })
    }

    // 既存の単一アイテム評価処理
    const { contentType, itemName, currentData } = body

    const prompts: Record<string, string> = {
      drug: `${SYSTEM_INSTRUCTION}

あなたは日本の薬剤師・皮膚科専門医です。
以下の薬剤情報をPMDA添付文書・メーカー公式情報に基づいて厳密に評価してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

【必須確認項目】
1. 薬品名（商品名）の正確性
2. 一般名（成分名・INN名）の正確性
3. 規格・含量・剤形の正確性（PMDAの承認規格と照合）
4. 効能・効果（保険適用上の正式病名のみ記載、適応外は明記）
5. 用法・用量（添付文書の用法用量と一致しているか）
6. 【重要】禁忌・使用上の注意（添付文書Section 2・8より）:
   - 絶対禁忌（2.禁忌に記載の内容）
   - 慎重投与（9.特定の背景を有する患者に関する注意より）
   - 妊婦・授乳婦（9.5・9.6より）
   - 小児（9.7より）
   - 高齢者（9.8より）
7. 自己注射の可否（添付文書の「自己投与」記載の有無のみで判断。記載なければ不可）
8. 重大な副作用（11.1より上位3件）
9. 主な薬物相互作用（10.より）
10. 2024〜2026年の添付文書改訂・適応拡大の有無

必ずJSON形式のみで回答:
{
  "name": "薬品名",
  "isCorrect": true,
  "severity": "none|low|medium|high",
  "issues": ["問題点（出典を明記）"],
  "contraindications": {
    "absolute": ["絶対禁忌（添付文書2.禁忌より）"],
    "caution": ["慎重投与（添付文書9.より）"],
    "pregnancy": "妊婦への投与（添付文書9.5より）",
    "lactation": "授乳婦への投与（添付文書9.6より）",
    "pediatric": "小児への投与（添付文書9.7より）",
    "elderly": "高齢者への投与（添付文書9.8より）"
  },
  "selfInjection": {
    "available": false,
    "basis": "添付文書に自己投与の記載なし（または記載あり）"
  },
  "newKnowledge": ["新知見・改訂（時期を明記）"],
  "corrections": {"フィールド名": "修正内容"},
  "evidenceSource": "参照した添付文書・ガイドライン（改訂年月を含む）",
  "confidence": "high|medium|low"
}`,

      disease: `${SYSTEM_INSTRUCTION}

あなたは日本の皮膚科専門医です。
以下の疾患情報を日本皮膚科学会ガイドライン・専門医テキストに基づいて評価してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

【参照すべき情報源】
- 日本皮膚科学会各種ガイドライン（https://www.dermatol.or.jp/）
- 皮膚科学テキスト（標準皮膚科学等）
- 各疾患の生物学的製剤使用ガイダンス（最新版）

【確認項目】
1. 疾患名・英語名の正確性（ICD-10コードと一致するか）
2. 定義・概念の正確性
3. 原因・病態の最新知見との整合性
4. 症状・所見の記載の正確性
5. 治療法（保険診療・自由診療を明確に区別）
6. 患者説明例の適切性（不正確・過剰な表現がないか）
7. 重要ポイントの正確性（スタッフが誤解しやすい点）
8. 2024〜2026年の新しい治療薬・ガイドライン改訂

必ずJSON形式のみで回答:
{
  "name": "疾患名",
  "isCorrect": true,
  "severity": "none|low|medium|high",
  "issues": ["問題点（出典を明記）"],
  "newKnowledge": ["新知見（ガイドライン名・改訂年を含む）"],
  "corrections": {"フィールド名": "修正内容"},
  "evidenceSource": "参照したガイドライン・文献",
  "confidence": "high|medium|low"
}`,

      quiz: `${SYSTEM_INSTRUCTION}

あなたは日本の皮膚科専門医・薬剤師です。
以下のクイズ問題を医学的正確性の観点から厳密に評価してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

【確認項目】
1. 問題文の医学的正確性
2. 選択肢の正確性（全選択肢を確認）
3. 正解の正確性（添付文書・ガイドラインと一致するか）
4. 不正解選択肢の適切性（紛らわしすぎないか・正解が他にないか）
5. 解説の正確性・十分性
6. 出典の明記

必ずJSON形式のみで回答:
{
  "question": "問題文",
  "isCorrect": true,
  "severity": "none|low|medium|high",
  "issues": ["問題点"],
  "correctAnswer": "正しい正解（変更が必要な場合）",
  "corrections": {"フィールド名": "修正内容"},
  "evidenceSource": "根拠となる添付文書・ガイドライン",
  "confidence": "high|medium|low"
}`,

      contraindication: `${SYSTEM_INSTRUCTION}

あなたは日本の薬剤師・皮膚科専門医です。
以下の禁忌・注意事項をPMDA添付文書に基づいて厳密に評価してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

【確認項目】
1. 禁忌の医薬品名・疾患名の正確性
2. 禁忌の理由・メカニズムの正確性
3. 禁忌の重大度（絶対禁忌か相対禁忌か）
4. 対処法・代替薬の正確性
5. 添付文書Section 2（禁忌）・Section 10（相互作用）との整合性

必ずJSON形式のみで回答:
{
  "drug": "薬剤名",
  "isCorrect": true,
  "severity": "none|low|medium|high",
  "issues": ["問題点（添付文書Section番号を含む）"],
  "corrections": {"フィールド名": "修正内容"},
  "evidenceSource": "PMDA添付文書（改訂年月）",
  "confidence": "high|medium|low"
}`,

      pregnancy: `${SYSTEM_INSTRUCTION}

あなたは日本の産婦人科医・薬剤師・皮膚科専門医です。
以下の妊娠・授乳中の薬剤安全性情報をPMDA添付文書・JAFTA分類に基づいて評価してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

【参照すべき情報源】
- PMDA電子添付文書 Section 9.5（妊婦）・9.6（授乳婦）
- 国立成育医療研究センター「妊娠と薬情報センター」
- 米国FDA妊娠カテゴリー（参考）

【確認項目】
1. 妊娠中の安全性レベルの正確性（添付文書9.5より）
2. 授乳中の安全性レベルの正確性（添付文書9.6より）
3. 安全性の根拠・理由の正確性
4. 代替薬・対処法の適切性

必ずJSON形式のみで回答:
{
  "name": "薬品名",
  "isCorrect": true,
  "severity": "none|low|medium|high",
  "issues": ["問題点（添付文書Section番号を含む）"],
  "pregnancySafety": "添付文書9.5の正確な記載",
  "lactationSafety": "添付文書9.6の正確な記載",
  "corrections": {"フィールド名": "修正内容"},
  "evidenceSource": "PMDA添付文書（改訂年月）",
  "confidence": "high|medium|low"
}`,

      interaction: `${SYSTEM_INSTRUCTION}

あなたは日本の薬剤師・皮膚科専門医です。
以下の薬剤相互作用情報をPMDA添付文書Section 10に基づいて評価してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

【確認項目】
1. 相互作用する薬剤名の正確性
2. 重大度分類の正確性（禁忌・原則禁忌・慎重投与）
3. 相互作用のメカニズムの正確性（PK/PD的根拠）
4. 臨床上の影響（何が起きるか）の正確性
5. 対処法の正確性
6. 添付文書Section 10との整合性

必ずJSON形式のみで回答:
{
  "drugs": "薬剤の組み合わせ",
  "isCorrect": true,
  "severity": "none|low|medium|high",
  "issues": ["問題点"],
  "correctSeverity": "正しい重大度分類",
  "corrections": {"フィールド名": "修正内容"},
  "evidenceSource": "両薬剤のPMDA添付文書（改訂年月）",
  "confidence": "high|medium|low"
}`,

      medical_fee: `${SYSTEM_INSTRUCTION}

あなたは日本の診療報酬専門家・医療事務士・皮膚科専門医です。
以下の保険診療算定点数情報を2024年度診療報酬点数表に基づいて評価してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

【参照すべき情報源】
- 診療報酬点数表（令和6年4月版）
- 厚生労働省保険局医療課通知
- 診療報酬の算定方法の一部改正（令和6年）

【確認項目】
1. 算定コード（Kコード・Aコード等）の正確性
2. 点数の正確性（2024年度改定後の点数）
3. カテゴリ分類の正確性
4. 算定要件・算定条件の正確性
5. 算定回数制限・間隔制限の正確性
6. 注加算・施設基準の有無

必ずJSON形式のみで回答:
{
  "name": "算定項目名",
  "isCorrect": true,
  "severity": "none|low|medium|high",
  "issues": ["問題点（点数表の該当箇所を明記）"],
  "correctPoints": 0,
  "corrections": {"フィールド名": "修正内容"},
  "evidenceSource": "令和6年度診療報酬点数表",
  "confidence": "high|medium|low"
}`,

      counseling: `${SYSTEM_INSTRUCTION}

あなたは日本の美容皮膚科専門医・医療カウンセリング専門家です。
以下のカウンセリングガイドを医学的正確性・法的適切性の観点から評価してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

【確認項目】
1. 施術名・機器名の正確性
2. クリアチェック項目の医学的正確性（禁忌が正しく設定されているか）
3. トークスクリプトの医学的正確性（効果の誇大表現がないか）
4. 副作用・ダウンタイムの説明の正確性・十分性
5. 同意取得プロセスの適切性（美容医療ガイドラインとの整合性）
6. クーリングオフ等の消費者保護事項の記載
7. 禁忌患者への対応の適切性

必ずJSON形式のみで回答:
{
  "treatment": "施術名",
  "isCorrect": true,
  "severity": "none|low|medium|high",
  "issues": ["問題点"],
  "corrections": {"フィールド名": "修正内容"},
  "evidenceSource": "日本美容外科学会ガイドライン等",
  "confidence": "high|medium|low"
}`,

      skincare: `${SYSTEM_INSTRUCTION}

あなたは日本の皮膚科専門医・薬剤師・美容皮膚科専門家です。
以下のスキンケア製品情報を添付文書・医学的エビデンスに基づいて評価してください。

確認対象:
${JSON.stringify(currentData, null, 2).slice(0, 3000)}

【確認項目】
1. 製品名・ブランド名の正確性
2. 主要成分・配合量の正確性（医薬品の場合は添付文書と照合）
3. 効果・効能の正確性（科学的エビデンスがあるか・誇大表現がないか）
4. 使用方法の正確性
5. 妊娠・授乳中の安全性の正確性（添付文書・既存文献より）
6. 禁忌・注意事項の正確性
7. 医薬品と化粧品の区分の正確性

必ずJSON形式のみで回答:
{
  "name": "製品名",
  "isCorrect": true,
  "severity": "none|low|medium|high",
  "issues": ["問題点"],
  "corrections": {"フィールド名": "修正内容"},
  "evidenceSource": "添付文書・論文・学会指針",
  "confidence": "high|medium|low"
}`,
    }

    const prompt = prompts[contentType] || prompts.drug

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 4096,
            thinkingConfig: GEMINI_THINKING_CONFIG,
          }
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

    try {
      const result = JSON.parse(jsonMatch[0])
      result.model = model
      result.checkedAt = new Date().toISOString()
      return NextResponse.json(result)
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Raw:', text.slice(0, 200))
      return NextResponse.json({
        isCorrect: false,
        severity: 'low',
        issues: ['AI応答のパースに失敗しました。再試行してください。'],
        corrections: {},
        evidenceSource: '解析エラー',
        confidence: 'low',
        model,
        checkedAt: new Date().toISOString(),
        raw: text.slice(0, 200)
      })
    }

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
