"use client";

// 🧭 成長の道しるべ（指示書270 第1部）— スタッフの画面
//   1. 全体の地図（8段のはしご・3つの柱）  2. 使い方  3. 段ごとのページ（意味・ゴール・ステップ・学びのステップ・区分で絞り込み）
//   4. 技能の4段階チェック表  5. 学びの地図  6. 支える人の流れ
// 文は別紙のまま（/api/michishirube が返す中身をそのまま出す・言い換えない）。【院長が直す】の印はサーバーで外してある。

import { useEffect, useMemo, useState } from "react";
import { MarkdownView } from "@/components/deep-research/MarkdownView";
import {
  MICHI_LEVEL_IDS,
  categoriesOf,
  filterByCategory,
  isMichiLevelId,
  type MichiContent,
  type MichiLevel,
  type MichiLevelId,
} from "@/lib/michishirube";
import { CategoryChips, LearnTable, Rich, StepTable } from "./MichiParts";

type View = "map" | "usage" | "level" | "skills" | "learn" | "support";

const VIEWS: { key: View; label: string }[] = [
  { key: "map", label: "🗺 全体の地図" },
  { key: "usage", label: "📖 使い方" },
  { key: "level", label: "🪜 段ごとのステップ" },
  { key: "skills", label: "🔧 技能の4段階チェック表" },
  { key: "learn", label: "📚 学びの地図" },
  { key: "support", label: "🤝 支える人の流れ" },
];

