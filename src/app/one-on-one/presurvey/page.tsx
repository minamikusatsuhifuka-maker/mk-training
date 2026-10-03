"use client";

// 📝 1on1の事前アンケート（指示書197・197-補／機能ID one_on_one_presurvey）
// - 本人が1on1の前に答える。並びは選択理論の面談の流れ（願望 → 行動 → 自己評価 → 計画・約束）。
// - データは private_store のみ（認証付きAPI経由・anon直読みなし）。
//   閲覧は本人＋選んだ相手（担当者）＋院長だけ（判定はサーバー側・112と同じ規則）。
// - 回答は評価に使わない（冒頭に常時表示）。集計・スコア・ランキングは作らない。
// - 自動表示（本人の目標・前回の回答・前回の約束）は取れなければ静かに案内だけ出す。

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  listMine,
  listInvolved,
  upsertRecord,
  deleteRecord,
  PrivateStoreError,
  type PrivateRecord,
} from "@/lib/private-store-client";
import {
  PRESURVEY_EMPTY,
  PRESURVEY_INTRO,
  PRESURVEY_LEAD,
  PRESURVEY_PARTNER_NOTE,
  DEFAULT_PRESURVEY_QUESTIONS,
  emptyPresurveyAnswer,
  genPresurveyKey,
  hasAnyAnswer,
  loadPresurveyQuestions,
  normalizePresurveyData,
  sortPresurveys,
  unansweredRequired,
  visiblePresurveyQuestions,
  answerSummary,
  type PresurveyAnswer,
  type PresurveyData,
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
import { jstTodayYmd } from "@/lib/library";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  formatMonthDay,
  formatScheduleLine,
  presurveyDeadline,
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

// 197 D: 書きかけの回答の下書き（176-補と同じ仕組み・sessionStorage のみ。タブを閉じれば消える）
type PresurveyDraft = {
  heldOn: string;
  partnerId: string;
  scheduleId: string;
  answers: Record<string, PresurveyAnswer>;
};
const draftKeyFor = (editingKey: string | null) => `presurvey:${editingKey ?? "new"}`;

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

  // 回答フォーム（新規 or 編集中の回）
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [heldOn, setHeldOn] = useState("");
  const [partnerId, setPartnerId] = useState("");
  // 197 B-2: 院長・担当幹部が登録した予定から答えている回（自分で作る回は空）
  const [scheduleId, setScheduleId] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const schedules = useMySchedules();
  const [answers, setAnswers] = useState<Record<string, PresurveyAnswer>>({});
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const today = jstTodayYmd();

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
      setHeldOn((prev) => prev || jstTodayYmd());
      // 197 D: 書きかけ（新しい回答）があれば戻す
      const draft = readDraft<PresurveyDraft>(draftKeyFor(null));
      if (draft && draft.answers && typeof draft.answers === "object") {
        setHeldOn(draft.heldOn || jstTodayYmd());
        setPartnerId(draft.partnerId || "");
        setScheduleId(draft.scheduleId || "");
        setAnswers(draft.answers);
        setDraftRestored(true);
      }
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

  const partnerCandidates = useMemo(
    () => profiles.filter((p) => p.userId && p.userId !== myId && p.name?.trim()),
    [profiles, myId]
  );
  const nameOf = useCallback(
    (userId: string, fallback: string) =>
      profiles.find((p) => p.userId === userId)?.name?.trim() || fallback,
    [profiles]
  );

  const sorted = useMemo(() => sortPresurveys(records), [records]);

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
            key !== editingKey && d.heldOn && (!heldOn || d.heldOn < heldOn)
        )
        .sort((a, b) => b.d.heldOn.localeCompare(a.d.heldOn));
      for (const { d } of past) {
        const a = d.answers.find((x) => x.questionId === questionId);
        const text = a ? answerSummary(a).trim() : "";
        if (text) return { text, heldOn: d.heldOn };
      }
      return null;
    },
    [records, editingKey, heldOn]
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
  const skipDraftWrite = useRef(true);
  useEffect(() => {
    if (state !== "ready") return;
    if (skipDraftWrite.current) {
      skipDraftWrite.current = false;
      return;
    }
    const key = draftKeyFor(editingKey);
    if (!hasAnyAnswer(Object.values(answers))) {
      clearDraft(key);
      return;
    }
    writeDraft(key, { heldOn, partnerId, scheduleId, answers } satisfies PresurveyDraft);
  }, [state, editingKey, heldOn, partnerId, scheduleId, answers]);

  const resetForm = () => {
    skipDraftWrite.current = true;
    setEditingKey(null);
    setHeldOn(jstTodayYmd());
    setPartnerId("");
    setScheduleId("");
    setAnswers({});
    setDraftRestored(false);
  };

  const discardDraft = () => {
    clearDraft(draftKeyFor(editingKey));
    if (editingKey) {
      const rec = records.find((r) => r.recordKey === editingKey);
      if (rec) startEdit(rec, { ignoreDraft: true });
    } else {
      resetForm();
    }
  };

  /** 197 B-2: 届いている予定（未回答）から答える */
  const pending = useMemo(
    () => (schedules?.mine ?? []).filter((s) => !s.answered),
    [schedules]
  );
  function startFromSchedule(id: string) {
    const s = schedules?.mine.find((x) => x.id === id);
    if (!s) return;
    // その予定への回答がもうあれば、それを編集する
    const existing = records.find((r) => normalizePresurveyData(r.data).scheduleId === s.id);
    if (existing) {
      startEdit(existing);
      return;
    }
    setEditingKey(null);
    setScheduleId(s.id);
    setHeldOn(s.date);
    setPartnerId(s.partnerId);
    setMessage("");
    setError("");
  }

  // ?schedule=<id>（ホームの知らせ・マイ成長記録から）で開いたら、その予定を選んだ状態にする（1回だけ）
  const scheduleParamDone = useRef(false);
  useEffect(() => {
    if (scheduleParamDone.current || state !== "ready" || !schedules) return;
    scheduleParamDone.current = true;
    const id = new URLSearchParams(window.location.search).get("schedule");
    if (!id || draftRestored) return;
    const s = schedules.mine.find((x) => x.id === id);
    // 回答済みの予定は「これまでの回答」から編集する（ここでは選ばない）
    if (!s || records.some((r) => normalizePresurveyData(r.data).scheduleId === s.id)) return;
    setScheduleId(s.id);
    setHeldOn(s.date);
    setPartnerId(s.partnerId);
  }, [state, schedules, records, draftRestored]);

  function startEdit(record: PrivateRecord, opts: { ignoreDraft?: boolean } = {}) {
    const d = normalizePresurveyData(record.data);
    skipDraftWrite.current = true;
    setEditingKey(record.recordKey);
    const draft = opts.ignoreDraft ? null : readDraft<PresurveyDraft>(draftKeyFor(record.recordKey));
    const next: Record<string, PresurveyAnswer> = {};
    for (const a of d.answers) next[a.questionId] = a;
    setHeldOn(draft?.heldOn || d.heldOn);
    setPartnerId(draft?.partnerId || d.participantIds[0] || "");
    setScheduleId(draft ? draft.scheduleId || "" : d.scheduleId);
    setAnswers(draft?.answers && typeof draft.answers === "object" ? draft.answers : next);
    setDraftRestored(!!draft);
    setMessage("");
    setError("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const save = async () => {
    if (saving) return;
    if (!heldOn) {
      setError("1on1の予定日を入力してください");
      return;
    }
    if (!partnerId) {
      setError("1on1の相手を選択してください");
      return;
    }
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
      const now = new Date().toISOString();
      const existing = editingKey
        ? normalizePresurveyData(
            records.find((r) => r.recordKey === editingKey)?.data
          )
        : null;
      const data: PresurveyData = {
        heldOn,
        scheduleId,
        participantIds: [partnerId],
        partnerName: nameOf(partnerId, "名前未設定"),
        authorName: myName,
        answers: body,
        submittedAt: existing?.submittedAt || now,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      const key = editingKey || genPresurveyKey(heldOn);
      const saved = await upsertRecord("one_on_one_presurvey", key, data);
      clearDraft(draftKeyFor(editingKey));
      // 197 C: 回答したら知らせ・メニューの印をすぐ消す
      void invalidateMySchedules();
      setRecords((prev) => {
        const rest = prev.filter((r) => r.recordKey !== key);
        return [saved, ...rest];
      });
      setMessage(
        editingKey
          ? "回答を更新しました。1on1の画面に反映されます。"
          : "回答を保存しました。1on1の画面に反映されます。"
      );
      resetForm();
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(
        e instanceof PrivateStoreError
          ? e.message
          : "保存に失敗しました。もう一度お試しください。"
      );
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
      if (editingKey === record.recordKey) resetForm();
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

      {/* 197 B-2: 届いている事前アンケート（院長・担当幹部が登録した1on1の予定） */}
      {pending.length > 0 && (
        <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3 space-y-2" data-presurvey-pending>
          <p className="text-sm font-medium text-gray-800">🗓 届いている事前アンケート</p>
          <ul className="space-y-1.5">
            {pending.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-800">
                <span>
                  {formatScheduleLine(s)}
                  <span className="ml-2 text-xs text-gray-500">
                    締切 {formatMonthDay(presurveyDeadline(s))}（1on1の3日前）
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => startFromSchedule(s.id)}
                  disabled={scheduleId === s.id}
                  className="text-xs px-3 py-1.5 rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 min-h-[36px]"
                  data-presurvey-start={s.id}
                >
                  {scheduleId === s.id ? "下で回答中" : "この1on1に答える"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {draftRestored && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5" data-presurvey-draft>
          保存していない書きかけの回答を戻しました（この端末のこのタブだけに一時保存）。
          <button type="button" onClick={discardDraft} className="ml-2 underline hover:opacity-70">
            書きかけを破棄する
          </button>
        </p>
      )}

      {/* 回答フォーム */}
      <div className="space-y-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-xs text-gray-600">
              1on1の予定日
              <input
                type="date"
                value={heldOn}
                onChange={(e) => setHeldOn(e.target.value)}
                disabled={!!scheduleId}
                className="block border border-gray-200 rounded-xl px-3 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-gray-600">
              相手（担当者）
              <select
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                disabled={!!scheduleId}
                className="block border border-gray-200 rounded-xl px-3 py-1.5 text-sm min-w-[160px]"
              >
                <option value="">選択してください</option>
                {partnerId && !partnerCandidates.some((p) => p.userId === partnerId) && (
                  <option value={partnerId}>
                    {schedules?.mine.find((x) => x.id === scheduleId)?.partnerName || "担当者"}
                  </option>
                )}
                {partnerCandidates.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {scheduleId ? (
            <p className="text-xs text-violet-800">
              登録された1on1の予定への回答です（日付と相手は予定のとおり）。
              {!editingKey && (
                <button type="button" onClick={resetForm} className="ml-2 underline hover:opacity-70">
                  予定を選ばずに答える
                </button>
              )}
            </p>
          ) : (
            <p className="text-xs text-gray-500">{PRESURVEY_PARTNER_NOTE}</p>
          )}
          {editingKey && (
            <p className="text-xs text-violet-800 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
              保存済みの回答を編集しています。
              <button
                type="button"
                onClick={resetForm}
                className="ml-2 underline hover:opacity-70"
              >
                新しい回答に切り替える
              </button>
            </p>
          )}
        </div>

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
            disabled={saving || !heldOn || !partnerId}
            className="text-sm px-4 py-2 bg-violet-600 text-white rounded-full hover:bg-violet-700 disabled:opacity-50 min-h-[40px]"
          >
            {saving ? "保存中…" : editingKey ? "💾 更新する" : "💾 保存する"}
          </button>
        </div>
      </div>

      {/* これまでの回答 */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-gray-800">これまでの回答</h2>
        {sorted.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            {PRESURVEY_EMPTY}
          </p>
        ) : (
          sorted.map((record) => {
            const d = normalizePresurveyData(record.data);
            const partnerName = d.participantIds[0]
              ? nameOf(d.participantIds[0], d.partnerName || "名前未設定")
              : d.partnerName || "名前未設定";
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
                      相手: <span className="font-medium">{partnerName}さん</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(record)}
                      className="text-xs px-2 py-1 text-gray-500 hover:text-gray-800"
                    >
                      ✏️ 編集
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(record)}
                      disabled={busyKey === record.recordKey}
                      className="text-xs px-2 py-1 text-gray-500 hover:text-red-600 disabled:opacity-50"
                    >
                      🗑️ 削除
                    </button>
                  </div>
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
      {/* 今日より先の予定日も入れられる（事前に答えるため）。today は案内にだけ使う */}
      <p className="text-[11px] text-gray-400">今日: {today.replaceAll("-", "/")}</p>
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
