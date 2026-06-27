"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
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

  // 追加フォーム
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueLocal, setDueLocal] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // 編集ダイアログ
  const [editing, setEditing] = useState<StaffTask | null>(null);

  useEffect(() => {
    setNow(new Date());
    Promise.all([loadTasks(), loadStaffMembers()])
      .then(([t, m]) => {
        setTasks(t);
        setMembers(m);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

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

  // 表示対象（フィルタ適用後）
  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterAssignee && t.assignee !== filterAssignee) return false;
      if (hideDone && t.status === "done") return false;
      return true;
    });
  }, [tasks, filterAssignee, hideDone]);

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

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <PageHeader
        title="📋 みんなのタスク"
        description="クリニック全体のタスクを「誰が・何を・いつまで」で見える化"
        badge={`未完了 ${tasks.filter((t) => t.status !== "done").length} 件`}
      />

      {/* 追加フォーム */}
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
          now={now}
          onStatus={handleStatusChange}
          onEdit={setEditing}
          onDelete={handleDelete}
        />
      ) : view === "assignee" ? (
        <AssigneeView
          tasks={visibleTasks}
          now={now}
          onStatus={handleStatusChange}
          onEdit={setEditing}
          onDelete={handleDelete}
        />
      ) : (
        <StatusView
          tasks={visibleTasks}
          now={now}
          onStatus={handleStatusChange}
          onEdit={setEditing}
          onDelete={handleDelete}
        />
      )}

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
  onEdit: (t: StaffTask) => void;
  onDelete: (id: string) => void;
};

function TaskRow({
  task,
  now,
  onStatus,
  onEdit,
  onDelete,
  showAssignee = true,
}: RowHandlers & { task: StaffTask; showAssignee?: boolean }) {
  const kind = dueColor(task.due, task.status, now);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
      <div className="flex-1 min-w-[180px]">
        <p
          className={`text-sm font-medium ${
            task.status === "done"
              ? "line-through text-muted-foreground"
              : ""
          }`}
        >
          {task.title}
        </p>
        {task.note && (
          <p className="text-xs text-muted-foreground mt-0.5">{task.note}</p>
        )}
      </div>

      {showAssignee && (
        <span className="text-xs text-foreground/70 min-w-[64px]">
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
  );
}

// ─── 期限順ビュー ───
function DueView({
  tasks,
  ...h
}: RowHandlers & { tasks: StaffTask[] }) {
  const sorted = [...tasks].sort(compareByDue);
  return (
    <div className="space-y-2">
      {sorted.map((t) => (
        <TaskRow key={t.id} task={t} {...h} />
      ))}
    </div>
  );
}

// ─── 担当者別ビュー ───
function AssigneeView({
  tasks,
  ...h
}: RowHandlers & { tasks: StaffTask[] }) {
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
            {sorted.map((t) => (
              <TaskRow key={t.id} task={t} {...h} showAssignee={false} />
            ))}
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
              list.map((t) => <TaskRow key={t.id} task={t} {...h} />)
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
