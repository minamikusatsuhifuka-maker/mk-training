"use client";

// 📊 ガントチャートの計画の中のタスク（指示書263）— 画面の部品
//
// ・TaskList     … 計画のくわしい内容の中の一覧（「3/8 完了」・＋ タスクを追加・1行ずつ・押すとメモとひとこと）
// ・TaskBody     … 1つのタスクのメモ・状態・ひとこと（「📋 みんなのタスク」でも使う）
// ・TaskForm     … タスクを足す・直す（題名・担当者・期限・「院長が判断」・状態・メモ）
// ・GanttMyTasks … 「📋 みんなのタスク」に出す、自分が担当者のタスク（スイッチOFFで見られない人には何も出さない）
// できない操作は画面に出さない（判定の材料はサーバーが返したものだけ。最後の判定は /api/gantt/tasks）。
// 色は250-補（さくらミルク）。

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { C } from "./sakura-theme";
import { CheerButton, HelpSection, JudgmentSection, ThanksButton } from "./GanttConnect";
import { thanksPrefill } from "@/lib/gantt-connect";
import { jstTodayYmd } from "@/lib/library";
import { STATUS_LABEL, TASK_STATUSES, shortDate, type TaskStatus, type TeamMember } from "@/lib/gantt";
import {
  OVERDUE_LABEL,
  TASKS_PER_PLAN_MAX,
  TASK_COMMENT_MAX,
  TASK_MEMO_MAX,
  TASK_TITLE_MAX,
  commentTimeLabel,
  commentsNewestFirst,
  isOverdue,
  progressLabel,
  statusChangeProblem,
  tasksOfPlan,
  type GanttTask,
} from "@/lib/gantt-tasks";

export async function ganttApi<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new Error("通信できませんでした。電波・接続を確かめてもう一度お試しください");
  }
  const j = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `処理に失敗しました (${res.status})`);
  return j;
}

/** 見ている人ができること（サーバーが返した材料から） */
export type TaskPerms = {
  me: string;
  /** この計画のタスクを足す・直す・消す・並べ替え */
  manage: boolean;
  isDirector: boolean;
  /** どのひとことでも消せる（院長・任された幹部） */
  canModerate: boolean;
};

const BORDER = "rgba(240, 209, 218, 0.9)";
const JUDGE_LABEL = "院長が判断";

