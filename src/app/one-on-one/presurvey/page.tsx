"use client";

// 📝 1on1の事前アンケート（指示書197・197-補・200 → 204 v2で2部構成／機能ID one_on_one_presurvey）
//
// - 本人が1on1の前に答える。**第1部「働く目的と目標」／第2部「今回の1on1」**の2部構成。
// - 第1部には前回の答え（＝育成カルテの目標）が入った状態で出る。1-2だけは毎回まっさらから。
// - 200: 回答は **院長・担当幹部が登録した「次回1on1の予定」にだけ** ひもづける。
//   本人が日付・相手を選ぶ欄は無い（予定の日時と担当者は表示だけ）。予定が無ければ回答欄を出さない。
// - 204 §5: 回答を読めるのは**本人・院長・院長が指定した管理者**だけ（判定はサーバー側）。
//   画面上部に、その時点の**実際の名前**を出す。
// - 204 §4: 提出すると、第1部の変わった段だけカルテの目標が更新される。
//   開いたあとに他の画面で目標が変わっていたら、上書きせず赤い帯で止める。
// - 回答は評価に使わない（冒頭に常時表示）。集計・スコア・ランキングは作らない。

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
  PRESURVEY_PART1_NOTICE,
  PRESURVEY_PARTS,
  answerSummary,
  defaultPresurveyQuestions,
  emptyPresurveyAnswer,
  hasAnyAnswer,
  isKarteLinked,
  isLegacyPresurvey,
  loadPresurveyQuestions,
  normalizePresurveyData,
  presurveyAnswerViewerNotice,
  presurveyDeadlineNotice,
  presurveyKarteViewerNotice,
  questionsOfPart,
  sortPresurveys,
  unansweredRequired,
  visiblePresurveyQuestions,
  type PresurveyAnswer,
  type PresurveyQuestion,
} from "@/lib/one-on-one-presurvey";
import {
  PresurveyQuestionBlock,
  type PresurveyPromiseHint,
} from "@/components/PresurveyForm";
import { normalizeOneOnOneData } from "@/lib/one-on-one";
import { promiseTextOf, goalLevelLabel, type GoalLevel } from "@/lib/staff-growth";
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
import {
  annualPeriodNote,
  halfPeriodNote,
  formatJpDate,
  type PresurveyPeriods,
} from "@/lib/presurvey-periods";
import { clearDraft, readDraft, writeDraft } from "@/lib/retro-drafts";
import {
  loadProfilesIndex,
  type StaffProfileIndexEntry,
} from "@/lib/staff-profiles";

type LoadState = "loading" | "ready" | "unauthenticated" | "error";

// 197 D: 書きかけの回答の下書き（176-補と同じ仕組み・sessionStorage のみ。タブを閉じれば消える）。予定ごとに持つ
type PresurveyDraft = { answers: Record<string, PresurveyAnswer> };
const draftKeyFor = (scheduleId: string) => `presurvey:${scheduleId}`;

/** カルテの目標の、いまの値（サーバーから受け取る） */
type KarteSlot = { level: GoalLevel; goalId: string; title: string; updatedAt: string };
type KarteMap = Partial<Record<GoalLevel, KarteSlot>>;
type PresurveyContext = {
  karte: KarteMap;
  karteTableMissing: boolean;
  periods: PresurveyPeriods;
  viewers: { karteManagerIds: string[]; answerViewerIds: string[] };
};

/** 予定の表示（例: 10月13日（火）13:00　院長と　締切 10月10日） */
function scheduleSummary(s: ScheduleView): string {
  return `${formatScheduleLine(s)}　締切 ${formatMonthDay(presurveyDeadline(s))}`;
}

