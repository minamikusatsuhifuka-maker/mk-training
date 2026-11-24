"use client";

// スタッフ個人シートの最初の3つ（指示書 mk_training_staff_sheet_1 §3）
//   1. 次の1on1と今する操作
//   2. 今月取り組みたいこと（目標の段 monthly）
//   3. 前回の面談で決めたこと（1on1の約束と取り組み状況・次の一歩）
// 本人（mode="self"）と院長・担当の幹部（mode="staff"）で同じ部品を使い、出す操作だけを変える。
// ここでは何も新しく保存しない。書くのは「約束の取り組み状況」（本人だけ・今あるAPI）だけ。
// 読めないデータ（見られない人）は呼び出し側が渡さない＝ここにも出ない。

import Link from "next/link";
import { useState } from "react";
import {
  GOAL_AXES,
  JITSU_LABEL,
  PROMISE_STATUSES,
  goalLevelLabel,
  type Goal,
  type PromiseStatusValue,
} from "@/lib/staff-growth";
import type { PromiseItem } from "@/lib/staff-growth-client";
import type { GrowthTabKey } from "@/lib/growth-tabs";
import { formatMonthDay, formatMonthDayW, presurveyDeadline } from "@/lib/one-on-one-schedule";
import { daysBetween, formatPersonName, pickLastPromise, pickMonthlyGoal, sheetActionKind } from "@/lib/staff-sheet";

export type SheetSchedule = {
  id: string;
  date: string;
  time: string;
  partnerName: string;
  answered: boolean;
  state: string;
};

const PRESURVEY_HREF = "/one-on-one/presurvey";

const card = "rounded-2xl border border-gray-200 bg-white p-4 space-y-3";
const btnPrimary =
  "flex items-center justify-center min-h-[44px] rounded-xl bg-teal-700 px-4 text-sm font-bold text-white hover:bg-teal-800";
const btnSub =
  "flex items-center justify-center min-h-[44px] rounded-xl border border-gray-300 bg-white px-3 text-[13px] text-gray-900 hover:bg-gray-50";

export function StaffSheetTop(props: {
  mode: "self" | "staff";
  today: string;
  /** undefined＝読み込み中 or 見られない／null＝予定なし */
  schedule: SheetSchedule | null | undefined;
  /** 本人: 事前アンケートの機能がONか（OFFのときは案内しない） */
  presurveyEnabled: boolean;
  /** 本人: 1on1の日程調整（予約）がONか */
  bookingEnabled?: boolean;
  /** 院長・担当: アンケートのタブを見られるか */
  presurveyAccess?: boolean;
  goals: Goal[];
  promises: PromiseItem[];
  onOpenTab: (k: GrowthTabKey) => void;
  /** 本人だけ: 取り組み状況を保存する */
  onPromiseStatus?: (p: PromiseItem, status: PromiseStatusValue) => Promise<void>;
}) {
  const { mode, today } = props;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3" data-staff-sheet-top={mode}>
      <NextOneOnOneBlock {...props} />
      <MonthlyGoalBlock mode={mode} goals={props.goals} onOpenTab={props.onOpenTab} />
      <LastPromiseBlock
        mode={mode}
        today={today}
        promises={props.promises}
        onOpenTab={props.onOpenTab}
        onPromiseStatus={props.onPromiseStatus}
      />
    </div>
  );
}

// ─── 1. 次の1on1と今する操作 ───

