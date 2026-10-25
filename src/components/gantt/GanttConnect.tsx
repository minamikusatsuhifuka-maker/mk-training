"use client";

// 265: 年間計画で人と人をつなぐ — 画面の部品（見た目は250-補 さくらミルク）
//
//   CheerButton      … 👏 応援（数と押した人の名前・もう一度で取り消し）
//   ThanksButton     … 💌 ありがとうカードを送る（完了したものだけ。今ある書く画面を、宛先と書き出しを入れて開く）
//   HelpSection      … 🙋 手伝ってほしい（出す・下ろす）／手伝います／担当者に加える
//   JudgmentSection  … 院長の判断（タスクのいちばん上・日時付き。書けるのは院長だけ）
//   GanttAlerts      … アプリ内の知らせ（ホームの帯・年間計画の画面の上）
// 判定はすべてサーバー（/api/gantt/connect・/api/gantt/alerts）。画面は返事に従うだけ。

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { C } from "./sakura-theme";
import { ganttApi } from "./GanttTasks";
import { ThankyouFormModal } from "@/components/ThankyouFormModal";
import type { TeamMember } from "@/lib/gantt";
import type { GanttTask } from "@/lib/gantt-tasks";
import { HELP_TEXT_MAX, JUDGMENT_MAX, timeLabel, type GanttAlert } from "@/lib/gantt-connect";

const BORDER = "rgba(240, 209, 218, 0.9)";

function ErrorLine({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p role="alert" className="m-0 mt-1.5 rounded-xl px-3 py-2 text-[12px]" style={{ background: "#FCEEF1", color: C.statusText }} data-gantt-connect-error>
      {text}
    </p>
  );
}

// ─── 👏 応援 ───

