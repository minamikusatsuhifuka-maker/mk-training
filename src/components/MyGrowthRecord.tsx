"use client";

// 本人ページ「マイ成長記録」（指示書179 C）
// 表示するのは 自分の学びの記録（B）／自分の目標／1on1の約束 の3つだけ。
// 院長メモ・適性検査・履歴書・家族構成は**この画面に存在しない**（APIも返さない）。
// 機能フラグ growth_record（既定OFF）で守られている（ページ側 FeatureGate ＋ API側 authorizeGrowth）。

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PROMISE_STATUSES,
  promiseStatusLabel,
  type Course,
  type Goal,
  type LearningRecord,
  type PromiseStatusValue,
} from "@/lib/staff-growth";
import {
  createGoalApi,
  createLearningApi,
  deleteEvidenceApi,
  deleteGoalApi,
  deleteLearningApi,
  fetchGoalsApi,
  fetchLearningApi,
  fetchPromisesApi,
  patchGoalApi,
  patchLearningApi,
  savePromiseStatusApi,
  uploadEvidenceApi,
  type LearningInput,
  type PromiseItem,
} from "@/lib/staff-growth-client";
import {
  LearningRecordForm,
  emptyLearningForm,
  learningFormFrom,
} from "@/components/LearningRecordForm";
import { LearningRecordList } from "@/components/LearningRecordList";
import { useDraft, useHasDraft, DISCARD_CONFIRM } from "@/lib/retro-drafts";

type Tab = "learning" | "goals" | "promises";