function NextOneOnOneBlock({
  mode,
  today,
  schedule,
  presurveyEnabled,
  bookingEnabled,
  presurveyAccess,
  onOpenTab,
}: {
  mode: "self" | "staff";
  today: string;
  schedule: SheetSchedule | null | undefined;
  presurveyEnabled: boolean;
  bookingEnabled?: boolean;
  presurveyAccess?: boolean;
  onOpenTab: (k: GrowthTabKey) => void;
}) {
  const kind = sheetActionKind(schedule ?? null);
  const deadline = schedule ? presurveyDeadline(schedule) : "";
  const left = deadline && today ? daysBetween(today, deadline) : 0;
  const presurveyHref = schedule ? `${PRESURVEY_HREF}?schedule=${encodeURIComponent(schedule.id)}` : PRESURVEY_HREF;

  return (
    <section className={card} aria-labelledby="sheet-next" data-sheet-block="next">
      <h2 id="sheet-next" className="text-[15px] font-bold text-gray-900">次の1on1と今する操作</h2>

      {schedule === undefined ? (
        <p className="text-[12px] text-gray-500">—</p>
      ) : schedule === null ? (
        <p className="text-[13px] text-gray-700">次の1on1の予定はまだありません。</p>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-teal-50 text-teal-900">
            <span className="text-[11px]">{Number(schedule.date.slice(5, 7))}月</span>
            <span className="text-[22px] font-bold leading-none">{Number(schedule.date.slice(8, 10))}</span>
          </div>
          <div className="min-w-0 space-y-0.5">
            <p className="text-[15px] font-bold text-gray-900">
              {formatMonthDayW(schedule.date)}
              {schedule.time && ` ${schedule.time}`}
            </p>
            {schedule.partnerName && <p className="text-[12px] text-gray-600">相手：{formatPersonName(schedule.partnerName)}</p>}
          </div>
        </div>
      )}

      {schedule !== undefined && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          {mode === "self" ? (
            <SelfAction
              kind={kind}
              deadline={deadline}
              left={left}
              presurveyEnabled={presurveyEnabled}
              bookingEnabled={!!bookingEnabled}
              presurveyHref={presurveyHref}
            />
          ) : (
            <StaffAction kind={kind} deadline={deadline} presurveyAccess={!!presurveyAccess} onOpenTab={onOpenTab} />
          )}
        </div>
      )}
    </section>
  );
}

function SelfAction({
  kind,
  deadline,
  left,
  presurveyEnabled,
  bookingEnabled,
  presurveyHref,
}: {
  kind: ReturnType<typeof sheetActionKind>;
  deadline: string;
  left: number;
  presurveyEnabled: boolean;
  bookingEnabled: boolean;
  presurveyHref: string;
}) {
  if (kind === "none") {
    return bookingEnabled ? (
      <Link href="/one-on-one/booking" className={btnPrimary} data-sheet-action="book">
        1on1を予約する
      </Link>
    ) : (
      <p className="text-[12px] text-gray-600">予定が決まると、ここに日時と事前アンケートの案内が出ます。</p>
    );
  }
  if (!presurveyEnabled) {
    return <p className="text-[12px] text-gray-600">当日はよろしくお願いします。</p>;
  }
  if (kind === "answered") {
    return (
      <>
        <p className="text-[13px] font-bold text-teal-800">事前アンケートは提出済みです</p>
        <Link href={presurveyHref} className={btnSub} data-sheet-action="review">
          回答を見直す
        </Link>
      </>
    );
  }
  return (
    <>
      <p className={`text-[13px] font-bold ${kind === "overdue" ? "text-red-700" : "text-amber-800"}`}>
        今すること：事前アンケート
        {deadline && (kind === "overdue" ? `（締切 ${formatMonthDay(deadline)} を過ぎました）` : `（締切 ${formatMonthDay(deadline)}${left >= 0 ? `・あと${left}日` : ""}）`)}
      </p>
      <p className="text-[12px] leading-relaxed text-gray-600">
        第1部の「目的と目標」は、今のシートの内容が入っています。変わったところだけ直してください。
      </p>
      <Link href={presurveyHref} className={btnPrimary} data-sheet-action="presurvey">
        事前アンケートに答える
      </Link>
      {kind === "overdue" && (
        <p className="text-[11px] text-gray-500">締切を過ぎても答えられます。未回答でも1on1は予定どおり行えます。</p>
      )}
    </>
  );
}

