"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { FileImport } from "@/components/tasks/FileImport";
import { loadPortalItems } from "@/lib/portal-store";
import {
  TASKS_PAGE_LAYOUT_KEY,
  DEFAULT_TASKS_LAYOUT,
  visibleTasksSectionKeys,
  type TasksSectionConfig,
  type TasksSectionKey,
} from "@/lib/section-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  loadTasks,
  saveTasks,
  loadStaffMembers,
  saveStaffMembers,
  newTaskId,
  dueColor,
  DUE_BADGE_CLASS,
  formatDue,
  isoToLocalInput,
  localInputToIso,
  compareByDue,
  bucketOf,
  taskCounts,
  DUE_BUCKET_ORDER,
  DUE_BUCKET_LABEL,
  DUE_BUCKET_TEXT,
  DUE_BUCKET_BORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  SAMPLE_MEMBERS,
  buildSampleTasks,
  mergeSampleTasks,
  clearSampleTasks,
  hasSampleTasks,
  mergeMembers,
  isSampleTask,
  assigneesOf,
  isTeamTask,
  formatAssignees,
  loadTaskCategories,
  visibleTaskCategories,
  taskCategoryLabel,
  loadTaskArchive,
  saveTaskArchive,
  splitArchivableTasks,
  ARCHIVE_AFTER_DAYS,
  type ArchivedTask,
  type TaskCategoryDef,
  type StaffTask,
  type TaskStatus,
} from "@/lib/staff-tasks";

type ViewKey = "due" | "assignee" | "status" | "team";