export function MichishirubeBoard() {
  const [content, setContent] = useState<MichiContent | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("map");
  const [levelId, setLevelId] = useState<MichiLevelId>("G1");

  useEffect(() => {
    // ?level=G2 で段のページを開く（可能性ノートの道しるべタブから）
    try {
      const q = new URLSearchParams(window.location.search).get("level");
      if (isMichiLevelId(q)) {
        setLevelId(q);
        setView("level");
      }
    } catch {
      /* そのまま */
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/michishirube", { cache: "no-store", credentials: "same-origin" });
        const j = (await res.json().catch(() => ({}))) as { content?: MichiContent; error?: string };
        if (!res.ok || !j.content) throw new Error(j.error || `読み込めませんでした (${res.status})`);
        if (alive) setContent(j.content);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "読み込めませんでした");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const openLevel = (id: MichiLevelId) => {
    setLevelId(id);
    setView("level");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (error) return <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>;
  if (!content)
    return (
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        <span className="animate-pulse">読み込んでいます…</span>
      </div>
    );

  return (
    <div className="space-y-4" data-michishirube>
      <nav className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" aria-label="成長の道しるべの見出し">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setView(v.key)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium min-h-[36px] ${
              view === v.key ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            aria-pressed={view === v.key}
            data-michi-view={v.key}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {view === "map" && <MapView content={content} onOpen={openLevel} />}
      {view === "usage" && (
        <Card title="📖 道しるべの使い方">
          <MarkdownView>{content.usageMd}</MarkdownView>
        </Card>
      )}
      {view === "level" && (
        <LevelView content={content} levelId={levelId} onLevel={(id) => setLevelId(id)} />
      )}
      {view === "skills" && <SkillsView content={content} />}
      {view === "learn" && <LearnMapView content={content} />}
      {view === "support" && (
        <Card title="🤝 支える人の流れ（育てることが、自分の成長にもなる）">
          <MarkdownView>{content.supportersMd}</MarkdownView>
        </Card>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 space-y-3">
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

// ─── 1. 全体の地図 ───

function MapView({ content, onOpen }: { content: MichiContent; onOpen: (id: MichiLevelId) => void }) {
  return (
    <div className="space-y-4">
      <Card title="この道しるべのねらい">
        <MarkdownView>{content.aimsMd}</MarkdownView>
      </Card>
      <Card title="🗺 全体の地図（8段のはしご）">
        <ol className="space-y-2" data-michi-ladder>
          {[...content.levels].reverse().map((lv) => (
            <li key={lv.id}>
              <button
                type="button"
                onClick={() => onOpen(lv.id)}
                className="w-full text-left rounded-xl border border-slate-200 bg-gradient-to-r from-teal-50/60 to-white px-3 py-2.5 hover:border-teal-300"
                data-ladder-level={lv.id}
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-xs text-slate-500">{lv.no}</span>
                  <span className="font-bold text-slate-800">{lv.name}</span>
                  <span className="text-sm text-teal-800">{lv.oneLine}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                  <span className="text-slate-500">主な道しるべ：</span>
                  {lv.guide}
                </p>
              </button>
            </li>
          ))}
        </ol>
      </Card>
      <Card title="3つの柱">
        <MarkdownView>{content.pillarsMd}</MarkdownView>
      </Card>
    </div>
  );
}

// ─── 3. 段ごとのページ ───

function LevelView({
  content,
  levelId,
  onLevel,
}: {
  content: MichiContent;
  levelId: MichiLevelId;
  onLevel: (id: MichiLevelId) => void;
}) {
  const lv = content.levels.find((l) => l.id === levelId) ?? content.levels[0];
  const [category, setCategory] = useState("");
  const cats = useMemo(() => categoriesOf(lv), [lv]);
  return (
    <div className="space-y-4" data-michi-level={lv.id}>
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label="段を選ぶ">
        {MICHI_LEVEL_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setCategory("");
              onLevel(id);
            }}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm font-semibold min-w-[3.5rem] ${
              id === lv.id ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            aria-pressed={id === lv.id}
          >
            {id}
          </button>
        ))}
      </div>
      <LevelBody level={lv} category={category} onCategory={setCategory} categories={cats} />
    </div>
  );
}

export function LevelBody({
  level: lv,
  category,
  onCategory,
  categories,
}: {
  level: MichiLevel;
  category: string;
  onCategory: (v: string) => void;
  categories: string[];
}) {
  const steps = filterByCategory(lv.steps, category);
  const learns = filterByCategory(lv.learnings, category);
  return (
    <>
      <section className="rounded-2xl border border-teal-200 bg-teal-50/40 p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-lg font-bold text-slate-800">{lv.name}</h2>
          <p className="text-sm text-teal-800">{lv.oneLine}</p>
        </div>
        <Field label="この段の意味">
          {lv.meaning.split("\n").map((m, i) => (
            <p key={i}>
              <Rich text={m} />
            </p>
          ))}
        </Field>
        {lv.goal && (
          <Field label="ゴール">
            <Rich text={lv.goal} />
          </Field>
        )}
        <Field label="3つの柱">
          <ul className="space-y-1">
            <li>
              <span className="text-slate-500">学び続けるコミット：</span>
              <Rich text={lv.pillars.commit} />
            </li>
            <li>
              <span className="text-slate-500">理念：</span>
              <Rich text={lv.pillars.philosophy} />
            </li>
            <li>
              <span className="text-slate-500">願望とキャリアの方向性：</span>
              <Rich text={lv.pillars.desire} />
            </li>
          </ul>
          {lv.pillarsNote && (
            <div className="mt-2">
              <MarkdownView>{lv.pillarsNote}</MarkdownView>
            </div>
          )}
        </Field>
      </section>

      {lv.extraMd && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5">
          <MarkdownView>{lv.extraMd}</MarkdownView>
        </section>
      )}

      {(lv.steps.length > 0 || lv.learnings.length > 0) && (
        <CategoryChips categories={categories} value={category} onChange={onCategory} />
      )}

      {lv.sections.length > 0 ? (
        lv.sections.map((sec) => (
          <div key={sec.key} className="space-y-3">
            <h3 className="text-sm font-bold text-slate-800 border-l-4 border-teal-500 pl-2">{sec.title}</h3>
            <StepTable steps={steps.filter((s) => s.section === sec.key)} whenLabel={lv.whenLabel} />
            <h4 className="text-sm font-semibold text-slate-700">{sec.learnTitle}</h4>
            <LearnTable rows={learns.filter((l) => l.section === sec.key)} whenLabel={lv.learnWhenLabel} />
          </div>
        ))
      ) : lv.steps.length > 0 || lv.learnings.length > 0 ? (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-800 border-l-4 border-teal-500 pl-2">ステップマップ　{lv.id}</h3>
          <StepTable steps={steps} whenLabel={lv.whenLabel} />
          <h4 className="text-sm font-semibold text-slate-700">{lv.learnTitle}</h4>
          <LearnTable rows={learns} whenLabel={lv.learnWhenLabel} />
        </div>
      ) : null}

      {lv.closing.map((c, i) => (
        <p key={i} className="text-sm text-slate-700 rounded-lg bg-slate-50 px-3 py-2">
          {c}
        </p>
      ))}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm leading-relaxed text-slate-700">
      <p className="text-xs font-semibold text-teal-800 mb-0.5">{label}</p>
      {children}
    </div>
  );
}

// ─── 4. 技能の4段階チェック表 ───

function SkillsView({ content }: { content: MichiContent }) {
  return (
    <div className="space-y-4" data-michi-skills>
      <Card title="🔧 技能の4段階">
        <MarkdownView>{content.skillStagesMd}</MarkdownView>
      </Card>
      <Card title="技能の4段階チェック表（G1 → G1+ → G2）">
        {content.skillNote && <p className="text-xs text-slate-600">{content.skillNote}</p>}
        {content.skillLines.map((line) => (
          <div key={line.id} className="space-y-1.5">
            <h3 className="text-sm font-bold text-slate-800">{line.label}</h3>
            <SkillTable headLabel="業務" columns={line.columns} items={line.items} />
          </div>
        ))}
      </Card>
      {content.skillRanges.map((r) => (
        <Card key={r.id} title={`技能の4段階（${r.title}）`}>
          {r.intro && <p className="text-sm text-slate-700">{r.intro}</p>}
          <SkillTable headLabel={r.headLabel} columns={r.columns} items={r.items} />
          {r.note && <p className="text-xs text-slate-600">{r.note}</p>}
        </Card>
      ))}
    </div>
  );
}

function SkillTable({
  headLabel,
  columns,
  items,
}: {
  headLabel: string;
  columns: { level: string; label: string }[];
  items: { id: string; name: string; reach: Record<string, string> }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px] leading-relaxed">
        <thead>
          <tr>
            <th className="border border-slate-200 bg-teal-50/70 px-2 py-1.5 text-left font-semibold">{headLabel}</th>
            {columns.map((c) => (
              <th key={c.level} className="border border-slate-200 bg-teal-50/70 px-2 py-1.5 text-left font-semibold whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} data-skill-id={it.id}>
              <td className="border border-slate-200 px-2 py-1.5">{it.name}</td>
              {columns.map((c) => (
                <td key={c.level} className="border border-slate-200 px-2 py-1.5">
                  {it.reach[c.level] ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 5. 学びの地図 ───

function LearnMapView({ content }: { content: MichiContent }) {
  return (
    <div className="space-y-4" data-michi-learnmap>
      <Card title="📚 学びの3点セット（どの学びも同じ）">
        <MarkdownView>{content.learnSetMd}</MarkdownView>
      </Card>
      <Card title="全8段の学びの地図">
        <div className="space-y-4">
          {content.learnMap.map((m) => (
            <div key={m.level} className="space-y-1.5" data-learnmap-level={m.level}>
              <h3 className="text-sm font-bold text-slate-800">
                {m.title}
                <span className="ml-2 font-normal text-teal-800">テーマ：{m.theme}</span>
              </h3>
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {m.rows.map((r) => (
                  <li key={r.id} className="px-3 py-2 text-sm text-slate-700 flex flex-col sm:flex-row sm:items-baseline gap-x-3 gap-y-0.5">
                    <span className="shrink-0 text-xs rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 self-start">{r.kind}</span>
                    <span className="flex-1">{r.item}</span>
                    {r.when && (
                      <span className="shrink-0 text-xs text-slate-500">
                        {m.whenLabel ? `${m.whenLabel}：` : ""}
                        {r.when}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
      <Card title="学びの順番の考え方">
        <MarkdownView>{content.learnOrderMd}</MarkdownView>
      </Card>
    </div>
  );
}
