"use client";

// 📝 1on1の事前アンケートの回答（指示書204 §5-2）— 院長＋委任された管理者
//
// ・1on1の予定ごとに「氏名・1on1の日・期限・提出済み／未提出」を並べ、回答を開ける
// ・委任された管理者には**担当に指定されたスタッフの分だけ**出る（判定はサーバー側）
// ・合計・件数・順位・比較は出さない（204 §5-2）
// ・第1部の「前回から変わった項目」に印を付ける（204 §4）
// ・院長以外が開いたら、サーバー側で閲覧の記録が残る（204 §5-3）
//
// ページの到達可否は proxy.ts（/admin/<項目>）と admin/layout.tsx、APIは requireAdminItem が判定する。

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  PRESURVEY_PARTS,
  answerSummary,
  type PresurveyAnswer,
} from "@/lib/one-on-one-presurvey";
import { formatMonthDayW, SCHEDULE_ANSWER_LABEL, type ScheduleAnswerState } from "@/lib/one-on-one-schedule";
import { formatJpDate } from "@/lib/presurvey-periods";
import { PresurveyCompare } from "@/components/PresurveyCompare";

type Row = {
  scheduleId: string;
  userId: string;
  staffName: string;
  date: string;
  time: string;
  deadline: string;
  partnerName: string;
  submitted: boolean;
  state: ScheduleAnswerState;
  recordKey: string;
  /** 214 §3: このスタッフの回答が2件以上ある（「比べる」を出す） */
  canCompare?: boolean;
};

type Detail = {
  isAdmin: boolean;
  answer: {
    userId: string;
    recordKey: string;
    staffName: string;
    heldOn: string;
    deadline: string;
    submittedAt: string;
    updatedAt: string;
    twoParts: boolean;
    answers: PresurveyAnswer[];
  };
  changedQuestionIds: string[];
  previousHeldOn: string;
};

const STATE_CLASS: Record<ScheduleAnswerState, string> = {
  answered: "bg-teal-50 text-teal-800 border-teal-200",
  waiting: "bg-slate-50 text-slate-700 border-slate-200",
  overdue: "bg-red-50 text-red-700 border-red-200",
};

