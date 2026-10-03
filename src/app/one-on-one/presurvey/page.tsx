"use client";

// 📝 1on1の事前アンケート（指示書197・197-補／機能ID one_on_one_presurvey）
// - 本人が1on1の前に答える。並びは選択理論の面談の流れ（願望 → 行動 → 自己評価 → 計画・約束）。
// - 200: 回答は **院長・担当幹部が登録した「次回1on1の予定」にだけ** ひもづける。
//   本人が日付・相手を選ぶ欄は無い（予定の日時と担当者は表示だけ）。予定が無ければ回答欄を出さない。
//   保存は /api/one-on-one/presurvey（日付と担当者は予定からサーバーが決める）。
// - 回答を読めるのは本人・院長・その1on1の担当者（院長が指定した人）だけ（判定はサーバー側）。
// - 回答は評価に使わない（冒頭に常時表示）。集計・スコア・ランキングは作らない。
// - 自動表示（本人の目標・前回の回答・前回の約束）は取れなければ静かに案内だけ出す。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  listMine,
  listInvolved,
  deleteRecord,
  PrivateStoreError,
  type PrivateRecord,
} from "@/lib/private-store-client";
import {
  PRESURVEY_EMPTY,
  PRESURVEY_INTRO,
  PRESURVEY_LEAD,
  PRESURVEY_NO_SCHEDULE,
  DEFAULT_PRESURVEY_QUESTIONS,
  emptyPresurveyAnswer,
  hasAnyAnswer,
  loadPresurveyQuestions,
  normalizePresurveyData,
  sortPresurveys,
  unansweredRequired,
  visiblePresurveyQuestions,
  answerSummary,
  type PresurveyAnswer,
  type PresurveyQuestion,
} from "@/lib/one-on-one-presurvey";
import {
  PresurveyQuestionBlock,
  type PresurveyGoalHint,
  type PresurveyPromiseHint,
} from "@/components/PresurveyForm";
import { normalizeOneOnOneData } from "@/lib/one-on-one";
import { promiseTextOf, goalLevelLabel } from "@/lib/staff-growth";
import { fetchGoalsApi } from "@/lib/staff-growth-client";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  formatMonthDay,
  formatScheduleLine,
  presurveyDeadline,
  type ScheduleView,
} from "@/lib/one-on-one-schedule";
import {
  invalidateMySchedules,
  useMySchedules,
} from "@/lib/one-on-one-schedule-client";
import { clearDraft, readDraft, writeDraft } from "@/lib/retro-drafts";
import {
  loadProfilesIndex,
  type StaffProfileIndexEntry,
} from "@/lib/staff-profiles";

type LoadState = "loading" | "ready" | "unauthenticated" | "error";

// 197 D: 書きかけの回答の下書き（176-補と同じ仕組み・sessionStorage のみ。タブを閉じれば消える）。予定ごとに持つ
type PresurveyDraft = { answers: Record<string, PresurveyAnswer> };
const draftKeyFor = (scheduleId: string) => `presurvey:${scheduleId}`;

/** 予定の表示（例: 10月13日（火）13:00　院長と　締切 10月10日） */
function scheduleSummary(s: ScheduleView): string {
  return `${formatScheduleLine(s)}　締切 ${formatMonthDay(presurveyDeadline(s))}`;
}

