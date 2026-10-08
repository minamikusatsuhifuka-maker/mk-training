"use client";

// スタッフ育成カルテ 個人のカルテ（指示書179 A-4）— 管理者のみ到達する
// - 上部カード: 最新の1on1の約束／最近の学び／次回1on1の予定（この便では予定データが無い）
// - 成長年表: 入職→1on1→学び→メンバーノート→自己評価→公開サーベイ→権限委譲を時系列に
// - 各項目から元の画面へ移動できる
// - 学びの記録は管理者がここから追加・編集できる（B-4）
// 家族構成はここに出さない（APIも返さない）。

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  TIMELINE_KIND_LABEL,
  formatDates,
  formatDiff,
  promiseStatusLabel,
  type Goal,
  type GrowthPace,
  tenureLabel,
  type Course,
  type LearningRecord,
  type SurveyView,
  type TimelineKind,
} from "@/lib/staff-growth";
import { NEED_KEYS, NEED_LABELS, NEED_GROUP_STYLE, NEEDS_GROUPS } from "@/lib/needs-survey";
import { NeedsRadarChart } from "@/components/NeedsRadarChart";
import { HiringDocsPanel } from "@/components/HiringDocsPanel";
import { ScouterCard } from "@/components/ScouterCard";
import { ContactQuickView } from "@/components/ContactQuickView";
import { CurrentPositionCard } from "@/components/CurrentPositionCard";
import { KarteScheduleCard } from "@/components/OneOnOneSchedule";
import { GoalsStaged, weeklyLinksFromPromises } from "@/components/GoalsStaged";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { PresurveyCompare } from "@/components/PresurveyCompare";
// 220: タブの帯・開いていたタブの記憶
import { GrowthTabsBar, useRememberedTab } from "@/components/GrowthTabsBar";
import { GROWTH_TABS, GROWTH_TAB_STORAGE_KEY, resolveGrowthTab, visibleGrowthTabs } from "@/lib/growth-tabs";
import { transitionLabel } from "@/lib/growth-matrix";
import { formatMonthDayW } from "@/lib/one-on-one-schedule";
// 221: 書き起こしの取り込みと、録音・書き起こしの同意の印
import { TranscriptImportDialog } from "@/components/TranscriptImportDialog";
import { TranscriptConsentPanel } from "@/components/TranscriptConsentPanel";
import { TRANSCRIPT_ENTRY_LABEL } from "@/lib/one-on-one-transcript";
import { fetchGoalsApi, fetchPromisesApi, supportGoalApi, type PromiseItem } from "@/lib/staff-growth-client";
import {
  createLearningApi,
  deleteEvidenceApi,
  deleteLearningApi,
  fetchKarteDetailApi,
  fetchLearningApi,
  patchLearningApi,
  uploadEvidenceApi,
  type KarteDetailResponse,
  type LearningInput,
} from "@/lib/staff-growth-client";
import {
  LearningRecordForm,
  emptyLearningForm,
  learningFormFrom,
} from "@/components/LearningRecordForm";
import { LearningRecordList } from "@/components/LearningRecordList";

// 220 §2-1: 帯と概要に出すぶんだけの軽い読み込み（読めない人には出さない＝null のまま）
type ScheduleBrief = { date: string; time: string; answered: boolean };
type PositionBrief = {
  grade: string;
  careerLine: string;
  agreed: { s: string; m: string } | null;
  transitionLabel: string;
  nextGate: string;
};