function StaffAction({
  kind,
  deadline,
  presurveyAccess,
  onOpenTab,
}: {
  kind: ReturnType<typeof sheetActionKind>;
  deadline: string;
  presurveyAccess: boolean;
  onOpenTab: (k: GrowthTabKey) => void;
}) {
  if (kind === "none") {
    return (
      <button type="button" onClick={() => onOpenTab("one_on_one")} className={btnPrimary} data-sheet-action="register">
        予定を登録
      </button>
    );
  }
  return (
    <>
      <p className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-gray-900">
        <span>事前アンケート</span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-[12px] ${
            kind === "answered"
              ? "bg-teal-50 text-teal-800"
              : kind === "overdue"
                ? "bg-red-50 text-red-700"
                : "bg-amber-50 text-amber-800"
          }`}
          data-sheet-presurvey={kind}
        >
          {kind === "answered" ? "提出済み" : kind === "overdue" ? "未回答（締切後）" : `未回答・締切 ${formatMonthDay(deadline)}`}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        {kind === "answered" && presurveyAccess ? (
          <button type="button" onClick={() => onOpenTab("presurvey")} className={btnSub}>
            回答を見る
          </button>
        ) : (
          <button type="button" onClick={() => onOpenTab("one_on_one")} className={btnSub}>
            予定を変更
          </button>
        )}
        <Link href="/one-on-one" className={btnSub}>
          面談を始める
        </Link>
      </div>
    </>
  );
}

// ─── 2. 今月取り組みたいこと ───

function MonthlyGoalBlock({
  mode,
  goals,
  onOpenTab,
}: {
  mode: "self" | "staff";
  goals: Goal[];
  onOpenTab: (k: GrowthTabKey) => void;
}) {
  const { goal, others } = pickMonthlyGoal(goals);
  const parent = goal?.parentId ? goals.find((g) => g.id === goal.parentId) : undefined;
  const lastComment = goal?.comments.length ? goal.comments[goal.comments.length - 1] : null;
  return (
    <section className={card} aria-labelledby="sheet-month" data-sheet-block="monthly">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="sheet-month" className="text-[15px] font-bold text-gray-900">今月取り組みたいこと</h2>
        <span className="text-[11px] text-gray-500">月の行動目標</span>
      </div>
      {!goal ? (
        <>
          <p className="text-[13px] text-gray-600">まだありません。</p>
          {mode === "self" && (
            <button type="button" onClick={() => onOpenTab("goals")} className={btnSub}>
              今月の目標を書く
            </button>
          )}
        </>
      ) : (
        <>
          <p className="text-[15px] font-bold leading-relaxed text-gray-900 whitespace-pre-wrap">{goal.title}</p>
          <dl className="space-y-1 text-[13px] leading-relaxed">
            {goal.achievedState.trim() && (
              <div className="flex gap-2">
                <dt className="w-[5.5em] shrink-0 text-gray-500">できた状態</dt>
                <dd className="min-w-0 whitespace-pre-wrap">{goal.achievedState}</dd>
              </div>
            )}
            {parent && (
              <div className="flex gap-2">
                <dt className="w-[5.5em] shrink-0 text-gray-500">つながり</dt>
                <dd className="min-w-0">
                  {goalLevelLabel(parent.level)}「{parent.title}」
                  {parent.agreedOn && <span className="ml-1 text-[11px] text-teal-800">（{parent.agreedOn.replaceAll("-", "/")} 合意）</span>}
                </dd>
              </div>
            )}
            {goal.review.trim() && (
              <div className="flex gap-2">
                <dt className="w-[5.5em] shrink-0 text-gray-500">振り返り</dt>
                <dd className="min-w-0 whitespace-pre-wrap">{goal.review}</dd>
              </div>
            )}
          </dl>
          {(goal.jitsu.length > 0 || goal.axes.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {goal.jitsu.map((k) => (
                <span key={k} className="rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] text-teal-900">
                  {JITSU_LABEL[k]}
                </span>
              ))}
              {goal.axes.map((a) => (
                <span key={a} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] text-blue-900">
                  {GOAL_AXES.find((x) => x.value === a)?.label}
                </span>
              ))}
            </div>
          )}
          {lastComment && (
            <div className="space-y-0.5 border-t border-gray-100 pt-2">
              <p className="text-[11px] font-bold text-gray-700">{formatPersonName(lastComment.name) || "院長"}さんからのひとこと</p>
              <p className="text-[13px] leading-relaxed text-gray-900 whitespace-pre-wrap">{lastComment.text}</p>
            </div>
          )}
          {others > 0 && <p className="text-[11px] text-gray-500">ほかに{others}件あります</p>}
          <div className="grid grid-cols-2 gap-2">
            {mode === "self" ? (
              <>
                <button type="button" onClick={() => onOpenTab("goals")} className={btnSub}>
                  振り返りを書く
                </button>
                <button type="button" onClick={() => onOpenTab("goals")} className={btnSub}>
                  目標を直す
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => onOpenTab("goals")} className={btnSub}>
                  コメントする
                </button>
                <button type="button" onClick={() => onOpenTab("goals")} className={btnSub}>
                  支援を書く
                </button>
              </>
            )}
          </div>
        </>
      )}
      <p className="text-[11px] leading-relaxed text-gray-500">
        {mode === "self"
          ? "ここと事前アンケート第1部は同じ目標です。どちらで直しても両方に反映されます。"
          : "目標の内容は本人が書きます。院長・担当者は支援・コメント・合意を書けます。"}
      </p>
    </section>
  );
}

// ─── 3. 前回の面談で決めたこと ───

function LastPromiseBlock({
  mode,
  today,
  promises,
  onOpenTab,
  onPromiseStatus,
}: {
  mode: "self" | "staff";
  today: string;
  promises: PromiseItem[];
  onOpenTab: (k: GrowthTabKey) => void;
  onPromiseStatus?: (p: PromiseItem, status: PromiseStatusValue) => Promise<void>;
}) {
  const p = pickLastPromise(promises, today);
  const [saving, setSaving] = useState(false);
  return (
    <section className={card} aria-labelledby="sheet-last" data-sheet-block="last">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="sheet-last" className="text-[15px] font-bold text-gray-900">前回の面談で決めたこと</h2>
        {p && (
          <span className="text-[11px] text-gray-500">
            {formatMonthDay(p.heldOn)}・{formatPersonName(p.partnerName)}
          </span>
        )}
      </div>
      {!p ? (
        <p className="text-[13px] text-gray-600">まだ1on1の記録がありません。</p>
      ) : (
        <div className="space-y-2 rounded-xl border border-gray-200 p-3">
          <p className="text-[14px] leading-relaxed text-gray-900 whitespace-pre-wrap">{p.text}</p>
          {mode === "self" && onPromiseStatus ? (
            <div role="group" aria-label="取り組み状況" className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
              {PROMISE_STATUSES.map((s) => {
                const on = p.status === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={on}
                    disabled={saving}
                    onClick={async () => {
                      if (on) return;
                      setSaving(true);
                      try {
                        await onPromiseStatus(p, s.value);
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className={`min-h-[40px] rounded-md text-[12px] ${
                      on ? "bg-white font-bold text-teal-900 shadow-sm" : "text-gray-600 hover:bg-white/60"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px]">
              <span
                className={`rounded-full px-2.5 py-0.5 ${
                  p.status === "done"
                    ? "bg-teal-50 text-teal-800"
                    : p.status === "in_progress"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-gray-100 text-gray-700"
                }`}
              >
                本人：{PROMISE_STATUSES.find((s) => s.value === p.status)?.label ?? "未記入"}
              </span>
            </p>
          )}
          {p.note.trim() && <p className="text-[12px] text-gray-600 whitespace-pre-wrap">メモ：{p.note}</p>}
        </div>
      )}
      {mode === "staff" && p && (
        <p className="text-[11px] leading-relaxed text-gray-500">取り組み状況は本人が更新します。決めたことの文面は、記録した人だけが直せます。</p>
      )}
      <button type="button" onClick={() => onOpenTab("one_on_one")} className="min-h-[44px] text-[13px] text-teal-800 underline underline-offset-2">
        これまでの1on1の記録を見る
      </button>
    </section>
  );
}
