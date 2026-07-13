"use client";

// 🗄 タスク履歴（指示書53）
// 完了から一定期間（7日）経過して staff_tasks_archive へ移動したタスクの
// 検索・振り返り・復元・完全削除。移動は /tasks 読み込み時に冪等実行される。

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import {
  loadTaskArchive,
  saveTaskArchive,
  loadTasks,
  saveTasks,
  loadTaskCategories,
  taskCategoryLabel,
  assigneesOf,
  isTeamTask,
  formatAssignees,
  formatDue,
  ARCHIVE_AFTER_DAYS,
  type ArchivedTask,
  type TaskCategoryDef,
} from "@/lib/staff-tasks";

// 完了日（updatedAt=doneにした日時）を YYYY/M/D で表示
function formatDoneDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ja-JP");
}

// 月グループのキー（完了日ベース・新しい月が先）
function monthKeyOf(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "不明";
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export default function TaskHistoryPage() {
  const [archive, setArchive] = useState<ArchivedTask[]>([]);
  const [categories, setCategories] = useState<TaskCategoryDef[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  // フィルタ
  const [keyword, setKeyword] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [fromDate, setFromDate] = useState(""); // 完了日の期間（YYYY-MM-DD）
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    Promise.all([loadTaskArchive(), loadTaskCategories()])
      .then(([a, cats]) => {
        setArchive(a);
        setCategories(cats);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // フィルタ選択肢（アーカイブ内の実データから）
  const assigneeOptions = useMemo(() => {
    const set = new Set<string>();
    archive.forEach((t) => assigneesOf(t).forEach((a) => set.add(a)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [archive]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    archive.forEach((t) => {
      if (t.category?.trim()) set.add(t.category.trim());
    });
    return Array.from(set).map((id) => ({
      id,
      label: taskCategoryLabel(categories, id),
    }));
  }, [archive, categories]);

  // 絞り込み＋新しい順（完了日=updatedAt降順）
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return [...archive]
      .filter((t) => {
        if (kw) {
          const hay = `${t.title} ${t.note ?? ""}`.toLowerCase();
          if (!hay.includes(kw)) return false;
        }
        if (filterAssignee && !assigneesOf(t).includes(filterAssignee))
          return false;
        if (filterCategory && (t.category ?? "") !== filterCategory)
          return false;
        const done = new Date(t.updatedAt).getTime();
        if (fromDate) {
          const from = new Date(`${fromDate}T00:00:00`).getTime();
          if (!isNaN(from) && done < from) return false;
        }
        if (toDate) {
          const to = new Date(`${toDate}T23:59:59.999`).getTime();
          if (!isNaN(to) && done > to) return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [archive, keyword, filterAssignee, filterCategory, fromDate, toDate]);

  // 月別グループ（完了日ベース・出現順=新しい順）
  const monthGroups = useMemo(() => {
    const groups: { month: string; items: ArchivedTask[] }[] = [];
    for (const t of filtered) {
      const month = monthKeyOf(t.updatedAt);
      const last = groups[groups.length - 1];
      if (last && last.month === month) last.items.push(t);
      else groups.push({ month, items: [t] });
    }
    return groups;
  }, [filtered]);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 3000);
  };

  // 復元: archive → staff_tasks（status=done のまま・archivedAt を外す）
  const handleRestore = async (t: ArchivedTask) => {
    setBusy(true);
    try {
      const tasks = await loadTasks();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { archivedAt, ...rest } = t;
      const restored = { ...rest, updatedAt: new Date().toISOString() };
      const okTasks = await saveTasks([
        restored,
        ...tasks.filter((x) => x.id !== t.id),
      ]);
      if (!okTasks) {
        flash("復元に失敗しました");
        return;
      }
      const next = archive.filter((x) => x.id !== t.id);
      await saveTaskArchive(next);
      setArchive(next);
      flash(`「${t.title}」をボードに戻しました（完了のまま）`);
    } finally {
      setBusy(false);
    }
  };

  // 完全削除
  const handleDelete = async (t: ArchivedTask) => {
    if (
      !confirm(
        `「${t.title}」を完全に削除しますか？\nこの操作は取り消せません。`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const next = archive.filter((x) => x.id !== t.id);
      const ok = await saveTaskArchive(next);
      if (!ok) {
        flash("削除に失敗しました");
        return;
      }
      setArchive(next);
      flash("削除しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-[1536px] mx-auto space-y-6">
      <PageHeader
        title="🗄 タスク履歴"
        description={`完了から${ARCHIVE_AFTER_DAYS}日たったタスクの保管場所。検索・振り返り・復元ができます`}
        badge={loaded ? `${archive.length} 件` : undefined}
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          href="/tasks"
          className="text-sm text-teal-700 underline underline-offset-2"
        >
          ← みんなのタスクへ戻る
        </Link>
        {message && (
          <span className="text-xs text-muted-foreground">{message}</span>
        )}
      </div>

      {/* フィルタ */}
      <div className="rounded-lg border border-border bg-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="🔍 キーワード（内容・メモ）"
          className="lg:col-span-2"
        />
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
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="h-9"
            title="完了日（から）"
          />
          <span className="text-xs text-muted-foreground shrink-0">〜</span>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="h-9"
            title="完了日（まで）"
          />
        </div>
      </div>

      {/* 一覧（月別グループ・新しい順） */}
      {!loaded ? (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {archive.length === 0
            ? `まだ履歴がありません。完了から${ARCHIVE_AFTER_DAYS}日たったタスクが自動でここに移ります。`
            : "条件に一致するタスクがありません。"}
        </p>
      ) : (
        <div className="space-y-6">
          {monthGroups.map((g) => (
            <div key={g.month} className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                {g.month}
                <span className="text-xs font-normal text-muted-foreground">
                  {g.items.length} 件
                </span>
              </h3>
              <div className="space-y-2">
                {g.items.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-md border border-border bg-card px-3 py-2 flex flex-wrap items-center gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words">
                        {t.title}
                      </p>
                      {t.note && (
                        <p className="text-xs text-muted-foreground mt-0.5 break-words">
                          {t.note}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span
                          className="text-xs text-foreground/70"
                          title={assigneesOf(t).join("・") || undefined}
                        >
                          {isTeamTask(t) && (
                            <span title="チームタスク">👥 </span>
                          )}
                          {formatAssignees(t)}
                        </span>
                        {t.category && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                            {taskCategoryLabel(categories, t.category)}
                          </span>
                        )}
                        <span className="text-[11px] text-muted-foreground">
                          完了: {formatDoneDate(t.updatedAt)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          期限: {formatDue(t.due)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRestore(t)}
                        disabled={busy}
                        className="text-xs px-2.5 py-1.5 border border-teal-200 text-teal-700 rounded-md hover:bg-teal-50 disabled:opacity-50"
                        title="ボードに戻す（完了のまま）"
                      >
                        ↩ 復元
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        disabled={busy}
                        className="text-xs px-2.5 py-1.5 border border-red-200 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
                        title="完全に削除"
                      >
                        🗑 削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