export function MyGrowthRecord() {
  const [tab, setTab] = useState<Tab>("learning");
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [promises, setPromises] = useState<PromiseItem[]>([]);
  const [aiDraftEnabled, setAiDraftEnabled] = useState(false);
  const [bucketMissing, setBucketMissing] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  /** "" / "new" / 記録id */
  const [editing, setEditing] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [l, g, p] = await Promise.all([fetchLearningApi(), fetchGoalsApi(), fetchPromisesApi()]);
      setRecords(l.records);
      setCourses(l.courses);
      setAiDraftEnabled(l.aiDraftEnabled);
      setBucketMissing(l.bucketMissing);
      setTableMissing(l.tableMissing || g.tableMissing || p.tableMissing);
      setGoals(g.goals);
      setPromises(p.promises);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) setHidden(true);
      else setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (t: string) => {
    setMsg(t);
    setError("");
  };

  // ─── 学びの記録 ───

  const submitLearning = async (
    id: string,
    input: LearningInput,
    evidence: Blob | null
  ): Promise<string | null> => {
    setBusy(true);
    try {
      if (id === "new") {
        let { record } = await createLearningApi(input);
        if (evidence) {
          try {
            record = (await uploadEvidenceApi(record.id, [evidence])).record;
          } catch (e) {
            setError(
              `記録は保存しましたが、証跡の添付に失敗しました: ${e instanceof Error ? e.message : ""}`
            );
          }
        }
        setRecords((prev) => [...prev, record]);
        flash("💾 学びの記録を保存しました");
      } else {
        const { record } = await patchLearningApi(id, input);
        setRecords((prev) => prev.map((r) => (r.id === id ? record : r)));
        flash("💾 学びの記録を更新しました");
      }
      setEditing("");
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "保存に失敗しました";
    } finally {
      setBusy(false);
    }
  };

  const removeLearning = async (r: LearningRecord) => {
    if (!confirm("この学びの記録を削除します（証跡の画像も消えます）。よろしいですか？")) return;
    setBusy(true);
    try {
      await deleteLearningApi(r.id);
      setRecords((prev) => prev.filter((x) => x.id !== r.id));
      flash("🗑 学びの記録を削除しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const replaceRecord = (record: LearningRecord) =>
    setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));

  const moveToGoal = async (r: LearningRecord) => {
    const firstLine = r.nextAction.trim().split("\n")[0].slice(0, 200);
    if (!confirm(`「${firstLine}」を自分の目標に移します。よろしいですか？`)) return;
    setBusy(true);
    try {
      const { goal } = await createGoalApi({
        title: firstLine,
        detail: r.nextAction.trim(),
        status: "active",
        dueDate: "",
        fromLearningId: r.id,
      });
      setGoals((prev) => [goal, ...prev]);
      setTab("goals");
      flash("🎯 目標に移しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "目標の追加に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const activeGoals = useMemo(() => goals.filter((g) => g.status === "active"), [goals]);
  const doneGoals = useMemo(() => goals.filter((g) => g.status === "done"), [goals]);

  if (hidden) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center gap-3">
        <p className="text-3xl">🌱</p>
        <p className="text-sm font-medium text-gray-800">この機能は現在準備中です。</p>
        <p className="text-xs text-muted-foreground">公開までもうしばらくお待ちください。</p>
      </div>
    );
  }

  if (tableMissing) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-medium text-gray-900">🌱 マイ成長記録の準備がまだ終わっていません</p>
          <p className="text-xs text-gray-700 mt-2 leading-relaxed">
            データの保存先がまだ作られていません。院長にお伝えください
            （管理者向け: <code className="mx-1">~/Downloads/179_スタッフ育成カルテ_テーブル作成.sql</code>
            を Supabase の SQL Editor で実行してください）。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      <p className="text-[11px] text-gray-600 leading-relaxed">
        ここに載るのは <strong>自分の学びの記録・自分の目標・1on1の約束</strong> の3つだけです。
        自分の学びと目標は自分で書き、院長も見ることができます。ほかのスタッフの記録は見られません。
      </p>

      <div className="flex gap-1 border-b border-gray-200">
        {(
          [
            ["learning", "📚 学びの記録"],
            ["goals", "🎯 自分の目標"],
            ["promises", "🤝 1on1の約束"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm min-h-[44px] border-b-2 -mb-px ${
              tab === k
                ? "border-teal-600 text-teal-800 font-medium"
                : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}
      {msg && (
        <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>
      )}

      {!loaded ? (
        <p className="text-xs text-gray-500">読み込み中…</p>
      ) : tab === "learning" ? (
        <section className="space-y-3">
          {editing === "new" ? (
            <LearningRecordForm
              key="new"
              draftKey="growth:learning:new"
              initial={emptyLearningForm()}
              courses={courses}
              aiDraftEnabled={aiDraftEnabled}
              busy={busy}
              isEdit={false}
              onCancel={() => setEditing("")}
              onCourseCreated={(c) => setCourses((prev) => [...prev, c])}
              onSubmit={(input, evidence) => submitLearning("new", input, evidence)}
            />
          ) : (
            <NewLearningButton onClick={() => setEditing("new")} />
          )}
          <LearningRecordList
            records={records}
            courses={courses}
            canEdit
            busy={busy}
            bucketMissing={bucketMissing}
            editingId={editing}
            renderEditor={(r) => (
              <LearningRecordForm
                key={r.id}
                draftKey={`growth:learning:${r.id}`}
                initial={learningFormFrom(r)}
                courses={courses}
                aiDraftEnabled={false}
                busy={busy}
                isEdit
                onCancel={() => setEditing("")}
                onCourseCreated={(c) => setCourses((prev) => [...prev, c])}
                onSubmit={(input) => submitLearning(r.id, input, null)}
              />
            )}
            onEdit={(r) => {
              setEditing(r.id);
              setMsg("");
            }}
            onDelete={removeLearning}
            onUploadEvidence={async (r, files) => {
              const { record } = await uploadEvidenceApi(r.id, files);
              replaceRecord(record);
            }}
            onDeleteEvidence={async (r, path) => {
              const { record } = await deleteEvidenceApi(r.id, path);
              replaceRecord(record);
            }}
            onMoveToGoal={moveToGoal}
          />
        </section>
      ) : tab === "goals" ? (
        <GoalsSection
          active={activeGoals}
          done={doneGoals}
          busy={busy}
          onCreate={async (input) => {
            setBusy(true);
            try {
              const { goal } = await createGoalApi(input);
              setGoals((prev) => [goal, ...prev]);
              flash("🎯 目標を追加しました");
              return null;
            } catch (e) {
              return e instanceof Error ? e.message : "追加に失敗しました";
            } finally {
              setBusy(false);
            }
          }}
          onPatch={async (id, input) => {
            setBusy(true);
            try {
              const { goal } = await patchGoalApi(id, input);
              setGoals((prev) => prev.map((g) => (g.id === id ? goal : g)));
              flash("💾 目標を更新しました");
              return null;
            } catch (e) {
              return e instanceof Error ? e.message : "更新に失敗しました";
            } finally {
              setBusy(false);
            }
          }}
          onDelete={async (g) => {
            if (!confirm(`「${g.title}」を削除します。よろしいですか？`)) return;
            setBusy(true);
            try {
              await deleteGoalApi(g.id);
              setGoals((prev) => prev.filter((x) => x.id !== g.id));
              flash("🗑 目標を削除しました");
            } catch (e) {
              setError(e instanceof Error ? e.message : "削除に失敗しました");
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <PromisesSection
          promises={promises}
          busy={busy}
          onSave={async (p, status, note) => {
            setBusy(true);
            try {
              const { status: saved } = await savePromiseStatusApi({
                oneOnOneKey: p.oneOnOneKey,
                ownerId: p.ownerId,
                status,
                note,
              });
              setPromises((prev) =>
                prev.map((x) =>
                  x.oneOnOneKey === p.oneOnOneKey && x.ownerId === p.ownerId
                    ? { ...x, status: saved.status, note: saved.note, updatedAt: saved.updatedAt }
                    : x
                )
              );
              flash("💾 取り組み状況を保存しました");
              return null;
            } catch (e) {
              return e instanceof Error ? e.message : "保存に失敗しました";
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function NewLearningButton({ onClick }: { onClick: () => void }) {
  const hasDraft = useHasDraft("growth:learning:new");
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 min-h-[44px]"
    >
      ＋ 学びの記録を追加{hasDraft ? "（下書きあり）" : ""}
    </button>
  );
}

// ─── 自分の目標 ───

type GoalForm = { title: string; detail: string; dueDate: string };

function GoalsSection({
  active,
  done,
  busy,
  onCreate,
  onPatch,
  onDelete,
}: {
  active: Goal[];
  done: Goal[];
  busy: boolean;
  onCreate: (input: GoalForm & { status: "active" }) => Promise<string | null>;
  onPatch: (id: string, input: Partial<GoalForm & { status: Goal["status"] }>) => Promise<string | null>;
  onDelete: (g: Goal) => Promise<void>;
}) {
  const [editing, setEditing] = useState("");
  const [showDone, setShowDone] = useState(false);
  const hasNewDraft = useHasDraft("growth:goal:new");

  return (
    <section className="space-y-3">
      <p className="text-[11px] text-gray-600 leading-relaxed">
        学びの記録の「次にやること」から移すこともできます。達成したら「達成にする」を押してください。
      </p>
      {editing === "new" ? (
        <GoalEditor
          key="new"
          draftKey="growth:goal:new"
          initial={{ title: "", detail: "", dueDate: "" }}
          busy={busy}
          onCancel={() => setEditing("")}
          onSubmit={async (v) => {
            const err = await onCreate({ ...v, status: "active" });
            if (!err) setEditing("");
            return err;
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 min-h-[44px]"
        >
          ＋ 目標を追加{hasNewDraft ? "（下書きあり）" : ""}
        </button>
      )}

      {active.length === 0 && editing !== "new" && (
        <p className="text-xs text-gray-600">取り組み中の目標はありません。</p>
      )}
      <ul className="space-y-2">
        {active.map((g) =>
          editing === g.id ? (
            <li key={g.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <GoalEditor
                key={g.id}
                draftKey={`growth:goal:${g.id}`}
                initial={{ title: g.title, detail: g.detail, dueDate: g.dueDate }}
                busy={busy}
                onCancel={() => setEditing("")}
                onSubmit={async (v) => {
                  const err = await onPatch(g.id, v);
                  if (!err) setEditing("");
                  return err;
                }}
              />
            </li>
          ) : (
            <li key={g.id} className="rounded-xl border border-gray-200 bg-white p-3 space-y-1">
              <p className="text-sm font-medium text-gray-900">{g.title}</p>
              {g.detail.trim() && (
                <p className="text-[12px] text-gray-700 whitespace-pre-wrap">{g.detail}</p>
              )}
              <p className="text-[11px] text-gray-500">
                {g.dueDate ? `期限 ${g.dueDate.replaceAll("-", "/")}` : "期限なし"}
                {g.fromLearningId ? " ・ 学びの記録から" : ""}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onPatch(g.id, { status: "done" })}
                  className="px-3 py-2 border border-emerald-300 text-emerald-800 rounded-full text-xs hover:bg-emerald-50 disabled:opacity-40 min-h-[40px]"
                >
                  ✅ 達成にする
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(g.id)}
                  className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 disabled:opacity-40 min-h-[40px]"
                >
                  ✏️ 編集
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete(g)}
                  className="px-3 py-2 border border-red-300 text-red-700 rounded-full text-xs hover:bg-red-50 disabled:opacity-40 min-h-[40px]"
                >
                  🗑 削除
                </button>
              </div>
            </li>
          )
        )}
      </ul>

      {done.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="text-xs text-gray-700 underline underline-offset-2 min-h-[36px]"
          >
            {showDone ? "▲ 達成した目標を隠す" : `▼ 達成した目標（${done.length}件）`}
          </button>
          {showDone && (
            <ul className="space-y-1 mt-1">
              {done.map((g) => (
                <li key={g.id} className="rounded-lg border border-gray-200 bg-gray-50 p-2 text-[12px]">
                  <span className="text-gray-900">✅ {g.title}</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onPatch(g.id, { status: "active" })}
                    className="ml-2 text-[11px] text-teal-800 underline underline-offset-2"
                  >
                    取り組み中に戻す
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function GoalEditor({
  draftKey,
  initial,
  busy,
  onCancel,
  onSubmit,
}: {
  draftKey: string;
  initial: GoalForm;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (v: GoalForm) => Promise<string | null>;
}) {
  const { values, set, dirty, discard } = useDraft<GoalForm>(draftKey, initial);
  const [error, setError] = useState("");
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-2">
      <label className="block">
        <span className="text-[11px] text-gray-700">目標（必須）</span>
        <input
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white mt-0.5"
        />
      </label>
      <label className="block">
        <span className="text-[11px] text-gray-700">詳細・やり方</span>
        <textarea
          value={values.detail}
          onChange={(e) => set("detail", e.target.value)}
          rows={3}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white mt-0.5"
        />
      </label>
      <label className="block">
        <span className="text-[11px] text-gray-700">期限</span>
        <input
          type="date"
          value={values.dueDate}
          onChange={(e) => set("dueDate", e.target.value)}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px] bg-white mt-0.5"
        />
      </label>
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !values.title.trim()}
          onClick={async () => {
            const err = await onSubmit({
              title: values.title.trim(),
              detail: values.detail,
              dueDate: values.dueDate,
            });
            if (err) setError(err);
            else discard();
          }}
          className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
        >
          💾 保存
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (dirty && !confirm(DISCARD_CONFIRM)) return;
            discard();
            onCancel();
          }}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full text-sm hover:bg-gray-50 disabled:opacity-40 min-h-[44px]"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

// ─── 1on1の約束 ───

function PromisesSection({
  promises,
  busy,
  onSave,
}: {
  promises: PromiseItem[];
  busy: boolean;
  onSave: (p: PromiseItem, status: PromiseStatusValue, note: string) => Promise<string | null>;
}) {
  if (promises.length === 0) {
    return (
      <p className="text-xs text-gray-600">
        1on1ノートに「実行の約束」または「次の一歩」が書かれた回がまだありません。
      </p>
    );
  }
  return (
    <section className="space-y-3">
      <p className="text-[11px] text-gray-600 leading-relaxed">
        約束の本文は1on1で合意したものなので、ここでは変えられません（変更は1on1ノートから）。
        ここでは<strong>取り組み状況</strong>を書けます。
      </p>
      <ul className="space-y-2">
        {promises.map((p) => (
          <li key={`${p.ownerId}/${p.oneOnOneKey}`}>
            <PromiseCard p={p} busy={busy} onSave={onSave} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PromiseCard({
  p,
  busy,
  onSave,
}: {
  p: PromiseItem;
  busy: boolean;
  onSave: (p: PromiseItem, status: PromiseStatusValue, note: string) => Promise<string | null>;
}) {
  const [status, setStatus] = useState<PromiseStatusValue>(p.status ?? "not_started");
  const [note, setNote] = useState(p.note);
  const [error, setError] = useState("");
  const changed = status !== (p.status ?? "not_started") || note !== p.note;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
      <p className="text-[11px] text-gray-500">
        📅 {p.heldOn.replaceAll("-", "/")} ・ {p.partnerName}さんと
        {p.mode === "rwdepc" ? "（RWDEPC・実行の約束）" : "（次の一歩）"}
        {p.status && (
          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-800 border border-teal-200 text-[10px]">
            {promiseStatusLabel(p.status)}
          </span>
        )}
      </p>
      <p className="text-sm text-gray-900 whitespace-pre-wrap">{p.text}</p>
      <div className="flex flex-wrap gap-2">
        {PROMISE_STATUSES.map((s) => (
          <label key={s.value} className="flex items-center gap-1 text-[12px] text-gray-800 min-h-[36px]">
            <input
              type="radio"
              name={`st-${p.ownerId}-${p.oneOnOneKey}`}
              checked={status === s.value}
              onChange={() => setStatus(s.value)}
            />
            {s.label}
          </label>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="取り組んでみてどうだったか（任意）"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white"
      />
      {error && <p className="text-[11px] text-red-700">{error}</p>}
      <button
        type="button"
        disabled={busy || !changed}
        onClick={async () => {
          const err = await onSave(p, status, note);
          setError(err ?? "");
        }}
        className="px-3 py-2 bg-teal-600 text-white rounded-full text-xs hover:bg-teal-700 disabled:opacity-40 min-h-[40px]"
      >
        💾 取り組み状況を保存
      </button>
    </div>
  );
}