export default function PresurveyAnswersPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Detail | null>(null);
  // 214 §2: 時期ごとの横並びの比較を開いているスタッフ
  const [compare, setCompare] = useState<{ userId: string; staffName: string } | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/presurvey-answers", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as {
        rows?: Row[];
        isAdmin?: boolean;
        tableMissing?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || `読み込めませんでした (${res.status})`);
      setRows(j.rows ?? []);
      setIsAdmin(j.isAdmin === true);
      setTableMissing(j.tableMissing === true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openAnswer = async (r: Row) => {
    if (!r.recordKey) return;
    setBusy(r.scheduleId);
    setError("");
    // 214: 比較と1件の回答を同時に出すと縦に長くなるので、どちらか一方にする
    setCompare(null);
    try {
      const res = await fetch(
        `/api/admin/presurvey-answers?userId=${encodeURIComponent(r.userId)}&recordKey=${encodeURIComponent(r.recordKey)}`,
        { cache: "no-store", credentials: "same-origin" }
      );
      const j = (await res.json().catch(() => ({}))) as Detail & { error?: string };
      if (!res.ok || !j.answer) throw new Error(j.error || "開けませんでした");
      setOpen(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "開けませんでした");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">📝 1on1の事前アンケートの回答</h1>
        <p className="text-sm text-slate-600 mt-1 leading-relaxed">
          1on1の予定ごとに、提出の状況と回答を見られます。
          {isAdmin
            ? "院長はすべてのスタッフの分を見られます。"
            : "あなたが担当に指定されているスタッフの分だけが出ます。"}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          回答は評価には使いません。合計・件数・順位は出しません。
          比べられるのは同じ人の、時期ごとの回答どうしだけです（ほかのスタッフとの比較・並べ替えはしません）。
          {!isAdmin && "（回答を開いた記録は院長に残ります）"}
        </p>
        {isAdmin && (
          <p className="text-xs text-slate-600 mt-2">
            <Link href="/admin/presurvey" className="text-teal-700 underline underline-offset-2">
              📝 質問の編集へ
            </Link>
          </p>
        )}
      </div>

      {error && (
        <p className="text-sm font-medium text-red-700 bg-red-50 border border-red-300 rounded-lg px-3 py-2" role="alert">
          {error}
        </p>
      )}
      {tableMissing && (
        <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          次回1on1の予定の記録がまだ使えません（可能性ノートのテーブルが未作成）。
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4" data-presurvey-answer-list>
        {rows === null ? (
          <p className="text-sm text-slate-500">読み込み中...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">
            見られる1on1の予定がありません（担当の指定があると、ここに出ます）。
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li
                key={r.scheduleId}
                data-presurvey-row={r.scheduleId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
              >
                <span className="min-w-[7rem] font-medium text-slate-800">{r.staffName}</span>
                <span className="text-slate-700">
                  {formatMonthDayW(r.date)}
                  {r.time && ` ${r.time}`}
                </span>
                <span className="text-xs text-slate-500">
                  担当 {r.partnerName === "院長" ? "院長" : `${r.partnerName}さん`}
                </span>
                <span className="text-xs text-slate-500">締切 {formatJpDate(r.deadline)}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] ${STATE_CLASS[r.state]}`}>
                  {SCHEDULE_ANSWER_LABEL[r.state]}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {/* 214 §3: 回答が2件以上あるスタッフの行に「比べる」を出す */}
                  {r.canCompare && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(null);
                        setCompare({ userId: r.userId, staffName: r.staffName });
                      }}
                      data-presurvey-compare-open={r.userId}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      ↔ 比べる
                    </button>
                  )}
                  {r.submitted && r.recordKey ? (
                    <button
                      type="button"
                      onClick={() => void openAnswer(r)}
                      disabled={busy === r.scheduleId}
                      data-presurvey-open={r.scheduleId}
                      className="rounded-full border border-teal-300 px-3 py-1 text-xs text-teal-800 hover:bg-teal-50 disabled:opacity-50"
                    >
                      {busy === r.scheduleId ? "開いています…" : "回答を開く"}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">未提出</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {compare && (
        <div className="bg-white border-2 border-slate-200 rounded-2xl p-4 space-y-3" data-presurvey-compare-panel>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-slate-800">
              {compare.staffName}さんの回答を時期ごとに比べる
            </h2>
            <button
              type="button"
              onClick={() => setCompare(null)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600"
            >
              閉じる
            </button>
          </div>
          <PresurveyCompare userId={compare.userId} staffName={compare.staffName} />
        </div>
      )}

      {open && (
        <div className="bg-white border-2 border-teal-200 rounded-2xl p-4 space-y-3" data-presurvey-detail>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-slate-800">
              {open.answer.staffName}さんの回答
              <span className="ml-2 text-xs font-normal text-slate-500">
                1on1 {formatJpDate(open.answer.heldOn)}
              </span>
            </h2>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600"
            >
              閉じる
            </button>
          </div>
          {!open.answer.twoParts && (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              2部構成より前（197の9問）の回答です。そのままの形で出しています。
            </p>
          )}
          {open.previousHeldOn && (
            <p className="text-[11px] text-slate-500">
              前回（{formatJpDate(open.previousHeldOn)}）から変わった項目には ✏️ が付きます。
            </p>
          )}

          {[1, 2, 0].map((part) => {
            const list = open.answer.answers.filter((a) => a.part === part);
            if (list.length === 0) return null;
            const title =
              part === 0
                ? "（2部構成より前の回答）"
                : PRESURVEY_PARTS.find((p) => p.value === part)?.title ?? "";
            return (
              <section key={part} className="space-y-2" data-presurvey-detail-part={part}>
                <h3 className="text-sm font-bold text-slate-700 border-l-4 border-teal-400 pl-2">
                  {title}
                </h3>
                <ul className="space-y-2">
                  {list.map((a) => (
                    <li key={a.questionId}>
                      <p className="text-[11px] text-slate-500 leading-snug">
                        {open.changedQuestionIds.includes(a.questionId) && (
                          <span className="mr-1 text-amber-700" data-presurvey-changed={a.questionId}>
                            ✏️
                          </span>
                        )}
                        {a.question}
                      </p>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {answerSummary(a) || "（未回答）"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
