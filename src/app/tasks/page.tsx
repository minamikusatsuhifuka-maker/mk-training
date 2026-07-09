"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
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
  type StaffTask,
  type TaskStatus,
} from "@/lib/staff-tasks";

type ViewKey = "due" | "assignee" | "status";

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
  const [hideDone, setHideDone] = useState(false);
  // 件数サマリーから切り替える期限フィルタ
  const [dueFilter, setDueFilter] = useState<"none" | "overdue" | "today">(
    "none"
  );

  // 表示列数（端末ごとのUI設定。localStorageに保持）。既定は3列
  const [columns, setColumns] = useState<1 | 2 | 3>(3);
  const [winW, setWinW] = useState(1280);

  // 追加フォーム
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueLocal, setDueLocal] = useState("");
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
    setNow(new Date());
    Promise.all([
      loadTasks(),
      loadStaffMembers(),
      loadPortalItems<TasksSectionConfig>(
        TASKS_PAGE_LAYOUT_KEY,
        DEFAULT_TASKS_LAYOUT
      ),
    ])
      .then(([t, m, layout]) => {
        setTasks(t);
        setMembers(m);
        setSectionOrder(visibleTasksSectionKeys(layout));
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

  // 担当者候補（既存タスク ∪ staff_members）
  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    members.forEach((m) => m && set.add(m));
    tasks.forEach((t) => t.assignee && set.add(t.assignee));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [members, tasks]);

  // 担当者フィルタのみ適用した母集団（件数サマリーの集計用＝完了を隠すの影響を受けない）
  const assigneeFilteredTasks = useMemo(() => {
    if (!filterAssignee) return tasks;
    return tasks.filter((t) => t.assignee === filterAssignee);
  }, [tasks, filterAssignee]);

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

  // ─── 操作 ───
  const handleAdd = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const nowIso = new Date().toISOString();
    const task: StaffTask = {
      id: newTaskId(),
      title: title.trim(),
      assignee: assignee.trim(),
      due: localInputToIso(dueLocal),
      status,
      note: note.trim() || undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await persist([task, ...tasks]);
    // フォームをリセット
    setTitle("");
    setAssignee("");
    setDueLocal("");
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
    const names = newTasks.map((t) => t.assignee).filter(Boolean);
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
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
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
          <div className="space-y-1">
            <Label htmlFor="t-assignee">担当者</Label>
            <Input
              id="t-assignee"
              list="assignee-list"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="名前を入力 / 選択"
            />
            <datalist id="assignee-list">
              {assigneeOptions.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label htmlFor="t-due">期限</Label>
            <Input
              id="t-due"
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
            />
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
      <FileImport knownMembers={assigneeOptions} onImport={handleImport} />
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
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {tabBtn("due", "期限順")}
          {tabBtn("assignee", "担当者別")}
          {tabBtn("status", "状態別")}
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
          <label className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideDone}
              onChange={(e) => setHideDone(e.target.checked)}
            />
            完了を隠す
          </label>
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
      {visibleTasks.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          表示できるタスクがありません。
        </p>
      ) : view === "due" ? (
        <DueView
          tasks={visibleTasks}
          cols={effectiveCols}
          now={now}
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
          onStatus={handleStatusChange}
          onToggleDone={handleToggleDone}
          onEdit={setEditing}
          onDelete={handleDelete}
        />
      ) : (
        <StatusView
          tasks={visibleTasks}
          now={now}
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
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
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
  onStatus: (id: string, s: TaskStatus) => void;
  onToggleDone: (id: string) => void;
  onEdit: (t: StaffTask) => void;
  onDelete: (id: string) => void;
};

function TaskCard({
  task,
  now,
  onStatus,
  onToggleDone,
  onEdit,
  onDelete,
  showAssignee = true,
}: RowHandlers & { task: StaffTask; showAssignee?: boolean }) {
  const kind = dueColor(task.due, task.status, now);
  const bucket = bucketOf(task, now);
  const isDone = task.status === "done";
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

      {/* 下段：担当者／期限／状態／操作（狭くても折り返す） */}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        {showAssignee && (
          <span className="text-xs text-foreground/70 truncate max-w-[120px]">
            {task.assignee || "—"}
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
function AssigneeView({
  tasks,
  cols,
  ...h
}: RowHandlers & { tasks: StaffTask[]; cols: number }) {
  const groups = new Map<string, StaffTask[]>();
  tasks.forEach((t) => {
    const key = t.assignee || "（未割当）";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
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

// ─── 編集ダイアログ ───
function EditDialog({
  task,
  assigneeOptions,
  onClose,
  onSave,
}: {
  task: StaffTask;
  assigneeOptions: string[];
  onClose: () => void;
  onSave: (t: StaffTask) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [assignee, setAssignee] = useState(task.assignee);
  const [dueLocal, setDueLocal] = useState(isoToLocalInput(task.due));
  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [note, setNote] = useState(task.note ?? "");

  const save = () => {
    if (!title.trim()) return;
    onSave({
      ...task,
      title: title.trim(),
      assignee: assignee.trim(),
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="e-assignee">担当者</Label>
              <Input
                id="e-assignee"
                list="edit-assignee-list"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              />
              <datalist id="edit-assignee-list">
                {assigneeOptions.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
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
            <Input
              id="e-due"
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
            />
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
