"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const sankaku = [
  {
    label: "患者様",
    icon: "🌸",
    color: "bg-pink-50 border-pink-200 text-pink-800",
    desc: "人生好転・物心両面の幸福",
  },
  {
    label: "スタッフ",
    icon: "🧑‍⚕️",
    color: "bg-teal-50 border-teal-200 text-teal-800",
    desc: "自律的成長・互いに高め合う",
  },
  {
    label: "クリニック",
    icon: "🏥",
    color: "bg-amber-50 border-amber-200 text-amber-800",
    desc: "学習し進化し続ける組織",
  },
  {
    label: "社会",
    icon: "🌍",
    color: "bg-emerald-50 border-emerald-200 text-emerald-800",
    desc: "地域医療・社会貢献",
  },
];

const philosophies = [
  {
    title: "同心円成長モデル",
    icon: "◎",
    summary: "自己愛 → 身近な人 → 社会への貢献",
    detail:
      "中心が変われば外側が変わる。スタッフが変われば患者が変わり、社会が変わる。",
    color: "from-rose-50 to-amber-50 border-rose-200",
  },
  {
    title: "先払いの原則",
    icon: "💎",
    summary: "与えることから始める",
    detail:
      "時間・お金・エネルギーを先払いして自己成長する。豊かな人生は与えた分だけ返ってくる。",
    color: "from-amber-50 to-yellow-50 border-amber-200",
  },
  {
    title: "インサイドアウト",
    icon: "🔄",
    summary: "変化は自分の内側から",
    detail:
      "外的コントロール（命令・強制・評価で動かす）は絶対にしない。自分が変わることが全ての出発点。",
    color: "from-sky-50 to-cyan-50 border-sky-200",
  },
];

const tealStages = [
  {
    name: "レッド",
    color: "bg-red-500 text-white border-red-700",
    desc: "支配・恐怖",
  },
  {
    name: "アンバー",
    color: "bg-amber-500 text-white border-amber-700",
    desc: "規則・階層",
  },
  {
    name: "オレンジ",
    color: "bg-orange-500 text-white border-orange-700",
    desc: "成果・競争",
  },
  {
    name: "グリーン",
    color: "bg-emerald-500 text-white border-emerald-700",
    desc: "多様性・関係",
  },
  {
    name: "ティール",
    color: "bg-teal-500 text-white border-teal-700 ring-4 ring-teal-200",
    desc: "自律・全体性・進化",
    target: true,
  },
];

const sevenFruits = [
  { name: "実行", icon: "🚀", desc: "コミットメント、強い決意でやりきる" },
  { name: "実績", icon: "📊", desc: "事実・数字で語れる成果が伴っている" },
  {
    name: "実力",
    icon: "💪",
    desc: "スキル・知識・マインドがエキスパートレベル",
  },
  {
    name: "実現",
    icon: "✨",
    desc: "描いたビジョンを現実にする力を学び続ける",
  },
  { name: "充実", icon: "🌟", desc: "内側から満ちあふれる豊かさで働く" },
  {
    name: "誠実",
    icon: "🤝",
    desc: "自分にも他者にも正直、言行一致・一貫性",
  },
  { name: "結実", icon: "🌳", desc: "継続した努力が形になっている" },
];

const grades = [
  {
    grade: "G1",
    name: "ルーキー",
    desc: "クリニックの文化・理念を学ぶ段階",
    size: "w-20 h-20",
    color: "bg-teal-100 text-teal-800 border-teal-300",
  },
  {
    grade: "G2",
    name: "コア",
    desc: "独立して業務ができる段階",
    size: "w-24 h-24",
    color: "bg-teal-200 text-teal-800 border-teal-400",
  },
  {
    grade: "G3",
    name: "エキスパート",
    desc: "専門性を持ち後輩を支援できる段階",
    size: "w-28 h-28",
    color: "bg-teal-300 text-teal-900 border-teal-500",
  },
  {
    grade: "G4",
    name: "パートナー",
    desc: "チームを牽引しクリニックの成長に貢献",
    size: "w-32 h-32",
    color: "bg-teal-400 text-white border-teal-600",
  },
  {
    grade: "G5",
    name: "アンバサダー",
    desc: "クリニックの理念を体現し社会に発信",
    size: "w-36 h-36",
    color: "bg-teal-500 text-white border-teal-700",
  },
];

