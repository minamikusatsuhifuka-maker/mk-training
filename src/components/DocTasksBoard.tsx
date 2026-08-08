"use client";

// 書類進捗ボード本体（指示書154 / 154-2）
// 画面に到達できている時点でサーバー側の認可は通っている（ここでの出し分けは体裁のみ）。
//
// 入力の軽さ最優先（診療の合間に登録・チェックするため）:
//   - 新規登録は「種別 → ID → 登録」の3操作。主治医・記入日は前回値/今日が既定で入る
//   - 工程チェックはタップした瞬間に保存（保存ボタンを押させない）
//   - メモだけは入力のたびに送らず、フォーカスを外したときに保存

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DOC_TYPES,
  createDocTask,
  deleteDocTask,
  docTypeDef,
  elapsedDays,
  fetchDocTasks,
  hasFinalPending,
  isDocTaskCompleted,
  isStale,
  isStepDone,
  patchDocTask,
  pendingSteps,
  sortDocTasks,
  summarizeStale,
  buildAlertLines,
  type DocTask,
  type DocTaskSort,
  type DocTasksConfig,
  type DocTasksListResponse,
  type DocTypeId,
} from "@/lib/doc-tasks";
import { DocTasksSettings } from "@/components/DocTasksSettings";
import { loadProfilesIndex } from "@/lib/staff-profiles";
import type { StaffProfileIndexEntry } from "@/lib/staff-profiles";

/** 状態での絞り込み（154の要件3）。「状態」＝工程の進み具合をまとめた見方 */
type StatusFilter = "open" | "stale" | "final" | "done" | "all";

