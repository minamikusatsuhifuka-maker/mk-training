"use client";

import { useState } from "react";

type GradeColor = "green" | "blue" | "amber" | "teal" | "purple";

type Grade = {
  grade: string;
  name: string;
  icon: string;
  color: GradeColor;
  description: string;
  period: string;
  skills: string[];
  knowledge: string[];
  mindset: string[];
};

const grades: Grade[] = [
  {
    grade: "G1",
    name: "ルーキー",
    icon: "🌱",
    color: "green",
    description:
      "クリニックの文化・理念を学ぶ段階。まずは凡事徹底から始める。",
    period: "入職〜6ヶ月",
    skills: [
      "挨拶・笑顔・感謝・清掃など凡事徹底ができる",
      "クリニックの理念・ミッション・ビジョンを理解している",
      "担当業務の基本フローを一人でこなせる",
      "ホウレンソウ（報告・連絡・相談）を徹底している",
    ],
    knowledge: [
      "クリニックの診療内容（保険・美容）を説明できる",
      "主要疾患（アトピー・ニキビ・乾癬等）の概要を知っている",
      "基本的な薬剤の名前と用途を知っている",
    ],
    mindset: [
      "素直に学ぶ姿勢を持っている",
      "先払いの姿勢（まず与えることから始める）を理解している",
      "インサイドアウト（自分が変わる）を意識している",
    ],
  },
  {
    grade: "G2",
    name: "コア",
    icon: "💪",
    color: "blue",
    description:
      "独立して業務ができる段階。チームの一員として貢献できる。",
    period: "6ヶ月〜2年",
    skills: [
      "担当業務を独立して正確・迅速にこなせる",
      "患者対応を自信を持って行える",
      "後輩・新人の基本的なサポートができる",
      "トラブル時に適切に判断・対処できる",
    ],
    knowledge: [
      "保険診療の算定ルール・レセプト知識がある（医療事務）",
      "主要薬剤の適応・禁忌・注意事項を理解している",
      "生物学的製剤の基本知識がある",
      "美容施術の概要・料金・ダウンタイムを説明できる",
    ],
    mindset: [
      "四方よしの精神で患者・チームに関わっている",
      "成功の八原則を日々実践している",
      "学習するクリニックの一員として自己研鑽を続けている",
    ],
  },
  {
    grade: "G3",
    name: "エキスパート",
    icon: "⭐",
    color: "amber",
    description:
      "専門性を持ち後輩を支援できる段階。自分のロールのプロフェッショナル。",
    period: "2年〜4年",
    skills: [
      "担当ロールのエキスパートとして高い品質で業務をこなせる",
      "後輩・新人への指導・育成ができる",
      "マニュアル・SOP の整備・改善ができる",
      "クリニック全体の動きを理解し連携できる",
    ],
    knowledge: [
      "ロール固有の専門知識を深く習得している",
      "生物学的製剤の詳細（投与・レセプト・副作用）を熟知している",
      "最新の医療情報・薬剤情報をキャッチアップしている",
    ],
    mindset: [
      "リードマネジメントの精神（外的コントロールをしない）を実践している",
      "7つの実（実行・実績・実力・実現・充実・誠実・結実）を体現している",
      "自己成長と貢献の2軸を大切にしている",
    ],
  },
  {
    grade: "G4",
    name: "パートナー",
    icon: "🤝",
    color: "teal",
    description: "チームを牽引しクリニックの成長に貢献する段階。",
    period: "4年〜",
    skills: [
      "チームのパフォーマンス向上をリードできる",
      "クリニックの課題を発見し改善提案・実行できる",
      "採用・育成・評価に関わることができる",
      "院長の右腕として経営判断を支援できる",
    ],
    knowledge: [
      "クリニック経営の全体像を理解している",
      "業界動向・競合・患者ニーズを把握している",
      "医療法規・労働法規の基礎を理解している",
    ],
    mindset: [
      "ティール組織の精神（自律・全体性・進化的目的）を体現している",
      "真のパワーパートナーとして理念に魂から共感している",
      "長期的・本質的・客観的な視点で判断している",
    ],
  },
  {
    grade: "G5",
    name: "アンバサダー",
    icon: "✨",
    color: "purple",
    description: "クリニックの理念を体現し社会に発信できる段階。",
    period: "パートナーとして実績を積んだ後",
    skills: [
      "クリニックの文化・理念を外部に発信できる",
      "業界全体に影響を与える活動ができる",
      "次世代リーダーを育成できる",
    ],
    knowledge: [
      "クリニックの全機能を深く理解している",
      "社会・医療業界への貢献方法を実践している",
    ],
    mindset: [
      "クリニックのビジョンを自分のビジョンとして語れる",
      "利他の精神で社会貢献を実践している",
    ],
  },
];

