"use client";

// 段階的な目標（指示書185 A）— 目的 → 3年後 → 年間 → 半期 → 月の行動 → 週の実践 を上から下へ段階表示
// - mode="owner": 本人。目標の内容を書く・直す・進捗と振り返り。希望のペースを選ぶ。週の実践には1on1の約束（と改善計画）を並べる
// - mode="supporter": 院長・担当幹部。閲覧＋「機会・支援」の記入・コメント・合意（年間・半期）だけ。目標の内容は触れない
// 下書きは176-補の仕組み（sessionStorage）。判定はサーバー（/api/growth/goals, /goals/support）でも強制される。

import { useMemo, useState } from "react";
import {
  GOAL_AXES,
  GOAL_LEVELS,
  GROWTH_PACES,
  JITSU_KEYS,
  JITSU_LABEL,
  goalAncestors,
  goalLevelLabel,
  groupGoalsByLevel,
  levelNeedsAgreement,
  parentLevelsOf,
  type Goal,
  type GoalAxis,
  type GoalLevel,
  type GrowthPace,
  type JitsuKey,
} from "@/lib/staff-growth";
import type { GoalInput, PromiseItem } from "@/lib/staff-growth-client";
import { useDraft, useHasDraft, DISCARD_CONFIRM } from "@/lib/retro-drafts";

export type WeeklyLink = { key: string; date: string; label: string; text: string; status: string; href: string };

