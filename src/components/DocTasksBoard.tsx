"use client";

// 書類進捗ボード本体（指示書154 / 154-2）
// 画面に到達できている時点でサーバー側の認可は通っている（ここでの出し分けは体裁のみ）。
//
// 入力の軽さ最優先（診療の合間に登録・チェックするため）:
//   - 新規登録は「種別 → ID → 登録」の3操作。主治医・記入日は前回値/今日が既定で入る
//   - 工程チェックはタップした瞬間に保存（保存ボタンを押させない）
//   - メモだけは入力のたびに送らず、フォーカスを外したときに保存

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  DOC_TYPES,
  createDocTask,
  deleteDocTask,
  docTypeDef,
  elapsedDays,
  elapsedTone,
  fetchDocTasks,
  formatShortDate,
  hasFinalPending,
  isDocTaskCompleted,
  isStale,
  isStepDone,
  patchDocTask,
  sortDocTasks,
  summarizeStale,
  buildAlertLines,
  type DocTask,
  type DocTaskSort,
  type DocTasksConfig,
  type DocTasksListResponse,
  type DocTypeId,
} from "@/lib/doc-tasks";
import { loadProfilesIndex } from "@/lib/staff-profiles";
import type { StaffProfileIndexEntry } from "@/lib/staff-profiles";

/** 状態での絞り込み（154の要件3）。「状態」＝工程の進み具合をまとめた見方 */
type StatusFilter = "open" | "stale" | "final" | "done" | "all";