export function DocTasksBoard({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<DocTasksListResponse | null>(null);
  const [members, setMembers] = useState<StaffProfileIndexEntry[]>([]);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // 新規登録フォーム（種別・主治医は登録後も残す＝連続登録が軽い）
  const [newType, setNewType] = useState<DocTypeId>("referral");
  const [newChartNo, setNewChartNo] = useState("");
  const [newDoctor, setNewDoctor] = useState("");
  const [newEnteredOn, setNewEnteredOn] = useState("");

  // 絞り込み
  const [filterType, setFilterType] = useState<DocTypeId | "all">("all");
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  // 状態での絞り込み（154の要件3）。既定は「未完了だけ」＝日常はこれで足りる
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("open");
  const [sort, setSort] = useState<DocTaskSort>("stale");
  const [expanded, setExpanded] = useState<string>("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [idx, json] = await Promise.all([
        loadProfilesIndex(),
        fetchDocTasks(),
      ]);
      setMembers(idx);
      setData(json);
      setNewEnteredOn((v) => v || json.today);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // useMemo の依存に毎回別配列が入らないよう、ここで安定化させる
  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const config: DocTasksConfig | null = data?.config ?? null;
  const today = data?.today ?? "";

  const nameOf = useCallback(
    (userId: string) =>
      members.find((m) => m.userId === userId)?.name || userId.slice(0, 8),
    [members]
  );

  // 主治医の選択肢は**管理画面の設定だけ**から作る（表記ゆれを防ぐため自由入力にしない）。
  // 設定が空のときだけ自由入力に落ちる（設定前でも登録できなくならないように）。
  const doctorOptions = useMemo(() => config?.doctors ?? [], [config]);

  // 絞り込みだけは、設定から外された医師名が入った過去の記録も探せるように、
  // データ側にしか無い名前を末尾に足す（既存レコードが埋もれないようにするため）。
  const doctorFilterOptions = useMemo(() => {
    const known = new Set(doctorOptions);
    const extra = new Set<string>();
    for (const t of tasks) if (t.doctor && !known.has(t.doctor)) extra.add(t.doctor);
    return [
      ...doctorOptions,
      ...Array.from(extra).sort((a, b) => a.localeCompare(b, "ja")),
    ];
  }, [doctorOptions, tasks]);

  const summary = useMemo(
    () => (config ? summarizeStale(tasks, config, today) : null),
    [tasks, config, today]
  );

  const visible = useMemo(() => {
    if (!config) return [];
    const filtered = tasks.filter((t) => {
      if (filterType !== "all" && t.docType !== filterType) return false;
      if (filterDoctor && t.doctor !== filterDoctor) return false;
      if (filterAssignee && t.assigneeUserId !== filterAssignee) return false;
      const done = isDocTaskCompleted(t);
      if (filterStatus === "open" && done) return false;
      if (filterStatus === "done" && !done) return false;
      if (filterStatus === "stale" && (done || !isStale(t, config, today))) {
        return false;
      }
      if (filterStatus === "final" && (done || !hasFinalPending(t))) return false;
      return true;
    });
    return sortDocTasks(filtered, sort, today);
  }, [tasks, config, filterType, filterDoctor, filterAssignee, filterStatus, sort, today]);

  const replaceTask = (task: DocTask) =>
    setData((d) =>
      d
        ? { ...d, tasks: d.tasks.map((t) => (t.id === task.id ? task : t)) }
        : d
    );

  const add = async () => {
    if (!newChartNo.trim()) {
      setError("ID（カルテ番号）を入力してください");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const task = await createDocTask({
        docType: newType,
        chartNo: newChartNo.trim(),
        doctor: newDoctor.trim(),
        enteredOn: newEnteredOn || today,
      });
      setData((d) => (d ? { ...d, tasks: [task, ...d.tasks] } : d));
      setNewChartNo("");
      setMsg(`➕ ${docTypeDef(newType).label} を登録しました`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (
    task: DocTask,
    patchBody: Parameters<typeof patchDocTask>[1]
  ) => {
    setBusy(true);
    setError("");
    try {
      const next = await patchDocTask(task.id, patchBody);
      replaceTask(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
      await load(); // 失敗時は画面とサーバーの食い違いを残さない
    } finally {
      setBusy(false);
    }
  };

  const remove = async (task: DocTask) => {
    if (
      !confirm(
        `ID ${task.chartNo}（${docTypeDef(task.docType).label}）の記録を削除します。\n\n⚠️ 取り消せません。よろしいですか？`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await deleteDocTask(task.id);
      setData((d) =>
        d ? { ...d, tasks: d.tasks.filter((t) => t.id !== task.id) } : d
      );
      setMsg("🗑 削除しました");
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  if (data?.tableMissing) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-medium text-gray-900">
            📋 書類進捗ボードの準備がまだ終わっていません
          </p>
          <p className="text-xs text-gray-700 mt-2 leading-relaxed">
            データの保存先（テーブル）がまだ作られていません。
            <code className="mx-1">~/Downloads/154_書類進捗ボード_テーブル作成.sql</code>
            を Supabase の SQL Editor で実行してください。実行後にこのページを再読み込みすると使えるようになります。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-3 md:p-4 space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">📋 書類進捗ボード</h1>
        <p className="text-xs text-gray-600 mt-1 leading-relaxed">
          紹介状・お返事・症状詳記の進み具合を共有します。指名されたアカウントだけが開けるページです。
          <br />
          <strong>患者様のお名前は保存しません</strong>（入力欄もありません）。書類そのもの（PDF・スキャン）も添付できません。
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </p>
      )}
      {msg && (
        <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">
          {msg}
        </p>
      )}

      {/* 滞留アラート */}
      {summary && summary.total > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-800">
            🔔 滞留アラート（{summary.total}件）
          </p>
          <ul className="mt-1.5 space-y-1">
            {buildAlertLines(summary).map((line) => (
              <li key={line} className="text-xs text-red-800">
                ・{line}
              </li>
            ))}
          </ul>
          {!data?.canNotify && (
            <p className="text-[11px] text-red-700/80 mt-1.5">
              ※ あなたはアラートの受け取り対象に指名されていません（この画面では確認できます）。
            </p>
          )}
        </div>
      )}

      {/* 新規登録（数タップで済む軽さを最優先） */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
        <p className="text-xs font-medium text-gray-800">➕ 新しく登録する</p>
        <div className="flex flex-wrap gap-1.5">
          {DOC_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setNewType(t.id)}
              className={`px-3 py-2 rounded-full text-sm min-h-[40px] border transition-colors ${
                newType === t.id
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <label className="text-[11px] text-gray-600 mb-1 block">
              ID（カルテ番号）
            </label>
            <input
              value={newChartNo}
              onChange={(e) => setNewChartNo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") add();
              }}
              inputMode="numeric"
              placeholder="例: 12345"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[40px]"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-600 mb-1 block">主治医</label>
            <DoctorPicker
              value={newDoctor}
              options={doctorOptions}
              disabled={busy}
              onChange={setNewDoctor}
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-600 mb-1 block">
              記入日（起票日）
            </label>
            <input
              type="date"
              value={newEnteredOn}
              onChange={(e) => setNewEnteredOn(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[40px]"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={busy || !newChartNo.trim()}
          className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[40px]"
        >
          ＋ 登録
        </button>
      </div>

      {/* 絞り込み・並び替え */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="すべて"
            active={filterType === "all"}
            onClick={() => setFilterType("all")}
          />
          {DOC_TYPES.map((t) => (
            <FilterChip
              key={t.id}
              label={`${t.emoji} ${t.short}`}
              active={filterType === t.id}
              onClick={() => setFilterType(t.id)}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={filterDoctor}
            onChange={(e) => setFilterDoctor(e.target.value)}
            className="rounded-md border border-gray-200 px-2 py-2 text-sm min-h-[40px]"
          >
            <option value="">主治医: すべて</option>
            {doctorFilterOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="rounded-md border border-gray-200 px-2 py-2 text-sm min-h-[40px]"
          >
            <option value="">担当: すべて</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as DocTaskSort)}
            className="rounded-md border border-gray-200 px-2 py-2 text-sm min-h-[40px]"
          >
            <option value="stale">並び: 滞留の長い順</option>
            <option value="entered">並び: 記入日の新しい順</option>
            <option value="chart">並び: ID順</option>
          </select>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
          className="w-full sm:w-auto rounded-md border border-gray-200 px-2 py-2 text-sm min-h-[40px]"
        >
          <option value="open">状態: 未完了だけ</option>
          <option value="stale">状態: 滞留しているものだけ</option>
          <option value="final">状態: 最終工程が残っているものだけ</option>
          <option value="done">状態: 完了だけ</option>
          <option value="all">状態: すべて</option>
        </select>
      </div>

      {/* 一覧 */}
      <div className="space-y-2">
        {!data && !error && (
          <p className="text-xs text-gray-500">読み込み中…</p>
        )}
        {data && visible.length === 0 && (
          <p className="text-xs text-gray-600">
            該当する記録はありません。
            {filterStatus === "open" && "（完了したものは表示していません）"}
          </p>
        )}
        {config &&
          visible.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              config={config}
              today={today}
              members={members}
              doctorOptions={doctorOptions}
              nameOf={nameOf}
              busy={busy}
              expanded={expanded === task.id}
              onToggleExpand={() =>
                setExpanded((v) => (v === task.id ? "" : task.id))
              }
              onPatch={(p) => patch(task, p)}
              onDelete={() => remove(task)}
            />
          ))}
      </div>

      {/* 管理者向け設定 */}
      {isAdmin && config && (
        <DocTasksSettings
          config={config}
          members={members}
          onSaved={(next) => {
            setData((d) => (d ? { ...d, config: next } : d));
            setMsg("💾 設定を保存しました");
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

/**
 * 主治医の入力（院長指示 2026-08-08）。
 * - 設定に登録された医師から**選ぶ**形にする（自由入力は表記ゆれのもとなのでしない）
 * - 2〜3名までは横並びのボタン（診療の合間に1タップで選べる）、4名以上はプルダウン
 * - **設定が空のときだけ**自由入力にフォールバック（設定前でも登録できなくならないように）
 * - 選択肢に無い名前が既に入っている記録では、その値を選択肢に残す（勝手に消さない）
 */
function DoctorPicker({
  value,
  options,
  disabled,
  onChange,
  compact,
}: {
  value: string;
  options: string[];
  disabled?: boolean;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  if (options.length === 0) {
    return (
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="例: 院長（設定に登録すると選択式になります）"
        className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[40px]"
      />
    );
  }

  // 過去の記録に、いま設定に無い名前が入っている場合はその値も選べるように残す
  const list = options.includes(value) || !value ? options : [...options, value];

  if (!compact && list.length <= 3) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {list.map((d) => (
          <button
            key={d}
            type="button"
            disabled={disabled}
            onClick={() => onChange(value === d ? "" : d)}
            className={`px-3 py-2 rounded-lg text-sm min-h-[40px] border transition-colors disabled:opacity-50 ${
              value === d
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
    );
  }

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm min-h-[40px]"
    >
      <option value="">選択してください</option>
      {list.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs border min-h-[36px] transition-colors ${
        active
          ? "bg-teal-600 text-white border-teal-600"
          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

function TaskCard({
  task,
  config,
  today,
  members,
  doctorOptions,
  nameOf,
  busy,
  expanded,
  onToggleExpand,
  onPatch,
  onDelete,
}: {
  task: DocTask;
  config: DocTasksConfig;
  today: string;
  members: StaffProfileIndexEntry[];
  doctorOptions: string[];
  nameOf: (userId: string) => string;
  busy: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onPatch: (patch: Parameters<typeof patchDocTask>[1]) => void;
  onDelete: () => void;
}) {
  const def = docTypeDef(task.docType);
  const done = isDocTaskCompleted(task);
  const days = elapsedDays(task, today);
  const stale = isStale(task, config, today);
  const finalPending = !done && hasFinalPending(task);
  // メモは入力のたびに送らず、フォーカスを外したときに保存する（下書きを持つ）。
  // サーバー側の値が変わったら下書きを合わせ直す（effectではなくレンダー中の調整）。
  const [memo, setMemo] = useState(task.memo);
  const [memoBase, setMemoBase] = useState(task.memo);
  if (memoBase !== task.memo) {
    setMemoBase(task.memo);
    setMemo(task.memo);
  }

  // 未完了の最終工程が残っている件は一覧で特に目立たせる（154-2）
  const frame = done
    ? "border-gray-200 bg-gray-50"
    : finalPending && stale
      ? "border-red-300 bg-red-50/60"
      : stale
        ? "border-amber-300 bg-amber-50/60"
        : "border-gray-200 bg-white";

  const setStep = (stepId: string, value: string) =>
    onPatch({ steps: { ...task.steps, [stepId]: value } });

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${frame}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            <span className="mr-1.5">{def.emoji}</span>
            {def.label}
            <span className="ml-2 font-mono text-[13px] text-gray-800">
              ID {task.chartNo}
            </span>
          </p>
          <p className="text-[11px] text-gray-600 mt-0.5">
            記入日 {task.enteredOn}
            {task.doctor && <> ／ 主治医 {task.doctor}</>}
            {task.assigneeUserId && <> ／ 担当 {nameOf(task.assigneeUserId)}</>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {done ? (
            <span className="text-[11px] px-2 py-1 rounded-full bg-teal-100 text-teal-800">
              ✅ 完了
            </span>
          ) : (
            <span
              className={`text-[11px] px-2 py-1 rounded-full ${
                stale ? "bg-red-100 text-red-800 font-medium" : "bg-gray-100 text-gray-700"
              }`}
            >
              {days}日経過
            </span>
          )}
        </div>
      </div>

      {finalPending && (
        <p className="text-[11px] text-red-700 font-medium">
          ⚠️ {def.finalNote}
        </p>
      )}

      {/* 工程（タップした瞬間に保存） */}
      <div className="flex flex-wrap gap-1.5">
        {def.steps.map((step) => {
          const ok = isStepDone(task, step);
          if (step.kind === "check") {
            return (
              <button
                key={step.id}
                type="button"
                disabled={busy}
                onClick={() => setStep(step.id, ok ? "" : "1")}
                className={`px-3 py-2 rounded-lg text-xs min-h-[40px] border transition-colors disabled:opacity-50 ${
                  ok
                    ? "bg-teal-600 text-white border-teal-600"
                    : step.final
                      ? "bg-white text-red-700 border-red-300 font-medium hover:bg-red-50"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {ok ? "✓ " : "□ "}
                {step.label}
              </button>
            );
          }
          return (
            <label
              key={step.id}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] border ${
                ok ? "bg-white border-teal-200" : "bg-white border-gray-200"
              }`}
            >
              <span className="text-gray-700">{step.label}</span>
              <input
                type="date"
                value={task.steps[step.id] ?? ""}
                disabled={busy}
                onChange={(e) => setStep(step.id, e.target.value)}
                className="rounded border border-gray-200 px-1.5 py-1 text-[11px] min-h-[32px]"
              />
            </label>
          );
        })}
      </div>

      {!done && (
        <p className="text-[11px] text-gray-600">
          残り: {pendingSteps(task).map((s) => s.label).join(" / ")}
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={onToggleExpand}
          className="text-[11px] text-teal-700 underline underline-offset-2 min-h-[32px]"
        >
          {expanded ? "▲ 閉じる" : "▼ メモ・担当・履歴"}
        </button>
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-gray-200 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-gray-600 mb-1 block">担当</label>
              <select
                value={task.assigneeUserId}
                disabled={busy}
                onChange={(e) => onPatch({ assigneeUserId: e.target.value })}
                className="w-full rounded-md border border-gray-200 px-2 py-2 text-sm min-h-[40px]"
              >
                <option value="">未割り当て</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-600 mb-1 block">
                主治医
              </label>
              <DoctorPicker
                value={task.doctor}
                options={doctorOptions}
                disabled={busy}
                compact
                onChange={(v) => onPatch({ doctor: v })}
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-gray-600 mb-1 block">
              メモ（経過記録・患者様のお名前は書かないでください）
            </label>
            <textarea
              value={memo}
              rows={3}
              disabled={busy}
              onChange={(e) => setMemo(e.target.value)}
              onBlur={() => {
                if (memo !== task.memo) onPatch({ memo });
              }}
              placeholder="例: 12/28お電話つながらず、12/29連絡済み"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm leading-relaxed"
            />
          </div>

          {task.history.length > 0 && (
            <details className="text-[11px] text-gray-600">
              <summary className="cursor-pointer">
                履歴（{task.history.length}件）
              </summary>
              <ul className="mt-1 space-y-0.5">
                {task.history.map((h, i) => (
                  <li key={`${h.at}-${i}`}>
                    {h.at.slice(0, 16).replace("T", " ")}　{h.action}
                    {h.by && `（${h.by}）`}
                  </li>
                ))}
              </ul>
            </details>
          )}

          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="px-3 py-2 border border-red-200 text-red-700 rounded-full text-xs hover:bg-red-50 disabled:opacity-40 min-h-[36px]"
          >
            🗑 この記録を削除
          </button>
        </div>
      )}
    </div>
  );
}