const fourZones = [
  {
    name: "レッド",
    level: "即退職レベル",
    color: "bg-red-50 border-red-300 text-red-900",
    badge: "bg-red-600",
    desc: "患者・スタッフへの重大な不正・虐待・犯罪行為",
  },
  {
    name: "イエロー",
    level: "退職勧告レベル",
    color: "bg-yellow-50 border-yellow-300 text-yellow-900",
    badge: "bg-yellow-500",
    desc: "チームの信頼を著しく損なう行動・繰り返しの問題行動",
  },
  {
    name: "グリーン",
    level: "一人前レベル",
    color: "bg-emerald-50 border-emerald-300 text-emerald-900",
    badge: "bg-emerald-600",
    desc: "基本的な業務・理念を実践できている状態",
  },
  {
    name: "ティール",
    level: "リーダー以上",
    color: "bg-teal-50 border-teal-400 text-teal-900",
    badge: "bg-teal-600",
    desc: "自律・全体性・進化的目的を体現している状態",
  },
];

const ngActions = [
  "強制する",
  "脅す",
  "批判・責める",
  "文句を言う",
  "ご褒美で釣る",
  "口うるさく言う",
  "脅かす",
];

const leadPrinciples = [
  "仕事の目的・意味をスタッフと一緒に考える",
  "良い仕事の定義をスタッフ自身に語らせる",
  "信頼関係を築いてから、仕事を教える",
  "自己評価を促す（「あなたはどう思う？」）",
  "常に良い仕事のための環境をつくる",
];

const sevenHabits = [
  "主体的である：反応するのではなく、選択する",
  "終わりを思い描くことから始める：目的から逆算して動く",
  "最優先事項を優先する：緊急でなく重要なことに時間を使う",
  "Win-Winを考える：相手の勝ちが自分の勝ち",
  "まず理解に徹し、そして理解される：聞くことが先、話すのは後",
  "シナジーを創り出す：違いを強みに変える",
  "刃を研ぐ：身体・精神・知性・社会を磨き続ける",
];

const successPrinciples = [
  {
    number: "一",
    title: "明確なビジョン（願望）と目標設定",
    detail: "具体性があり、肯定的である",
    icon: "🎯",
  },
  {
    number: "二",
    title: "コミットメント（本気）",
    detail: "必要なことは何でもする",
    icon: "🔥",
  },
  {
    number: "三",
    title: "冒険",
    detail: "安全圏から行動を起こす。観念から自由になる",
    icon: "🚀",
  },
  {
    number: "四",
    title: "パートナーシップ",
    detail: "人に援助、貢献から関わる（パワーパートナーの原則）",
    icon: "🤝",
  },
  {
    number: "五",
    title: "正直",
    detail: "素直に見、伝える。自分に、そして他の人に誠実に向き合う",
    icon: "💎",
  },
  {
    number: "六",
    title: "シェアする",
    detail: "分かち合う、共有する、表現する",
    icon: "🌸",
  },
  {
    number: "七",
    title: "責任（自分が源）",
    detail: "「自分が創り出している」という意識で行動する",
    icon: "⚡",
  },
  {
    number: "八",
    title: "凡事徹底",
    detail: "当たり前のことを、特別熱心に、しかも徹底的に行う",
    icon: "🏆",
  },
];

