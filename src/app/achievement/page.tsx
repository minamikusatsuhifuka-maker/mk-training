// 🌱 アチーブメントの教え（指示書 mk_training_success_cycle.md／mk_training_achievement_formulas.md）
// 1. 成功のサイクル・失敗のサイクル 2. 人生の方程式 3. 成功の公式 4. 身につけたい7つの習慣
//
// - ログインしたスタッフ全員。静的な内容（DB なし）
// - 文言は院長が確定したもの。一字一句変えない・説明を足さない（lib/achievement-teachings-server.ts）
// - 格言（/quotes）と同じく**サーバーでログインを確かめてから**描く。文言はサーバーで描き、
//   クライアントの JS（/_next/static は誰でも取れる）には入れない。入口の関門（proxy.ts）と二重に守る

import Link from "next/link";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/staff-profiles-server";
import NavPageHeader from "@/components/NavPageHeader";
import { CycleCircle, CycleList } from "@/components/achievement/CycleFigure";
import { CycleViewSwitch } from "@/components/achievement/CycleViewSwitch";
import { SelfCheckItem } from "@/components/achievement/SelfCheckItem";
import {
  CONSTRUCTIVE_HABITS,
  CYCLE_LEAD,
  DESTRUCTIVE_HABITS,
  FAILURE_CYCLE,
  HABITS_HEADING,
  LIFE_EQUATION,
  SUCCESS_CYCLE,
  SUCCESS_FORMULA,
  type Formula,
  type HabitColumn,
} from "@/lib/achievement-teachings-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "アチーブメントの教え",
  robots: { index: false, follow: false, nocache: true },
};

const SECTIONS = [
  { id: "cycle", label: "成功のサイクル・失敗のサイクル" },
  { id: "life", label: LIFE_EQUATION.heading },
  { id: "success-formula", label: SUCCESS_FORMULA.heading },
  { id: "habits", label: HABITS_HEADING },
];

// 人生の方程式＝パープル／成功の公式＝ティール。左辺は濃い色、右辺は同系色の淡い色
const FORMULA_COLORS: Record<Formula["id"], { left: string; right: string; sym: string }> = {
  life: { left: "bg-violet-500 text-white border-violet-500", right: "bg-violet-50 text-violet-900 border-violet-200", sym: "text-violet-500" },
  success: { left: "bg-teal-600 text-white border-teal-600", right: "bg-teal-50 text-teal-900 border-teal-200", sym: "text-teal-600" },
};

function FormulaRow({ f }: { f: Formula }) {
  const c = FORMULA_COLORS[f.id];
  const card = "whitespace-nowrap rounded-xl border px-4 py-3 text-center text-[16px] font-bold min-[560px]:flex-1 min-[560px]:px-2";
  const sym = `text-2xl font-bold leading-none ${c.sym}`;
  return (
    <div className="flex flex-col items-stretch gap-2 min-[560px]:flex-row min-[560px]:items-center" data-formula={f.id}>
      <div className={`${card} ${c.left}`} data-formula-left>
        {f.left}
      </div>
      <span aria-hidden="true" className={`${sym} self-center`}>
        ＝
      </span>
      {f.right.map((t, i) => (
        <div key={t} className="contents">
          {i > 0 && (
            <span aria-hidden="true" className={`${sym} self-center`}>
              ×
            </span>
          )}
          <div className={`${card} ${c.right}`} data-formula-term>
            {t}
          </div>
        </div>
      ))}
    </div>
  );
}

function HabitCard({ col, tone }: { col: HabitColumn; tone: "coral" | "teal" }) {
  const box =
    tone === "teal"
      ? "border-2 border-teal-500 bg-teal-50/60"
      : "border border-[#E9A796] bg-[#FDEEE9]/60";
  const head = tone === "teal" ? "text-teal-900" : "text-[#7A2E1E]";
  const sub = tone === "teal" ? "text-teal-700" : "text-[#9A4F3C]";
  return (
    <div className={`rounded-xl p-3 ${box}`} data-habit-col={tone}>
      <p className={`text-center text-sm font-bold ${head}`}>{col.principle}</p>
      <div className="mt-2 border-t border-black/5 pt-2 text-center">
        <p className={`text-[15px] font-bold ${head}`}>{col.title}</p>
        <p className={`text-xs ${sub}`}>{col.theory}</p>
      </div>
      <ul className="mt-2 space-y-0.5">
        {col.items.map((t) => (
          <li key={t}>
            <SelfCheckItem accent={tone}>{t}</SelfCheckItem>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function AchievementPage() {
  const { user } = await getSessionUser();

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-3">
          <h1 className="text-lg font-bold text-gray-900">🔒 アチーブメントの教え</h1>
          <p className="text-sm text-gray-700 leading-relaxed">
            このページはスタッフ専用です。閲覧するにはログインしてください。
          </p>
          <Link
            href="/login?next=/achievement"
            className="inline-block px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700"
          >
            ログインページへ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-8" data-achievement>
      <NavPageHeader navKey="/achievement" title="🌱 アチーブメントの教え" />

      <nav aria-label="このページの中" className="flex flex-wrap gap-2" data-achievement-jump>
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-sm text-teal-800 hover:bg-teal-50"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <section id="cycle" className="scroll-mt-20 space-y-4" data-section="cycle">
        <h2 className="text-xl font-bold text-gray-900">成功のサイクル・失敗のサイクル</h2>
        <div className="rounded-xl border border-gray-100 bg-white p-4 text-[15px] leading-relaxed text-gray-800">
          {CYCLE_LEAD.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
        <CycleViewSwitch
          circle={
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-100 bg-white p-2">
                <CycleCircle cycle={SUCCESS_CYCLE} />
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-2">
                <CycleCircle cycle={FAILURE_CYCLE} />
              </div>
            </div>
          }
          list={
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <CycleList cycle={SUCCESS_CYCLE} />
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4">
                <CycleList cycle={FAILURE_CYCLE} />
              </div>
            </div>
          }
        />
      </section>

      {[LIFE_EQUATION, SUCCESS_FORMULA].map((f) => (
        <section key={f.id} id={f.id === "life" ? "life" : "success-formula"} className="scroll-mt-20 space-y-3" data-section={f.id}>
          <h2 className="text-xl font-bold text-gray-900">{f.heading}</h2>
          <div className="rounded-xl border border-gray-100 bg-white p-4">
            <FormulaRow f={f} />
          </div>
        </section>
      ))}

      <section id="habits" className="scroll-mt-20 space-y-3" data-section="habits">
        <h2 className="text-xl font-bold text-gray-900">{HABITS_HEADING}</h2>
        <div className="grid grid-cols-1 gap-3 min-[560px]:grid-cols-2">
          <HabitCard col={DESTRUCTIVE_HABITS} tone="coral" />
          <HabitCard col={CONSTRUCTIVE_HABITS} tone="teal" />
        </div>
      </section>
    </div>
  );
}
