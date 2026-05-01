import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "🏛️ クリニックの理念・院長の想い | 南草津皮フ科 スタッフ研修",
};

const actionGuidelines = [
  "素直、傾聴、共感の姿勢を大切にします",
  "笑顔、あいさつ、感謝、掃除など凡事徹底します",
  "皮膚科医療・美容医療に携わる者として、心も外見も美しくあるように努めます",
  "医療者としての強い倫理観をもって誠実な医療を行います",
];

const careGuidelines = [
  "誰しも肌トラブルがあると気持ちがふさぎ込みます",
  "肌と心（気持ち）はお互いに強く影響し合っています",
  "穏やかな気持ちで過ごすために、肌を健やかに美しく保つことはとても大切です",
  "患者さんのお悩みの症状について親身に伺い、症状の背景までていねいに聞き出すよう心がけます",
  "皮膚科専門医がお肌の状態をケアすることで、皮膚疾患をお持ちの方でも安心して美容施術を受けていただけます",
];

export default function PhilosophyPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-teal">
          🏛️ クリニックの理念・院長の想い
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          南草津皮フ科のスタッフ全員が、この理念を胸に日々の診療に取り組んでいます。
        </p>
      </div>

      {/* ミッション */}
      <Card className="border-l-4 border-l-teal bg-teal-light/40 p-6 md:p-8">
        <Badge className="bg-teal text-white mb-3">MISSION</Badge>
        <h2 className="text-lg font-semibold text-slate-700 mb-2">
          クリニックのミッション
        </h2>
        <blockquote className="text-xl md:text-2xl font-bold text-teal leading-relaxed mb-4">
          「肌すこやかに、心かろやかに
          <br />
          大切な人生を次のステージへ」
        </blockquote>
        <p className="text-sm leading-relaxed text-slate-700">
          わたしたちの使命は、安全・安心の皮膚科診療・美容診療を提供し社会に貢献することです。
          みなさまをより健やかで美しい肌へと導き、笑顔、自信を取り戻してよりよい人生を歩んでいただけることがわたしたちの喜びです。
        </p>
      </Card>

      {/* ビジョン */}
      <Card className="border-l-4 border-l-emerald-500 p-6 md:p-8">
        <Badge className="bg-emerald-600 text-white mb-3">VISION</Badge>
        <h2 className="text-lg font-semibold text-slate-700 mb-2">
          クリニックのビジョン
        </h2>
        <blockquote className="text-xl md:text-2xl font-bold text-emerald-700 leading-relaxed mb-4">
          「学習するクリニック」
        </blockquote>
        <p className="text-sm leading-relaxed text-slate-700 mb-2">
          わたしたちは、個々が自己研鑽に励み、互いに尊重し、協力しながらひとりひとりに寄り添った医療を行います。
          日々の診療から学び、新しい挑戦を続けながら成長する風土と文化に根ざした「学習するクリニック」であります。
        </p>
        <p className="text-sm leading-relaxed text-slate-700">
          クリニックにおける学びと成長を地域の方々に還元することで、近畿圏の中でもトップクラスの皮膚科診療を提供し、地域医療に貢献することのできる皮膚科クリニックを築き上げます。
        </p>
      </Card>

      {/* 行動指針 */}
      <Card className="p-6 md:p-8">
        <Badge className="bg-blue-600 text-white mb-3">ACTION GUIDELINES</Badge>
        <h2 className="text-lg font-semibold text-slate-700 mb-4">
          スタッフの行動指針
        </h2>
        <ul className="space-y-3">
          {actionGuidelines.map((g, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-teal text-white flex items-center justify-center text-sm font-bold">
                {i + 1}
              </span>
              <span className="text-sm md:text-base leading-relaxed text-slate-700 pt-0.5">
                {g}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* 院長の想い */}
      <Card className="bg-amber-50 border border-amber-200 p-6 md:p-8">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">💭</span>
          <Badge className="bg-amber-600 text-white">DOCTOR&apos;S MESSAGE</Badge>
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">
          院長・楠葉展大 の想い
        </h2>
        <p className="text-sm leading-relaxed text-slate-700 mb-3">
          院長自身がアトピー性皮膚炎・ニキビに長年悩まされてきた経験があります。
          「肌悩みのコンプレックスを乗り越える過程で得た知識や技術を通じて、同じように肌のお悩みで苦しんでいる方の力になりたい」という強い思いのもと南草津皮フ科を開業しました。
        </p>
        <blockquote className="border-l-4 border-amber-400 bg-white px-4 py-3 my-4 text-base md:text-lg font-bold text-amber-800 leading-relaxed rounded-r-md">
          「肌本来の美しさを取り戻し、笑顔で前向きに幸せな人生を歩んでいただきたい」
        </blockquote>
        <p className="text-sm leading-relaxed text-slate-700 mb-2">
          わたしたちは、皮膚科診療、美容診療を通じてあなたに寄り添い、よりよい人生へ導くお手伝いを致します。
        </p>
        <p className="text-sm leading-relaxed text-slate-700 font-medium">
          一歩踏み出す勇気が持てない方もお気軽にご相談ください。
        </p>
      </Card>

      {/* 診療方針 */}
      <Card className="p-6 md:p-8">
        <Badge className="bg-violet-600 text-white mb-3">TREATMENT POLICY</Badge>
        <h2 className="text-lg font-semibold text-slate-700 mb-4">診療方針</h2>
        <ul className="space-y-2 text-sm md:text-base text-slate-700">
          <li className="flex items-start gap-2">
            <span className="text-teal">●</span>
            <span>保険診療で治療できることは保険診療で</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal">●</span>
            <span>保険診療では対応が難しい肌トラブルには美容診療を駆使して</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal">●</span>
            <span>「保険診療 × 美容診療」のハイブリッド皮膚美容診療を行っています</span>
          </li>
        </ul>
      </Card>

      {/* 患者さんへの寄り添い方 */}
      <Card className="p-6 md:p-8">
        <Badge className="bg-pink-600 text-white mb-3">PATIENT CARE</Badge>
        <h2 className="text-lg font-semibold text-slate-700 mb-4">
          患者さんへの寄り添い方
        </h2>
        <ul className="space-y-2.5 text-sm md:text-base text-slate-700">
          {careGuidelines.map((g, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-pink-500 mt-1">♥</span>
              <span className="leading-relaxed">{g}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* スタッフとして大切にすること */}
      <Card className="border-l-4 border-l-teal p-6 md:p-8">
        <Badge className="bg-teal text-white mb-3">STAFF VALUES</Badge>
        <h2 className="text-lg font-semibold text-slate-700 mb-4">
          スタッフとして大切にすること
        </h2>
        <ul className="space-y-2 text-sm md:text-base text-slate-700">
          <li className="flex items-start gap-2">
            <span className="text-teal">✓</span>
            <span>患者さんの気持ちに寄り添う（院長自身が肌で悩んできた経験を持つクリニックです）</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal">✓</span>
            <span>知識の習得と自己研鑽を続ける（学習するクリニックの一員として）</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal">✓</span>
            <span>凡事徹底（挨拶・笑顔・感謝・清掃など基本を徹底する）</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal">✓</span>
            <span>正直・誠実・倫理観を持って医療に向き合う</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-teal">✓</span>
            <span>チームで協力し、互いを尊重する</span>
          </li>
        </ul>
      </Card>

      {/* フッター */}
      <Card className="bg-slate-50 border border-slate-200 p-6 text-center">
        <p className="text-sm leading-relaxed text-slate-700">
          🏛️ この理念は <span className="font-semibold">AIアシスタント</span>・
          <span className="font-semibold">症例学習</span>・
          <span className="font-semibold">ロールプレイ</span>{" "}
          に組み込まれています。
        </p>
        <p className="text-sm leading-relaxed text-slate-700 mt-2">
          スタッフ全員がこの精神で患者さんに接することを目指しています。
        </p>
      </Card>
    </div>
  );
}
