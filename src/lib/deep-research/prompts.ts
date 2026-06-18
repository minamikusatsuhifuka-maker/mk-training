// ディープリサーチ用のプロンプト構築（ai-incho から移植）
// ※ STEP 1 ではリサーチ実行用 buildResearchPrompt のみ。学習資料生成プロンプトは STEP 2 で追加する。

import type { ResearchMode } from "./types";

export function buildResearchPrompt(params: {
  topic: string;
  mode: ResearchMode;
  additionalContext?: string;
}): string {
  const { topic, mode, additionalContext } = params;

  const modeInstructions: Record<ResearchMode, { length: string; detail: string }> = {
    quick: {
      length: "1500 字程度",
      detail: "要点を簡潔に",
    },
    standard: {
      length: "3000 字程度",
      detail: "主要な内容を詳しく",
    },
    deep: {
      length: "5000 字以上",
      detail: "網羅的かつ詳細に、各セクションを深く掘り下げる",
    },
  };

  const config = modeInstructions[mode] ?? modeInstructions.standard;

  return `# ディープリサーチ依頼

## トピック
${topic}

## 求める分量
${config.length}

## 詳細度
${config.detail}

## 必須要件(極めて重要)
- **必ず最後まで完結させる**こと。途中で終わるのは絶対に避ける
- 文字数より**完結性を最優先**する
- 必ず以下の構成で書く:
  1. はじめに(トピックの定義と重要性)
  2. 背景と概要
  3. 詳細解説(複数セクション)
  4. 実践・活用のポイント
  5. **まとめ・結論(必ず書く)**
  6. 参考資料・情報源

## 情報の質
- 最新情報を含めてください
- 情報源を明示してください(学会名、論文名、公的機関名など)
- エビデンスに基づいた記述を心がけてください
- 推測や個人的見解は明示してください

${additionalContext ? `## 追加要件\n${additionalContext}` : ""}

## 出力形式
Markdown 形式で出力してください。見出し(##, ###)、箇条書き、強調(太字)を適切に使ってください。`;
}
