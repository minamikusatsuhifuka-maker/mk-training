"use client";

// 🧭 成長の道しるべ（中身）（指示書270 §2-2）— 院長＋委任の設定で任された人
// 直せるもの：ステップ（やること・できた目安・根拠の残し方・目安の時期・支える人）・並び順・足す・消す／
//   技能の業務一覧（業務の名前・到達の段階）／学びのステップ／学びの地図／【院長が直す】の印
// 「💾 保存」を押すまでスタッフの画面は変わらない。保存したらすぐスタッフの画面に出る。直した日時と人を残す。
// ページの到達可否は proxy.ts（/admin/<項目>）、APIは requireAdminItem が判定する。

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AutoGrowTextarea } from "@/components/AutoGrowTextarea";
import {
  DIRECTOR_FIX_MARK,
  MICHI_LEVEL_IDS,
  nextRowId,
  type MichiContent,
  type MichiLearn,
  type MichiLevelId,
  type MichiMapRow,
  type MichiSkillItem,
  type MichiStep,
} from "@/lib/michishirube";

type Pane = "steps" | "skills" | "map" | "history";

const input = "w-full rounded-md border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300";

function move<T>(arr: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export default function MichishirubeAdminPage() {
  const [saved, setSaved] = useState<MichiContent | null>(null);
  const [draft, setDraft] = useState<MichiContent | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [saving, setSaving] = useState(false);
  const [pane, setPane] = useState<Pane>("steps");
  const [levelId, setLevelId] = useState<MichiLevelId>("G1");
  const [resetArmed, setResetArmed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/michishirube", { cache: "no-store", credentials: "same-origin" });
      const j = (await res.json().catch(() => ({}))) as { content?: MichiContent; error?: string };
      if (!res.ok || !j.content) throw new Error(j.error || `読み込めませんでした (${res.status})`);
      setSaved(j.content);
      setDraft(j.content);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);

  // 書きかけのまま離れようとしたら知らせる（262と同じ文）
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const put = async (body: Record<string, unknown>) => {
    if (!saved) return;
    setSaving(true);
    setFlash("");
    try {
      const res = await fetch("/api/admin/michishirube", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ...body, baseUpdatedAt: saved.updatedAt }),
      });
      const j = (await res.json().catch(() => ({}))) as { content?: MichiContent; error?: string };
      if (!res.ok || !j.content) throw new Error(j.error || `保存できませんでした (${res.status})`);
      setSaved(j.content);
      setDraft(j.content);
      setError("");
      setFlash("保存しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setSaving(false);
      setResetArmed(false);
    }
  };

  if (error && !draft) return <p className="p-6 text-sm text-red-700">{error}</p>;
  if (!draft) return <p className="p-6 text-sm text-muted-foreground animate-pulse">読み込んでいます…</p>;

  const level = draft.levels.find((l) => l.id === levelId) ?? draft.levels[0];
  const setLevel = (patch: { steps?: MichiStep[]; learnings?: MichiLearn[] }) =>
    setDraft({ ...draft, levels: draft.levels.map((l) => (l.id === level.id ? { ...l, ...patch } : l)) });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl" data-michi-admin>
      <div>
        <h1 className="text-xl font-bold text-slate-800">🧭 成長の道しるべ（中身）</h1>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          スタッフの画面「<Link href="/michishirube" className="text-teal-700 underline">🧭 成長の道しるべ</Link>」に出す中身です。
          「💾 保存」を押すと、すぐスタッフの画面に出ます。{DIRECTOR_FIX_MARK}の印は、この画面だけに出ます（スタッフの画面には出ません）。
        </p>
        {draft.updatedAt && (
          <p className="text-[11px] text-slate-500 mt-1">
            最後に直した日時：{new Date(draft.updatedAt).toLocaleString("ja-JP")}（{draft.updatedByName}）
          </p>
        )}
      </div>

      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm">
        <button
          type="button"
          onClick={() => put({ content: draft })}
          disabled={!dirty || saving}
          className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          data-michi-save
        >
          {saving ? "保存しています…" : "💾 保存"}
        </button>
        <button
          type="button"
          onClick={() => saved && setDraft(saved)}
          disabled={!dirty || saving}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-40"
        >
          元に戻す
        </button>
        {dirty && <span className="text-xs text-amber-700">書きかけの内容（まだ保存していない入力）があります</span>}
        {flash && !dirty && <span className="text-xs text-teal-700">{flash}</span>}
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["steps", "🪜 段ごとのステップ・学び"],
            ["skills", "🔧 技能の業務一覧"],
            ["map", "📚 学びの地図"],
            ["history", "🕘 直した記録"],
          ] as [Pane, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPane(k)}
            className={`rounded-full border px-3 py-1 text-xs ${pane === k ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {(pane === "steps" || pane === "map") && (
        <div className="flex flex-wrap gap-1.5">
          {MICHI_LEVEL_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setLevelId(id)}
              className={`rounded-lg border px-3 py-1 text-sm font-semibold ${id === level.id ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white"}`}
            >
              {id}
            </button>
          ))}
        </div>
      )}

      {pane === "steps" && (
        <div className="space-y-5">
          {level.steps.length === 0 && level.learnings.length === 0 && level.sections.length === 0 && (
            <p className="text-sm text-slate-600">この段（{level.id}）には、ステップの表はありません（別紙のまま）。</p>
          )}
          {(level.sections.length > 0 ? level.sections : [{ key: "", title: `ステップマップ　${level.id}`, learnTitle: level.learnTitle }]).map((sec) => {
            const inSec = <T extends { section?: string }>(x: T) => (sec.key ? x.section === sec.key : true);
            const steps = level.steps.filter(inSec);
            const learns = level.learnings.filter(inSec);
            if (level.steps.length === 0 && level.learnings.length === 0) return null;
            return (
              <div key={sec.key || "all"} className="space-y-4">
                <section className="space-y-2">
                  <h2 className="text-sm font-bold text-slate-800 border-l-4 border-teal-500 pl-2">{sec.title}</h2>
                  {steps.map((s) => {
                    const idx = level.steps.indexOf(s);
                    const update = (patch: Partial<MichiStep>) =>
                      setLevel({ steps: level.steps.map((x) => (x === s ? { ...x, ...patch } : x)) });
                    return (
                      <RowCard
                        key={s.id}
                        id={s.id}
                        fix={!!s.fix}
                        onFix={(v) => update({ fix: v || undefined })}
                        onUp={() => setLevel({ steps: move(level.steps, idx, -1) })}
                        onDown={() => setLevel({ steps: move(level.steps, idx, 1) })}
                        onDelete={() => setLevel({ steps: level.steps.filter((x) => x !== s) })}
                      >
                        <TextField label="区分" value={s.category} onChange={(v) => update({ category: v })} short />
                        <TextField label="やること" value={s.todo} onChange={(v) => update({ todo: v })} />
                        <TextField label="できた目安" value={s.sign} onChange={(v) => update({ sign: v })} />
                        <TextField label="根拠の残し方" value={s.evidence} onChange={(v) => update({ evidence: v })} />
                        <TextField label={level.whenLabel || "目安の時期"} value={s.when} onChange={(v) => update({ when: v })} short />
                        <TextField label="支える人" value={s.supporter} onChange={(v) => update({ supporter: v })} short />
                      </RowCard>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      const prefix = `${MICHI_LEVEL_IDS.indexOf(level.id) + 1}-`;
                      const id = nextRowId(prefix, level.steps.map((x) => x.id));
                      setLevel({
                        steps: [
                          ...level.steps,
                          { id, category: "", todo: "", sign: "", evidence: "", when: "", supporter: "", ...(sec.key ? { section: sec.key } : {}) },
                        ],
                      });
                    }}
                    className="rounded-lg border border-dashed border-teal-400 px-3 py-1.5 text-sm text-teal-800"
                  >
                    ＋ ステップを足す
                  </button>
                </section>
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-700">{sec.learnTitle}</h3>
                  {learns.map((l) => {
                    const idx = level.learnings.indexOf(l);
                    const update = (patch: Partial<MichiLearn>) =>
                      setLevel({ learnings: level.learnings.map((x) => (x === l ? { ...x, ...patch } : x)) });
                    return (
                      <RowCard
                        key={l.id}
                        id={l.id}
                        fix={!!l.fix}
                        onFix={(v) => update({ fix: v || undefined })}
                        onUp={() => setLevel({ learnings: move(level.learnings, idx, -1) })}
                        onDown={() => setLevel({ learnings: move(level.learnings, idx, 1) })}
                        onDelete={() => setLevel({ learnings: level.learnings.filter((x) => x !== l) })}
                      >
                        <TextField label="区分" value={l.category} onChange={(v) => update({ category: v })} short />
                        <TextField label="学ぶ" value={l.learn} onChange={(v) => update({ learn: v })} />
                        <TextField label="実践（1か月以内に1つ）" value={l.practice} onChange={(v) => update({ practice: v })} />
                        <TextField label="分かち合う" value={l.share} onChange={(v) => update({ share: v })} />
                        <TextField label={level.learnWhenLabel || "目安の時期"} value={l.when} onChange={(v) => update({ when: v })} short />
                      </RowCard>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      const prefix = `L${MICHI_LEVEL_IDS.indexOf(level.id) + 1}-`;
                      const id = nextRowId(prefix, level.learnings.map((x) => x.id));
                      setLevel({
                        learnings: [
                          ...level.learnings,
                          { id, category: "", learn: "", practice: "", share: "", when: "", ...(sec.key ? { section: sec.key } : {}) },
                        ],
                      });
                    }}
                    className="rounded-lg border border-dashed border-amber-400 px-3 py-1.5 text-sm text-amber-800"
                  >
                    ＋ 学びのステップを足す
                  </button>
                </section>
              </div>
            );
          })}
        </div>
      )}

      {pane === "skills" && (
        <div className="space-y-5">
          {draft.skillFixNote && <p className="text-xs text-amber-800">{DIRECTOR_FIX_MARK} {draft.skillFixNote}</p>}
          {draft.skillLines.map((line) => (
            <SkillEditor
              key={line.id}
              title={line.label}
              prefix={line.id[0]}
              columns={line.columns}
              items={line.items}
              onChange={(items) => setDraft({ ...draft, skillLines: draft.skillLines.map((x) => (x.id === line.id ? { ...x, items } : x)) })}
            />
          ))}
          {draft.skillRanges.map((r) => (
            <SkillEditor
              key={r.id}
              title={`技能の4段階（${r.title}）`}
              prefix={`${r.id}-`}
              columns={r.columns}
              items={r.items}
              onChange={(items) => setDraft({ ...draft, skillRanges: draft.skillRanges.map((x) => (x.id === r.id ? { ...x, items } : x)) })}
            />
          ))}
        </div>
      )}

      {pane === "map" &&
        (() => {
          const m = draft.learnMap.find((x) => x.level === level.id);
          if (!m) return null;
          const setRows = (rows: MichiMapRow[]) =>
            setDraft({ ...draft, learnMap: draft.learnMap.map((x) => (x.level === m.level ? { ...x, rows } : x)) });
          return (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-slate-800">
                {m.title}　テーマ：{m.theme}
              </h2>
              {m.rows.map((r, idx) => {
                const update = (patch: Partial<MichiMapRow>) => setRows(m.rows.map((x) => (x === r ? { ...x, ...patch } : x)));
                return (
                  <RowCard
                    key={r.id}
                    id={r.id}
                    fix={!!r.fix}
                    onFix={(v) => update({ fix: v || undefined })}
                    onUp={() => setRows(move(m.rows, idx, -1))}
                    onDown={() => setRows(move(m.rows, idx, 1))}
                    onDelete={() => setRows(m.rows.filter((x) => x !== r))}
                  >
                    <TextField label="種類" value={r.kind} onChange={(v) => update({ kind: v })} short />
                    <TextField label="学び" value={r.item} onChange={(v) => update({ item: v })} />
                    <TextField label={m.whenLabel || "目安の時期"} value={r.when} onChange={(v) => update({ when: v })} short />
                  </RowCard>
                );
              })}
              <button
                type="button"
                onClick={() => setRows([...m.rows, { id: nextRowId("m", m.rows.map((x) => x.id)), kind: "", item: "", when: "" }])}
                className="rounded-lg border border-dashed border-amber-400 px-3 py-1.5 text-sm text-amber-800"
              >
                ＋ 学びを足す
              </button>
            </section>
          );
        })()}

      {pane === "history" && (
        <section className="space-y-3">
          {draft.history.length === 0 ? (
            <p className="text-sm text-slate-600">まだ直した記録はありません（別紙のままです）。</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {[...draft.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="px-3 py-2 text-sm">
                  <span className="text-slate-500 text-xs mr-2">{new Date(h.at).toLocaleString("ja-JP")}</span>
                  <span className="font-medium mr-2">{h.byName}</span>
                  <span className="text-slate-700">{h.what}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-2">
            <p className="text-xs text-slate-700">中身を、はじめの中身（別紙のまま）に戻します。直した記録は残ります。</p>
            {!resetArmed ? (
              <button type="button" onClick={() => setResetArmed(true)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700">
                別紙のままに戻す
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => put({ reset: true })}
                  disabled={saving}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white"
                >
                  戻す
                </button>
                <button type="button" onClick={() => setResetArmed(false)} className="rounded-lg border px-3 py-1.5 text-sm">
                  キャンセル
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function RowCard({
  id,
  fix,
  onFix,
  onUp,
  onDown,
  onDelete,
  children,
}: {
  id: string;
  fix: boolean;
  onFix: (v: boolean) => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${fix ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"}`} data-edit-row={id}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-slate-500">{id}</span>
        <label className="flex items-center gap-1 text-xs text-amber-800">
          <input type="checkbox" checked={fix} onChange={(e) => onFix(e.target.checked)} />
          {DIRECTOR_FIX_MARK}
        </label>
        <span className="flex-1" />
        <button type="button" onClick={onUp} className="rounded border px-2 text-xs" aria-label="上へ">
          ↑
        </button>
        <button type="button" onClick={onDown} className="rounded border px-2 text-xs" aria-label="下へ">
          ↓
        </button>
        <button type="button" onClick={onDelete} className="rounded border border-red-200 px-2 text-xs text-red-700">
          🗑 消す
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">{children}</div>
    </div>
  );
}

function TextField({ label, value, onChange, short }: { label: string; value: string; onChange: (v: string) => void; short?: boolean }) {
  return (
    <label className={`block text-xs text-slate-600 space-y-0.5 ${short ? "" : "md:col-span-2"}`}>
      <span>{label}</span>
      {short ? (
        <input className={input} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <AutoGrowTextarea className={input} value={value} onChange={onChange} minRows={1} ariaLabel={label} />
      )}
    </label>
  );
}

function SkillEditor({
  title,
  prefix,
  columns,
  items,
  onChange,
}: {
  title: string;
  prefix: string;
  columns: { level: MichiLevelId; label: string }[];
  items: MichiSkillItem[];
  onChange: (items: MichiSkillItem[]) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
      {items.map((it, idx) => {
        const update = (patch: Partial<MichiSkillItem>) => onChange(items.map((x) => (x === it ? { ...x, ...patch } : x)));
        return (
          <RowCard
            key={it.id}
            id={it.id}
            fix={!!it.fix}
            onFix={(v) => update({ fix: v || undefined })}
            onUp={() => onChange(move(items, idx, -1))}
            onDown={() => onChange(move(items, idx, 1))}
            onDelete={() => onChange(items.filter((x) => x !== it))}
          >
            <TextField label="業務" value={it.name} onChange={(v) => update({ name: v })} />
            {columns.map((c) => (
              <TextField
                key={c.level}
                label={c.label}
                value={it.reach[c.level] ?? ""}
                onChange={(v) => update({ reach: { ...it.reach, [c.level]: v } })}
                short
              />
            ))}
          </RowCard>
        );
      })}
      <button
        type="button"
        onClick={() =>
          onChange([
            ...items,
            { id: nextRowId(prefix, items.map((x) => x.id)), name: "", reach: Object.fromEntries(columns.map((c) => [c.level, ""])) },
          ])
        }
        className="rounded-lg border border-dashed border-teal-400 px-3 py-1.5 text-sm text-teal-800"
      >
        ＋ 業務を足す
      </button>
    </section>
  );
}