async function fetchScheduleBrief(userId: string): Promise<ScheduleBrief[] | null> {
  try {
    const res = await fetch(`/api/growth/schedule?user=${encodeURIComponent(userId)}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { schedules?: { date?: string; time?: string; answered?: boolean }[] };
    return (j.schedules ?? []).map((x) => ({
      date: typeof x.date === "string" ? x.date : "",
      time: typeof x.time === "string" ? x.time : "",
      answered: x.answered === true,
    }));
  } catch {
    return null;
  }
}

async function fetchPositionBrief(userId: string): Promise<PositionBrief | null> {
  try {
    const res = await fetch(`/api/growth/position?user=${encodeURIComponent(userId)}`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) return null; // 院長以外は404（＝帯にも概要にも出さない）
    const j = (await res.json()) as {
      grade?: { grade?: string; careerLine?: string };
      review?: { agreed?: { s?: string; m?: string }[] };
      transition?: string | null;
      gates?: { ok?: boolean; gate?: { label?: string } }[];
    };
    const agreed = j.review?.agreed?.[0];
    const gate = (j.gates ?? []).find((g) => g.ok !== true);
    return {
      grade: j.grade?.grade ?? "",
      careerLine: j.grade?.careerLine ?? "",
      agreed: agreed?.s && agreed?.m ? { s: agreed.s, m: agreed.m } : null,
      transitionLabel: j.transition ? transitionLabel(j.transition as Parameters<typeof transitionLabel>[0]) : "",
      nextGate: gate?.gate?.label ?? "",
    };
  } catch {
    return null;
  }
}

/** 次の1on1（今日以降でいちばん近い回）。無ければ直近の過去の回 */
function pickSchedule(list: ScheduleBrief[] | null, today: string): ScheduleBrief | null {
  if (!list || list.length === 0) return null;
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.find((s) => s.date >= today) ?? sorted[sorted.length - 1];
}

const KIND_TONE: Record<TimelineKind, string> = {
  joined: "bg-slate-100 text-slate-700",
  one_on_one: "bg-sky-50 text-sky-800",
  learning: "bg-teal-50 text-teal-800",
  member_note: "bg-amber-50 text-amber-800",
  self_review: "bg-violet-50 text-violet-800",
  survey: "bg-rose-50 text-rose-800",
  delegation: "bg-emerald-50 text-emerald-800",
  hiring_doc: "bg-orange-50 text-orange-800",
  feedback: "bg-yellow-50 text-yellow-900",
};

export function StaffGrowthDetail({ userId }: { userId: string }) {
  const [detail, setDetail] = useState<KarteDetailResponse | null>(null);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [aiDraftEnabled, setAiDraftEnabled] = useState(false);
  const [bucketMissing, setBucketMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState("");
  const [showAll, setShowAll] = useState(false);
  // 220 §2-1: 上の帯に出す「次回1on1」「等級・キャリアライン」
  const [schedules, setSchedules] = useState<ScheduleBrief[] | null>(null);
  const [position, setPosition] = useState<PositionBrief | null>(null);
  // 185: 段階的な目標（閲覧＋機会・支援・コメント・合意）と1on1の約束
  const [goalsState, setGoalsState] = useState<{ goals: Goal[]; pace: GrowthPace; canSupport: boolean } | null>(null);
  const [promises, setPromises] = useState<PromiseItem[]>([]);
  // 220 §2-2: 開いていたタブをその端末で覚える（見られないタブのときは概要に戻す）
  const [rememberedTab, setTab] = useRememberedTab(GROWTH_TAB_STORAGE_KEY.staff, GROWTH_TABS);
  // 221: 書き起こしの取り込みを開いているか
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const [d, l] = await Promise.all([fetchKarteDetailApi(userId), fetchLearningApi(userId)]);
      setDetail(d);
      setRecords(l.records);
      setCourses(l.courses);
      setAiDraftEnabled(l.aiDraftEnabled);
      setBucketMissing(l.bucketMissing);
      // 185: 目標（段階）と約束。188 6: 入職予定者はアカウントが無く目標が存在しないので読みに行かない（エラーにしない）
      if (d.entry.prospect) {
        setGoalsState(null);
        setPromises([]);
      } else {
        try {
          const [g, p] = await Promise.all([fetchGoalsApi(userId), fetchPromisesApi(userId)]);
          setGoalsState({ goals: g.goals, pace: g.pref?.pace ?? "", canSupport: g.canSupport });
          setPromises(p.promises);
        } catch {
          setGoalsState(null);
        }
        // 220 §2-1: 帯と概要に出すぶんだけ軽く読む。読めない人（幹部など）には出さない
        void fetchScheduleBrief(userId).then(setSchedules);
        void fetchPositionBrief(userId).then(setPosition);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (t: string) => {
    setMsg(t);
    setError("");
  };

  // 年表は学びの記録を含むので、追加・編集後は取り直す
  const reloadDetail = async () => {
    try {
      setDetail(await fetchKarteDetailApi(userId));
    } catch {
      /* 年表の更新に失敗しても一覧は更新済み */
    }
  };

  const submitLearning = async (
    id: string,
    input: LearningInput,
    evidence: Blob | null
  ): Promise<string | null> => {
    setBusy(true);
    try {
      if (id === "new") {
        let { record } = await createLearningApi(input, userId);
        if (evidence) {
          try {
            record = (await uploadEvidenceApi(record.id, [evidence])).record;
          } catch (e) {
            setError(`記録は保存しましたが、証跡の添付に失敗しました: ${e instanceof Error ? e.message : ""}`);
          }
        }
        setRecords((prev) => [...prev, record]);
        flash("💾 学びの記録を追加しました");
      } else {
        const { record } = await patchLearningApi(id, input);
        setRecords((prev) => prev.map((r) => (r.id === id ? record : r)));
        flash("💾 学びの記録を更新しました");
      }
      setEditing("");
      void reloadDetail();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "保存に失敗しました";
    } finally {
      setBusy(false);
    }
  };

  const removeLearning = async (r: LearningRecord) => {
    if (!confirm("この学びの記録を削除します（証跡の画像も消えます）。よろしいですか？")) return;
    setBusy(true);
    try {
      await deleteLearningApi(r.id);
      setRecords((prev) => prev.filter((x) => x.id !== r.id));
      flash("🗑 学びの記録を削除しました");
      void reloadDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const replaceRecord = (record: LearningRecord) =>
    setRecords((prev) => prev.map((r) => (r.id === record.id ? record : r)));

  if (!loaded) {
    return <p className="text-xs text-gray-500 p-4">読み込み中…</p>;
  }
  if (!detail) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-2">
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error || "対象が見つかりません"}
        </p>
        <Link href="/staff-growth" className="text-xs text-teal-800 underline underline-offset-2">
          ← 一覧へ戻る
        </Link>
      </div>
    );
  }

  const { entry, latestPromise, recentLearning, timeline, today } = detail;
  const isAdmin = detail.isAdmin !== false; // 183: false＝担当の幹部（閲覧のみ）
  const isProspect = !!entry.prospect; // 187/188 6: アカウント作成前
  // 214 §3: 「アンケート」タブを出すか（サーバーの判定をそのまま使う）。入職予定者には出さない
  const presurveyAccess = detail.presurveyAccess === true && !isProspect;
  const PROSPECT_NOTE = "入職してアカウントを作成すると使えます。";
  const tenure = tenureLabel(entry.joinedOn, today);
  const shownTimeline = showAll ? timeline : timeline.slice(0, 30);

  // 220 §2-2: 見られるタブだけを出す（現在地・基本情報は院長のみ／アンケートはサーバーの判定）
  const showPosition = isAdmin && !isProspect;
  const tabs = visibleGrowthTabs({
    position: showPosition,
    presurvey: presurveyAccess,
    basic: isAdmin,
  });
  const tab = resolveGrowthTab(rememberedTab, tabs);

  // 220 §2-3: 概要のカードに出す「最新の1件」
  const goals = goalsState?.goals ?? [];
  const purposeGoal = goals.find((g) => g.level === "purpose");
  const monthlyGoal = goals.find((g) => g.level === "monthly");
  const oneOnOneItems = timeline.filter((it) => it.kind === "one_on_one");
  const latestOneOnOne = oneOnOneItems[0];
  const latestFeedback = timeline.find((it) => it.kind === "feedback");
  const nextGate = position?.nextGate ?? "";
  const nextSchedule = pickSchedule(schedules, today);

  return (
    <div className="max-w-3xl mx-auto p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Link href="/staff-growth" className="text-xs text-teal-800 underline underline-offset-2">
          ← スタッフの成長記録 一覧
        </Link>
        {/* 195: 印刷用の表示（項目を選んで印刷） */}
        <Link href={`/staff-growth/${encodeURIComponent(userId)}/print`} className="text-xs px-3 py-1.5 border border-gray-300 text-gray-700 rounded-full hover:bg-gray-50 min-h-[32px] inline-flex items-center" data-print-link>
          🖨 印刷用に表示
        </Link>
      </div>

      <header className="rounded-xl border border-gray-200 bg-white p-3">
        <h1 className="text-lg font-bold text-gray-900">
          {entry.name}
          {detail.contactAccess && <ContactQuickView userId={userId} name={entry.name} />}
          {entry.testSeed && <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-900 font-normal" data-test-seed-badge>🧪 検証用</span>}
          {entry.roleLabel && (
            <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-normal">
              {entry.roleLabel}
            </span>
          )}
          {entry.retired && (
            <span className="ml-1 text-[11px] px-1.5 py-0.5 rounded border border-gray-300 bg-gray-50 text-gray-600 font-normal">
              退職
            </span>
          )}
        </h1>
        <p className="text-[11px] text-gray-600 mt-1">
          {isAdmin
            ? entry.joinedOn
              ? `入職 ${entry.joinedOn.replaceAll("-", "/")}${tenure ? `（在籍 ${tenure}）` : ""}`
              : "入職日 未登録（スタッフ連絡先に入職日を登録すると表示されます）"
            : "閲覧のみ（担当スタッフ）"}
          {" ・ "}学びの記録 {entry.learningCount}件
          {position?.grade && <>{" ・ "}等級 {position.grade}</>}
          {position?.careerLine && <>{" ・ "}{position.careerLine}</>}
        </p>

        {/* 220 §2-1: いつも見える「次回1on1」と「最新の約束」 */}
        {!isProspect && (
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-lg border border-gray-200 p-2" data-head-schedule>
              <p className="text-[11px] font-medium text-gray-700">🗓 次回1on1</p>
              {nextSchedule ? (
                <p className="text-[12px] text-gray-900">
                  {formatMonthDayW(nextSchedule.date)}
                  {nextSchedule.time && ` ${nextSchedule.time}`}
                  <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${nextSchedule.answered ? "bg-teal-50 text-teal-800" : "bg-amber-50 text-amber-800"}`}>
                    事前アンケート {nextSchedule.answered ? "提出済み" : "未提出"}
                  </span>
                </p>
              ) : (
                <p className="text-[11px] text-gray-500">{schedules === null ? "—" : "予定はまだありません"}</p>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 p-2" data-head-promise>
              <p className="text-[11px] font-medium text-gray-700">🤝 最新の約束</p>
              {latestPromise ? (
                <>
                  <p className="text-[12px] text-gray-900 line-clamp-2 whitespace-pre-wrap">{latestPromise.text}</p>
                  <p className="text-[10px] text-gray-500">
                    {latestPromise.date.replaceAll("-", "/")} ・ {latestPromise.partnerName}さんと
                    {latestPromise.status && ` ・ 本人: ${promiseStatusLabel(latestPromise.status)}`}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-gray-500">約束が書かれた1on1はまだありません。</p>
              )}
            </div>
          </div>
        )}
      </header>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}
      {msg && (
        <p className="text-xs text-teal-800 bg-teal-50 border border-teal-200 rounded-lg p-2">{msg}</p>
      )}

      {entry.prospect && (
        <p className="text-[11px] text-orange-900 bg-orange-50 border border-orange-200 rounded-lg p-2" data-prospect-banner>
          🆕 入職予定者（アカウント作成前・院長のみ）。入職予定 {entry.prospect.expectedJoinOn ? entry.prospect.expectedJoinOn.replaceAll("-", "/") : "未設定"}。
          採用資料の登録・AI整理・連絡先の反映ができます。アカウントができたら一覧から紐づけてください。
        </p>
      )}

      {/* 220 §2-2: タブ。見られないタブは出さない（判定はサーバー側の結果をそのまま使う） */}
      <GrowthTabsBar tabs={tabs} current={tab} onChange={setTab} />

      {/* 220 §2-3: 概要（最初に開く）。各タブの最新1件だけを小さなカードで並べる */}
      {tab === "overview" && (
        <div className="space-y-3" data-tab-panel="overview">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <OverviewCard title="🎯 目標" onMore={() => setTab("goals")}>
              {isProspect ? (
                <p className="text-[11px] text-gray-500">{PROSPECT_NOTE}</p>
              ) : purposeGoal || monthlyGoal ? (
                <>
                  <p className="text-[12px] text-gray-900 line-clamp-2">目的: {purposeGoal?.title || "未記入"}</p>
                  <p className="text-[12px] text-gray-900 line-clamp-2">今月: {monthlyGoal?.title || "未記入"}</p>
                </>
              ) : (
                <p className="text-[11px] text-gray-500">まだ目標が書かれていません。</p>
              )}
            </OverviewCard>

            <OverviewCard title="🤝 1on1" onMore={() => setTab("one_on_one")}>
              {latestOneOnOne ? (
                <>
                  <p className="text-[11px] text-gray-500">{latestOneOnOne.date.replaceAll("-", "/")}</p>
                  <p className="text-[12px] text-gray-900 line-clamp-2">{latestOneOnOne.title}</p>
                </>
              ) : (
                <p className="text-[11px] text-gray-500">まだ1on1の記録がありません。</p>
              )}
            </OverviewCard>

            <OverviewCard title="🌟 フィードバック" onMore={() => setTab("feedback")}>
              {latestFeedback ? (
                <p className="text-[12px] text-gray-900 line-clamp-2">
                  <span className="text-[11px] text-gray-500 mr-1">{latestFeedback.date.replaceAll("-", "/")}</span>
                  {latestFeedback.title}
                </p>
              ) : (
                <p className="text-[11px] text-gray-500">まだ記録がありません。</p>
              )}
            </OverviewCard>

            <OverviewCard title="📚 学び" onMore={() => setTab("learning")}>
              {recentLearning.length === 0 ? (
                <p className="text-[11px] text-gray-500">まだ学びの記録がありません。</p>
              ) : (
                <p className="text-[12px] text-gray-900 line-clamp-2">
                  <span className="text-[11px] text-gray-500 mr-1">{formatDates(recentLearning[0].dates)}</span>
                  {courses.find((c) => c.id === recentLearning[0].courseId)?.name ?? "（講座不明）"}
                </p>
              )}
              {nextGate && <p className="text-[11px] text-amber-800">次に受ける講座: {nextGate}</p>}
            </OverviewCard>

            {showPosition && (
              <OverviewCard title="🧭 現在地" onMore={() => setTab("position")}>
                <p className="text-[12px] text-gray-900">
                  合意した位置: <strong>{position?.agreed ? `${position.agreed.s} × ${position.agreed.m}` : "未記録"}</strong>
                </p>
                <p className="text-[11px] text-gray-600">
                  次の移行: {position?.transitionLabel || "—"}
                </p>
              </OverviewCard>
            )}

            {presurveyAccess && (
              <OverviewCard title="📝 アンケート" onMore={() => setTab("presurvey")}>
                {nextSchedule ? (
                  <>
                    <p className="text-[11px] text-gray-500">1on1 {nextSchedule.date.replaceAll("-", "/")}</p>
                    <p className={`text-[12px] ${nextSchedule.answered ? "text-teal-800" : "text-amber-800"}`}>
                      {nextSchedule.answered ? "提出済み" : "未提出"}
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-gray-500">次の1on1の予定がありません。</p>
                )}
              </OverviewCard>
            )}
          </div>

      {/* 成長年表（A-4） */}
      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <h2 className="text-sm font-medium text-gray-900">📈 成長年表</h2>
        {timeline.length === 0 ? (
          <p className="text-[11px] text-gray-500">まだ記録がありません。</p>
        ) : (
          <ol className="space-y-2">
            {shownTimeline.map((it, i) => (
              <li key={`${it.kind}-${it.date}-${i}`} className="flex gap-2">
                <span className="shrink-0 w-[5.5em] text-[11px] text-gray-500 pt-0.5">
                  {it.date ? it.date.replaceAll("-", "/") : "日付なし"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] text-gray-900">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full mr-1 ${KIND_TONE[it.kind]}`}>
                      {TIMELINE_KIND_LABEL[it.kind]}
                    </span>
                    {it.title}
                    <Link
                      href={it.href}
                      className="ml-1.5 text-[11px] text-teal-800 underline underline-offset-2"
                    >
                      元の画面へ
                    </Link>
                  </p>
                  {it.survey ? (
                    <SurveyBlock view={it.survey} />
                  ) : (
                    it.body && (
                      <p className="text-[11px] text-gray-700 whitespace-pre-wrap line-clamp-6">{it.body}</p>
                    )
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {timeline.length > 30 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="text-xs text-teal-800 underline underline-offset-2 min-h-[36px]"
          >
            ▼ 残り{timeline.length - 30}件を表示
          </button>
        )}
      </section>

        </div>
      )}

      {tab === "goals" && (
        <div data-tab-panel="goals">
      {/* 185: 段階的な目標（本人が書く。院長・担当幹部は機会・支援・コメント・合意だけ） */}
      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" data-goals-section>
        <h2 className="text-sm font-medium text-gray-900">🎯 本人の目標（目的 → 3年後 → 年間 → 半期 → 月 → 週）</h2>
        <p className="text-[10px] text-gray-500">目標の内容は本人だけが書けます。ここでは「クリニックが提供する機会・支援」の記入、コメント、年間・半期の合意を記録できます。</p>
        {isProspect ? (
          <p className="text-[11px] text-gray-500" data-prospect-note>{PROSPECT_NOTE}</p>
        ) : goalsState ? (
          <GoalsStaged
            mode="supporter"
            goals={goalsState.goals}
            pace={goalsState.pace}
            weeklyLinks={weeklyLinksFromPromises(promises)}
            busy={busy}
            draftPrefix={`growth:goal-view:${userId}`}
            onSupport={async (input) => {
              setBusy(true);
              try {
                const { goal } = await supportGoalApi(input);
                setGoalsState((st) => (st ? { ...st, goals: st.goals.map((g) => (g.id === goal.id ? goal : g)) } : st));
                flash("💾 保存しました（本人にも見えます）");
                return null;
              } catch (e) {
                return e instanceof Error ? e.message : "保存に失敗しました";
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : (
          <p className="text-[11px] text-gray-500">目標を読み込めませんでした。</p>
        )}
      </section>

        </div>
      )}

      {/* 220 §2-2: 1on1（221の書き起こしの取り込みはこのタブに入る） */}
      {tab === "one_on_one" && (
        <div className="space-y-3" data-tab-panel="one_on_one">
          <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium text-gray-900">🗓 次回1on1の予定</h2>
              <Link href="/one-on-one" className="text-[11px] text-teal-800 underline underline-offset-2">
                1on1の画面へ
              </Link>
            </div>
            {isProspect ? (
              <p className="text-[11px] text-gray-500" data-prospect-note>{PROSPECT_NOTE}</p>
            ) : (
              <KarteScheduleCard userId={userId} />
            )}
          </section>

          {/* 221 §2: 書き起こしから記録する（院長・担当の幹部だけ。同意の印が無ければAPIが断る） */}
          {!isProspect && (
            transcriptOpen ? (
              <TranscriptImportDialog
                staff={{ userId, name: entry.name }}
                defaultHeldOn={nextSchedule?.date}
                myName={detail.viewerName ?? ""}
                sampleAllowed={entry.testSeed === true}
                onClose={() => setTranscriptOpen(false)}
                onSaved={() => void load()}
              />
            ) : (
              <button
                type="button"
                onClick={() => setTranscriptOpen(true)}
                className="px-4 py-2 border border-violet-300 text-violet-800 rounded-full text-sm hover:bg-violet-50 min-h-[44px]"
                data-transcript-open
              >
                {TRANSCRIPT_ENTRY_LABEL}
              </button>
            )
          )}

          <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
            <h2 className="text-sm font-medium text-gray-900">🤝 1on1の記録</h2>
            {oneOnOneItems.length === 0 ? (
              <p className="text-[11px] text-gray-500">まだ1on1の記録がありません。</p>
            ) : (
              <ol className="space-y-2">
                {oneOnOneItems.map((it, i) => (
                  <li key={`${it.date}-${i}`} className="flex gap-2">
                    <span className="shrink-0 w-[5.5em] text-[11px] text-gray-500 pt-0.5">
                      {it.date ? it.date.replaceAll("-", "/") : "日付なし"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-gray-900">
                        {it.title}
                        <Link href={it.href} className="ml-1.5 text-[11px] text-teal-800 underline underline-offset-2">
                          元の画面へ
                        </Link>
                      </p>
                      {it.body && (
                        <p className="text-[11px] text-gray-700 whitespace-pre-wrap line-clamp-6">{it.body}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      {tab === "feedback" && (
        <div data-tab-panel="feedback">
      {/* 185: フィードバックの記録（院長=全件／担当幹部=自分の記録だけ。本人にも見える） */}
      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <h2 className="text-sm font-medium text-gray-900">🌟 フィードバックの記録</h2>
        {isProspect ? (
          <p className="text-[11px] text-gray-500" data-prospect-note>{PROSPECT_NOTE}（本人に見せる記録のため、本人のアカウントができてから）</p>
        ) : (
          <FeedbackPanel mode="recorder" userId={userId} staffName={entry.name} />
        )}
      </section>

        </div>
      )}

      {tab === "learning" && (
        <div data-tab-panel="learning">
      {/* 学びの記録（管理者は追加・編集できる・B-4） */}
      <section id="learning" className="space-y-2">
        <h2 className="text-sm font-medium text-gray-900">📚 学びの記録（全件）</h2>
        {!isAdmin ? null : editing === "new" ? (
          <LearningRecordForm
            key="new"
            draftKey={`growth:admin-learning:${userId}:new`}
            initial={emptyLearningForm()}
            courses={courses}
            myRequests={[]}
            aiDraftEnabled={aiDraftEnabled}
            busy={busy}
            isEdit={false}
            onCancel={() => setEditing("")}
            onRequestCreated={() => {}}
            onSubmit={(input, evidence) => submitLearning("new", input, evidence)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 min-h-[44px]"
          >
            ＋ この人の学びの記録を追加（管理者）
          </button>
        )}
        <LearningRecordList
          records={records}
          courses={courses}
          canEdit={isAdmin}
          busy={busy}
          bucketMissing={bucketMissing}
          editingId={editing}
          renderEditor={(r) => (
            <LearningRecordForm
              key={r.id}
              draftKey={`growth:admin-learning:${userId}:${r.id}`}
              initial={learningFormFrom(r)}
              courses={courses}
              myRequests={[]}
              aiDraftEnabled={false}
              busy={busy}
              isEdit
              onCancel={() => setEditing("")}
              onRequestCreated={() => {}}
              onSubmit={(input) => submitLearning(r.id, input, null)}
            />
          )}
          onEdit={(r) => {
            setEditing(r.id);
            setMsg("");
          }}
          onDelete={removeLearning}
          onUploadEvidence={async (r, files) => {
            const { record } = await uploadEvidenceApi(r.id, files);
            replaceRecord(record);
          }}
          onDeleteEvidence={async (r, path) => {
            const { record } = await deleteEvidenceApi(r.id, path);
            replaceRecord(record);
          }}
        />
      </section>
        </div>
      )}

      {/* 190 D: 現在地（成長マトリクス）— 院長のみ（担当幹部には出さない）。入職予定者には出さない */}
      {tab === "position" && showPosition && (
        <div data-tab-panel="position">
          <CurrentPositionCard userId={userId} mode="director" />
        </div>
      )}

      {/* 214 §1: アンケート（最新の回答＋これまでの回答＋横並びの比較） */}
      {tab === "presurvey" && presurveyAccess && (
        <section className="space-y-2" data-tab-panel="presurvey" data-karte-presurvey>
          <h2 className="text-sm font-medium text-gray-900">📝 1on1の事前アンケート</h2>
          <p className="text-[11px] text-gray-500">
            回答は評価には使いません。読み取り専用です（ここから書き換えはできません）。
            {!isAdmin && "（開いた記録は院長に残ります）"}
          </p>
          <PresurveyCompare userId={userId} staffName={entry.name} />
        </section>
      )}

      {/* 184/188: 採用資料・経歴・入職時の想い・適性検査（院長のみ） */}
      {tab === "basic" && isAdmin && (
        <div className="space-y-3" data-tab-panel="basic">
          {/* 221 §1: 1on1の録音・書き起こしの同意の印（院長だけが付け外しできる） */}
          {!isProspect && <TranscriptConsentPanel userId={userId} staffName={entry.name} canEdit />}
      {/* 184: 採用資料・経歴・入職時の想い（院長のみ。幹部モードでは描画しない＝APIも404） */}
      {isAdmin && <HiringDocsPanel userId={userId} staffName={entry.name} />}
      {/* 188 4: 適性検査（スカウター）— 院長のみ・委任対象外 */}
      {isAdmin && <ScouterCard userId={userId} />}

        </div>
      )}
    </div>
  );
}

/**
 * サーベイ公開の展開表示（指示書181）。
 * 出すのは本人が公開したもの（サーバー側で164を通した後）で、中身は「レーダーチャート・5欲求の点数・結果画像・回答日」まで
 * ＝本人への説明（プロフィールの公開設定）の範囲。順位付け・他者比較・高い/低いの評価語は付けない。
 */
function SurveyBlock({ view }: { view: SurveyView }) {
  // 186 B: 最初から表示。見出しの「たたむ」で折りたためる
  const [open, setOpen] = useState(true);
  const hasValues = NEED_KEYS.some((k) => typeof view.values[k] === "number");
  const summary =
    NEED_KEYS.filter((k) => typeof view.values[k] === "number")
      .map((k) => `${NEED_LABELS[k]} ${view.values[k]}`)
      .join(" / ") || "点数の記録なし";
  return (
    <div className="mt-1 rounded-lg border border-rose-100 bg-rose-50/40 p-2" data-survey-block data-open={open ? "1" : "0"}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-rose-900">{summary}</p>
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-[10px] text-rose-700 underline underline-offset-2 min-h-[28px] shrink-0">
          {open ? "たたむ" : "ひらく"}
        </button>
      </div>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {/* レーダー（小さめ）＋5つの点数を横並び（縦に長くしない） */}
          <div className="flex flex-wrap items-center gap-3">
            {hasValues && (
              <div className="shrink-0">
                <NeedsRadarChart values={view.values} size={140} compact />
              </div>
            )}
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[10px] text-gray-500">回答日: {view.answeredOn ? view.answeredOn.replaceAll("-", "/") : "記録なし"}</p>
              <ul className="flex flex-wrap gap-1" aria-label="5つの欲求の点数">
                {NEED_KEYS.map((k) => {
                  const s = NEED_GROUP_STYLE[k];
                  const v = view.values[k];
                  const d = view.diff?.[k];
                  return (
                    <li key={k} className={`text-[11px] px-2 py-0.5 rounded-full border ${s.headerBg} ${s.text} border-current/20`}>
                      {NEED_LABELS[k]} <span className="tabular-nums font-medium">{typeof v === "number" ? v : "—"}</span>
                      {typeof d === "number" && <span className="text-[10px] text-gray-500 ml-1">（前回比 {formatDiff(d)}）</span>}
                    </li>
                  );
                })}
              </ul>
              {/* 詳細15項目（「詳細（詳細15項目の欲求値）も公開」の人だけ）: 欲求ごとに色分けしたチップを横に並べて折り返す */}
              {view.details && (
                <ul className="flex flex-wrap gap-1" aria-label="詳細15項目" data-survey-detail-chips>
                  {NEEDS_GROUPS.flatMap((group) =>
                    group.items
                      .filter((it) => typeof view.details?.[it.key] === "number")
                      .map((it) => {
                        const s = NEED_GROUP_STYLE[group.key];
                        const d = view.detailsDiff?.[it.key];
                        return (
                          <li key={it.key} className={`text-[11px] px-2 py-0.5 rounded-full border-l-4 bg-white ${s.rowBorder} ${s.text}`} title={`${group.label}: ${it.label}`}>
                            {it.label} <span className="tabular-nums font-medium">{view.details?.[it.key]}</span>
                            {typeof d === "number" && <span className="text-[10px] text-gray-500 ml-0.5">{formatDiff(d)}</span>}
                          </li>
                        );
                      })
                  )}
                </ul>
              )}
              {view.imageUrl &&
                (view.isPdf ? (
                  <a href={view.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-teal-800 underline underline-offset-2 min-h-[28px]">
                    📄 結果PDFを開く（1時間有効のリンク）
                  </a>
                ) : (
                  <a href={view.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                    {/* 署名URLは1時間で切れるため next/image を通さない */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={view.imageUrl} alt="サーベイ結果画像" className="w-20 rounded-md border border-gray-200 object-cover hover:opacity-90" />
                  </a>
                ))}
            </div>
          </div>
          <p className="text-[10px] text-gray-500">
            本人が公開した内容だけを表示しています（レーダーチャート・点数・画像{view.details ? "・詳細15項目の欲求" : ""}）。相互理解のための共有で、評価・優劣付けには使いません。
          </p>
        </div>
      )}
    </div>
  );
}

/** 220 §2-3: 概要タブの小さなカード。「すべて見る →」でそのタブへ移る */
function OverviewCard({
  title,
  onMore,
  children,
}: {
  title: string;
  onMore: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-1" data-overview-card={title}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium text-gray-900">{title}</p>
        <button
          type="button"
          onClick={onMore}
          className="text-[11px] text-teal-800 underline underline-offset-2 shrink-0 min-h-[28px]"
        >
          すべて見る →
        </button>
      </div>
      {children}
    </div>
  );
}