export function JudgeChip({ small }: { small?: boolean }) {
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded-full font-bold leading-none text-white ${small ? "px-[7px] py-[3px] text-[10px]" : "px-[9px] py-[4px] text-[11px]"}`}
      style={{ background: C.hero, boxShadow: "0 2px 6px rgba(142, 91, 181, 0.25)" }}
      data-gantt-judge
    >
      {JUDGE_LABEL}
    </span>
  );
}

/** 265: 「🙋 手伝ってほしい」が出ている印 */
export function HelpMark() {
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-full px-[7px] py-[3px] text-[10px] font-bold leading-none"
      style={{ background: "linear-gradient(135deg, #FDF0C8 0%, #FBE3CF 100%)", color: "#86650F" }}
      title="手伝ってほしい"
      data-gantt-help-mark
    >
      🙋 手伝ってほしい
    </span>
  );
}

export function TaskStatusChip({ status }: { status: TaskStatus }) {
  const done = status === "done";
  return (
    <span
      className="shrink-0 whitespace-nowrap rounded-full px-[8px] py-[3px] text-[11px] leading-none"
      style={done ? { background: "linear-gradient(135deg, #C3E8D6 0%, #D2EBF4 100%)", color: "#2B6A4F" } : { background: C.statusChip, color: C.statusText }}
      data-gantt-task-status={status}
    >
      {done ? "✓ " : ""}
      {STATUS_LABEL[status]}
    </span>
  );
}

function DueText({ task, today }: { task: GanttTask; today: string }) {
  if (!task.due) return null;
  const over = isOverdue(task, today);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" style={{ color: over ? "#B42318" : C.sub, fontWeight: over ? 700 : 400 }} data-gantt-task-due={task.due}>
      期限 {shortDate(task.due)}
      {over && (
        <span className="rounded-full px-[6px] py-[2px] text-[10px] leading-none" style={{ background: "#FDE7E4", color: "#B42318" }} data-gantt-overdue>
          {OVERDUE_LABEL}
        </span>
      )}
    </span>
  );
}

/** 状態を選ぶ（「院長が判断」のタスクの完了は院長だけ） */
function StatusSelect({ task, isDirector, busy, onChange }: { task: GanttTask; isDirector: boolean; busy: boolean; onChange: (s: TaskStatus) => void }) {
  const locked = !!statusChangeProblem(task, "todo", isDirector) && task.status === "done";
  return (
    <select
      value={task.status}
      disabled={busy || locked}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      aria-label={`${task.title}の状態`}
      className="min-h-[40px] rounded-full border bg-white px-3 text-[13px] disabled:opacity-60"
      style={{ borderColor: BORDER, color: C.ink }}
      data-gantt-task-status-select={task.id}
    >
      {TASK_STATUSES.map((s) => (
        <option key={s.value} value={s.value} disabled={!!statusChangeProblem(task, s.value, isDirector)}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

// ─── 1つのタスクのメモ・状態・ひとこと ───

export function TaskBody({
  task,
  perms,
  showStatus = true,
  cheers,
  onCheers,
  onSaved,
}: {
  task: GanttTask;
  perms: TaskPerms;
  /** 状態の欄を出す（「📋 みんなのタスク」は行に出すので出さない） */
  showStatus?: boolean;
  /** 265: 👏 応援（渡したときだけ出す） */
  cheers?: TeamMember[];
  onCheers?: (list: TeamMember[]) => void;
  onSaved: (t: GanttTask) => void;
}) {
  const touch = perms.manage || task.assignees.some((a) => a.id === perms.me);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const run = async (fn: () => Promise<{ task: GanttTask }>) => {
    setBusy(true);
    setErr("");
    try {
      const j = await fn();
      onSaved(j.task);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const patch = (body: Record<string, unknown>) => () => ganttApi<{ task: GanttTask }>("/api/gantt/tasks", { method: "PATCH", body: JSON.stringify({ id: task.id, ...body }) });

  const field = "w-full rounded-xl border bg-white px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#F2C6D3]";
  return (
    <div className="space-y-2.5 text-[13px]" data-gantt-task-body={task.id}>
      {/* 265 §4: 院長の判断は、タスクのいちばん上に日時付きで */}
      <JudgmentSection task={task} isDirector={perms.isDirector} onSaved={onSaved} />
      {task.memo && (
        <div>
          <div className="text-[11px]" style={{ color: C.sub }}>
            メモ
          </div>
          <p className="m-0 whitespace-pre-wrap break-words" data-gantt-task-memo>
            {task.memo}
          </p>
        </div>
      )}
      {showStatus && touch && (
        <label className="flex items-center gap-2 text-[12px]" style={{ color: C.sub }}>
          状態
          <StatusSelect task={task} isDirector={perms.isDirector} busy={busy} onChange={(s) => void run(patch({ status: s }))} />
        </label>
      )}
      {/* 265 §3: 🙋 手伝ってほしい／手伝います */}
      <HelpSection task={task} me={perms.me} touch={touch} manage={perms.manage} onSaved={onSaved} />
      {/* 265 §1: 👏 応援・完了したら 💌 ありがとうカードを送る */}
      {(cheers || task.status === "done") && (
        <div className="flex flex-wrap items-start gap-2">
          {cheers && onCheers && <CheerButton kind="task" targetId={task.id} me={perms.me} cheers={cheers} onChange={onCheers} />}
          {task.status === "done" && (() => {
            const pre = thanksPrefill({ kind: "task", task }, perms.me);
            return <ThanksButton to={pre.to} message={pre.message} />;
          })()}
        </div>
      )}
      <div>
        <div className="text-[11px]" style={{ color: C.sub }}>
          ひとこと（{task.comments.length}）
        </div>
        {touch && (
          <form
            className="mt-1 flex items-start gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim() || busy) return;
              void run(patch({ comment: text })).then((ok) => ok && setText(""));
            }}
          >
            <textarea
              value={text}
              rows={2}
              maxLength={TASK_COMMENT_MAX}
              onChange={(e) => setText(e.target.value)}
              aria-label="ひとこと"
              placeholder={`進み具合や困りごと（${TASK_COMMENT_MAX}字まで）`}
              className={field}
              style={{ borderColor: BORDER, color: C.ink }}
              data-gantt-comment-input={task.id}
            />
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className="min-h-[40px] shrink-0 rounded-full px-4 text-[13px] font-bold text-white disabled:opacity-50"
              style={{ background: C.hero }}
              data-gantt-comment-save={task.id}
            >
              保存
            </button>
          </form>
        )}
        <ul className="m-0 mt-1.5 list-none space-y-1.5 p-0" data-gantt-comments={task.id}>
          {commentsNewestFirst(task.comments).map((cm) => {
            const mine = cm.authorId === perms.me;
            const canDelete = mine || perms.canModerate;
            return (
              <li key={cm.id} className="rounded-xl px-3 py-2" style={{ background: "rgba(252, 238, 241, 0.55)" }} data-gantt-comment={cm.id}>
                <div className="flex flex-wrap items-center gap-x-2 text-[11px]" style={{ color: C.sub }}>
                  <span className="font-medium" style={{ color: C.ink }}>
                    {cm.authorName || "名前未設定"}
                  </span>
                  <span>{commentTimeLabel(cm.createdAt)}</span>
                  {cm.editedAt && <span>（直しました）</span>}
                  <span className="ml-auto flex gap-1">
                    {mine && touch && editing?.id !== cm.id && (
                      <button type="button" onClick={() => setEditing({ id: cm.id, text: cm.text })} className="min-h-[28px] px-1.5 underline" data-gantt-comment-edit={cm.id}>
                        直す
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm("このひとことを消します。よろしいですか？")) return;
                          void run(() =>
                            ganttApi<{ task: GanttTask }>(`/api/gantt/tasks?id=${encodeURIComponent(task.id)}&commentId=${encodeURIComponent(cm.id)}`, { method: "DELETE" })
                          );
                        }}
                        className="min-h-[28px] px-1.5 underline"
                        data-gantt-comment-delete={cm.id}
                      >
                        消す
                      </button>
                    )}
                  </span>
                </div>
                {editing?.id === cm.id ? (
                  <form
                    className="mt-1 flex items-start gap-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!editing.text.trim() || busy) return;
                      void run(patch({ commentId: cm.id, text: editing.text })).then((ok) => ok && setEditing(null));
                    }}
                  >
                    <textarea
                      value={editing.text}
                      rows={2}
                      maxLength={TASK_COMMENT_MAX}
                      onChange={(e) => setEditing({ id: cm.id, text: e.target.value })}
                      aria-label="ひとことを直す"
                      className={field}
                      style={{ borderColor: BORDER, color: C.ink }}
                    />
                    <span className="flex shrink-0 flex-col gap-1">
                      <button type="submit" disabled={busy} className="min-h-[34px] rounded-full px-3 text-[12px] font-bold text-white" style={{ background: C.hero }}>
                        保存
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="min-h-[34px] rounded-full border bg-white px-3 text-[12px]" style={{ borderColor: BORDER, color: C.sub }}>
                        閉じる
                      </button>
                    </span>
                  </form>
                ) : (
                  <p className="m-0 mt-0.5 whitespace-pre-wrap break-words">{cm.text}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {err && (
        <p role="alert" className="m-0 rounded-xl px-3 py-2 text-[12px]" style={{ background: "#FCEEF1", color: C.statusText }} data-gantt-task-error>
          {err}
        </p>
      )}
    </div>
  );
}

// ─── 計画のくわしい内容の中の一覧 ───

export function TaskList({
  planId,
  tasks,
  today,
  perms,
  initialOpenId,
  onAdd,
  onEdit,
  onSaved,
  onRemoved,
  onReorder,
  cheers,
  onCheers,
}: {
  planId: string;
  tasks: GanttTask[];
  today: string;
  perms: TaskPerms;
  initialOpenId?: string;
  /** 265: タスクごとの 👏 応援 */
  cheers?: Record<string, TeamMember[]>;
  onCheers?: (taskId: string, list: TeamMember[]) => void;
  onAdd: () => void;
  onEdit: (t: GanttTask) => void;
  onSaved: (t: GanttTask) => void;
  onRemoved: (id: string) => void;
  onReorder: (id: string, dir: -1 | 1) => void;
}) {
  const list = tasksOfPlan(tasks, planId);
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null);
  const [err, setErr] = useState("");
  const openRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (initialOpenId) openRef.current?.scrollIntoView({ block: "nearest" });
  }, [initialOpenId]);

  if (list.length === 0 && !perms.manage) return null;

  const remove = async (t: GanttTask) => {
    if (!window.confirm(`タスク「${t.title}」を消します。ひとことも一緒に消えます。\n\nよろしいですか？`)) return;
    setErr("");
    try {
      await ganttApi(`/api/gantt/tasks?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
      onRemoved(t.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "消せませんでした");
    }
  };

  return (
    <section className="px-[18px] pb-3" aria-label="タスク" data-gantt-tasks={planId}>
      <div className="mb-1.5 flex items-center justify-between gap-2 border-t pt-3" style={{ borderColor: C.ruleHead }}>
        <span className="text-[13px] font-bold">
          タスク
          {list.length > 0 && (
            <span className="ml-2 text-[12px] font-normal" style={{ color: C.sub }} data-gantt-progress>
              {progressLabel(list)}
            </span>
          )}
        </span>
        {perms.manage && list.length < TASKS_PER_PLAN_MAX && (
          <button
            type="button"
            onClick={onAdd}
            className="min-h-[36px] rounded-full border bg-white px-3 text-[12px] font-bold"
            style={{ borderColor: BORDER, color: C.statusText }}
            data-gantt-task-add
          >
            ＋ タスクを追加
          </button>
        )}
      </div>
      {list.length === 0 && (
        <p className="m-0 text-[12px]" style={{ color: C.sub }}>
          まだタスクはありません
        </p>
      )}
      <ul className="m-0 list-none space-y-1.5 p-0">
        {list.map((t, i) => {
          const open = openId === t.id;
          return (
            <li
              key={t.id}
              ref={open ? openRef : undefined}
              className="rounded-2xl border"
              style={{ borderColor: open ? "rgba(231, 166, 184, 0.9)" : "rgba(243, 222, 228, 0.9)", background: open ? "rgba(253, 248, 246, 0.95)" : "#FFFFFF" }}
              data-gantt-task={t.id}
            >
              <div className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : t.id)}
                  aria-expanded={open}
                  className="min-w-0 flex-1 px-3 py-2 text-left"
                  data-gantt-task-toggle={t.id}
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <TaskStatusChip status={t.status} />
                    <span className="min-w-0 break-words text-[13px] font-medium" style={{ color: C.ink }}>
                      {t.title}
                    </span>
                    {t.directorJudge && <JudgeChip small />}
                    {t.help?.open && <HelpMark />}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px]" style={{ color: C.sub }}>
                    <span className="break-words">{t.assignees.length ? t.assignees.map((a) => a.name || "名前未設定").join("、") : "担当者なし"}</span>
                    <DueText task={t} today={today} />
                    {t.comments.length > 0 && <span>ひとこと {t.comments.length}</span>}
                  </span>
                </button>
                {perms.manage && (
                  <span className="flex shrink-0 flex-col justify-center pr-1">
                    <button type="button" disabled={i === 0} onClick={() => onReorder(t.id, -1)} aria-label={`${t.title}を上へ`} className="h-[24px] w-[28px] text-[12px] disabled:opacity-30" style={{ color: C.sub }} data-gantt-task-up={t.id}>
                      ↑
                    </button>
                    <button type="button" disabled={i === list.length - 1} onClick={() => onReorder(t.id, 1)} aria-label={`${t.title}を下へ`} className="h-[24px] w-[28px] text-[12px] disabled:opacity-30" style={{ color: C.sub }} data-gantt-task-down={t.id}>
                      ↓
                    </button>
                  </span>
                )}
              </div>
              {open && (
                <div className="border-t px-3 pb-3 pt-2" style={{ borderColor: C.ruleHead }}>
                  <TaskBody
                    task={t}
                    perms={perms}
                    onSaved={onSaved}
                    cheers={cheers ? cheers[t.id] ?? [] : undefined}
                    onCheers={onCheers ? (list) => onCheers(t.id, list) : undefined}
                  />
                  {perms.manage && (
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => onEdit(t)} className="min-h-[36px] rounded-full px-4 text-[12px] font-bold text-white" style={{ background: C.hero }} data-gantt-task-edit={t.id}>
                        直す
                      </button>
                      <button type="button" onClick={() => void remove(t)} className="min-h-[36px] rounded-full border bg-white px-4 text-[12px]" style={{ borderColor: BORDER, color: C.statusText }} data-gantt-task-delete={t.id}>
                        消す
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {err && (
        <p role="alert" className="m-0 mt-2 rounded-xl px-3 py-2 text-[12px]" style={{ background: "#FCEEF1", color: C.statusText }}>
          {err}
        </p>
      )}
    </section>
  );
}

// ─── タスクを足す・直す ───

export type TaskDraft = { title: string; assigneeIds: string[]; due: string; directorJudge: boolean; status: TaskStatus; memo: string };

export function TaskForm({
  planName,
  initial,
  editing,
  wasJudge,
  candidates,
  isDirector,
  busy,
  error,
  onSave,
  onClose,
}: {
  planName: string;
  initial: TaskDraft;
  editing: boolean;
  /** 直す前から「院長が判断」の印が付いている（院長でなければ外せない） */
  wasJudge: boolean;
  candidates: TeamMember[];
  isDirector: boolean;
  busy: boolean;
  error: string;
  onSave: (d: TaskDraft) => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<TaskDraft>(initial);
  const [q, setQ] = useState("");
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const missing = !d.title.trim() ? "題名を入れてください" : "";
  const judgeLocked = wasJudge && !isDirector;
  const toggle = (id: string) => set("assigneeIds", d.assigneeIds.includes(id) ? d.assigneeIds.filter((x) => x !== id) : [...d.assigneeIds, id]);
  const shown = candidates.filter((c) => !q.trim() || c.name.includes(q.trim()));
  const doneLocked = !!statusChangeProblem({ directorJudge: d.directorJudge, status: initial.status }, "done", isDirector);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const field = "mt-1 w-full rounded-xl border bg-white px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-[#F2C6D3]";
  const fieldStyle = { borderColor: BORDER, color: C.ink };
  const lab = "block text-[12px] font-medium";
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/25 sm:items-center" data-gantt-form-backdrop data-gantt-keep-detail>
      <form
        role="dialog"
        aria-label={editing ? "タスクを直す" : "タスクを追加"}
        data-gantt-task-form
        onSubmit={(e) => {
          e.preventDefault();
          if (!missing && !busy) onSave(d);
        }}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-[24px] p-5 sm:max-w-[540px] sm:rounded-[24px]"
        style={{ background: "#FFFFFF", fontFamily: C.sans, color: C.ink, boxShadow: "0 20px 44px rgba(142, 91, 181, 0.18)" }}
      >
        <h2 className="mb-0.5 text-[18px] font-bold" style={{ fontFamily: C.serif }}>
          {editing ? "タスクを直す" : "＋ タスクを追加"}
        </h2>
        <p className="mb-3 break-words text-[12px]" style={{ color: C.sub }}>
          {planName}
        </p>
        <div className="space-y-3">
          <label className={lab} style={{ color: C.sub }}>
            題名
            <input type="text" value={d.title} maxLength={TASK_TITLE_MAX} onChange={(e) => set("title", e.target.value)} className={field} style={fieldStyle} data-gantt-tf-title />
          </label>
          <fieldset data-gantt-tf-assignees>
            <legend className="text-[12px] font-medium" style={{ color: C.sub }}>
              担当者（{d.assigneeIds.length}人・いなくてもよい）
            </legend>
            {candidates.length > 8 && (
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前でさがす" aria-label="名前でさがす" className={field} style={fieldStyle} />
            )}
            <div className="mt-1.5 flex max-h-[180px] flex-wrap gap-1.5 overflow-y-auto">
              {shown.map((c) => {
                const on = d.assigneeIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(c.id)}
                    data-gantt-tf-assignee={c.id}
                    className="min-h-[40px] rounded-full border px-3 text-[13px]"
                    style={{
                      borderColor: on ? "#E68AA0" : BORDER,
                      background: on ? "linear-gradient(135deg, #FBE1E8 0%, #F6E6F5 100%)" : "#FFFFFF",
                      color: on ? C.statusText : C.ink,
                      fontWeight: on ? 700 : 400,
                    }}
                  >
                    {on ? "✓ " : ""}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className={lab} style={{ color: C.sub }}>
              期限（任意）
              <input type="date" value={d.due} onChange={(e) => set("due", e.target.value)} className={field} style={fieldStyle} data-gantt-tf-due />
            </label>
            <label className={lab} style={{ color: C.sub }}>
              状態
              <select value={d.status} onChange={(e) => set("status", e.target.value as TaskStatus)} className={field} style={fieldStyle} data-gantt-tf-status>
                {TASK_STATUSES.map((s) => (
                  <option key={s.value} value={s.value} disabled={s.value === "done" && doneLocked && initial.status !== "done"}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={d.directorJudge}
              disabled={judgeLocked}
              onChange={(e) => {
                const on = e.target.checked;
                setD((p) => ({ ...p, directorJudge: on, status: on && !isDirector && p.status === "done" && initial.status !== "done" ? initial.status : p.status }));
              }}
              className="h-4 w-4"
              data-gantt-tf-judge
            />
            <JudgeChip />
            <span className="text-[12px]" style={{ color: C.sub }}>
              {judgeLocked ? "印を外せるのは院長だけです" : "院長にしかできない判断のタスクに付けます"}
            </span>
          </label>
          <label className={lab} style={{ color: C.sub }}>
            メモ（任意・{TASK_MEMO_MAX}字まで）
            <textarea value={d.memo} rows={3} maxLength={TASK_MEMO_MAX} onChange={(e) => set("memo", e.target.value)} className={field} style={fieldStyle} data-gantt-tf-memo />
          </label>
        </div>
        {(error || missing) && (
          <p role="alert" className="mt-3 rounded-xl px-3 py-2 text-[13px]" style={{ background: "#FCEEF1", color: C.statusText }} data-gantt-tf-error>
            {error || missing}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded-full border px-5 text-[14px]" style={{ borderColor: BORDER, color: C.sub }}>
            閉じる
          </button>
          <button type="submit" disabled={!!missing || busy} className="min-h-[44px] rounded-full px-6 text-[14px] font-bold text-white disabled:opacity-50" style={{ background: C.hero, boxShadow: C.heroShadow }} data-gantt-tf-save>
            {busy ? "保存しています…" : "保存"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}

// ─── 「📋 みんなのタスク」に出す、自分が担当者のタスク ───

type MyTask = GanttTask & { planName: string; canTouch: boolean; canManage: boolean };

export function GanttMyTasks() {
  const [tasks, setTasks] = useState<MyTask[] | null>(null);
  const [meta, setMeta] = useState<{ me: string; isDirector: boolean; canModerate: boolean }>({ me: "", isDirector: false, canModerate: false });
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");
  const today = jstTodayYmd();

  useEffect(() => {
    let alive = true;
    // スイッチOFFで見られない人・未ログインは 404/401 → 何も出さない
    ganttApi<{ tasks: MyTask[]; me: string; isDirector: boolean; canModerate: boolean }>("/api/gantt/tasks?mine=1")
      .then((j) => {
        if (!alive) return;
        setTasks(j.tasks ?? []);
        setMeta({ me: j.me, isDirector: !!j.isDirector, canModerate: !!j.canModerate });
      })
      .catch(() => alive && setTasks([]));
    return () => {
      alive = false;
    };
  }, []);

  if (!tasks || tasks.length === 0) return null;

  const replace = (t: GanttTask) => setTasks((prev) => (prev ?? []).map((x) => (x.id === t.id ? { ...x, ...t } : x)));
  const changeStatus = async (t: MyTask, s: TaskStatus) => {
    setBusyId(t.id);
    setErr("");
    try {
      const j = await ganttApi<{ task: GanttTask }>("/api/gantt/tasks", { method: "PATCH", body: JSON.stringify({ id: t.id, status: s }) });
      replace(j.task);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusyId("");
    }
  };

  const undone = tasks.filter((t) => t.status !== "done").length;
  return (
    <section
      className="rounded-[20px] p-4"
      style={{ background: "linear-gradient(160deg, #FDF8F6 0%, #FBEEF2 55%, #F3EEFA 100%)", border: C.cardBorder, boxShadow: "0 8px 22px rgba(142, 91, 181, 0.08)", color: C.ink }}
      aria-label="🏁 年間計画"
      data-gantt-my-tasks
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="m-0 text-[15px] font-bold">
          🏁 年間計画
          <span className="ml-2 text-[12px] font-normal" style={{ color: C.sub }}>
            自分が担当者のタスク（未完了 {undone} 件）
          </span>
        </h2>
        <Link href="/gantt" className="text-[12px] underline" style={{ color: C.currentText }}>
          🏁 年間計画を開く
        </Link>
      </div>
      <ul className="m-0 grid list-none gap-2 p-0 md:grid-cols-2">
        {tasks.map((t) => {
          const open = openId === t.id;
          return (
            <li key={t.id} className="rounded-2xl border bg-white/90 px-3 py-2.5" style={{ borderColor: "rgba(243, 222, 228, 0.9)" }} data-gantt-my-task={t.id}>
              <div className="flex items-start gap-2">
                <Link href={`/gantt?plan=${encodeURIComponent(t.planId)}&task=${encodeURIComponent(t.id)}`} className="min-w-0 flex-1" data-gantt-my-task-link={t.id}>
                  <span className="block truncate text-[11px]" style={{ color: C.sub }} data-gantt-my-task-plan>
                    {t.planName}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="break-words text-[14px] font-medium">{t.title}</span>
                    {t.directorJudge && <JudgeChip small />}
                    {t.help?.open && <HelpMark />}
                  </span>
                  <span className="mt-0.5 block text-[11px]">
                    <DueText task={t} today={today} />
                  </span>
                </Link>
                <StatusSelect task={t} isDirector={meta.isDirector} busy={busyId === t.id} onChange={(s) => void changeStatus(t, s)} />
              </div>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : t.id)}
                aria-expanded={open}
                className="mt-1.5 min-h-[32px] text-[12px] underline"
                style={{ color: C.currentText }}
                data-gantt-my-task-toggle={t.id}
              >
                {open ? "閉じる" : `ひとこと（${t.comments.length}）`}
              </button>
              {open && (
                <div className="mt-1.5">
                  <TaskBody
                    task={t}
                    showStatus={false}
                    perms={{ me: meta.me, manage: t.canManage, isDirector: meta.isDirector, canModerate: meta.canModerate }}
                    onSaved={replace}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {err && (
        <p role="alert" className="m-0 mt-2 rounded-xl px-3 py-2 text-[12px]" style={{ background: "#FCEEF1", color: C.statusText }} data-gantt-my-task-error>
          {err}
        </p>
      )}
    </section>
  );
}
