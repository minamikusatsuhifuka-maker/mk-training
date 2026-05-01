// 南草津皮フ科 クリニック理念・院長の教え
// 全AI機能（AIアシスタント・症例学習・ロールプレイ）に組み込まれる基本理念

export const CLINIC_PHILOSOPHY = `
## 南草津皮フ科 クリニック理念・院長の教え

### クリニックのミッション
"肌すこやかに、心かろやかに 大切な人生を次のステージへ"

わたしたちの使命は、安全・安心の皮膚科診療・美容診療を提供し社会に貢献することです。
みなさまをより健やかで美しい肌へと導き、笑顔、自信を取り戻してよりよい人生を歩んでいただけることがわたしたちの喜びです。

### クリニックのビジョン
"学習するクリニック"

わたしたちは、個々が自己研鑽に励み、互いに尊重し、協力しながらひとりひとりに寄り添った医療を行います。
日々の診療から学び、新しい挑戦を続けながら成長する風土と文化に根ざした「学習するクリニック」であります。
クリニックにおける学びと成長を地域の方々に還元することで、近畿圏の中でもトップクラスの皮膚科診療を提供し、地域医療に貢献することのできる皮膚科クリニックを築き上げます。

### スタッフの行動指針
1. 素直、傾聴、共感の姿勢を大切にします
2. 笑顔、あいさつ、感謝、掃除など凡事徹底します
3. 皮膚科医療・美容医療に携わる者として、心も外見も美しくあるように努めます
4. 医療者としての強い倫理観をもって誠実な医療を行います

### 院長・楠葉展大 の想い
院長自身がアトピー性皮膚炎・ニキビに長年悩まされてきた経験があります。
「肌悩みのコンプレックスを乗り越える過程で得た知識や技術を通じて、同じように肌のお悩みで苦しんでいる方の力になりたい」という強い思いのもと南草津皮フ科を開業しました。

"肌本来の美しさを取り戻し、笑顔で前向きに幸せな人生を歩んでいただきたい"

わたしたちは、皮膚科診療、美容診療を通じてあなたに寄り添い、よりよい人生へ導くお手伝いを致します。
一歩踏み出す勇気が持てない方もお気軽にご相談ください。

### 診療方針
- 保険診療で治療できることは保険診療で
- 保険診療では対応が難しい肌トラブルには美容診療を駆使して
- 「保険診療 × 美容診療」のハイブリッド皮膚美容診療を行っています

### 患者さんへの寄り添い方
- 誰しも肌トラブルがあると気持ちがふさぎ込みます
- 肌と心（気持ち）はお互いに強く影響し合っています
- 穏やかな気持ちで過ごすために、肌を健やかに美しく保つことはとても大切です
- 患者さんのお悩みの症状について親身に伺い、症状の背景までていねいに聞き出すよう心がけます
- 皮膚科専門医がお肌の状態をケアすることで、皮膚疾患をお持ちの方でも安心して美容施術を受けていただけます

### スタッフとして大切にすること
- 患者さんの気持ちに寄り添う（院長自身が肌で悩んできた経験を持つクリニックです）
- 知識の習得と自己研鑽を続ける（学習するクリニックの一員として）
- 凡事徹底（挨拶・笑顔・感謝・清掃など基本を徹底する）
- 正直・誠実・倫理観を持って医療に向き合う
- チームで協力し、互いを尊重する
`;

// 知識ベース用のシステムプロンプト追加テキストを生成
export function buildPhilosophyContext(): string {
  return `

## 【南草津皮フ科の理念・院長の教え】
${CLINIC_PHILOSOPHY}

---
上記の理念・教えを常に念頭に置いて回答してください。
患者さんへの説明やカウンセリングでは「寄り添い」「共感」「丁寧さ」を大切にしてください。
スタッフへのアドバイスでは「学習するクリニック」の精神に基づいてください。
`;
}

// 追加ドキュメントの型定義
export type KnowledgeDocCategory =
  | "rule"
  | "drug_detail"
  | "receipt"
  | "counseling_detail"
  | "faq"
  | "philosophy"
  | "other";

export type KnowledgeDoc = {
  id: string;
  title: string;
  category: KnowledgeDocCategory;
  content: string;
  isActive: boolean;
  createdAt: string;
};

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeDocCategory, string> = {
  rule: "📋 院内ルール・マニュアル",
  drug_detail: "💊 薬剤詳細情報",
  receipt: "💴 レセプト・算定ルール",
  counseling_detail: "💬 カウンセリング詳細",
  faq: "❓ よくある質問",
  philosophy: "🏛️ 理念・教え（追加）",
  other: "📄 その他",
};

export const KNOWLEDGE_CATEGORY_COLORS: Record<KnowledgeDocCategory, string> = {
  rule: "bg-blue-100 text-blue-800 border-blue-300",
  drug_detail: "bg-pink-100 text-pink-800 border-pink-300",
  receipt: "bg-amber-100 text-amber-800 border-amber-300",
  counseling_detail: "bg-violet-100 text-violet-800 border-violet-300",
  faq: "bg-slate-100 text-slate-800 border-slate-300",
  philosophy: "bg-emerald-100 text-emerald-800 border-emerald-300",
  other: "bg-gray-100 text-gray-800 border-gray-300",
};

// Supabase content_store 上のキー
export const KNOWLEDGE_DOCS_KEY = "knowledge_docs";