export default function PhilosophyPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-8 md:space-y-10 pb-12">
      {/* ヘッダー */}
      <div className="text-center pt-4">
        <h1 className="text-3xl md:text-4xl font-bold text-teal-700">
          🌱 クリニックの理念・哲学
        </h1>
        <p className="text-sm md:text-base text-muted-foreground mt-3">
          南草津皮フ科が大切にする理念・哲学・判断軸
        </p>
      </div>

      {/* 1. ミッション */}
      <Card className="bg-gradient-to-br from-amber-50 via-amber-50 to-yellow-50 border-l-4 border-l-amber-500 p-8 md:p-12">
        <Badge className="bg-amber-600 text-white mb-4">MISSION</Badge>
        <blockquote className="text-2xl md:text-3xl font-bold text-amber-900 leading-relaxed mb-4">
          「患者様の人生好転・物心両面の幸福に貢献すること」
        </blockquote>
        <p className="text-base md:text-lg text-amber-800 leading-relaxed">
          スタッフ全員が自律的に成長し、互いに高め合うチームをつくること。
        </p>
      </Card>

      {/* 2. 四方よし */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🌟</span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">
            四方よし
          </h2>
          <span className="text-sm text-muted-foreground">
            — 全員にとって良い選択をする
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {sankaku.map((s) => (
            <Card
              key={s.label}
              className={`${s.color} border-2 p-4 md:p-6 text-center`}
            >
              <div className="text-3xl md:text-4xl mb-2">{s.icon}</div>
              <div className="font-bold text-base md:text-lg mb-1">
                {s.label}
              </div>
              <div className="text-xs md:text-sm opacity-80">{s.desc}</div>
            </Card>
          ))}
        </div>
      </section>

      {/* 3. 院長の3つの哲学 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">💡</span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">
            院長の3つの哲学
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {philosophies.map((p) => (
            <Card
              key={p.title}
              className={`bg-gradient-to-br ${p.color} border-2 p-5 md:p-6`}
            >
              <div className="text-4xl mb-3">{p.icon}</div>
              <h3 className="font-bold text-lg text-slate-800 mb-2">
                {p.title}
              </h3>
              <p className="text-sm font-semibold text-slate-700 mb-2">
                {p.summary}
              </p>
              <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
                {p.detail}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* 4. ティール組織 進化段階 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🌀</span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">
            ティール組織 進化段階
          </h2>
          <span className="text-sm text-muted-foreground">
            — 目指す姿は「ティール」
          </span>
        </div>
        <Card className="p-6 md:p-8">
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
            {tealStages.map((t, i) => (
              <div key={t.name} className="flex items-center gap-2 md:gap-3">
                <div
                  className={`${t.color} border-2 rounded-full px-4 py-3 text-center font-bold ${
                    t.target ? "scale-110 shadow-lg" : ""
                  }`}
                >
                  <div className="text-sm md:text-base">{t.name}</div>
                  <div className="text-xs opacity-90 font-normal mt-0.5">
                    {t.desc}
                  </div>
                </div>
                {i < tealStages.length - 1 && (
                  <span className="text-slate-400 text-xl">→</span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h3 className="font-bold text-teal-700 mb-3">
              ティール組織の3原則
            </h3>
            <ul className="space-y-2 text-sm md:text-base text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-teal-600 font-bold">●</span>
                <span>
                  <span className="font-semibold">自律分散型：</span>
                  ひとりひとりが主体的に考え行動する
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 font-bold">●</span>
                <span>
                  <span className="font-semibold">全体性（Wholeness）：</span>
                  本来の自分で、安心して働ける場所
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-teal-600 font-bold">●</span>
                <span>
                  <span className="font-semibold">進化的目的：</span>
                  クリニックの理念が全員の羅針盤になる
                </span>
              </li>
            </ul>
          </div>
        </Card>
      </section>

      {/* 5. 7つの実 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🍎</span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">
            評価の大原則：7つの実
          </h2>
        </div>
        <Card className="p-5 md:p-6">
          <p className="text-sm text-slate-600 mb-4 italic">
            「心の中やマインドは言動に全て現れる」だから内面ではなく「実」で評価する
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm md:text-base">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-2 px-3 font-semibold text-slate-700 w-16">

                  </th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-700 w-24">
                    実
                  </th>
                  <th className="text-left py-2 px-3 font-semibold text-slate-700">
                    意味
                  </th>
                </tr>
              </thead>
              <tbody>
                {sevenFruits.map((f) => (
                  <tr
                    key={f.name}
                    className="border-b border-slate-100 hover:bg-amber-50/50"
                  >
                    <td className="py-3 px-3 text-2xl">{f.icon}</td>
                    <td className="py-3 px-3 font-bold text-amber-700">
                      {f.name}
                    </td>
                    <td className="py-3 px-3 text-slate-700">{f.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* 6. 等級制度（同心円） */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🎯</span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">
            等級制度（非ピラミッド・同心円モデル）
          </h2>
        </div>
        <Card className="p-5 md:p-6">
          <p className="text-sm text-slate-600 mb-5">
            上下の権力関係ではなく、関わりの深さ・影響力の広がりで定義
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5">
            {grades.map((g) => (
              <div
                key={g.grade}
                className="flex flex-col items-center text-center"
              >
                <div
                  className={`${g.size} ${g.color} border-2 rounded-full flex flex-col items-center justify-center font-bold transition-transform hover:scale-105`}
                >
                  <div className="text-base md:text-lg">{g.grade}</div>
                  <div className="text-xs md:text-sm">{g.name}</div>
                </div>
                <p className="text-xs text-slate-600 mt-2 max-w-[140px] leading-tight">
                  {g.desc}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* 7. 4ゾーン行動基準 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🚦</span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">
            4ゾーン行動基準
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {fourZones.map((z) => (
            <Card key={z.name} className={`${z.color} border-2 p-5`}>
              <div className="flex items-center gap-3 mb-2">
                <Badge className={`${z.badge} text-white`}>{z.name}</Badge>
                <span className="text-xs font-semibold opacity-80">
                  {z.level}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{z.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* 8. リードマネジメント比較 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">🤲</span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">
            リードマネジメント
          </h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {/* NG行動 */}
          <Card className="bg-red-50 border-2 border-red-200 p-5">
            <Badge className="bg-red-600 text-white mb-3">
              ❌ 外的コントロールの7つのNG
            </Badge>
            <h3 className="font-bold text-red-900 mb-3">これは絶対にしない</h3>
            <ol className="space-y-2 text-sm text-red-900">
              {ngActions.map((a, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-red-200 text-red-800 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{a}</span>
                </li>
              ))}
            </ol>
          </Card>

          {/* リードマネジャー5原則 */}
          <Card className="bg-teal-50 border-2 border-teal-200 p-5">
            <Badge className="bg-teal-600 text-white mb-3">
              ✓ リードマネジャーの5原則
            </Badge>
            <h3 className="font-bold text-teal-900 mb-3">
              これを大切にする
            </h3>
            <ol className="space-y-2 text-sm text-teal-900">
              {leadPrinciples.map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="shrink-0 w-6 h-6 rounded-full bg-teal-200 text-teal-800 flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{p}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </section>

      {/* 9. 7つの習慣 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">📖</span>
          <h2 className="text-xl md:text-2xl font-bold text-slate-800">
            7つの習慣（コヴィー）
          </h2>
        </div>
        <Card className="p-5 md:p-6">
          <ol className="space-y-3">
            {sevenHabits.map((h, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-white flex items-center justify-center text-sm font-bold">
                  {i + 1}
                </span>
                <span className="text-sm md:text-base text-slate-700 leading-relaxed pt-1">
                  {h}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {/* 9-2. 成功の八原則（アチーブメント） */}
      <section>
        <div className="bg-gradient-to-br from-teal-50/50 to-white border border-teal-100 rounded-2xl p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-xl font-medium text-gray-900">成功の八原則</h2>
            <p className="text-sm text-gray-500 mt-1">
              © Achievement Corp. — スタッフ全員が体現すべき原則
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            {successPrinciples.map((p) => (
              <div
                key={p.number}
                className="bg-white border border-gray-100 rounded-xl p-4 flex gap-4 items-start"
              >
                <div className="shrink-0 w-10 h-10 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-teal-700">
                    {p.number}
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{p.icon}</span>
                    <p className="font-medium text-gray-900 text-sm">
                      {p.title}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                    {p.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mt-4 text-right">
            © Copyright 2013 Achievement Corp., All rights reserved.
          </p>
        </div>
      </section>

      {/* 10. フッター */}
      <Card className="bg-gradient-to-br from-teal-50 to-emerald-50 border-2 border-teal-200 p-6 md:p-8 text-center">
        <div className="text-4xl mb-3">🌱</div>
        <p className="text-sm md:text-base text-slate-700 leading-relaxed mb-2">
          この理念・哲学は{" "}
          <span className="font-bold text-teal-700">AIアシスタント</span>・
          <span className="font-bold text-teal-700">症例学習</span>・
          <span className="font-bold text-teal-700">ロールプレイ</span>{" "}
          に組み込まれています。
        </p>
        <p className="text-sm md:text-base text-slate-700 leading-relaxed">
          AIはこの判断軸に基づいて回答・評価・フィードバックを行います。
        </p>
      </Card>
    </div>
  );
}