/** 並び順の記憶（157-C7・端末ごと） */
const SORT_LS_KEY = "doc_tasks_sort";

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
  // 157: 既定は記入日の新しい順。選んだ順序は端末に覚えさせる（人ごとの好みなので保存はローカル）
  const [sort, setSort] = useState<DocTaskSort>("entered_desc");
  const [expanded, setExpanded] = useState<string>("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_LS_KEY);
      if (saved === "entered_desc" || saved === "entered_asc" || saved === "stale") {
        setSort(saved);
      }
    } catch {
      /* localStorageが使えなくても既定で動く */
    }
  }, []);

  const changeSort = (next: DocTaskSort) => {
    setSort(next);
    try {
      localStorage.setItem(SORT_LS_KEY, next);
    } catch {
      /* 保存できなくても表示は切り替わる */
    }
  };

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
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
            className="rounded-md border border-gray-200 px-2 py-2 text-sm min-h-[40px]"
          >
            <option value="open">状態: 未完了だけ</option>
            <option value="stale">状態: 滞留しているものだけ</option>
            <option value="final">状態: 最終工程が残っているものだけ</option>
            <option value="done">状態: 完了だけ</option>
            <option value="all">状態: すべて</option>
          </select>
        </div>

        {/* 並び替え（157-C7）。記入日の新旧トグル＋滞留順 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-gray-600">並び替え</span>
          <button
            type="button"
            onClick={() =>
              changeSort(sort === "entered_desc" ? "entered_asc" : "entered_desc")
            }
            className={`px-3 py-1.5 rounded-full text-xs border min-h-[36px] transition-colors ${
              sort !== "stale"
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            記入日 {sort === "entered_asc" ? "古い順 ↑" : "新しい順 ↓"}
          </button>
          <button
            type="button"
            onClick={() => changeSort("stale")}
            className={`px-3 py-1.5 rounded-full text-xs border min-h-[36px] transition-colors ${
              sort === "stale"
                ? "bg-teal-600 text-white border-teal-600"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            滞留の長い順
          </button>
        </div>
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

      {/* 157: 設定は管理画面へ移設。ここには導線だけ置く（管理者にのみ表示） */}
      {isAdmin && (
        <p className="text-[11px] text-gray-500">
          設定（開ける人・滞留日数・主治医・アラートの送信先）は{" "}
          <Link
            href="/admin/doc-tasks"
            className="text-teal-700 underline underline-offset-2"
          >
            管理画面 → 書類進捗ボードの設定
          </Link>{" "}
          にあります。
        </p>
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
  busy: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onPatch: (patch: Parameters<typeof patchDocTask>[1]) => void;
  onDelete: () => void;
}) {
  // 157: 1件2行（情報行＋工程チップ行）。⚠️注意文・「残り:」・独立した日付入力欄・
  // 行頭の工程名は廃止し、状態はチップの見た目だけで表す。
  const def = docTypeDef(task.docType);
  const done = isDocTaskCompleted(task);
  const days = elapsedDays(task, today);
  const stale = isStale(task, config, today);
  const tone = elapsedTone(task, config, today);
  // メモは入力のたびに送らず、フォーカスを外したときに保存する（下書きを持つ）。
  // サーバー側の値が変わったら下書きを合わせ直す（effectではなくレンダー中の調整）。
  const [memo, setMemo] = useState(task.memo);
  const [memoBase, setMemoBase] = useState(task.memo);
  if (memoBase !== task.memo) {
    setMemoBase(task.memo);
    setMemo(task.memo);
  }

  const frame = done
    ? "border-gray-200 bg-gray-50"
    : tone === "red"
      ? "border-red-300 bg-red-50/50"
      : tone === "amber"
        ? "border-amber-300 bg-amber-50/50"
        : "border-gray-200 bg-white";

  // 経過バッジ（C-5の決定的ルール）
  const badge =
    tone === "done"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "red"
        ? "bg-red-100 text-red-800 font-medium"
        : tone === "amber"
          ? "bg-amber-100 text-amber-900"
          : "bg-gray-100 text-gray-700";

  const setStep = (stepId: string, value: string) =>
    onPatch({ steps: { ...task.steps, [stepId]: value } });

  return (
    <div className={`rounded-xl border px-3 py-2.5 space-y-2 ${frame}`}>
      {/* 1行目: カルテ番号・記入日・経過バッジ・展開トグル */}
      <div className="flex items-center gap-2">
        <span className="shrink-0" aria-hidden>
          {def.emoji}
        </span>
        <span className="font-mono text-[13px] font-semibold text-gray-900 truncate">
          {task.chartNo}
        </span>
        <span className="text-[11px] text-gray-600 shrink-0">
          {formatShortDate(task.enteredOn, today)}
        </span>
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${badge}`}
        >
          {done ? "完了" : `${days}日経過`}
        </span>
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label="メモ・担当・履歴"
          className="ml-auto shrink-0 text-gray-500 hover:text-gray-800 min-w-[40px] min-h-[40px] flex items-center justify-center"
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* 2行目: 工程チップ（タップした瞬間に保存・狭い画面での折り返しは許容） */}
      <div className="flex flex-wrap gap-1.5">
        {def.steps.map((step) => {
          const ok = isStepDone(task, step);
          // 済み＝緑の塗り／未＝枠線／滞留を超えた未完了＝赤枠
          const chip = ok
            ? "bg-emerald-600 text-white border-emerald-600"
            : stale
              ? "bg-white text-red-700 border-red-400 font-medium hover:bg-red-50"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50";
          const base = `px-3 py-2 rounded-lg text-xs min-h-[40px] border transition-colors inline-flex items-center gap-1 disabled:opacity-50 ${chip}`;

          if (step.kind === "check") {
            return (
              <button
                key={step.id}
                type="button"
                disabled={busy}
                title={step.label}
                onClick={() => setStep(step.id, ok ? "" : "1")}
                className={base}
              >
                {ok && <span aria-hidden>✓</span>}
                {step.short}
              </button>
            );
          }
          // 日付工程: チップ自体をタップすると日付選択が開く（入力欄は重ねて透明にする）
          return (
            <label
              key={step.id}
              title={step.label}
              className={`${base} relative cursor-pointer`}
            >
              {ok && <span aria-hidden>✓</span>}
              <span>{step.short}</span>
              {ok && (
                <span className="tabular-nums">
                  {formatShortDate(task.steps[step.id] ?? "", today)}
                </span>
              )}
              <input
                type="date"
                value={task.steps[step.id] ?? ""}
                disabled={busy}
                onChange={(e) => setStep(step.id, e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </label>
          );
        })}
      </div>

      {expanded && (
        <div className="space-y-2 border-t border-gray-200 pt-2">
          {/* 短縮名の正式名称はここで確認できるようにする（一覧では短縮のみ） */}
          <p className="text-[11px] text-gray-600 leading-relaxed">
            {def.label}:{" "}
            {def.steps
              .map(
                (s) =>
                  `${s.label}${
                    isStepDone(task, s)
                      ? s.kind === "date"
                        ? `（${task.steps[s.id]}）`
                        : "（済）"
                      : "（未）"
                  }`
              )
              .join(" ／ ")}
          </p>

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