export function GoalsStaged({
  mode,
  goals,
  pace,
  weeklyLinks,
  busy,
  onCreate,
  onPatch,
  onDelete,
  onPace,
  onSupport,
  draftPrefix,
}: {
  mode: "owner" | "supporter";
  goals: Goal[];
  pace: GrowthPace;
  /** 週の実践に並べる 1on1の約束・改善計画 */
  weeklyLinks: WeeklyLink[];
  busy: boolean;
  onCreate?: (input: GoalInput) => Promise<string | null>;
  onPatch?: (id: string, input: GoalInput) => Promise<string | null>;
  onDelete?: (g: Goal) => Promise<void>;
  onPace?: (pace: GrowthPace) => Promise<void>;
  onSupport?: (input: { id: string; support?: string; comment?: string; agree?: boolean }) => Promise<string | null>;
  draftPrefix: string;
}) {
  const [editing, setEditing] = useState("");
  const [newLevel, setNewLevel] = useState<GoalLevel | "">("");
  const grouped = useMemo(() => groupGoalsByLevel(goals), [goals]);
  const byId = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  const owner = mode === "owner";

  return (
    <section className="space-y-3" data-goals-staged>
      {/* 希望のペース（A-4） */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1">
        <p className="text-[11px] font-medium text-gray-800">🧭 希望のペース（キャリアの選び方）</p>
        {owner ? (
          <div className="flex flex-wrap gap-2">
            {GROWTH_PACES.map((p) => (
              <label key={p.value} className="flex items-center gap-1.5 text-[12px] text-gray-800 min-h-[40px]">
                <input type="radio" name="growth-pace" checked={pace === p.value} disabled={busy} onChange={() => void onPace?.(p.value)} />
                {p.label}
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-[12px] text-gray-600 min-h-[40px]">
              <input type="radio" name="growth-pace" checked={pace === ""} disabled={busy} onChange={() => void onPace?.("")} />
              まだ決めていない
            </label>
          </div>
        ) : (
          <p className="text-[12px] text-gray-900">{GROWTH_PACES.find((p) => p.value === pace)?.label ?? "まだ決めていない"}</p>
        )}
        <p className="text-[10px] text-gray-500">早く進めることも、じっくり深めることも、どちらも大切な選び方です。いつでも変えられます。</p>
      </div>

      {owner && (
        <p className="text-[11px] text-gray-600 leading-relaxed">
          目標の内容はあなただけが書けます。院長・担当幹部は「機会・支援」とコメント、年間・半期の合意を記録します。
          下の段階の目標は、どの上位目標につながっているかを選べます（目的まで一本の線で見えます）。
        </p>
      )}

      {GOAL_LEVELS.map((lv, idx) => {
        const list = grouped[lv.value];
        return (
          <div key={lv.value} className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" data-goal-level={lv.value}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-medium text-gray-900">
                <span className="text-[10px] mr-1.5 px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-800">{idx + 1}</span>
                {lv.label}
                <span className="ml-2 text-[10px] text-gray-500">{lv.hint}</span>
              </h3>
              {owner && newLevel !== lv.value && (
                <NewGoalButton draftKey={`${draftPrefix}:new:${lv.value}`} onClick={() => setNewLevel(lv.value)} />
              )}
            </div>

            {owner && newLevel === lv.value && (
              <GoalEditor
                key={`new-${lv.value}`}
                draftKey={`${draftPrefix}:new:${lv.value}`}
                level={lv.value}
                initial={{ parentId: "", title: "", detail: "", why: "", jitsu: [], axes: [], achievedState: "", dueDate: "", review: "" }}
                candidates={parentLevelsOf(lv.value).flatMap((l) => grouped[l])}
                busy={busy}
                onCancel={() => setNewLevel("")}
                onSubmit={async (v) => {
                  const err = (await onCreate?.({ ...v, level: lv.value, status: "active" })) ?? null;
                  if (!err) setNewLevel("");
                  return err;
                }}
              />
            )}

            {list.length === 0 && newLevel !== lv.value && (
              <p className="text-[11px] text-gray-500">{lv.value === "weekly" && weeklyLinks.length > 0 ? "" : "まだありません。"}</p>
            )}

            <ul className="space-y-2">
              {list.map((g) =>
                owner && editing === g.id ? (
                  <li key={g.id}>
                    <GoalEditor
                      key={g.id}
                      draftKey={`${draftPrefix}:${g.id}`}
                      level={g.level}
                      initial={{ parentId: g.parentId, title: g.title, detail: g.detail, why: g.why, jitsu: g.jitsu, axes: g.axes, achievedState: g.achievedState, dueDate: g.dueDate, review: g.review }}
                      candidates={parentLevelsOf(g.level).flatMap((l) => grouped[l]).filter((c) => c.id !== g.id)}
                      busy={busy}
                      onCancel={() => setEditing("")}
                      onSubmit={async (v) => {
                        const err = (await onPatch?.(g.id, v)) ?? null;
                        if (!err) setEditing("");
                        return err;
                      }}
                    />
                  </li>
                ) : (
                  <li key={g.id}>
                    <GoalCard
                      goal={g}
                      chain={goalAncestors(goals, g)}
                      parentName={g.parentId ? byId.get(g.parentId)?.title ?? "" : ""}
                      mode={mode}
                      busy={busy}
                      onEdit={owner ? () => setEditing(g.id) : undefined}
                      onDone={owner ? () => void onPatch?.(g.id, { status: g.status === "done" ? "active" : "done" }) : undefined}
                      onDelete={owner ? () => void onDelete?.(g) : undefined}
                      onSupport={onSupport}
                    />
                  </li>
                )
              )}
            </ul>

            {/* 週の実践: 1on1の約束・改善計画を並べる（A-1「1on1の約束（C）とつなぐ」） */}
            {lv.value === "weekly" && weeklyLinks.length > 0 && (
              <div className="rounded-lg border border-sky-100 bg-sky-50/40 p-2 space-y-1" data-weekly-links>
                <p className="text-[11px] font-medium text-sky-900">🤝 1on1の約束・改善計画（本人の取り組み状況つき）</p>
                <ul className="space-y-1">
                  {weeklyLinks.map((w) => (
                    <li key={w.key} className="text-[12px] text-gray-900">
                      <span className="text-[10px] text-gray-500 mr-1">{w.date.replaceAll("-", "/")}</span>
                      <span className="text-[10px] px-1 py-0.5 rounded bg-white border border-sky-200 text-sky-800 mr-1">{w.label}</span>
                      {w.text}
                      {w.status && <span className="ml-1 text-[10px] text-teal-800">（{w.status}）</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function NewGoalButton({ draftKey, onClick }: { draftKey: string; onClick: () => void }) {
  const hasDraft = useHasDraft(draftKey);
  return (
    <button type="button" onClick={onClick} className="px-3 py-1.5 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 min-h-[36px]">
      ＋ 追加{hasDraft ? "（下書きあり）" : ""}
    </button>
  );
}

function GoalCard({
  goal: g,
  chain,
  parentName,
  mode,
  busy,
  onEdit,
  onDone,
  onDelete,
  onSupport,
}: {
  goal: Goal;
  chain: Goal[];
  parentName: string;
  mode: "owner" | "supporter";
  busy: boolean;
  onEdit?: () => void;
  onDone?: () => void;
  onDelete?: () => void;
  onSupport?: (input: { id: string; support?: string; comment?: string; agree?: boolean }) => Promise<string | null>;
}) {
  const [supportDraft, setSupportDraft] = useState(g.support);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const supporter = mode === "supporter";
  return (
    <div className={`rounded-lg border p-2 space-y-1 ${g.status === "done" ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200"}`} data-goal-card>
      <p className="text-sm text-gray-900">
        {g.status === "done" ? "✅ " : ""}
        {g.title}
        {g.dueDate && <span className="ml-1.5 text-[10px] text-gray-500">期限 {g.dueDate.replaceAll("-", "/")}</span>}
        {levelNeedsAgreement(g.level) &&
          (g.agreedOn ? (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">合意 {g.agreedOn.replaceAll("-", "/")}・{g.agreedByName}</span>
          ) : (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">未合意</span>
          ))}
      </p>
      {(parentName || chain.length > 0) && (
        <p className="text-[10px] text-gray-500">
          ↑ つながり: {chain.map((c) => `${goalLevelLabel(c.level)}「${c.title}」`).join(" ← ") || parentName}
        </p>
      )}
      {g.why && <p className="text-[11px] text-gray-700">なぜ: {g.why}</p>}
      {(g.jitsu.length > 0 || g.axes.length > 0) && (
        <p className="flex flex-wrap gap-1">
          {g.jitsu.map((k) => (
            <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">{JITSU_LABEL[k]}</span>
          ))}
          {g.axes.map((a) => (
            <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">{GOAL_AXES.find((x) => x.value === a)?.label}</span>
          ))}
        </p>
      )}
      {g.achievedState && <p className="text-[11px] text-gray-700">達成した状態: {g.achievedState}</p>}
      {g.detail && <p className="text-[11px] text-gray-700 whitespace-pre-wrap">{g.detail}</p>}
      {g.review && <p className="text-[11px] text-gray-700 whitespace-pre-wrap">進捗・振り返り（本人）: {g.review}</p>}

      {/* 機会・支援・コメント（院長・担当幹部が書く。本人は読むだけ） */}
      <div className="rounded-md border border-violet-100 bg-violet-50/40 p-1.5 space-y-1" data-goal-support>
        <p className="text-[10px] font-medium text-violet-900">🏥 クリニックが提供する機会・支援{g.supportBy ? `（${g.supportBy}）` : ""}</p>
        {supporter ? (
          <div className="space-y-1">
            <textarea value={supportDraft} onChange={(e) => setSupportDraft(e.target.value)} rows={2} placeholder="研修・任せる業務・伴走 など" className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12px] bg-white" aria-label="機会・支援" />
            <button type="button" disabled={busy || supportDraft === g.support} onClick={async () => setErr((await onSupport?.({ id: g.id, support: supportDraft })) ?? "")} className="px-3 py-1.5 border border-violet-300 text-violet-800 rounded-full text-[11px] hover:bg-violet-50 disabled:opacity-40 min-h-[36px]">
              💾 機会・支援を保存
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-gray-800 whitespace-pre-wrap">{g.support || "（まだ記入がありません）"}</p>
        )}
        {g.comments.length > 0 && (
          <ul className="space-y-0.5">
            {g.comments.map((c, i) => (
              <li key={i} className="text-[11px] text-gray-800">
                💬 {c.name}（{c.at.slice(0, 10).replaceAll("-", "/")}）: {c.text}
              </li>
            ))}
          </ul>
        )}
        {supporter && (
          <div className="flex gap-1.5">
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="コメント" className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-[12px] bg-white min-h-[36px]" aria-label="コメント" />
            <button type="button" disabled={busy || !comment.trim()} onClick={async () => { const e = await onSupport?.({ id: g.id, comment }); setErr(e ?? ""); if (!e) setComment(""); }} className="px-3 py-1.5 border border-violet-300 text-violet-800 rounded-full text-[11px] hover:bg-violet-50 disabled:opacity-40 min-h-[36px]">
              送る
            </button>
          </div>
        )}
        {supporter && levelNeedsAgreement(g.level) && (
          <button type="button" disabled={busy} onClick={async () => setErr((await onSupport?.({ id: g.id, agree: !g.agreedOn })) ?? "")} className="px-3 py-1.5 border border-emerald-300 text-emerald-800 rounded-full text-[11px] hover:bg-emerald-50 disabled:opacity-40 min-h-[36px]">
            {g.agreedOn ? "合意を取り消す" : "🤝 合意を記録する（今日）"}
          </button>
        )}
        {err && <p className="text-[11px] text-red-700">{err}</p>}
      </div>

      {mode === "owner" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" disabled={busy} onClick={onDone} className="px-3 py-1.5 border border-emerald-300 text-emerald-800 rounded-full text-[11px] hover:bg-emerald-50 disabled:opacity-40 min-h-[36px]">
            {g.status === "done" ? "取り組み中に戻す" : "✅ 達成にする"}
          </button>
          <button type="button" disabled={busy} onClick={onEdit} className="px-3 py-1.5 border border-teal-300 text-teal-800 rounded-full text-[11px] hover:bg-teal-50 disabled:opacity-40 min-h-[36px]">
            ✏️ 編集
          </button>
          <button type="button" disabled={busy} onClick={onDelete} className="px-3 py-1.5 border border-red-300 text-red-700 rounded-full text-[11px] hover:bg-red-50 disabled:opacity-40 min-h-[36px]">
            🗑 削除
          </button>
        </div>
      )}
    </div>
  );
}

type EditorValues = {
  parentId: string;
  title: string;
  detail: string;
  why: string;
  jitsu: JitsuKey[];
  axes: GoalAxis[];
  achievedState: string;
  dueDate: string;
  review: string;
};

function GoalEditor({
  draftKey,
  level,
  initial,
  candidates,
  busy,
  onCancel,
  onSubmit,
}: {
  draftKey: string;
  level: GoalLevel;
  initial: EditorValues;
  candidates: Goal[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: GoalInput) => Promise<string | null>;
}) {
  const { values, set, dirty, discard } = useDraft<EditorValues>(draftKey, initial);
  const [error, setError] = useState("");
  const toggle = <T extends string>(arr: T[], k: T): T[] => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k]);
  return (
    <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-2 space-y-2" data-goal-editor>
      <p className="text-[11px] font-medium text-gray-800">{goalLevelLabel(level)}{dirty ? "（下書きあり）" : ""}</p>
      <label className="block">
        <span className="text-[11px] text-gray-700">目標（必須）</span>
        <input value={values.title} onChange={(e) => set("title", e.target.value)} className={inputClass} aria-label="目標" />
      </label>
      {candidates.length > 0 && (
        <label className="block">
          <span className="text-[11px] text-gray-700">つながる上位目標</span>
          <select value={values.parentId} onChange={(e) => set("parentId", e.target.value)} className={inputClass} aria-label="上位目標">
            <option value="">（選ばない）</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {goalLevelLabel(c.level)}: {c.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        <span className="text-[11px] text-gray-700">目的とのつながり（なぜこの目標か）</span>
        <textarea value={values.why} onChange={(e) => set("why", e.target.value)} rows={2} className={areaClass} />
      </label>
      <div>
        <span className="text-[11px] text-gray-700">伸ばしたい7つの実</span>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {JITSU_KEYS.map((k) => (
            <button key={k} type="button" aria-pressed={values.jitsu.includes(k)} onClick={() => set("jitsu", toggle(values.jitsu, k))} className={`text-[11px] px-2 py-1 rounded-full border min-h-[32px] ${values.jitsu.includes(k) ? "bg-amber-500 text-white border-amber-500" : "bg-white text-gray-700 border-gray-300"}`}>
              {JITSU_LABEL[k]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="text-[11px] text-gray-700">3軸</span>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {GOAL_AXES.map((a) => (
            <button key={a.value} type="button" aria-pressed={values.axes.includes(a.value)} onClick={() => set("axes", toggle(values.axes, a.value))} className={`text-[11px] px-2 py-1 rounded-full border min-h-[32px] ${values.axes.includes(a.value) ? "bg-sky-600 text-white border-sky-600" : "bg-white text-gray-700 border-gray-300"}`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="text-[11px] text-gray-700">達成した状態（事実で分かる形）</span>
        <textarea value={values.achievedState} onChange={(e) => set("achievedState", e.target.value)} rows={2} className={areaClass} placeholder="例: 初診の問診を1人で10件担当できた" />
      </label>
      <label className="block">
        <span className="text-[11px] text-gray-700">期限</span>
        <input type="date" value={values.dueDate} onChange={(e) => set("dueDate", e.target.value)} className={inputClass} />
      </label>
      <label className="block">
        <span className="text-[11px] text-gray-700">詳細・やり方</span>
        <textarea value={values.detail} onChange={(e) => set("detail", e.target.value)} rows={2} className={areaClass} />
      </label>
      <label className="block">
        <span className="text-[11px] text-gray-700">進捗・振り返り（自分で書く）</span>
        <textarea value={values.review} onChange={(e) => set("review", e.target.value)} rows={2} className={areaClass} />
      </label>
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !values.title.trim()}
          onClick={async () => {
            const err = await onSubmit({ ...values, title: values.title.trim() });
            if (err) setError(err);
            else discard();
          }}
          className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
        >
          💾 保存
        </button>
        <button type="button" disabled={busy} onClick={() => { if (dirty && !confirm(DISCARD_CONFIRM)) return; discard(); onCancel(); }} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm hover:bg-gray-50 disabled:opacity-40 min-h-[44px]">
          キャンセル
        </button>
      </div>
    </div>
  );
}

export function weeklyLinksFromPromises(promises: PromiseItem[]): WeeklyLink[] {
  return promises.map((p) => ({
    key: `p:${p.ownerId}:${p.oneOnOneKey}`,
    date: p.heldOn,
    label: "1on1の約束",
    text: p.text,
    status: p.status ? ({ not_started: "これから", in_progress: "取り組み中", done: "できた" } as Record<string, string>)[p.status] ?? "" : "",
    href: "/one-on-one",
  }));
}

const inputClass = "w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white mt-0.5";
const areaClass = "w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white mt-0.5";