// 色ごとのスタイル
const COLOR_STYLE: Record<
  GradeColor,
  { headerBg: string; headerBorder: string; badge: string; tabActive: string }
> = {
  green: {
    headerBg: "bg-green-50",
    headerBorder: "border-l-green-500",
    badge: "bg-green-100 text-green-700",
    tabActive: "bg-green-600 text-white border-green-600",
  },
  blue: {
    headerBg: "bg-blue-50",
    headerBorder: "border-l-blue-500",
    badge: "bg-blue-100 text-blue-700",
    tabActive: "bg-blue-600 text-white border-blue-600",
  },
  amber: {
    headerBg: "bg-amber-50",
    headerBorder: "border-l-amber-500",
    badge: "bg-amber-100 text-amber-800",
    tabActive: "bg-amber-500 text-white border-amber-500",
  },
  teal: {
    headerBg: "bg-teal-50",
    headerBorder: "border-l-teal-500",
    badge: "bg-teal-100 text-teal-700",
    tabActive: "bg-teal-600 text-white border-teal-600",
  },
  purple: {
    headerBg: "bg-purple-50",
    headerBorder: "border-l-purple-500",
    badge: "bg-purple-100 text-purple-700",
    tabActive: "bg-purple-600 text-white border-purple-600",
  },
};

export default function GradeSystemPage() {
  const [activeGrade, setActiveGrade] = useState<string>(grades[0].grade);

  const current = grades.find((g) => g.grade === activeGrade) ?? grades[0];
  const style = COLOR_STYLE[current.color];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-teal">
          📊 等級制度（グレード制度）
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          南草津皮フ科の等級制度。各グレードの定義・求められるスキル・知識・マインドを確認できます。
        </p>
      </div>

      {/* グレードタブ（モバイル横スクロール） */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        {grades.map((g) => {
          const isActive = g.grade === activeGrade;
          const tabStyle = COLOR_STYLE[g.color];
          return (
            <button
              key={g.grade}
              type="button"
              onClick={() => setActiveGrade(g.grade)}
              className={`whitespace-nowrap shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full border text-sm transition-colors min-h-[40px] ${
                isActive
                  ? tabStyle.tabActive
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{g.icon}</span>
              <span className="font-semibold">{g.grade}</span>
              <span>{g.name}</span>
            </button>
          );
        })}
      </div>

      {/* グレード詳細 */}
      <div
        className={`rounded-xl border border-l-4 ${style.headerBorder} bg-white overflow-hidden`}
      >
        <div className={`${style.headerBg} px-5 py-4`}>
          <div className="flex items-start gap-3">
            <div className="text-3xl">{current.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-800">
                  {current.grade}：{current.name}
                </h2>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}
                >
                  {current.period}
                </span>
              </div>
              <p className="text-sm text-slate-700 mt-1.5 leading-relaxed">
                {current.description}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* スキル・行動 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <span>⚡</span>
              <span>スキル・行動</span>
            </h3>
            <ul className="space-y-2">
              {current.skills.map((s, i) => (
                <li
                  key={i}
                  className="text-xs text-slate-700 leading-relaxed flex items-start gap-2"
                >
                  <span className={`${style.badge} rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-semibold flex-shrink-0`}>
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 知識 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <span>📖</span>
              <span>知識</span>
            </h3>
            <ul className="space-y-2">
              {current.knowledge.map((k, i) => (
                <li
                  key={i}
                  className="text-xs text-slate-700 leading-relaxed flex items-start gap-2"
                >
                  <span className={`${style.badge} rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-semibold flex-shrink-0`}>
                    {i + 1}
                  </span>
                  <span>{k}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* マインドセット */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
              <span>💡</span>
              <span>マインドセット</span>
            </h3>
            <ul className="space-y-2">
              {current.mindset.map((m, i) => (
                <li
                  key={i}
                  className="text-xs text-slate-700 leading-relaxed flex items-start gap-2"
                >
                  <span className={`${style.badge} rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-semibold flex-shrink-0`}>
                    {i + 1}
                  </span>
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 全グレードのサマリー */}
      <div>
        <h2 className="text-base font-semibold text-slate-700 mb-3">
          グレード一覧
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {grades.map((g) => {
            const s = COLOR_STYLE[g.color];
            const isActive = g.grade === activeGrade;
            return (
              <button
                key={g.grade}
                type="button"
                onClick={() => setActiveGrade(g.grade)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  isActive
                    ? `${s.headerBg} border-current`
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{g.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {g.grade}
                    </p>
                    <p className="text-xs text-slate-600">{g.name}</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 mt-1.5">{g.period}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