function PresurveyPageBody() {
  const [state, setState] = useState<LoadState>("loading");
  const [questions, setQuestions] = useState<PresurveyQuestion[]>(() =>
    defaultPresurveyQuestions()
  );
  const [records, setRecords] = useState<PrivateRecord[]>([]);
  const [oneOnOnes, setOneOnOnes] = useState<PrivateRecord[]>([]);
  const [profiles, setProfiles] = useState<StaffProfileIndexEntry[]>([]);
  const [ctx, setCtx] = useState<PresurveyContext | null>(null);
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
  /** 開いた時点のカルテの版（提出時に照合してもらう） */
  const baseline = useRef<Partial<Record<GoalLevel, string>>>({});

  const loadContext = useCallback(async (): Promise<PresurveyContext | null> => {
    try {
      const res = await fetch("/api/one-on-one/presurvey", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!res.ok) return null;
      return (await res.json()) as PresurveyContext;
    } catch {
      return null;
    }
  }, []);

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
      const [idx, qs, mine, involved, context] = await Promise.all([
        loadProfilesIndex().catch(() => []),
        loadPresurveyQuestions().catch(() => defaultPresurveyQuestions()),
        listMine("one_on_one_presurvey"),
        // 前回の約束を引くために、自分が関わる1on1ノートを読む（読めるのは112の範囲だけ）
        listInvolved("one_on_one").catch(() => []),
        loadContext(),
      ]);
      setProfiles(idx);
      setMyName(idx.find((p) => p.userId === user.id)?.name?.trim() || "名前未設定");
      setQuestions(qs);
      setRecords(mine);
      setOneOnOnes(involved);
      setCtx(context);
      setState("ready");
    } catch (e) {
      if (e instanceof PrivateStoreError && e.kind === "unauthenticated") {
        setState("unauthenticated");
        return;
      }
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      setState("error");
    }
  }, [loadContext]);

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

  /** 同じ質問の、この回より前の自分の回答 */
  const previousAnswerFor = useCallback(
    (questionId: string, before: string, excludeKey?: string): { text: string; heldOn: string } | null => {
      const past = records
        .map((r) => ({ key: r.recordKey, d: normalizePresurveyData(r.data) }))
        .filter(({ key, d }) => key !== excludeKey && d.heldOn && (!before || d.heldOn < before))
        .sort((a, b) => b.d.heldOn.localeCompare(a.d.heldOn));
      for (const { d } of past) {
        const a = d.answers.find((x) => x.questionId === questionId);
        const text = a ? answerSummary(a).trim() : "";
        if (text) return { text, heldOn: d.heldOn };
      }
      return null;
    },
    [records]
  );

  /**
   * 同じ質問の、この回より前の自分の回答を**まるごと**引く。
   * 1-7 のように「前回の答えが入る」問いは、記述だけでなく**選んだ選択肢も**引き継ぐ
   *（選択肢を引き継がないと、選択が必須の問いが未回答のままになってしまう）。
   */
  const previousFullAnswerFor = useCallback(
    (questionId: string, before: string, excludeKey?: string): PresurveyAnswer | null => {
      const past = records
        .map((r) => ({ key: r.recordKey, d: normalizePresurveyData(r.data) }))
        .filter(({ key, d }) => key !== excludeKey && d.heldOn && (!before || d.heldOn < before))
        .sort((a, b) => b.d.heldOn.localeCompare(a.d.heldOn));
      for (const { d } of past) {
        const a = d.answers.find((x) => x.questionId === questionId);
        if (a && (a.text.trim() || a.choice || a.unchanged)) return a;
      }
      return null;
    },
    [records]
  );

  /**
   * 予定を選ぶ: 初期値（カルテの値・前回の答え）→ 保存済みの回答 → 書きかけ（下書き）の順に重ねる。
   * 204 §4: 第1部の初期値は**開いた時点のカルテの値**。そのときの版も覚えておく。
   */
  const selectSchedule = useCallback(
    (id: string) => {
      const rec = recordFor(id);
      const picked = upcoming.find((s) => s.id === id) ?? null;
      const on = picked?.date ?? "";
      const initial: Record<string, PresurveyAnswer> = {};
      const base: Partial<Record<GoalLevel, string>> = {};
      for (const q of visible) {
        const a = emptyPresurveyAnswer(q);
        if (isKarteLinked(q) && ctx) {
          const slot = ctx.karte[q.karteLevel as GoalLevel];
          a.text = slot?.title ?? "";
          base[q.karteLevel as GoalLevel] = slot?.updatedAt ?? "";
        } else if (q.prefill === "previous") {
          const prev = previousFullAnswerFor(q.id, on, rec?.recordKey);
          if (prev) {
            a.text = prev.text;
            // 選択肢は、いまもその質問にある選択肢だけ引き継ぐ（院長が選択肢を変えていても壊れない）
            a.choice = prev.choice && q.choices.includes(prev.choice) ? prev.choice : "";
            a.unchanged = prev.unchanged;
          }
        }
        initial[q.id] = a;
      }
      baseline.current = base;
      if (rec) {
        for (const a of normalizePresurveyData(rec.data).answers) initial[a.questionId] = a;
      }
      const draft = readDraft<PresurveyDraft>(draftKeyFor(id));
      skipDraftWrite.current = true;
      setScheduleId(id);
      setAnswers(
        draft?.answers && typeof draft.answers === "object"
          ? { ...initial, ...draft.answers }
          : initial
      );
      setDraftRestored(!!draft);
      setMessage("");
      setError("");
    },
    [recordFor, upcoming, visible, ctx, previousFullAnswerFor]
  );

  // 初回: ?schedule=<id>（ホームの知らせ・マイ成長記録から）→ なければ最初の未回答 → なければ最初の予定
  const initialPicked = useRef(false);
  useEffect(() => {
    if (initialPicked.current || state !== "ready" || !schedules || !ctx) return;
    initialPicked.current = true;
    const param = new URLSearchParams(window.location.search).get("schedule");
    const pick =
      upcoming.find((s) => s.id === param) ?? upcoming.find((s) => !s.answered) ?? upcoming[0];
    if (pick) selectSchedule(pick.id);
  }, [state, schedules, ctx, upcoming, selectSchedule]);

  const answerOf = useCallback(
    (q: PresurveyQuestion): PresurveyAnswer => answers[q.id] ?? emptyPresurveyAnswer(q),
    [answers]
  );

  const patchAnswer = (q: PresurveyQuestion, patch: Partial<PresurveyAnswer>) =>
    setAnswers((prev) => ({
      ...prev,
      [q.id]: { ...(prev[q.id] ?? emptyPresurveyAnswer(q)), ...patch },
    }));

  /** 2-3（前回の約束）用: この回より前の1on1の約束のうち最も新しいもの */
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

  const missing = useMemo(() => unansweredRequired(questions, answers), [questions, answers]);

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

  /** 区切りの日付（1-4・1-5） */
  const periodNoteFor = useCallback(
    (q: PresurveyQuestion): string => {
      if (!ctx) return "";
      if (q.karteLevel === "annual") return annualPeriodNote(ctx.periods);
      if (q.karteLevel === "half") return halfPeriodNote(ctx.periods);
      return "";
    },
    [ctx]
  );

  const save = async () => {
    if (saving || !selected) return;
    if (missing.length > 0) {
      setError(
        `必須の質問がまだ残っています（${missing.map((q) => `「${q.text}」`).join("・")}）`
      );
      return;
    }
    const body = visible.map((q) => ({
      ...answerOf(q),
      // 回答した時点の質問文・役割・置き場所・部を一緒に保存する（あとで質問を直しても崩れない）
      question: q.text,
      role: q.role,
      slot: q.slot,
      kind: q.kind,
      part: q.part,
    }));
    if (!hasAnyAnswer(body)) {
      setError("まだ何も書かれていません");
      return;
    }
    setSaving(true);
    setError("");
    try {
      // 200: 日付と担当者は送らない（予定からサーバーが決める）
      // 204 §4: 開いた時点のカルテの版を添える（食い違えば保存されない）
      const res = await fetch("/api/one-on-one/presurvey", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: selected.id,
          answers: body,
          authorName: myName,
          karteBaseline: baseline.current,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        record?: PrivateRecord;
        karte?: KarteMap;
        updatedLevels?: GoalLevel[];
        error?: string;
        code?: string;
      };
      if (!res.ok || !j.record) {
        throw new Error(j.error || "保存に失敗しました。もう一度お試しください。");
      }
      const saved = j.record;
      clearDraft(draftKeyFor(selected.id));
      // 197 C: 回答したら知らせ・メニューの印をすぐ消す
      void invalidateMySchedules();
      setRecords((prev) => [saved, ...prev.filter((r) => r.recordKey !== saved.recordKey)]);
      if (j.karte) {
        setCtx((prev) => (prev ? { ...prev, karte: j.karte! } : prev));
        const next: Partial<Record<GoalLevel, string>> = {};
        for (const [lv, slot] of Object.entries(j.karte)) {
          next[lv as GoalLevel] = (slot as KarteSlot | undefined)?.updatedAt ?? "";
        }
        baseline.current = next;
      }
      const updated = j.updatedLevels ?? [];
      setMessage(
        [
          editingRecord ? "回答を更新しました。" : "回答を保存しました。",
          "1on1の画面に反映されます。",
          updated.length > 0
            ? `育成カルテの目標も更新しました（${updated.map((l) => goalLevelLabel(l)).join("・")}）。`
            : "育成カルテの目標は変わっていないので、そのままです。",
        ].join("")
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

  const karteNames = (ctx?.viewers.karteManagerIds ?? []).map((id) => nameOf(id, "担当者"));
  const answerNames = (ctx?.viewers.answerViewerIds ?? []).map((id) => nameOf(id, "担当者"));

  return (
    <div className="space-y-6">
      {/* 197: 冒頭の常時表示（文言を変えないこと） */}
      <p className="text-sm text-gray-700 leading-relaxed bg-violet-50/60 border border-violet-100 rounded-xl px-4 py-3">
        {PRESURVEY_INTRO}
      </p>

      {/* 204 §1: 画面上部の案内 */}
      <div className="space-y-1.5 bg-white border border-gray-200 rounded-xl px-4 py-3" data-presurvey-notice>
        {selected && (
          <p className="text-sm font-medium text-gray-900" data-presurvey-deadline>
            {presurveyDeadlineNotice(formatJpDate(presurveyDeadline(selected)))}
          </p>
        )}
        <p className="text-xs text-gray-700">{PRESURVEY_PART1_NOTICE}</p>
        <p className="text-[11px] text-gray-600" data-presurvey-karte-viewers>
          {presurveyKarteViewerNotice(karteNames)}
        </p>
        <p className="text-[11px] text-gray-600" data-presurvey-answer-viewers>
          {presurveyAnswerViewerNotice(answerNames)}
        </p>
      </div>

      <p className="text-xs text-gray-600 leading-relaxed">{PRESURVEY_LEAD}</p>

      {message && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm font-medium text-red-700 bg-red-50 border border-red-300 rounded-xl p-3" role="alert" data-presurvey-error>
          {error}
        </p>
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
              </div>

              {ctx?.karteTableMissing && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  育成カルテの目標をまだ読み込めません。第1部は空欄から書いてください（提出はできます）。
                </p>
              )}

              {draftRestored && (
                <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5" data-presurvey-draft>
                  保存していない書きかけの回答を戻しました（この端末のこのタブだけに一時保存）。
                  <button type="button" onClick={discardDraft} className="ml-2 underline hover:opacity-70">
                    書きかけを破棄する
                  </button>
                </p>
              )}

              {/* 204 §2・§3: 第1部／第2部に分けて出す */}
              {PRESURVEY_PARTS.map((part) => {
                const list = questionsOfPart(questions, part.value);
                if (list.length === 0) return null;
                return (
                  <section key={part.value} className="space-y-3" data-presurvey-part={part.value}>
                    <div className="border-l-4 border-violet-400 pl-3">
                      <h2 className="text-base font-bold text-gray-900">{part.title}</h2>
                      <p className="text-[11px] text-gray-600">{part.lead}</p>
                    </div>
                    {list.map((q, i) => (
                      <PresurveyQuestionBlock
                        key={q.id}
                        number={`${part.value}-${i + 1}`}
                        question={q}
                        answer={answerOf(q)}
                        onChange={(patch) => patchAnswer(q, patch)}
                        disabled={saving}
                        previousAnswer={
                          q.kind === "carry_over"
                            ? previousAnswerFor(q.id, heldOn, editingRecord?.recordKey)
                            : null
                        }
                        referenceAnswer={
                          q.prefill === "blank" && part.value === 1
                            ? previousAnswerFor(q.id, heldOn, editingRecord?.recordKey)
                            : null
                        }
                        previousPromise={q.kind === "promise_check" ? previousPromise : null}
                        karteLabel={isKarteLinked(q) ? goalLevelLabel(q.karteLevel as GoalLevel) : ""}
                        periodNote={periodNoteFor(q)}
                      />
                    ))}
                  </section>
                );
              })}

              <div className="flex items-center justify-between gap-2 flex-wrap bg-white border border-gray-200 rounded-xl p-4">
                <span className="text-xs text-gray-500">
                  {myName} として保存します（回答は評価に使いません）
                </span>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  data-presurvey-save
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
          <p className="text-sm text-gray-500 py-6 text-center">{PRESURVEY_EMPTY}</p>
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
                    {isLegacyPresurvey(d) && (
                      <span className="text-[10px] bg-gray-100 text-gray-600 rounded-full px-2 py-0.5" data-presurvey-legacy>
                        2部構成より前の形
                      </span>
                    )}
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
                      <p className="text-[11px] text-gray-500 leading-snug">{a.question}</p>
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