export function CheerButton({
  kind,
  targetId,
  me,
  cheers,
  onChange,
}: {
  kind: "plan" | "task";
  targetId: string;
  me: string;
  cheers: TeamMember[];
  onChange: (list: TeamMember[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const on = cheers.some((c) => c.id === me);
  const press = async () => {
    setBusy(true);
    setErr("");
    try {
      const j = await ganttApi<{ cheers: TeamMember[] }>("/api/gantt/connect", { method: "POST", body: JSON.stringify({ action: "cheer", kind, targetId }) });
      onChange(j.cheers ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div data-gantt-cheer={targetId}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void press()}
          disabled={busy}
          aria-pressed={on}
          className="min-h-[36px] rounded-full border px-3.5 text-[13px] disabled:opacity-60"
          style={{
            borderColor: on ? "#E68AA0" : BORDER,
            background: on ? "linear-gradient(135deg, #FBE1E8 0%, #F6E6F5 100%)" : "#FFFFFF",
            color: on ? C.statusText : C.ink,
            fontWeight: on ? 700 : 400,
          }}
          data-gantt-cheer-button={targetId}
        >
          👏 応援 <span data-gantt-cheer-count>{cheers.length}</span>
        </button>
        {cheers.length > 0 && (
          <span className="min-w-0 break-words text-[12px]" style={{ color: C.sub }} data-gantt-cheer-names>
            {cheers.map((c) => c.name || "名前未設定").join("、")}
          </span>
        )}
      </div>
      <ErrorLine text={err} />
    </div>
  );
}

// ─── 💌 ありがとうカードを送る ───

export function ThanksButton({ to, message, small }: { to: string[]; message: string; small?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${small ? "min-h-[34px] px-3 text-[12px]" : "min-h-[36px] px-4 text-[13px]"} rounded-full border`}
        style={{ borderColor: BORDER, background: C.todayBtn, color: C.statusText }}
        data-gantt-thanks
      >
        💌 ありがとうカードを送る
      </button>
      {/* 今ある「💌 ありがとうカード」を書く画面（見られる人・送り方の決まりは変えない）。重ね画面の中から開くので、詳細を閉じないよう印を付ける */}
      {open &&
        createPortal(
          <div className="relative z-[80]" data-gantt-keep-detail data-gantt-thanks-modal>
            <ThankyouFormModal open={open} onClose={() => setOpen(false)} initialTo={to} initialMessage={message} />
          </div>,
          document.body
        )}
    </>
  );
}

// ─── 🙋 手伝ってほしい ───

export function HelpSection({
  task,
  me,
  touch,
  manage,
  onSaved,
}: {
  task: GanttTask;
  me: string;
  /** 出す・下ろすができる（タスクの担当者・タスクを書ける人） */
  touch: boolean;
  /** 名乗り出た人を担当者に加えられる（タスクを書ける人） */
  manage: boolean;
  onSaved: (t: GanttTask) => void;
}) {
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const open = !!task.help?.open;
  const helpers = task.helpers ?? [];
  const isAssignee = task.assignees.some((a) => a.id === me);
  const offered = helpers.some((h) => h.id === me);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr("");
    try {
      const j = await ganttApi<{ task: GanttTask }>("/api/gantt/connect", { method: "POST", body: JSON.stringify({ taskId: task.id, ...body }) });
      onSaved(j.task);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-xl border bg-white px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#F2C6D3]";
  return (
    <div data-gantt-help={task.id}>
      {open && (
        <div className="rounded-xl px-3 py-2" style={{ background: "linear-gradient(135deg, #FDF0C8 0%, #FBE3CF 100%)", color: "#5E470A" }} data-gantt-help-open>
          <div className="text-[12px] font-bold">🙋 手伝ってほしい</div>
          <p className="m-0 mt-0.5 whitespace-pre-wrap break-words text-[13px]" data-gantt-help-text>
            {task.help!.text}
          </p>
          <div className="mt-0.5 text-[11px]" style={{ color: "#86650F" }}>
            {task.help!.byName || "名前未設定"}・{timeLabel(task.help!.at)}
          </div>
        </div>
      )}
      {helpers.length > 0 && (
        <div className="mt-1.5 text-[12px]" data-gantt-helpers>
          <span style={{ color: C.sub }}>手伝います：</span>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {helpers.map((h) => {
              const already = task.assignees.some((a) => a.id === h.id);
              return (
                <span key={h.id} className="inline-flex items-center gap-1" data-gantt-helper={h.id}>
                  {h.name || "名前未設定"}
                  {manage && !already && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void post({ action: "addHelper", userId: h.id })}
                      className="min-h-[30px] rounded-full border bg-white px-2.5 text-[11px] disabled:opacity-60"
                      style={{ borderColor: BORDER, color: C.statusText }}
                      data-gantt-helper-add={h.id}
                    >
                      担当者に加える
                    </button>
                  )}
                </span>
              );
            })}
          </span>
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap gap-2">
        {open && !isAssignee && (
          <button
            type="button"
            disabled={busy}
            aria-pressed={offered}
            onClick={() => void post({ action: "offer" })}
            className="min-h-[36px] rounded-full border px-4 text-[13px] disabled:opacity-60"
            style={{ borderColor: offered ? "#E8C35A" : BORDER, background: offered ? "linear-gradient(135deg, #FDF0C8 0%, #FBE3CF 100%)" : "#FFFFFF", color: offered ? "#86650F" : C.ink, fontWeight: offered ? 700 : 400 }}
            data-gantt-offer={task.id}
          >
            {offered ? "✓ 手伝います" : "手伝います"}
          </button>
        )}
        {touch && !open && !writing && (
          <button
            type="button"
            onClick={() => {
              setText(task.help?.text ?? "");
              setWriting(true);
            }}
            className="min-h-[36px] rounded-full border bg-white px-4 text-[13px]"
            style={{ borderColor: BORDER, color: C.statusText }}
            data-gantt-help-raise={task.id}
          >
            🙋 手伝ってほしい
          </button>
        )}
        {touch && open && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void post({ action: "help", open: false })}
            className="min-h-[36px] rounded-full border bg-white px-4 text-[13px] disabled:opacity-60"
            style={{ borderColor: BORDER, color: C.sub }}
            data-gantt-help-lower={task.id}
          >
            「🙋 手伝ってほしい」を下ろす
          </button>
        )}
      </div>
      {writing && (
        <form
          className="mt-1.5 flex items-start gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim() || busy) return;
            void post({ action: "help", text }).then((ok) => ok && setWriting(false));
          }}
        >
          <textarea
            value={text}
            rows={2}
            maxLength={HELP_TEXT_MAX}
            onChange={(e) => setText(e.target.value)}
            aria-label="何を手伝ってほしいか"
            placeholder={`何を手伝ってほしいか（${HELP_TEXT_MAX}字まで）`}
            className={field}
            style={{ borderColor: BORDER, color: C.ink }}
            data-gantt-help-input={task.id}
          />
          <span className="flex shrink-0 flex-col gap-1">
            <button type="submit" disabled={!text.trim() || busy} className="min-h-[34px] rounded-full px-3 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: C.hero }} data-gantt-help-save={task.id}>
              保存
            </button>
            <button type="button" onClick={() => setWriting(false)} className="min-h-[34px] rounded-full border bg-white px-3 text-[12px]" style={{ borderColor: BORDER, color: C.sub }}>
              閉じる
            </button>
          </span>
        </form>
      )}
      <ErrorLine text={err} />
    </div>
  );
}

// ─── 院長の判断 ───

export function JudgmentSection({ task, isDirector, onSaved }: { task: GanttTask; isDirector: boolean; onSaved: (t: GanttTask) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!task.directorJudge && !task.judgment) return null;
  if (!task.judgment && !isDirector) return null;
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const j = await ganttApi<{ task: GanttTask }>("/api/gantt/connect", { method: "POST", body: JSON.stringify({ action: "judgment", taskId: task.id, text }) });
      onSaved(j.task);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "linear-gradient(135deg, #F3ECFB 0%, #FBEFF4 100%)", border: "1px solid rgba(201, 180, 238, 0.7)" }} data-gantt-judgment={task.id}>
      <div className="flex flex-wrap items-center gap-2 text-[12px] font-bold" style={{ color: "#6B3F96" }}>
        🧭 院長の判断
        {task.judgment && (
          <span className="font-normal" style={{ color: C.sub }} data-gantt-judgment-at>
            {timeLabel(task.judgment.at)}
            {task.judgment.editedAt && `（直しました ${timeLabel(task.judgment.editedAt)}）`}
          </span>
        )}
        {isDirector && task.directorJudge && !editing && (
          <button
            type="button"
            onClick={() => {
              setText(task.judgment?.text ?? "");
              setEditing(true);
            }}
            className="ml-auto min-h-[30px] px-1.5 font-normal underline"
            style={{ color: C.statusText }}
            data-gantt-judgment-edit={task.id}
          >
            {task.judgment ? "直す" : "書く"}
          </button>
        )}
      </div>
      {!editing && task.judgment && (
        <p className="m-0 mt-0.5 whitespace-pre-wrap break-words text-[13px]" data-gantt-judgment-text>
          {task.judgment.text}
        </p>
      )}
      {!editing && !task.judgment && (
        <p className="m-0 mt-0.5 text-[12px]" style={{ color: C.sub }}>
          まだ書いていません
        </p>
      )}
      {editing && (
        <div className="mt-1">
          <textarea
            value={text}
            rows={4}
            maxLength={JUDGMENT_MAX}
            onChange={(e) => setText(e.target.value)}
            aria-label="院長の判断"
            className="w-full rounded-xl border bg-white px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-[#F2C6D3]"
            style={{ borderColor: BORDER, color: C.ink }}
            data-gantt-judgment-input={task.id}
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-[11px]" style={{ color: C.sub }}>
              {text.length}／{JUDGMENT_MAX}
            </span>
            <span className="flex gap-1.5">
              <button type="button" onClick={() => setEditing(false)} className="min-h-[34px] rounded-full border bg-white px-3 text-[12px]" style={{ borderColor: BORDER, color: C.sub }}>
                閉じる
              </button>
              <button type="button" disabled={!text.trim() || busy} onClick={() => void save()} className="min-h-[34px] rounded-full px-4 text-[12px] font-bold text-white disabled:opacity-50" style={{ background: C.hero }} data-gantt-judgment-save={task.id}>
                {busy ? "保存しています…" : "保存"}
              </button>
            </span>
          </div>
        </div>
      )}
      <ErrorLine text={err} />
    </div>
  );
}

// ─── アプリ内の知らせ（ホームの帯・年間計画の画面の上） ───

export function GanttAlerts({ compact }: { compact?: boolean }) {
  const [alerts, setAlerts] = useState<GanttAlert[] | null>(null);
  const load = useCallback(() => {
    // 年間計画を見られない人・未ログインは 404/401 → 何も出さない
    ganttApi<{ alerts: GanttAlert[] }>("/api/gantt/alerts")
      .then((j) => setAlerts(j.alerts ?? []))
      .catch(() => setAlerts([]));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  if (!alerts || alerts.length === 0) return null;
  const read = (ids?: string[]) => {
    setAlerts((prev) => (prev ?? []).filter((a) => ids && !ids.includes(a.id)));
    void ganttApi("/api/gantt/alerts", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) }).catch(() => load());
  };
  const shown = alerts.slice(0, compact ? 3 : 8);
  return (
    <div className="space-y-1.5" data-gantt-alerts>
      {shown.map((a) => (
        <div
          key={a.id}
          className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm"
          style={{ borderColor: "rgba(231, 166, 184, 0.9)", background: "linear-gradient(135deg, #FCEEF1 0%, #F2EAFA 100%)", color: C.statusText }}
          data-gantt-alert={a.kind}
        >
          <Link
            href={`/gantt?plan=${encodeURIComponent(a.planId)}${a.taskId ? `&task=${encodeURIComponent(a.taskId)}` : ""}`}
            onClick={() => read([a.id])}
            className="min-w-0 break-words"
            data-gantt-alert-link={a.id}
          >
            {a.text}
            <span className="ml-1.5 text-[11px]" style={{ color: C.sub }}>
              {timeLabel(a.at)}
            </span>
          </Link>
          <button type="button" onClick={() => read([a.id])} className="min-h-[32px] shrink-0 rounded-full border bg-white px-3 text-[12px]" style={{ borderColor: BORDER, color: C.sub }} data-gantt-alert-close={a.id}>
            閉じる
          </button>
        </div>
      ))}
      {alerts.length > shown.length && (
        <p className="m-0 text-[12px]" style={{ color: C.sub }}>
          ほか {alerts.length - shown.length}件（
          <Link href="/gantt" className="underline">
            🏁 年間計画を開く
          </Link>
          ）
        </p>
      )}
    </div>
  );
}