function PresurveyPageBody() {
  const [state, setState] = useState<LoadState>("loading");
  const [questions, setQuestions] = useState<PresurveyQuestion[]>(
    DEFAULT_PRESURVEY_QUESTIONS
  );
  const [records, setRecords] = useState<PrivateRecord[]>([]);
  const [oneOnOnes, setOneOnOnes] = useState<PrivateRecord[]>([]);
  const [goals, setGoals] = useState<PresurveyGoalHint[] | null>(null);
  const [goalsUnavailable, setGoalsUnavailable] = useState("");
  const [profiles, setProfiles] = useState<StaffProfileIndexEntry[]>([]);
  const [myId, setMyId] = useState("");
  const [myName, setMyName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // 回答する予定（200: 予定にだけひもづく）
  const schedules = useMySchedules();
  const [scheduleId, setScheduleId] = useState("");
  const [answers, setAnswers] = useState<Record<string, PresurveyAnswer>>({});
  const [draftRestored, setDraftRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // 予定を選び直した直後は、保存済みの値を下書きとして書かない
  const skipDraftWrite = useRef(true);

  const load = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setState("unauthenticated");
        return;
      }
      setMyId(user.id);
      const [idx, qs, mine, involved] = await Promise.all([
        loadProfilesIndex().catch(() => []),
        loadPresurveyQuestions().catch(() => DEFAULT_PRESURVEY_QUESTIONS),
        listMine("one_on_one_presurvey"),
        // 前回の約束を引くために、自分が関わる1on1ノートを読む（読めるのは112の範囲だけ）
        listInvolved("one_on_one").catch(() => []),
      ]);
      setProfiles(idx);
      setMyName(idx.find((p) => p.userId === user.id)?.name?.trim() || "名前未設定");
      setQuestions(qs);
      setRecords(mine);
      setOneOnOnes(involved);
      setState("ready");

      // 本人の目標（質問3の自動表示）。フラグOFF・テーブル未作成・未登録でも回答は続けられる
      try {
        const res = await fetchGoalsApi();
        const active = res.goals
          .filter((g) => g.status !== "done" && g.title.trim())
          .slice(0, 5)
          .map((g) => ({ level: goalLevelLabel(g.level), title: g.title.trim() }));
        setGoals(active);
        if (active.length === 0) {
          setGoalsUnavailable(
            res.tableMissing
              ? "目標の記録はまだ使えません。下に書いてください。"
              : "登録された目標は見つかりませんでした。下に書いてください。"
          );
        }
      } catch {
        setGoals([]);
        setGoalsUnavailable(
          "目標を自動で表示できませんでした。下に書いてください。"
        );
      }
    } catch (e) {
      if (e instanceof PrivateStoreError && e.kind === "unauthenticated") {
        setState("unauthenticated");
        return;
      }
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setState("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => visiblePresurveyQuestions(questions), [questions]);

  const nameOf = useCallback(
    (userId: string, fallback: string) =>
      profiles.find((p) => p.userId === userId)?.name?.trim() || fallback,
    [profiles]
  );

  const sorted = useMemo(() => sortPresurveys(records), [records]);
  const upcoming = useMemo(() => schedules?.mine ?? [], [schedules]);
  const selected = upcoming.find((s) => s.id === scheduleId) ?? null;
  const heldOn = selected?.date ?? "";
  /** その予定への保存済みの回答 */
  const recordFor = useCallback(
    (id: string) => records.find((r) => normalizePresurveyData(r.data).scheduleId === id) ?? null,
    [records]
  );
  const editingRecord = selected ? recordFor(selected.id) : null;

  /** 予定を選ぶ: 保存済みの回答 → その上に書きかけ（下書き）を重ねる */
  const selectSchedule = useCallback(
    (id: string) => {
      const rec = recordFor(id);
      const saved: Record<string, PresurveyAnswer> = {};
      if (rec) for (const a of normalizePresurveyData(rec.data).answers) saved[a.questionId] = a;
      const draft = readDraft<PresurveyDraft>(draftKeyFor(id));
      skipDraftWrite.current = true;
      setScheduleId(id);
      setAnswers(draft?.answers && typeof draft.answers === "object" ? draft.answers : saved);
      setDraftRestored(!!draft);
      setMessage("");
      setError("");
    },
    [recordFor]
  );

  // 初回: ?schedule=<id>（ホームの知らせ・マイ成長記録から）→ なければ最初の未回答 → なければ最初の予定
  const initialPicked = useRef(false);
  useEffect(() => {
    if (initialPicked.current || state !== "ready" || !schedules) return;
    initialPicked.current = true;
    const param = new URLSearchParams(window.location.search).get("schedule");
    const pick =
      upcoming.find((s) => s.id === param) ?? upcoming.find((s) => !s.answered) ?? upcoming[0];
    if (pick) selectSchedule(pick.id);
  }, [state, schedules, upcoming, selectSchedule]);

  const answerOf = useCallback(
    (q: PresurveyQuestion): PresurveyAnswer =>
      answers[q.id] ?? emptyPresurveyAnswer(q),
    [answers]
  );

  const patchAnswer = (q: PresurveyQuestion, patch: Partial<PresurveyAnswer>) =>
    setAnswers((prev) => ({
      ...prev,
      [q.id]: { ...(prev[q.id] ?? emptyPresurveyAnswer(q)), ...patch },
    }));

  /** 質問4（前回の回答を引き継ぐ）用: 同じ質問の、この回より前の自分の回答 */
  const previousAnswerFor = useCallback(
    (questionId: string): { text: string; heldOn: string } | null => {
      const past = records
        .map((r) => ({ key: r.recordKey, d: normalizePresurveyData(r.data) }))
        .filter(
          ({ key, d }) =>
            key !== editingRecord?.recordKey && d.heldOn && (!heldOn || d.heldOn < heldOn)
        )
        .sort((a, b) => b.d.heldOn.localeCompare(a.d.heldOn));
      for (const { d } of past) {
        const a = d.answers.find((x) => x.questionId === questionId);
        const text = a ? answerSummary(a).trim() : "";
        if (text) return { text, heldOn: d.heldOn };
      }
      return null;
    },
    [records, editingRecord, heldOn]
  );

  /** 質問6（前回の約束）用: この回より前の1on1の約束のうち最も新しいもの */
  const previousPromise = useMemo((): PresurveyPromiseHint | null => {
    const past = oneOnOnes
      .map((r) => ({ r, d: normalizeOneOnOneData(r.data) }))
      .filter(({ d }) => d.heldOn && (!heldOn || d.heldOn <= heldOn))
      .sort((a, b) => b.d.heldOn.localeCompare(a.d.heldOn));
    for (const { r, d } of past) {
      const text = promiseTextOf(d);
      if (!text) continue;
      const partner =
        r.ownerId === myId
          ? nameOf(d.participantIds[0] ?? "", d.partnerName || "")
          : nameOf(r.ownerId, d.authorName || "");
      return { text, heldOn: d.heldOn, partnerName: partner };
    }
    return null;
  }, [oneOnOnes, heldOn, myId, nameOf]);

  const missing = useMemo(
    () => unansweredRequired(questions, answers),
    [questions, answers]
  );

  // 197 D: 入力のたびに下書きへ（何も書いていなければ消す）。保存ボタンだけがサーバーへ送る
  useEffect(() => {
    if (state !== "ready" || !scheduleId) return;
    if (skipDraftWrite.current) {
      skipDraftWrite.current = false;
      return;
    }
    const key = draftKeyFor(scheduleId);
    if (!hasAnyAnswer(Object.values(answers))) {
      clearDraft(key);
      return;
    }
    writeDraft(key, { answers } satisfies PresurveyDraft);
  }, [state, scheduleId, answers]);

  const discardDraft = () => {
    if (!scheduleId) return;
    clearDraft(draftKeyFor(scheduleId));
    selectSchedule(scheduleId);
  };

  const save = async () => {
    if (saving || !selected) return;
    if (missing.length > 0) {
      setError(
        `必須の質問がまだ残っています（${missing
          .map((q) => `「${q.text}」`)
          .join("・")}）`
      );
      return;
    }
    const body = visible.map((q) => ({
      ...answerOf(q),
      // 回答した時点の質問文・役割・置き場所を一緒に保存する（あとで質問を直しても崩れない）
      question: q.text,
      role: q.role,
      slot: q.slot,
      kind: q.kind,
    }));
    if (!hasAnyAnswer(body)) {
      setError("まだ何も書かれていません");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // 200: 日付と担当者は送らない（予定からサーバーが決める）
      const res = await fetch("/api/one-on-one/presurvey", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduleId: selected.id, answers: body, authorName: myName }),
      });
      const j = (await res.json().catch(() => ({}))) as { record?: PrivateRecord; error?: string };
      if (!res.ok || !j.record) throw new Error(j.error || "保存に失敗しました。もう一度お試しください。");
      const saved = j.record;
      clearDraft(draftKeyFor(selected.id));
      // 197 C: 回答したら知らせ・メニューの印をすぐ消す
      void invalidateMySchedules();
      setRecords((prev) => [saved, ...prev.filter((r) => r.recordKey !== saved.recordKey)]);
      setMessage(
        editingRecord
          ? "回答を更新しました。1on1の画面に反映されます。"
          : "回答を保存しました。1on1の画面に反映されます。"
      );
      setDraftRestored(false);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  };

  // 物理削除（110の原則: 機微データは「消したら消える」）
  const remove = async (record: PrivateRecord) => {
    if (busyKey) return;
    if (!confirm("この回答を削除しますか？（削除すると元に戻せません）")) return;
    setBusyKey(record.recordKey);
    setError("");
    try {
      await deleteRecord("one_on_one_presurvey", record.recordKey);
      setRecords((prev) => prev.filter((r) => r.recordKey !== record.recordKey));
      if (editingRecord?.recordKey === record.recordKey) setAnswers({});
      void invalidateMySchedules();
    } catch (e) {
      setError(
        e instanceof PrivateStoreError
          ? e.message
          : "削除に失敗しました。もう一度お試しください。"
      );
    } finally {
      setBusyKey(null);
    }
  };

  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (state === "loading") {
    return (
      <p className="text-sm text-gray-500 py-16 text-center animate-pulse">
        読み込んでいます…
      </p>
    );
  }

  if (state === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <p className="text-sm text-gray-800">
          事前アンケートの利用にはログインが必要です。
        </p>
        <a
          href="/login"
          className="text-sm px-4 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700"
        >
          ログインする
        </a>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="py-16 text-center space-y-3">
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3 inline-block">
          {error || "読み込みに失敗しました"}
        </p>
        <p className="text-xs text-gray-500">
          ページを再読み込みしても直らない場合は院長にお知らせください。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 197: 冒頭の常時表示（文言を変えないこと） */}
      <p className="text-sm text-gray-700 leading-relaxed bg-violet-50/60 border border-violet-100 rounded-xl px-4 py-3">
        {PRESURVEY_INTRO}
      </p>
      <p className="text-xs text-gray-600 leading-relaxed">{PRESURVEY_LEAD}</p>

      {message && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
      )}

      {/* 200: 予定が無ければ回答欄を出さない */}
      {!schedules ? (
        <p className="text-sm text-gray-500 py-6 text-center animate-pulse">予定を確認しています…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-gray-600 bg-white border border-gray-200 rounded-xl p-4 text-center" data-presurvey-no-schedule>
          {PRESURVEY_NO_SCHEDULE}
        </p>
      ) : (
        <>
          {/* 届いている事前アンケート（予定の日時・担当者は表示だけ） */}
          <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2" data-presurvey-schedules>
            <p className="text-sm font-medium text-gray-800">🗓 次回1on1</p>
            <ul className="space-y-1.5">
              {upcoming.map((s) => {
                const active = s.id === scheduleId;
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-800">
                    <span data-presurvey-schedule-line>
                      {scheduleSummary(s)}
                      <span className={`ml-2 text-[11px] ${s.answered ? "text-teal-700" : "text-amber-700"}`}>
                        {s.answered ? "回答済み" : "未回答"}
                      </span>
                    </span>
                    {upcoming.length > 1 && (
                      <button
                        type="button"
                        onClick={() => selectSchedule(s.id)}
                        disabled={active}
                        className="text-xs px-3 py-1.5 rounded-full border border-violet-300 text-violet-800 hover:bg-violet-50 disabled:opacity-50 min-h-[36px]"
                      >
                        {active ? "下で回答中" : s.answered ? "回答を直す" : "この1on1に答える"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {selected && (
            <div className="space-y-3">
              <div className="bg-violet-50/50 border border-violet-100 rounded-xl px-4 py-2.5" data-presurvey-selected>
                <p className="text-sm text-gray-800">
                  {editingRecord ? "回答を直しています：" : "回答する1on1："}
                  <span className="font-medium">{scheduleSummary(selected)}</span>
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  回答を読めるのは、あなたと院長、この1on1の担当者だけです。
                </p>
              </div>

              {draftRestored && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5" data-presurvey-draft>
                  保存していない書きかけの回答を戻しました（この端末のこのタブだけに一時保存）。
                  <button type="button" onClick={discardDraft} className="ml-2 underline hover:opacity-70">
                    書きかけを破棄する
                  </button>
                </p>
              )}

              {visible.map((q, i) => (
                <PresurveyQuestionBlock
                  key={q.id}
                  index={i + 1}
                  question={q}
                  answer={answerOf(q)}
                  onChange={(patch) => patchAnswer(q, patch)}
                  disabled={saving}
                  goals={goals}
                  goalsUnavailable={goalsUnavailable}
                  previousAnswer={
                    q.kind === "carry_over" ? previousAnswerFor(q.id) : null
                  }
                  previousPromise={q.kind === "promise_check" ? previousPromise : null}
                />
              ))}

              <div className="flex items-center justify-between gap-2 flex-wrap bg-white border border-gray-200 rounded-xl p-4">
                <span className="text-xs text-gray-500">
                  {myName} として保存します（回答は評価に使いません）
                </span>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="text-sm px-4 py-2 bg-violet-600 text-white rounded-full hover:bg-violet-700 disabled:opacity-50 min-h-[40px]"
                >
                  {saving ? "保存中…" : editingRecord ? "💾 更新する" : "💾 保存する"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* これまでの回答（読むだけ・削除可。直すのは次回1on1の予定からだけ） */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-gray-800">これまでの回答</h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            {PRESURVEY_EMPTY}
          </p>
        ) : (
          sorted.map((record) => {
            const d = normalizePresurveyData(record.data);
            const partnerName = d.partnerName || "担当者";
            const isExpanded = expanded.has(record.recordKey);
            const shown = isExpanded ? d.answers : d.answers.slice(0, 2);
            return (
              <div
                key={record.recordKey}
                className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-medium bg-violet-100 text-violet-800 rounded-full px-2 py-0.5">
                      📅 {d.heldOn.replaceAll("-", "/")}
                    </span>
                    <span className="text-sm text-gray-800">
                      担当: <span className="font-medium">{partnerName === "院長" ? "院長" : `${partnerName}さん`}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(record)}
                    disabled={busyKey === record.recordKey}
                    className="text-xs px-2 py-1 text-gray-500 hover:text-red-600 disabled:opacity-50 shrink-0"
                  >
                    🗑️ 削除
                  </button>
                </div>
                <ul className="space-y-1.5">
                  {shown.map((a) => (
                    <li key={a.questionId}>
                      <p className="text-[11px] text-gray-500 leading-snug">
                        {a.question}
                      </p>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                        {answerSummary(a) || "（未回答）"}
                      </p>
                    </li>
                  ))}
                </ul>
                {d.answers.length > 2 && (
                  <button
                    type="button"
                    onClick={() => toggleExpanded(record.recordKey)}
                    className="text-xs text-violet-700 underline hover:opacity-70"
                  >
                    {isExpanded ? "たたむ" : "すべて表示"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-gray-500">
        <Link href="/one-on-one" className="text-violet-700 underline hover:opacity-70">
          🤝 1on1ノートへ
        </Link>
      </p>
    </div>
  );
}

export default function PresurveyPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <NavPageHeader
        navKey="/one-on-one/presurvey"
        title="📝 1on1の事前アンケート"
        description="1on1の前に、自分の言葉で整えておく"
      />
      <FeatureGate feature="one_on_one_presurvey">
        <PresurveyPageBody />
      </FeatureGate>
    </div>
  );
}