const STATUS_SELECT_CLASS: Record<TaskStatus, string> = {
  todo: "bg-slate-100 text-slate-700 border-slate-200",
  doing: "bg-blue-100 text-blue-700 border-blue-200",
  done: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [members, setMembers] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  const [view, setView] = useState<ViewKey>("due");
  const [filterAssignee, setFilterAssignee] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [hideDone, setHideDone] = useState(false);
  // カテゴリ定義（管理画面 /admin/task-categories で編集）
  const [categories, setCategories] = useState<TaskCategoryDef[]>([]);
  // 件数サマリーから切り替える期限フィルタ
  const [dueFilter, setDueFilter] = useState<"none" | "overdue" | "today">(
    "none"
  );

  // 表示列数（端末ごとのUI設定。localStorageに保持）。既定は3列
  const [columns, setColumns] = useState<1 | 2 | 3>(3);
  const [winW, setWinW] = useState(1280);

  // 追加フォーム（担当者はチップ式複数選択・指示書53）
  const [title, setTitle] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [assigneeInput, setAssigneeInput] = useState("");
  const [category, setCategory] = useState("");
  const [dueLocal, setDueLocal] = useState("");
  // 期限の「決定」= ピッカーを閉じて確定表示を出す補助（押さなくても入力値は保存される。指示書54）
  const [dueConfirmed, setDueConfirmed] = useState(false);
  const dueInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // 編集ダイアログ
  const [editing, setEditing] = useState<StaffTask | null>(null);

  // セクション並び順（content_store: tasks_page_layout。未設定/不正なら既定順）
  const [sectionOrder, setSectionOrder] = useState<TasksSectionKey[]>(() =>
    visibleTasksSectionKeys(null)
  );

  useEffect(() => {
    const current = new Date();
    setNow(current);
    Promise.all([
      loadTasks(),
      loadStaffMembers(),
      loadTaskCategories(),
      loadPortalItems<TasksSectionConfig>(
        TASKS_PAGE_LAYOUT_KEY,
        DEFAULT_TASKS_LAYOUT
      ),
    ])
      .then(async ([t, m, cats, layout]) => {
        setMembers(m);
        setCategories(cats);
        setSectionOrder(visibleTasksSectionKeys(layout));

        // 完了から一定期間（7日）経過したタスクをアーカイブへ冪等移動（指示書53）。
        // サンプル（sample-）は移動しない。移動保存に失敗したら元のまま表示する。
        const { keep, toArchive } = splitArchivableTasks(t, current);
        if (toArchive.length > 0) {
          try {
            const archive = await loadTaskArchive();
            const archivedAt = current.toISOString();
            const existing = new Set(archive.map((a) => a.id));
            const additions: ArchivedTask[] = toArchive
              .filter((x) => !existing.has(x.id))
              .map((x) => ({ ...x, archivedAt }));
            const okArchive = await saveTaskArchive([...additions, ...archive]);
            if (okArchive) {
              const okTasks = await saveTasks(keep);
              setTasks(okTasks ? keep : t);
              return;
            }
          } catch {
            /* 失敗時は移動せず全件表示 */
          }
        }
        setTasks(t);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // 列数設定の読み込み＋画面幅の追従（SSRハイドレーション安全：mount後のみ）
  useEffect(() => {
    try {
      const saved = localStorage.getItem("tasks_view_columns");
      if (saved === "1" || saved === "2" || saved === "3") {
        setColumns(Number(saved) as 1 | 2 | 3);
      }
    } catch {
      /* ignore */
    }
    const onResize = () => setWinW(window.innerWidth);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const changeColumns = (c: 1 | 2 | 3) => {
    setColumns(c);
    try {
      localStorage.setItem("tasks_view_columns", String(c));
    } catch {
      /* ignore */
    }
  };

  // 選択列数は「広い画面での最大列数」。狭い画面では自動で減らす。
  const effectiveCols =
    winW < 768 ? 1 : winW < 1024 ? Math.min(columns, 2) : Math.min(columns, 3);

  // タスク配列を保存して state も更新
  const persist = async (next: StaffTask[]) => {
    setTasks(next);
    await saveTasks(next);
  };

  // 担当者候補（既存タスクの全担当 ∪ staff_members）
  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    members.forEach((m) => m && set.add(m));
    tasks.forEach((t) => assigneesOf(t).forEach((a) => set.add(a)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [members, tasks]);

  // カテゴリフィルタの選択肢（表示中の定義 ∪ タスクで使用中のカテゴリ）
  const categoryOptions = useMemo(() => {
    const visible = visibleTaskCategories(categories);
    const known = new Set(visible.map((c) => c.id));
    const extra: { id: string; label: string }[] = [];
    tasks.forEach((t) => {
      const v = (t.category ?? "").trim();
      if (v && !known.has(v) && !extra.some((e) => e.id === v)) {
        extra.push({ id: v, label: taskCategoryLabel(categories, v) });
      }
    });
    return [
      ...visible.map((c) => ({ id: c.id, label: c.label })),
      ...extra,
    ];
  }, [categories, tasks]);

  // 担当者・カテゴリフィルタのみ適用した母集団（件数サマリーの集計用＝完了を隠すの影響を受けない）
  // 担当者は assigneesOf に含まれれば一致（チームタスク対応・指示書53）
  const assigneeFilteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterAssignee && !assigneesOf(t).includes(filterAssignee))
        return false;
      if (filterCategory && (t.category ?? "") !== filterCategory) return false;
      return true;
    });
  }, [tasks, filterAssignee, filterCategory]);

  // 件数サマリー（常に実数）
  const counts = useMemo(
    () => (now ? taskCounts(assigneeFilteredTasks, now) : null),
    [assigneeFilteredTasks, now]
  );

  // 表示対象（担当者＋完了を隠す＋期限サマリーフィルタ）
  const visibleTasks = useMemo(() => {
    return assigneeFilteredTasks.filter((t) => {
      if (hideDone && t.status === "done") return false;
      if (dueFilter !== "none") {
        if (!now) return true;
        if (bucketOf(t, now) !== dueFilter) return false;
      }
      return true;
    });
  }, [assigneeFilteredTasks, hideDone, dueFilter, now]);

  // ─── 追加フォームの担当者チップ操作（49のありがとうカードと同パターン） ───
  const toggleAssignee = (name: string) => {
    const n = name.trim();
    if (!n) return;
    setAssignees((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );
  };

  const addAssigneeFromInput = () => {
    const n = assigneeInput.trim();
    if (!n) return;
    setAssignees((prev) => (prev.includes(n) ? prev : [...prev, n]));
    setAssigneeInput("");
  };

  // ─── 操作 ───
  const handleAdd = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const nowIso = new Date().toISOString();
    // 新規保存は assignees 配列。assignee には先頭を入れて旧読み取りとの互換を保つ
    const list = assignees.map((a) => a.trim()).filter(Boolean);
    const task: StaffTask = {
      id: newTaskId(),
      title: title.trim(),
      assignee: list[0] ?? "",
      assignees: list,
      category: category || undefined,
      due: localInputToIso(dueLocal),
      status,
      note: note.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await persist([task, ...tasks]);
    // 担当者を名簿へマージ
    const nextMembers = mergeMembers(members, list);
    if (nextMembers.length !== members.length) {
      setMembers(nextMembers);
      await saveStaffMembers(nextMembers);
    }
    // フォームをリセット
    setTitle("");
    setAssignees([]);
    setAssigneeInput("");
    setCategory("");
    setDueLocal("");
    setDueConfirmed(false);
    setStatus("todo");
    setNote("");
    setSaving(false);
  };

  const handleStatusChange = (id: string, next: TaskStatus) => {
    const updated = tasks.map((t) =>
      t.id === id
        ? { ...t, status: next, updatedAt: new Date().toISOString() }
        : t
    );
    persist(updated);
  };

  // ワンタップ完了/解除（未完了→done、done→todo）
  const handleToggleDone = (id: string) => {
    const updated = tasks.map((t) =>
      t.id === id
        ? {
            ...t,
            status: (t.status === "done" ? "todo" : "done") as TaskStatus,
            updatedAt: new Date().toISOString(),
          }
        : t
    );
    persist(updated);
  };

  const handleDelete = (id: string) => {
    const target = tasks.find((t) => t.id === id);
    if (!confirm(`「${target?.title ?? "このタスク"}」を削除しますか？`)) return;
    persist(tasks.filter((t) => t.id !== id));
  };

  const handleEditSave = (updated: StaffTask) => {
    const next = tasks.map((t) =>
      t.id === updated.id
        ? { ...updated, updatedAt: new Date().toISOString() }
        : t
    );
    persist(next);
    setEditing(null);
  };

  // ─── 確認用サンプル ───
  // タスクが0件、または現存タスクが sample- のみのとき投入ボタンを出す
  const canSeed = tasks.length === 0 || tasks.every(isSampleTask);
  const showClear = hasSampleTasks(tasks);

  const handleSeed = async () => {
    const samples = buildSampleTasks(new Date());
    await persist(mergeSampleTasks(tasks, samples));
    const nextMembers = mergeMembers(members, SAMPLE_MEMBERS);
    if (nextMembers.length !== members.length) {
      setMembers(nextMembers);
      await saveStaffMembers(nextMembers);
    }
  };

  const handleClearSamples = async () => {
    await persist(clearSampleTasks(tasks));
  };

  // ファイルAI解析からの取り込み（新規IDで追加・担当者はstaff_membersにマージ）
  const handleImport = async (newTasks: StaffTask[]) => {
    await persist([...newTasks, ...tasks]);
    const names = newTasks.flatMap((t) => assigneesOf(t));
    const nextMembers = mergeMembers(members, names);
    if (nextMembers.length !== members.length) {
      setMembers(nextMembers);
      await saveStaffMembers(nextMembers);
    }
  };

  // ─── レンダリング補助 ───
  const tabBtn = (key: ViewKey, label: string) => (
    <button
      type="button"
      onClick={() => setView(key)}
      className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
        view === key
          ? "bg-teal text-teal-foreground font-medium"
          : "text-foreground/70 hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );

  if (!loaded || !now) {
    return (
      <div className="p-4 md:p-8 max-w-[1536px] mx-auto space-y-6">
        <PageHeader
          title="📋 みんなのタスク"
          description="クリニック全体のタスクを「誰が・何を・いつまで」で見える化"
        />
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      </div>
    );
  }

  // ─── セクション本体（並び替え可能な単位。中身・機能は従来どおり） ───
  const sectionNodes: Record<TasksSectionKey, ReactNode> = {
    // 追加フォーム
    add_form: (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">タスクを追加</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="t-title">内容 *</Label>
            <Input
              id="t-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：在庫の発注、ポスター差し替え など"
            />
          </div>
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="t-assignee-input">
              担当者（複数選択可・0名=未割当もOK）
            </Label>
            {/* 選択済みチップ */}
            {assignees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {assignees.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-light text-teal rounded-full text-xs"
                  >
                    {a}
                    <button
                      type="button"
                      onClick={() => toggleAssignee(a)}
                      className="opacity-60 hover:opacity-100 leading-none"
                      aria-label={`${a} を担当から外す`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* 候補（タップで追加/解除） */}
            {assigneeOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-1 max-h-24 overflow-y-auto">
                {assigneeOptions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAssignee(a)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      assignees.includes(a)
                        ? "bg-teal border-teal text-teal-foreground"
                        : "bg-card border-border text-foreground/70 hover:bg-accent"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
            {/* 候補に無い名前の自由入力（Enter/追加でチップ化） */}
            <div className="flex gap-2">
              <Input
                id="t-assignee-input"
                value={assigneeInput}
                onChange={(e) => setAssigneeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addAssigneeFromInput();
                  }
                }}
                placeholder="候補に無い名前はここに入力してEnter"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addAssigneeFromInput}
                disabled={!assigneeInput.trim()}
              >
                追加
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-category">カテゴリ</Label>
            <select
              id="t-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">未分類</option>
              {visibleTaskCategories(categories).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-due">期限</Label>
            <div className="flex items-center gap-2">
              <Input
                ref={dueInputRef}
                id="t-due"
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => {
                  setDueLocal(e.target.value);
                  setDueConfirmed(false);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!dueLocal}
                onClick={() => {
                  dueInputRef.current?.blur();
                  setDueConfirmed(true);
                }}
                title="ピッカーを閉じて期限を確認する"
              >
                決定
              </Button>
              {dueLocal && (
                <button
                  type="button"
                  onClick={() => {
                    setDueLocal("");
                    setDueConfirmed(false);
                  }}
                  className="text-xs text-foreground/50 hover:text-red-600 underline underline-offset-2 shrink-0"
                >
                  クリア
                </button>
              )}
            </div>
            {dueConfirmed && dueLocal ? (
              <p className="text-xs text-emerald-700">
                ✓ {formatDue(localInputToIso(dueLocal))} に設定
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                決定を押さなくても、入力した期限はそのまま保存されます
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-status">状態</Label>
            <select
              id="t-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-note">メモ</Label>
            <Input
              id="t-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="補足（任意）"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={handleAdd} disabled={saving || !title.trim()}>
            {saving ? "追加中..." : "追加"}
          </Button>
        </div>
      </div>
    ),

    // ファイルからAIでタスク化
    ai_import: (
      <FileImport
        knownMembers={assigneeOptions}
        categories={visibleTaskCategories(categories)}
        onImport={handleImport}
      />
    ),

    // 件数サマリー
    summary: counts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() =>
              setDueFilter((p) => (p === "overdue" ? "none" : "overdue"))
            }
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              dueFilter === "overdue"
                ? "border-red-400 bg-red-50 ring-1 ring-red-300"
                : "border-border bg-card hover:bg-accent"
            }`}
          >
            <p className="text-xs text-muted-foreground">超過</p>
            <p className="text-2xl font-bold text-red-600">{counts.overdue}</p>
          </button>
          <button
            type="button"
            onClick={() =>
              setDueFilter((p) => (p === "today" ? "none" : "today"))
            }
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              dueFilter === "today"
                ? "border-yellow-400 bg-yellow-50 ring-1 ring-yellow-300"
                : "border-border bg-card hover:bg-accent"
            }`}
          >
            <p className="text-xs text-muted-foreground">今日</p>
            <p className="text-2xl font-bold text-yellow-600">{counts.today}</p>
          </button>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">未完了</p>
            <p className="text-2xl font-bold text-foreground">{counts.open}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-3 py-2">
            <p className="text-xs text-muted-foreground">完了</p>
            <p className="text-2xl font-bold text-muted-foreground">
              {counts.done}
            </p>
          </div>
        </div>
    ),

    // ビュー切替ツールバー＋タスク一覧（一体で1セクション扱い）
    task_list: (
      <>
      {/* ビュー切替 + フィルタ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
          {tabBtn("due", "期限順")}
          {tabBtn("assignee", "担当者別")}
          {tabBtn("status", "状態別")}
          {tabBtn("team", "👥 チームタスク")}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">担当者：すべて</option>
            {assigneeOptions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">カテゴリ：すべて</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
            />
            完了を隠す
          </label>
          <Link
            href="/tasks/history"
            className="text-xs text-foreground/60 hover:text-foreground underline underline-offset-2"
            title={`完了から${ARCHIVE_AFTER_DAYS}日たったタスクは自動で履歴へ移動します`}
          >
            🗄 タスク履歴
          </Link>
          {/* 列数セレクタ（状態別は元々列構成のため非表示） */}
          {view !== "status" && (
            <div className="flex gap-0.5 rounded-md border border-border bg-card p-0.5">
              {([1, 2, 3] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => changeColumns(c)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    columns === c
                      ? "bg-teal text-teal-foreground font-medium"
                      : "text-foreground/70 hover:bg-accent"
                  }`}
                  title={`${c}列表示`}
                >
                  {c}列
                </button>
              ))}
            </div>
          )}
          {showClear && (
            <button
              type="button"
              onClick={handleClearSamples}
              className="text-xs text-foreground/50 hover:text-red-600 underline underline-offset-2"
            >
              サンプルを消す
            </button>
          )}
        </div>
      </div>

      {/* 完了を隠すトグルと履歴の関係の説明（指示書53） */}
      <p className="text-[11px] text-muted-foreground">
        完了タスクは直近{ARCHIVE_AFTER_DAYS}
        日ぶんがボードに残り、それより古いものは「🗄
        タスク履歴」へ自動で移動します。
      </p>

      {/* 確認用サンプル投入 */}
      {canSeed && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleSeed}
            className="text-xs text-foreground/60 hover:text-foreground hover:border-foreground/30 border border-dashed border-border rounded-md px-3 py-1.5 transition-colors"
          >
            ✨ サンプルを入れて試す（8件）
          </button>
        </div>
      )}

      {/* 本体 */}
      {view === "team" ? (
        // 👥 チームタスク（担当2名以上のみ・期限順ビューと同じ表示。指示書54）
        visibleTasks.filter(isTeamTask).length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            チームタスクはまだありません。担当者を2名以上選んで登録するとここに表示されます。
          </p>
        ) : (
          <DueView
            tasks={visibleTasks.filter(isTeamTask)}
            cols={effectiveCols}
            now={now}
            categories={categories}
            onStatus={handleStatusChange}
            onToggleDone={handleToggleDone}
            onEdit={setEditing}
            onDelete={handleDelete}
          />
        )
      ) : visibleTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          表示できるタスクがありません。
        </p>
      ) : view === "due" ? (
        <DueView
          tasks={visibleTasks}
          cols={effectiveCols}
          now={now}
          categories={categories}
          onStatus={handleStatusChange}
          onToggleDone={handleToggleDone}
          onEdit={setEditing}
          onDelete={handleDelete}
        />
      ) : view === "assignee" ? (
        <AssigneeView
          tasks={visibleTasks}
          cols={effectiveCols}
          now={now}
          categories={categories}
          onStatus={handleStatusChange}
          onToggleDone={handleToggleDone}
          onEdit={setEditing}
          onDelete={handleDelete}
        />
      ) : (
        <StatusView
          tasks={visibleTasks}
          now={now}
          categories={categories}
          onStatus={handleStatusChange}
          onToggleDone={handleToggleDone}
          onEdit={setEditing}
          onDelete={handleDelete}
        />
      )}
      </>
    ),
  };

  return (
    <div className="p-4 md:p-8 max-w-[1536px] mx-auto space-y-6">
      <PageHeader
        title="📋 みんなのタスク"
        description="クリニック全体のタスクを「誰が・何を・いつまで」で見える化"
        badge={`未完了 ${tasks.filter((t) => t.status !== "done").length} 件`}
      />

      {/* セクション（管理画面「ポータル管理→レイアウト」の設定順に描画） */}
      {sectionOrder.map((key) => (
        <Fragment key={key}>{sectionNodes[key]}</Fragment>
      ))}

      {/* 編集ダイアログ */}
      {editing && (
        <EditDialog
          task={editing}
          assigneeOptions={assigneeOptions}
          categories={categories}
          onClose={() => setEditing(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
}

// ─── 行コンポーネント ───
type RowHandlers = {
  now: Date;
  categories: TaskCategoryDef[];
  onStatus: (id: string, s: TaskStatus) => void;
  onToggleDone: (id: string) => void;
  onEdit: (t: StaffTask) => void;
  onDelete: (id: string) => void;
};

function TaskCard({
  task,
  now,
  categories,
  onStatus,
  onToggleDone,
  onEdit,
  onDelete,
  showAssignee = true,
}: RowHandlers & { task: StaffTask; showAssignee?: boolean }) {
  const kind = dueColor(task.due, task.status, now);
  const bucket = bucketOf(task, now);
  const isDone = task.status === "done";
  const team = isTeamTask(task);
  const categoryLabel = taskCategoryLabel(categories, task.category);
  return (
    <div
      className={`flex h-full flex-col gap-2 rounded-md border border-l-4 border-border bg-card px-3 py-2 ${DUE_BUCKET_BORDER[bucket]}`}
    >
      {/* 上段：丸チェック＋内容＋メモ */}
      <div className="flex items-start gap-2 min-w-0">
        <button
          type="button"
          onClick={() => onToggleDone(task.id)}
          title={isDone ? "未着手に戻す" : "完了にする"}
          aria-label={isDone ? "未着手に戻す" : "完了にする"}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs transition-colors ${
            isDone
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-foreground/30 text-transparent hover:border-emerald-500 hover:text-emerald-500"
          }`}
        >
          ✓
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm font-medium break-words ${
              isDone ? "line-through text-muted-foreground" : ""
            }`}
          >
            {task.title}
          </p>
          {task.note && (
            <p className="text-xs text-muted-foreground mt-0.5 break-words">
              {task.note}
            </p>
          )}
        </div>
      </div>

      {/* 下段：担当者／カテゴリ／期限／状態／操作（狭くても折り返す） */}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {showAssignee ? (
          // 全員表示（54）: truncateで切らず折り返す。名前が全員見えることを優先
          <span className="text-xs text-foreground/70 min-w-0 break-words whitespace-normal">
            {team && <span title="チームタスク">👥 </span>}
            {formatAssignees(task)}
          </span>
        ) : (
          // 担当者別ビューでもチームタスクは👥マークで分かるようにする（指示書53）
          team && (
            <span
              className="text-xs"
              title={`チームタスク: ${assigneesOf(task).join("・")}`}
            >
              👥
            </span>
          )
        )}

        {categoryLabel && (
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap">
            {categoryLabel}
          </span>
        )}

        <span
          className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${DUE_BADGE_CLASS[kind]}`}
        >
          {formatDue(task.due)}
        </span>

        <select
          value={task.status}
          onChange={(e) => onStatus(task.id, e.target.value as TaskStatus)}
          className={`h-8 rounded-md border px-2 text-xs ${STATUS_SELECT_CLASS[task.status]}`}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center">
          <button
            type="button"
            onClick={() => onEdit(task)}
            className="text-xs text-foreground/60 hover:text-foreground px-1.5 py-1"
            title="編集"
          >
            ✏️
          </button>
          <button
            type="button"
            onClick={() => onDelete(task.id)}
            className="text-xs text-foreground/60 hover:text-red-600 px-1.5 py-1"
            title="削除"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

// 列数に応じたグリッドコンテナ
function TaskGrid({
  cols,
  children,
}: {
  cols: number;
  children: ReactNode;
}) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

// ─── 期限順ビュー（期限グループ見出し付き） ───
function DueView({
  tasks,
  cols,
  ...h
}: RowHandlers & { tasks: StaffTask[]; cols: number }) {
  // バケットごとに振り分け
  const groups = new Map<string, StaffTask[]>();
  tasks.forEach((t) => {
    const b = bucketOf(t, h.now);
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b)!.push(t);
  });

  return (
    <div className="space-y-5">
      {DUE_BUCKET_ORDER.map((bucket) => {
        const list = groups.get(bucket);
        if (!list || list.length === 0) return null; // 0件グループは出さない
        const sorted = [...list].sort(compareByDue);
        return (
          <div key={bucket} className="space-y-2">
            <h3
              className={`text-sm font-semibold flex items-center gap-2 ${DUE_BUCKET_TEXT[bucket]}`}
            >
              {DUE_BUCKET_LABEL[bucket]}
              <span className="text-xs font-normal text-muted-foreground">
                {list.length} 件
              </span>
            </h3>
            <TaskGrid cols={cols}>
              {sorted.map((t) => (
                <TaskCard key={t.id} task={t} {...h} />
              ))}
            </TaskGrid>
          </div>
        );
      })}
    </div>
  );
}

// ─── 担当者別ビュー ───
// 複数担当のタスクは担当者それぞれのグループに表示する（未完了件数も各担当者に計上）。指示書53
function AssigneeView({
  tasks,
  cols,
  ...h
}: RowHandlers & { tasks: StaffTask[]; cols: number }) {
  const groups = new Map<string, StaffTask[]>();
  tasks.forEach((t) => {
    const names = assigneesOf(t);
    const keys = names.length > 0 ? names : ["（未割当）"];
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
  });
  const entries = Array.from(groups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], "ja")
  );
  return (
    <div className="space-y-5">
      {entries.map(([name, list]) => {
        const open = list.filter((t) => t.status !== "done").length;
        const sorted = [...list].sort(compareByDue);
        return (
          <div key={name} className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              {name}
              <span className="text-xs font-normal text-muted-foreground">
                未完了 {open} 件 / 全 {list.length} 件
              </span>
            </h3>
            <TaskGrid cols={cols}>
              {sorted.map((t) => (
                <TaskCard key={t.id} task={t} {...h} showAssignee={false} />
              ))}
            </TaskGrid>
          </div>
        );
      })}
    </div>
  );
}

// ─── 状態別ビュー ───
function StatusView({
  tasks,
  ...h
}: RowHandlers & { tasks: StaffTask[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {STATUS_ORDER.map((s) => {
        const list = [...tasks]
          .filter((t) => t.status === s)
          .sort(compareByDue);
        return (
          <div key={s} className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              {STATUS_LABELS[s]}
              <span className="text-xs font-normal text-muted-foreground">
                {list.length} 件
              </span>
            </h3>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">なし</p>
            ) : (
              <div className="space-y-2">
                {list.map((t) => (
                  <TaskCard key={t.id} task={t} {...h} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── 編集ダイアログ（担当者チップ・カテゴリ対応。指示書53） ───
function EditDialog({
  task,
  assigneeOptions,
  categories,
  onClose,
  onSave,
}: {
  task: StaffTask;
  assigneeOptions: string[];
  categories: TaskCategoryDef[];
  onClose: () => void;
  onSave: (t: StaffTask) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [assignees, setAssignees] = useState<string[]>(assigneesOf(task));
  const [assigneeInput, setAssigneeInput] = useState("");
  const [category, setCategory] = useState(task.category ?? "");
  const [dueLocal, setDueLocal] = useState(isoToLocalInput(task.due));
  // 期限の「決定」（追加フォームと同じ補助。押さなくても入力値は保存される）
  const [dueConfirmed, setDueConfirmed] = useState(false);
  const dueInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [note, setNote] = useState(task.note ?? "");

  const toggle = (name: string) => {
    const n = name.trim();
    if (!n) return;
    setAssignees((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]
    );
  };

  const addFromInput = () => {
    const n = assigneeInput.trim();
    if (!n) return;
    setAssignees((prev) => (prev.includes(n) ? prev : [...prev, n]));
    setAssigneeInput("");
  };

  // 現在のカテゴリが非表示/未知でも選択肢に残す（値のサイレント消失防止）
  const catOptions = visibleTaskCategories(categories);
  const extraCat =
    category && !catOptions.some((c) => c.id === category)
      ? { id: category, label: taskCategoryLabel(categories, category) }
      : null;

  const save = () => {
    if (!title.trim()) return;
    const list = assignees.map((a) => a.trim()).filter(Boolean);
    onSave({
      ...task,
      title: title.trim(),
      assignee: list[0] ?? "",
      assignees: list,
      category: category || undefined,
      due: localInputToIso(dueLocal),
      status,
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>タスクを編集</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="e-title">内容 *</Label>
            <Input
              id="e-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-assignee-input">担当者（複数選択可）</Label>
            {assignees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {assignees.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-teal-light text-teal rounded-full text-xs"
                  >
                    {a}
                    <button
                      type="button"
                      onClick={() => toggle(a)}
                      className="opacity-60 hover:opacity-100 leading-none"
                      aria-label={`${a} を担当から外す`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {assigneeOptions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pb-1 max-h-24 overflow-y-auto">
                {assigneeOptions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggle(a)}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      assignees.includes(a)
                        ? "bg-teal border-teal text-teal-foreground"
                        : "bg-card border-border text-foreground/70 hover:bg-accent"
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                id="e-assignee-input"
                value={assigneeInput}
                onChange={(e) => setAssigneeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addFromInput();
                  }
                }}
                placeholder="候補に無い名前はここに入力してEnter"
              />
              <Button
                type="button"
                variant="outline"
                onClick={addFromInput}
                disabled={!assigneeInput.trim()}
              >
                追加
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="e-category">カテゴリ</Label>
              <select
                id="e-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">未分類</option>
                {catOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                {extraCat && (
                  <option value={extraCat.id}>{extraCat.label}</option>
                )}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-status">状態</Label>
              <select
                id="e-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-due">期限</Label>
            <div className="flex items-center gap-2">
              <Input
                ref={dueInputRef}
                id="e-due"
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => {
                  setDueLocal(e.target.value);
                  setDueConfirmed(false);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!dueLocal}
                onClick={() => {
                  dueInputRef.current?.blur();
                  setDueConfirmed(true);
                }}
                title="ピッカーを閉じて期限を確認する"
              >
                決定
              </Button>
              {dueLocal && (
                <button
                  type="button"
                  onClick={() => {
                    setDueLocal("");
                    setDueConfirmed(false);
                  }}
                  className="text-xs text-foreground/50 hover:text-red-600 underline underline-offset-2 shrink-0"
                >
                  クリア
                </button>
              )}
            </div>
            {dueConfirmed && dueLocal ? (
              <p className="text-xs text-emerald-700">
                ✓ {formatDue(localInputToIso(dueLocal))} に設定
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                決定を押さなくても、入力した期限はそのまま保存されます
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="e-note">メモ</Label>
            <Textarea
              id="e-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button onClick={save} disabled={!title.trim()}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
