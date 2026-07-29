"use client";

import { useEffect, useState } from "react";
import {
  loadPortalItems,
  savePortalItems,
  loadPortalObject,
  loadTodayWord,
  saveTodayWord,
  loadCharacterSettings,
  saveCharacterSettings,
  archiveExpiredNews,
  appendNewsLog,
  loadNewsLog,
} from "@/lib/portal-store";
import {
  getCurrentActorName,
  buildNewsUpdateDetail,
  aggregateNewsContributions,
  NEWS_LOG_ACTION_META,
} from "@/lib/news-log";
import {
  loadNewsReactions,
  saveNewsReactions,
  totalReactionsOf,
  type NewsReactionsMap,
} from "@/lib/news-reactions";
import {
  PORTAL_KEYS,
  NEWS_LOG_MAX,
  DEFAULT_CHARACTER_SETTINGS,
  DEFAULT_HOME_LAYOUT,
  HOME_SECTION_LABELS,
  resolveHomeLayout,
  URGENCY_META,
  URGENCY_OPTIONS,
  urgencyOf,
  urgencyCardClass,
  isNewsExpired,
  formatThankyouTo,
  normalizeThankyouName,
  type NewsItem,
  type ArchivedNewsItem,
  type NewsCategory,
  type NewsLogAction,
  type NewsLogEntry,
  type NewsLogInput,
  type Urgency,
  type HiyariItem,
  type ThankyouItem,
  type PolicyItem,
  type TodayWord,
  type CharacterSettings,
  type CharacterSvgType,
  type HomeSectionConfig,
} from "@/types/portal";
import { CharacterSVG } from "@/components/CharacterNotification";
import { SectionLayoutEditor } from "@/components/admin/SectionLayoutEditor";
import {
  DEFAULT_PORTAL_FEATURES,
  PORTAL_FEATURE_META,
  loadPortalFeatures,
  savePortalFeatures,
  type PortalFeatures,
} from "@/lib/portal-features";
import {
  DEFAULT_FEATURE_FLAGS,
  FEATURE_META,
  IMPLEMENTED_FEATURES,
  getFeatureFlags,
  saveFeatureFlags,
  type FeatureFlags,
  type FeatureId,
} from "@/lib/feature-flags";
import {
  loadKizukiStore,
  saveKizukiStore,
  type KizukiPost,
} from "@/lib/kizuki";
import {
  loadHiyariStore,
  saveHiyariStore,
  type HiyariReport,
} from "@/lib/hiyari-reports";
import {
  MANUAL_DRAFT_STATUS_META,
  loadManualDraftStore,
  saveManualDraftStore,
  type ManualDraft,
} from "@/lib/manual-drafts";
import {
  loadChoreiData,
  saveChoreiData,
  advancePointer,
  applyOrderEdit,
  setPointer,
  currentDuty,
  EMPTY_ROTATION,
  type ChoreiMember,
  type ChoreiPost,
  type ChoreiRotation,
} from "@/lib/chorei";
import { loadProfilesIndex } from "@/lib/staff-profiles";
import { loadStaffMembers } from "@/lib/staff-tasks";
import {
  loadBenkyokaiStore,
  saveBenkyokaiStore,
  normalizeLibraryRefs,
  formatHeldOn,
  type BenkyokaiPost,
} from "@/lib/benkyokai";
import { LibraryDocPicker } from "@/components/LibraryDocPicker";
import {
  listAll as listAllPrivate,
  upsertRecord as upsertPrivateRecord,
  deleteRecord as deletePrivateRecord,
  PrivateStoreError,
  RECORD_KEY_RE,
  type PrivateRecord,
} from "@/lib/private-store-client";
import {
  normalizeSelfReviewData,
  loadSelfReviewConfig,
  saveSelfReviewConfig,
  MINORI_ITEMS,
  ARIKATA_ITEMS,
  OUTPUT_ITEMS,
  RAIKI_ITEMS,
  RANK_REASON_LABEL,
  DEFAULT_SELF_REVIEW_CONFIG,
  type SelfReviewConfig,
} from "@/lib/self-review";
import {
  normalizeOneOnOneData,
  sortOneOnOne,
  ONE_ON_ONE_SECTIONS,
} from "@/lib/one-on-one";
import {
  loadOnboardingTemplate,
  saveOnboardingTemplate,
  normalizeOnboardingProgress,
  emptyOnboardingTemplate,
  genOnboardingId,
  type OnboardingTemplate,
  type OnboardingSection,
  type OnboardingItem,
} from "@/lib/onboarding";
import {
  LIBRARY_KEY,
  normalizeStore as normalizeLibraryStore,
  type LibraryDoc,
} from "@/lib/library";
import {
  loadClinicMetrics,
  saveClinicMetrics,
  emptyClinicMetrics,
  genInitiativeId,
  monthTotal,
  isLegacyOnly,
  type ClinicMetrics,
} from "@/lib/clinic-metrics";
import {
  advanceToNewPeriod,
  currentPeriodKey,
  formatSwitchDate,
  legacyWeeklyAnchorIso,
  loadQuestionSchedule,
  loadWeeklyQuestions,
  nextSwitchDayMs,
  saveQuestionSchedule,
  saveWeeklyQuestions,
  QUESTION_INTERVAL_META,
  type QuestionSchedule,
  type QuestionScheduleInterval,
} from "@/lib/weekly-questions";
import {
  TASKS_PAGE_LAYOUT_KEY,
  TASKS_SECTION_LABELS,
  DEFAULT_TASKS_LAYOUT,
  resolveTasksLayout,
  type TasksSectionConfig,
} from "@/lib/section-layout";
import {
  loadTaskLog,
  TASK_LOG_ACTION_META,
  TASK_LOG_MAX,
  type TaskLogAction,
  type TaskLogEntry,
} from "@/lib/staff-tasks";
import {
  buildNewsHistory,
  filterNewsHistory,
  groupNewsHistory,
  newsCategoryMeta,
  HISTORY_STATUS_META,
  NEWS_CATEGORY_OPTIONS,
  type NewsHistoryGroupAxis,
  type NewsHistoryStatus,
} from "@/lib/news-history";

type TabKey =
  | "news"
  | "archive"
  | "history"
  | "contrib"
  | "hiyari"
  | "hiyariReport"
  | "kizuki"
  | "manualDraft"
  | "chorei"
  | "benkyokai"
  | "selfReview"
  | "oneOnOne"
  | "onboarding"
  | "thankyou"
  | "policy"
  | "word"
  | "character"
  | "layout"
  | "features";

// 「💛 気づきシェア」(hiyari=既存のヒヤリハット/良いこと複合) と
// 「💡 日々の気づき」(kizuki=指示書104・記名投稿) は別機能。混同注意。
const TABS: { key: TabKey; label: string }[] = [
  { key: "news", label: "📢 新着情報" },
  { key: "archive", label: "🗄️ アーカイブ" },
  { key: "history", label: "🕘 共有履歴" },
  { key: "contrib", label: "📊 共有ログ・貢献" },
  { key: "hiyari", label: "💛 気づきシェア" },
  { key: "hiyariReport", label: "🚨 ヒヤリハット報告" },
  { key: "kizuki", label: "💡 日々の気づき" },
  { key: "manualDraft", label: "✍️ マニュアル下書き" },
  { key: "chorei", label: "🌅 朝礼サポート" },
  { key: "benkyokai", label: "📖 勉強会アーカイブ" },
  { key: "selfReview", label: "📝 自己評価" },
  { key: "oneOnOne", label: "🤝 1on1ノート" },
  { key: "onboarding", label: "✅ オンボーディング" },
  { key: "thankyou", label: "♥ ありがとうカード" },
  { key: "policy", label: "🎯 経営方針" },
  { key: "word", label: "💬 今日の一言" },
  { key: "character", label: "🐾 キャラクター" },
  { key: "layout", label: "🧩 レイアウト" },
  { key: "features", label: "⚙ 機能" },
];

const CHARACTER_EMOJIS = [
  "🐈",
  "🐕",
  "🐰",
  "🐦",
  "🐻",
  "🐼",
  "🦊",
  "🐱",
  "🐶",
  "🐹",
  "🐧",
  "🦉",
  "🐢",
  "🦋",
  "🐝",
  "🐙",
];

const CHARACTER_SVGS: { type: CharacterSvgType; label: string }[] = [
  { type: "cat", label: "ねこ" },
  { type: "dog", label: "いぬ" },
  { type: "rabbit", label: "うさぎ" },
  { type: "bird", label: "とり" },
  { type: "chihuahua", label: "ブラックタンチワワ" },
  { type: "sakura", label: "さくら" },
  { type: "sprout", label: "ふたば" },
  { type: "star", label: "ほし" },
  { type: "moon", label: "つき" },
  { type: "shiba", label: "しばいぬ" },
  { type: "panda", label: "ぱんだ" },
  { type: "penguin", label: "ぺんぎん" },
  { type: "hedgehog", label: "はりねずみ" },
  { type: "rainbow", label: "にじ" },
  { type: "note", label: "おんぷ" },
  { type: "clover", label: "クローバー" },
  { type: "butterfly", label: "ちょうちょ" },
];

const NEWS_CATEGORIES: { value: NewsCategory; label: string }[] = [
  { value: "important", label: "重要" },
  { value: "drug_info", label: "新薬情報" },
  { value: "notice", label: "お知らせ" },
  { value: "event", label: "イベント" },
];

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ─── datetime-local（ローカル時刻 "YYYY-MM-DDTHH:mm"）⇔ ISO 変換 ───
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToDatetimeLocal(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return toDatetimeLocal(d);
}

function datetimeLocalToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

// 現在 + days日 を datetime-local 形式で返す（追加フォームの既定値）
function defaultNoticeLocal(days: number): string {
  return toDatetimeLocal(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
}

export default function AdminPortalPage() {
  const [tab, setTab] = useState<TabKey>("news");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // データ
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsArchive, setNewsArchive] = useState<ArchivedNewsItem[]>([]);
  const [hiyari, setHiyari] = useState<HiyariItem[]>([]);
  // 日々の気づき（kizuki_posts・指示書104）。既存「気づきシェア」（hiyari）とは別物
  const [kizukiPosts, setKizukiPosts] = useState<KizukiPost[]>([]);
  const [busyKizukiId, setBusyKizukiId] = useState<string | null>(null);
  // ヒヤリハット報告（hiyari_reports・指示書106）。既存「気づきシェア」（portal_hiyari）とは別物
  const [hiyariReports, setHiyariReports] = useState<HiyariReport[]>([]);
  const [busyHiyariReportId, setBusyHiyariReportId] = useState<string | null>(
    null
  );

  // マニュアル下書き（manual_drafts・指示書107）
  const [manualDrafts, setManualDrafts] = useState<ManualDraft[]>([]);
  const [busyManualDraftId, setBusyManualDraftId] = useState<string | null>(
    null
  );
  // 「📗 資料庫登録済みにする」の資料選択パネル（開いている下書きID。検索/フィルタは LibraryDocPicker 内）
  const [linkTargetId, setLinkTargetId] = useState<string | null>(null);
  const [libraryDocs, setLibraryDocs] = useState<LibraryDoc[]>([]);

  // 勉強会アーカイブ（benkyokai_posts・指示書109）
  const [benkyokaiPosts, setBenkyokaiPosts] = useState<BenkyokaiPost[]>([]);
  const [busyBenkyokaiId, setBusyBenkyokaiId] = useState<string | null>(null);
  // 紐付け編集パネルを開いている記録ID
  const [benkyokaiLinkId, setBenkyokaiLinkId] = useState<string | null>(null);

  // 自己評価シート（private_store self_review・指示書111）
  const [selfReviews, setSelfReviews] = useState<PrivateRecord[]>([]);
  const [selfReviewLoadError, setSelfReviewLoadError] = useState("");
  const [srConfig, setSrConfig] = useState<SelfReviewConfig>(
    DEFAULT_SELF_REVIEW_CONFIG
  );
  const [srPeriodDraft, setSrPeriodDraft] = useState("");
  const [srLabelDraft, setSrLabelDraft] = useState("");
  const [savingSrConfig, setSavingSrConfig] = useState(false);
  const [openSelfReviewId, setOpenSelfReviewId] = useState<string | null>(null);
  const [busySelfReviewId, setBusySelfReviewId] = useState<string | null>(null);

  // 1on1ノート（private_store one_on_one・指示書112）
  const [oneOnOnes, setOneOnOnes] = useState<PrivateRecord[]>([]);
  const [oneOnOneLoadError, setOneOnOneLoadError] = useState("");
  const [openOneOnOneId, setOpenOneOnOneId] = useState<string | null>(null);
  const [busyOneOnOneId, setBusyOneOnOneId] = useState<string | null>(null);

  // オンボーディング（テンプレ=content_store・進捗=private_store onboarding・指示書113）
  const [onbTemplate, setOnbTemplate] = useState<OnboardingTemplate>(
    emptyOnboardingTemplate()
  );
  const [onbLoaded, setOnbLoaded] = useState(false);
  const [savingOnb, setSavingOnb] = useState(false);
  const [onbPickItemId, setOnbPickItemId] = useState<string | null>(null);
  const [newOnbSectionTitle, setNewOnbSectionTitle] = useState("");
  const [newOnbItemLabels, setNewOnbItemLabels] = useState<
    Record<string, string>
  >({});
  const [onbProgressList, setOnbProgressList] = useState<PrivateRecord[]>([]);
  const [onbProgressLoadError, setOnbProgressLoadError] = useState("");
  const [openOnbProgressId, setOpenOnbProgressId] = useState<string | null>(
    null
  );
  const [busyOnbProgressId, setBusyOnbProgressId] = useState<string | null>(
    null
  );

  // 朝礼サポート（chorei_data・指示書108）: 輪番＋投稿
  const [choreiRotation, setChoreiRotation] =
    useState<ChoreiRotation>(EMPTY_ROTATION);
  const [choreiPosts, setChoreiPosts] = useState<ChoreiPost[]>([]);
  const [choreiCandidates, setChoreiCandidates] = useState<ChoreiMember[]>([]);
  const [busyChorei, setBusyChorei] = useState(false);
  const [thankyou, setThankyou] = useState<ThankyouItem[]>([]);
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [todayWord, setTodayWord] = useState<TodayWord>({
    text: "",
    author: "",
    updatedAt: new Date().toISOString(),
  });
  const [charSettings, setCharSettings] = useState<CharacterSettings>(
    DEFAULT_CHARACTER_SETTINGS
  );
  const [savingChar, setSavingChar] = useState(false);

  // 新着情報追加フォーム
  const [newsForm, setNewsForm] = useState<{
    title: string;
    category: NewsCategory;
    urgency: Urgency;
    author: string;
    content: string;
    isActive: boolean;
    noticeUntil: string; // datetime-local 形式（ローカル時刻）
    character?: CharacterSvgType; // 通知アニメのキャラ（未設定=おまかせ）
  }>({
    title: "",
    category: "notice",
    urgency: "normal",
    author: "管理者",
    content: "",
    isActive: true,
    noticeUntil: "",
    character: undefined,
  });

  // 経営方針追加・編集フォーム
  const [policyForm, setPolicyForm] = useState<PolicyItem>({
    id: "",
    year: new Date().getFullYear(),
    purpose: "",
    mission: "",
    vision: "",
    value: "",
    fullText: "",
    isActive: false,
  });
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);

  // 共有ログ・貢献タブ（指示書36）
  const [newsLog, setNewsLog] = useState<NewsLogEntry[]>([]);
  const [newsReactions, setNewsReactions] = useState<NewsReactionsMap>({});
  const [actorName, setActorName] = useState("管理者");
  const [logAction, setLogAction] = useState<NewsLogAction | "all">("all");
  const [logActor, setLogActor] = useState<string>("all");
  const [logKeyword, setLogKeyword] = useState("");

  // タスク操作ログ（指示書56）
  const [taskLog, setTaskLog] = useState<TaskLogEntry[]>([]);
  const [taskLogAction, setTaskLogAction] = useState<TaskLogAction | "all">(
    "all"
  );
  const [taskLogActor, setTaskLogActor] = useState<string>("all");
  const [taskLogKeyword, setTaskLogKeyword] = useState("");

  // 共有履歴タブ（検索・グループ切替・フィルタ）
  const [historyKeyword, setHistoryKeyword] = useState("");
  const [historyAxis, setHistoryAxis] = useState<NewsHistoryGroupAxis>("flat");
  const [historyCategory, setHistoryCategory] = useState<NewsCategory | "all">(
    "all"
  );
  const [historyUrgency, setHistoryUrgency] = useState<Urgency | "all">("all");
  const [historyStatus, setHistoryStatus] = useState<NewsHistoryStatus | "all">(
    "all"
  );
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  // ホーム画面のセクション並び順（管理画面「レイアウト」タブで編集）
  const [homeLayout, setHomeLayout] =
    useState<HomeSectionConfig[]>(DEFAULT_HOME_LAYOUT);
  const [savingLayout, setSavingLayout] = useState(false);

  // みんなのタスク（/tasks）のセクション並び順（同タブで編集）
  const [tasksLayout, setTasksLayout] =
    useState<TasksSectionConfig[]>(DEFAULT_TASKS_LAYOUT);
  const [savingTasksLayout, setSavingTasksLayout] = useState(false);

  // 機能スイッチ（portal_features。指示書47・46Rで「⚙ 機能」タブに3トグル集約）
  const [features, setFeatures] = useState<PortalFeatures>(
    DEFAULT_PORTAL_FEATURES
  );
  const [savingFeatures, setSavingFeatures] = useState(false);

  // 機能の表示設定（portal_feature_flags。指示書103・未リリース機能の解禁フラグ・既定全OFF）
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>(
    DEFAULT_FEATURE_FLAGS
  );
  const [savingFlags, setSavingFlags] = useState(false);

  // みんなへの質問の質問プール（weekly_questions.pool。「⚙ 機能」タブで編集）
  const [pool, setPool] = useState<string[]>([]);
  const [poolLoaded, setPoolLoaded] = useState(false);
  const [newPoolQuestion, setNewPoolQuestion] = useState("");
  const [savingPool, setSavingPool] = useState(false);

  // 質問の配信間隔（portal_question_schedule。指示書75。null=未設定（毎週として動作））
  const [schedule, setSchedule] = useState<QuestionSchedule | null>(null);
  const [scheduleLoaded, setScheduleLoaded] = useState(false);
  const [intervalDraft, setIntervalDraft] =
    useState<QuestionScheduleInterval>("weekly");
  const [savingSchedule, setSavingSchedule] = useState(false);

  // 📈 クリニックの歩み（指示書80。「⚙ 機能」タブで月次・施策を入力）
  const [metrics, setMetrics] = useState<ClinicMetrics | null>(null);
  const [savingMetrics, setSavingMetrics] = useState(false);
  const [newMonth, setNewMonth] = useState<{
    ym: string;
    insurance: string;
    selfPay: string;
    counseling: string;
  }>({ ym: "", insurance: "", selfPay: "", counseling: "" });
  const [newInit, setNewInit] = useState<{
    date: string;
    endDate: string;
    label: string;
  }>({ date: "", endDate: "", label: "" });

  useEffect(() => {
    loadPortalFeatures().then(setFeatures).catch(() => {});
    getFeatureFlags().then(setFeatureFlags).catch(() => {});
    loadKizukiStore()
      .then((s) => setKizukiPosts(s.posts))
      .catch(() => {});
    loadHiyariStore()
      .then((s) => setHiyariReports(s.posts))
      .catch(() => {});
    loadManualDraftStore()
      .then((s) => setManualDrafts(s.posts))
      .catch(() => {});
    // 紐付け候補の資料一覧（LibraryNewsSection と同じ anon 直読み・API不要）
    loadPortalObject<unknown>(LIBRARY_KEY, null)
      .then((raw) => setLibraryDocs(normalizeLibraryStore(raw).docs))
      .catch(() => {});
    loadChoreiData()
      .then((d) => {
        setChoreiRotation(d.rotation);
        setChoreiPosts(d.posts);
      })
      .catch(() => {});
    loadBenkyokaiStore()
      .then((s) => setBenkyokaiPosts(s.posts))
      .catch(() => {});
    // 自己評価（管理者のみ成功。テーブル未作成・権限エラーはタブ内に表示）
    listAllPrivate("self_review")
      .then((records) => {
        setSelfReviews(records);
        setSelfReviewLoadError("");
      })
      .catch((e) => {
        setSelfReviewLoadError(
          e instanceof PrivateStoreError
            ? e.message
            : "自己評価の読み込みに失敗しました"
        );
      });
    loadSelfReviewConfig()
      .then((c) => {
        setSrConfig(c);
        setSrPeriodDraft(c.currentPeriod);
        setSrLabelDraft(c.label);
      })
      .catch(() => {});
    listAllPrivate("one_on_one")
      .then((records) => {
        setOneOnOnes(records);
        setOneOnOneLoadError("");
      })
      .catch((e) => {
        setOneOnOneLoadError(
          e instanceof PrivateStoreError
            ? e.message
            : "1on1ノートの読み込みに失敗しました"
        );
      });
    // オンボーディング（指示書113）: テンプレ＋進捗一覧
    loadOnboardingTemplate()
      .then(setOnbTemplate)
      .catch(() => {})
      .finally(() => setOnbLoaded(true));
    listAllPrivate("onboarding")
      .then((records) => {
        setOnbProgressList(records);
        setOnbProgressLoadError("");
      })
      .catch((e) => {
        setOnbProgressLoadError(
          e instanceof PrivateStoreError
            ? e.message
            : "進捗の読み込みに失敗しました"
        );
      });
    // 当番候補 = プロフィール登録者 ∪ スタッフ名簿（thanks の宛先候補と同じ流儀・正規化名で重複除去）
    Promise.all([
      loadProfilesIndex().catch(() => []),
      loadStaffMembers().catch(() => []),
    ])
      .then(([profiles, members]) => {
        const seen = new Set<string>();
        const out: ChoreiMember[] = [];
        for (const p of profiles) {
          const name = (p.name ?? "").trim();
          const key = normalizeThankyouName(name);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          out.push({ staffId: p.userId, name });
        }
        for (const raw of members) {
          const name = (raw ?? "").trim();
          const key = normalizeThankyouName(name);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          out.push({ staffId: "", name }); // 名簿のみの人は staffId 空（承認済み）
        }
        setChoreiCandidates(out);
      })
      .catch(() => {});
    loadWeeklyQuestions()
      .then((d) => setPool(d.pool))
      .catch(() => {})
      .finally(() => setPoolLoaded(true));
    loadQuestionSchedule()
      .then((s) => {
        setSchedule(s);
        setIntervalDraft(s?.interval ?? "weekly");
      })
      .catch(() => {})
      .finally(() => setScheduleLoaded(true));
    loadClinicMetrics()
      .then(setMetrics)
      .catch(() => setMetrics(emptyClinicMetrics()));
  }, []);

  // 配信間隔の保存（指示書75）。
  // - 間隔が実際に変わった場合のみアンカーを現在時刻に更新し、その場で新しい質問へ切替。
  // - 同じ間隔のまま再保存してもアンカーは維持（誤操作で質問が飛ばない）。
  // - 未設定環境で「毎週」をそのまま保存する場合は今週の月曜をアンカーにし、
  //   期間キーが従来の週キーと一致するようにする（保存起因の切替なし）。
  const handleSaveSchedule = async () => {
    if (savingSchedule) return;
    const effectivePrev = schedule?.interval ?? "weekly";
    const changed = intervalDraft !== effectivePrev;
    if (changed) {
      const msg =
        intervalDraft === "off"
          ? "停止すると、ホームの質問セクションが非表示になります（アーカイブは残ります）。よろしいですか？"
          : "保存すると新しい質問に切り替わります。よろしいですか？";
      if (!confirm(msg)) return;
    }
    setSavingSchedule(true);
    const next: QuestionSchedule = changed
      ? { interval: intervalDraft, anchorAt: new Date().toISOString() }
      : (schedule ?? { interval: "weekly", anchorAt: legacyWeeklyAnchorIso() });
    const ok = await saveQuestionSchedule(next);
    if (!ok) {
      setSavingSchedule(false);
      flash("⚠ 配信間隔の保存に失敗しました");
      return;
    }
    // 間隔が変わったときはその場で新しい質問に切り替える（停止時は切替不要）
    let switched = false;
    if (changed && next.interval !== "off") {
      const fresh = await loadWeeklyQuestions().catch(() => null);
      if (fresh) {
        const rotated = advanceToNewPeriod(fresh, currentPeriodKey(next));
        if (rotated) {
          switched = await saveWeeklyQuestions(rotated).catch(() => false);
        }
      }
    }
    setSchedule(next);
    setSavingSchedule(false);
    if (!changed) flash("💾 配信間隔を保存しました（変更はありません）");
    else if (next.interval === "off")
      flash("💾 配信を停止しました（ホームに表示されません）");
    else if (switched) flash("💾 配信間隔を保存し、新しい質問に切り替えました");
    else flash("💾 配信間隔を保存しました");
  };

  // 配信間隔の現在状態（表示用）
  const currentIntervalKey = schedule?.interval ?? "weekly";
  const currentIntervalLabel =
    QUESTION_INTERVAL_META.find((m) => m.key === currentIntervalKey)?.label ??
    "毎週";
  const nextSwitchMs =
    currentIntervalKey === "off" ? null : nextSwitchDayMs(schedule);

  const handleToggleFeature = async (
    key: keyof PortalFeatures,
    on: boolean
  ) => {
    if (savingFeatures) return;
    const prev = features;
    const next = { ...features, [key]: on };
    setFeatures(next);
    setSavingFeatures(true);
    const ok = await savePortalFeatures(next);
    setSavingFeatures(false);
    if (!ok) {
      setFeatures(prev);
      flash("⚠ 機能スイッチの保存に失敗しました");
      return;
    }
    const label =
      PORTAL_FEATURE_META.find((m) => m.key === key)?.label ?? String(key);
    flash(on ? `💾 ${label} をONにしました` : `💾 ${label} をOFFにしました`);
  };

  // 機能の表示設定（指示書103）: 楽観更新＋丸ごと保存（updatedAt はlib側で現在時刻に更新）
  const handleToggleFlag = async (id: FeatureId, on: boolean) => {
    if (savingFlags) return;
    const prev = featureFlags;
    const next = { ...featureFlags, [id]: on };
    setFeatureFlags(next);
    setSavingFlags(true);
    const ok = await saveFeatureFlags(next);
    setSavingFlags(false);
    if (!ok) {
      setFeatureFlags(prev);
      flash("⚠ 機能の表示設定の保存に失敗しました");
      return;
    }
    const label = FEATURE_META.find((m) => m.id === id)?.label ?? String(id);
    flash(
      on
        ? `💾 ${label} を表示（ON）にしました`
        : `💾 ${label} を非表示（OFF）にしました`
    );
  };

  const movePoolItem = (index: number, dir: -1 | 1) =>
    setPool((ps) => {
      const to = index + dir;
      if (to < 0 || to >= ps.length) return ps;
      const next = [...ps];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const addPoolItem = () => {
    const q = newPoolQuestion.trim();
    if (!q) return;
    setPool((ps) => [...ps, q]);
    setNewPoolQuestion("");
  };

  const removePoolItem = (index: number) =>
    setPool((ps) => ps.filter((_, i) => i !== index));

  // プール保存: 最新の weekly_questions を読み直し、pool だけ差し替える
  // （回答・questionByWeek 等は触らない。currentIndex は範囲内にクランプ）
  const handleSavePool = async () => {
    if (savingPool) return;
    setSavingPool(true);
    const fresh = await loadWeeklyQuestions().catch(() => null);
    if (!fresh) {
      setSavingPool(false);
      flash("⚠ 質問プールの保存に失敗しました（読み込みエラー）");
      return;
    }
    const cleaned = pool.map((q) => q.trim()).filter(Boolean);
    const next = {
      ...fresh,
      pool: cleaned,
      currentIndex:
        cleaned.length > 0 ? fresh.currentIndex % cleaned.length : 0,
    };
    const ok = await saveWeeklyQuestions(next);
    setSavingPool(false);
    if (!ok) {
      flash("⚠ 質問プールの保存に失敗しました");
      return;
    }
    setPool(cleaned);
    flash("💾 質問プールを保存しました");
  };

  // ─── 📈 クリニックの歩み（指示書80） ───
  const parseNumOrNull = (s: string): number | null => {
    if (s.trim() === "") return null;
    const n = Math.round(Number(s));
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const addMetricMonth = () => {
    if (!metrics) return;
    const ym = newMonth.ym;
    if (!/^\d{4}-\d{2}$/.test(ym)) {
      flash("⚠ 年月を選択してください");
      return;
    }
    if (metrics.months.some((m) => m.ym === ym)) {
      flash("⚠ 同じ年月が既にあります");
      return;
    }
    setMetrics({
      ...metrics,
      months: [
        ...metrics.months,
        {
          ym,
          insurance: parseNumOrNull(newMonth.insurance),
          selfPay: parseNumOrNull(newMonth.selfPay),
          counseling: parseNumOrNull(newMonth.counseling),
        },
      ].sort((a, b) => a.ym.localeCompare(b.ym)),
    });
    setNewMonth({ ym: "", insurance: "", selfPay: "", counseling: "" });
  };

  const updateMonth = (
    ym: string,
    field: "insurance" | "selfPay" | "counseling",
    value: string
  ) => {
    if (!metrics) return;
    setMetrics({
      ...metrics,
      months: metrics.months.map((m) =>
        m.ym === ym ? { ...m, [field]: parseNumOrNull(value) } : m
      ),
    });
  };

  const removeMonth = (ym: string) => {
    if (!metrics) return;
    setMetrics({ ...metrics, months: metrics.months.filter((m) => m.ym !== ym) });
  };

  const addInitiative = () => {
    if (!metrics) return;
    const date = newInit.date;
    const endDate = newInit.endDate;
    const label = newInit.label.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      flash("⚠ 施策の開始日を入力してください");
      return;
    }
    if (!label) {
      flash("⚠ 施策ラベルを入力してください");
      return;
    }
    if (endDate && endDate < date) {
      flash("⚠ 終了日は開始日以降にしてください");
      return;
    }
    setMetrics({
      ...metrics,
      initiatives: [
        ...metrics.initiatives,
        {
          id: genInitiativeId(),
          date,
          label,
          ...(endDate ? { endDate } : {}),
        },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    });
    setNewInit({ date: "", endDate: "", label: "" });
  };

  const updateInit = (
    id: string,
    field: "date" | "endDate" | "label",
    value: string
  ) => {
    if (!metrics) return;
    setMetrics({
      ...metrics,
      initiatives: metrics.initiatives.map((it) =>
        it.id === id
          ? field === "endDate"
            ? value
              ? { ...it, endDate: value }
              : (() => {
                  const { endDate: _drop, ...rest } = it;
                  void _drop;
                  return rest;
                })()
            : { ...it, [field]: value }
          : it
      ),
    });
  };

  const removeInit = (id: string) => {
    if (!metrics) return;
    setMetrics({
      ...metrics,
      initiatives: metrics.initiatives.filter((it) => it.id !== id),
    });
  };

  const handleSaveMetrics = async () => {
    if (!metrics || savingMetrics) return;
    setSavingMetrics(true);
    const ok = await saveClinicMetrics(metrics);
    if (ok) {
      const fresh = await loadClinicMetrics().catch(() => null);
      if (fresh) setMetrics(fresh);
    }
    setSavingMetrics(false);
    flash(
      ok
        ? "💾 クリニックの歩みを保存しました"
        : "⚠ 保存に失敗しました（管理者権限をご確認ください）"
    );
  };

  useEffect(() => {
    const fetchAll = async () => {
      // 管理画面を開くたびに期限切れの新着をアーカイブへ移動（冪等）
      await archiveExpiredNews().catch(() => {});
      const [n, na, h, t, p, w, c, layout, tLayout, nlog, rx, tlog] =
        await Promise.all([
        loadPortalItems<NewsItem>(PORTAL_KEYS.news, []),
        loadPortalItems<ArchivedNewsItem>(PORTAL_KEYS.newsArchive, []),
        loadPortalItems<HiyariItem>(PORTAL_KEYS.hiyari, []),
        loadPortalItems<ThankyouItem>(PORTAL_KEYS.thankyou, []),
        loadPortalItems<PolicyItem>(PORTAL_KEYS.policy, []),
        loadTodayWord({
          text: "",
          author: "",
          updatedAt: new Date().toISOString(),
        }),
        loadCharacterSettings(),
        loadPortalItems<HomeSectionConfig>(
          PORTAL_KEYS.homeLayout,
          DEFAULT_HOME_LAYOUT
        ),
        loadPortalItems<TasksSectionConfig>(
          TASKS_PAGE_LAYOUT_KEY,
          DEFAULT_TASKS_LAYOUT
        ),
        loadNewsLog(),
        loadNewsReactions(),
        loadTaskLog(),
      ]);
      setNews(n);
      setNewsArchive(na);
      setHiyari(h);
      setThankyou(t);
      setPolicies(p);
      setTodayWord(w);
      setCharSettings(c);
      setHomeLayout(resolveHomeLayout(layout));
      setTasksLayout(resolveTasksLayout(tLayout));
      setNewsLog(nlog);
      setNewsReactions(rx);
      setTaskLog(tlog);
      setLoading(false);
    };
    fetchAll().catch(() => setLoading(false));
    // 操作ログのactor名: ログイン中ならプロフィール名、未ログインなら「管理者」
    getCurrentActorName()
      .then((name) => {
        if (name) setActorName(name);
      })
      .catch(() => {});
  }, []);

  // 共有ログ・貢献タブの派生データ（データ量はログ最大1,000件・お知らせ数十件程度）
  const contributionRows = aggregateNewsContributions(
    buildNewsHistory(news, newsArchive)
  );
  // 発信者別「もらったリアクション数」（参考情報・指示書37R）
  const reactionsByAuthor = new Map<string, number>();
  for (const item of buildNewsHistory(news, newsArchive)) {
    const author = (item.author ?? "").trim() || "（無記名）";
    reactionsByAuthor.set(
      author,
      (reactionsByAuthor.get(author) ?? 0) +
        totalReactionsOf(newsReactions, item.id)
    );
  }
  const logActors = [...new Set(newsLog.map((l) => l.actor))].sort((a, b) =>
    a.localeCompare(b, "ja")
  );
  const filteredLog = newsLog
    .filter((l) => {
      if (logAction !== "all" && l.action !== logAction) return false;
      if (logActor !== "all" && l.actor !== logActor) return false;
      const kw = logKeyword.trim().toLowerCase();
      if (
        kw &&
        !`${l.newsTitle} ${l.actor} ${l.detail ?? ""}`
          .toLowerCase()
          .includes(kw)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  // タスク操作ログの派生データ（指示書56。ニュースの操作ログと同じパターン）
  const taskLogActors = [...new Set(taskLog.map((l) => l.actor))].sort((a, b) =>
    a.localeCompare(b, "ja")
  );
  const filteredTaskLog = taskLog
    .filter((l) => {
      if (taskLogAction !== "all" && l.action !== taskLogAction) return false;
      if (taskLogActor !== "all" && l.actor !== taskLogActor) return false;
      const kw = taskLogKeyword.trim().toLowerCase();
      if (
        kw &&
        !`${l.taskTitle} ${l.actor} ${l.detail ?? ""}`
          .toLowerCase()
          .includes(kw)
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1));

  // 操作ログを追記し、画面上のログ一覧にも即時反映する（ログ失敗は本体処理を妨げない）
  const trackNewsLog = async (input: NewsLogInput) => {
    await appendNewsLog(input).catch(() => {});
    setNewsLog((prev) =>
      [
        {
          ...input,
          id: `nlog_local_${Date.now()}`,
          at: new Date().toISOString(),
        },
        ...prev,
      ].slice(0, 1000)
    );
  };

  // ─────────────────────────────────────
  // ホーム画面レイアウト（並び順・表示/非表示）
  // ※ 並び替え操作自体は SectionLayoutEditor 内で処理
  // ─────────────────────────────────────
  const handleSaveLayout = async () => {
    setSavingLayout(true);
    const normalized = homeLayout.map((s, i) => ({ ...s, order: i }));
    const ok = await savePortalItems(PORTAL_KEYS.homeLayout, normalized);
    setSavingLayout(false);
    if (ok) {
      setHomeLayout(normalized);
      flash("💾 レイアウトを保存しました");
    } else {
      alert("保存に失敗しました");
    }
  };

  const handleReloadSavedLayout = async () => {
    const layout = await loadPortalItems<HomeSectionConfig>(
      PORTAL_KEYS.homeLayout,
      DEFAULT_HOME_LAYOUT
    );
    setHomeLayout(resolveHomeLayout(layout));
    flash("🔄 保存済みの並びを読み込みました");
  };

  const handleResetLayoutToDefault = () => {
    setHomeLayout(DEFAULT_HOME_LAYOUT);
  };

  // ─────────────────────────────────────
  // みんなのタスク（/tasks）レイアウト
  // ─────────────────────────────────────
  const handleSaveTasksLayout = async () => {
    setSavingTasksLayout(true);
    const normalized = tasksLayout.map((s, i) => ({ ...s, order: i }));
    const ok = await savePortalItems(TASKS_PAGE_LAYOUT_KEY, normalized);
    setSavingTasksLayout(false);
    if (ok) {
      setTasksLayout(normalized);
      flash("💾 みんなのタスクの並びを保存しました");
    } else {
      alert("保存に失敗しました");
    }
  };

  const handleReloadSavedTasksLayout = async () => {
    const layout = await loadPortalItems<TasksSectionConfig>(
      TASKS_PAGE_LAYOUT_KEY,
      DEFAULT_TASKS_LAYOUT
    );
    setTasksLayout(resolveTasksLayout(layout));
    flash("🔄 保存済みの並びを読み込みました");
  };

  const handleResetTasksLayoutToDefault = () => {
    setTasksLayout(DEFAULT_TASKS_LAYOUT);
  };

  // 追加フォームの通知期限を「現在 + newsNoticeDays日」でプリフィル（未入力時のみ）
  useEffect(() => {
    if (loading) return;
    setNewsForm((f) =>
      f.noticeUntil
        ? f
        : { ...f, noticeUntil: defaultNoticeLocal(charSettings.newsNoticeDays) }
    );
  }, [loading, charSettings.newsNoticeDays]);

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 3000);
  };

  // ─────────────────────────────────────
  // 新着情報
  // ─────────────────────────────────────
  const handleAddNews = async () => {
    if (!newsForm.title.trim()) return;
    setSaving(true);
    const item: NewsItem = {
      // eslint-disable-next-line react-hooks/purity -- 送信ボタン押下時のみ実行される既存のID採番（レンダー中には呼ばれない）
      id: `news_${Date.now()}`,
      title: newsForm.title.trim(),
      category: newsForm.category,
      urgency: newsForm.urgency,
      author: newsForm.author.trim() || "管理者",
      content: newsForm.content.trim(),
      createdAt: new Date().toISOString(),
      isActive: newsForm.isActive,
      noticeUntil: datetimeLocalToIso(newsForm.noticeUntil),
      character: newsForm.character,
    };
    const next = [item, ...news];
    const ok = await savePortalItems(PORTAL_KEYS.news, next);
    setSaving(false);
    if (ok) {
      setNews(next);
      await trackNewsLog({
        action: "create",
        newsId: item.id,
        newsTitle: item.title,
        actor: actorName,
        source: "admin",
      });
      setNewsForm({
        title: "",
        category: "notice",
        urgency: "normal",
        author: "管理者",
        content: "",
        isActive: true,
        noticeUntil: defaultNoticeLocal(charSettings.newsNoticeDays),
        character: undefined,
      });
      flash("💾 追加しました");
    } else {
      alert("保存に失敗しました");
    }
  };

  const updateNewsItem = async (id: string, patch: Partial<NewsItem>) => {
    setSaving(true);
    const before = news.find((n) => n.id === id);
    const next = news.map((n) => (n.id === id ? { ...n, ...patch } : n));
    const ok = await savePortalItems(PORTAL_KEYS.news, next);
    setSaving(false);
    if (ok) {
      setNews(next);
      await trackNewsLog({
        action: "update",
        newsId: id,
        newsTitle: (patch.title ?? before?.title ?? "").toString(),
        actor: actorName,
        source: "admin",
        detail: buildNewsUpdateDetail(before, patch),
      });
      flash("💾 更新しました");
    }
  };

  const deleteNewsItem = async (id: string) => {
    if (!confirm("この新着情報を削除しますか？")) return;
    setSaving(true);
    const target = news.find((n) => n.id === id);
    const next = news.filter((n) => n.id !== id);
    const ok = await savePortalItems(PORTAL_KEYS.news, next);
    setSaving(false);
    if (ok) {
      setNews(next);
      await trackNewsLog({
        action: "delete",
        newsId: id,
        newsTitle: target?.title ?? "",
        actor: actorName,
        source: "admin",
      });
      flash("🗑️ 削除しました");
    }
  };

  // ─────────────────────────────────────
  // アーカイブ（期限切れ）
  // ─────────────────────────────────────
  // portal_news へ戻す。期限切れのままだと次回アーカイブ処理で即座に
  // 再アーカイブされるため、期限切れの場合は 現在+newsNoticeDays日 に更新する
  // （必要ならこの後 news 一覧で通知期限を編集できる）。
  const restoreArchivedNews = async (id: string) => {
    const item = newsArchive.find((a) => a.id === id);
    if (!item) return;
    setSaving(true);
    const rest: NewsItem = {
      id: item.id,
      title: item.title,
      category: item.category,
      author: item.author,
      content: item.content,
      createdAt: item.createdAt,
      isActive: item.isActive,
      noticeUntil: item.noticeUntil,
      character: item.character,
      urgency: item.urgency,
    };
    const days = charSettings.newsNoticeDays ?? DEFAULT_CHARACTER_SETTINGS.newsNoticeDays;
    const restored: NewsItem = isNewsExpired(rest, days)
      ? { ...rest, noticeUntil: datetimeLocalToIso(defaultNoticeLocal(days)) }
      : rest;
    const nextNews = [restored, ...news];
    const nextArchive = newsArchive.filter((a) => a.id !== id);
    const [okNews, okArchive] = await Promise.all([
      savePortalItems(PORTAL_KEYS.news, nextNews),
      savePortalItems(PORTAL_KEYS.newsArchive, nextArchive),
    ]);
    setSaving(false);
    if (okNews && okArchive) {
      setNews(nextNews);
      setNewsArchive(nextArchive);
      await trackNewsLog({
        action: "restore",
        newsId: restored.id,
        newsTitle: restored.title,
        actor: actorName,
        source: "admin",
      });
      flash("↩️ 復元しました");
    }
  };

  const deleteArchivedNewsForever = async (id: string) => {
    if (!confirm("このお知らせを完全に削除しますか？（元に戻せません）")) return;
    setSaving(true);
    const target = newsArchive.find((a) => a.id === id);
    const next = newsArchive.filter((a) => a.id !== id);
    const ok = await savePortalItems(PORTAL_KEYS.newsArchive, next);
    setSaving(false);
    if (ok) {
      setNewsArchive(next);
      // リアクションデータの後始末（肥大化対策・失敗しても削除自体は成立）
      try {
        const rx = await loadNewsReactions();
        if (rx[id]) {
          const nextRx = { ...rx };
          delete nextRx[id];
          if (await saveNewsReactions(nextRx)) setNewsReactions(nextRx);
        }
      } catch {
        // 後始末失敗は無視（次回の完全削除時などに残っていても実害なし）
      }
      await trackNewsLog({
        action: "delete",
        newsId: id,
        newsTitle: target?.title ?? "",
        actor: actorName,
        source: "admin",
        detail: "アーカイブから完全削除",
      });
      flash("🗑️ 完全に削除しました");
    }
  };

  // ─────────────────────────────────────
  // 気づきシェア
  // ─────────────────────────────────────
  const deleteHiyari = async (id: string) => {
    if (!confirm("この投稿を削除しますか？")) return;
    setSaving(true);
    const next = hiyari.filter((h) => h.id !== id);
    const ok = await savePortalItems(PORTAL_KEYS.hiyari, next);
    setSaving(false);
    if (ok) {
      setHiyari(next);
      flash("🗑️ 削除しました");
    }
  };

  // ─────────────────────────────────────
  // 日々の気づき（kizuki_posts・指示書104）: 論理削除・復元
  // ─────────────────────────────────────
  const setKizukiDeleted = async (id: string, deleted: boolean) => {
    if (busyKizukiId) return;
    if (deleted && !confirm("この投稿を削除しますか？（あとで復元できます）")) {
      return;
    }
    setBusyKizukiId(id);
    // 並行更新に強いよう最新を読み直してから適用（他ハンドラと同じ read-modify-write）
    const store = await loadKizukiStore().catch(() => null);
    const base = store ? store.posts : kizukiPosts;
    const next = base.map((p) =>
      p.id === id ? { ...p, deleted, updatedAt: new Date().toISOString() } : p
    );
    const ok = await saveKizukiStore(next);
    setBusyKizukiId(null);
    if (ok) {
      setKizukiPosts(next);
      flash(deleted ? "🗑️ 削除しました（復元できます）" : "♻️ 復元しました");
    } else {
      flash("⚠ 保存に失敗しました");
    }
  };

  // ─────────────────────────────────────
  // ヒヤリハット報告（hiyari_reports・指示書106）: 論理削除・復元
  // ─────────────────────────────────────
  const setHiyariReportDeleted = async (id: string, deleted: boolean) => {
    if (busyHiyariReportId) return;
    if (deleted && !confirm("この報告を削除しますか？（あとで復元できます）")) {
      return;
    }
    setBusyHiyariReportId(id);
    const store = await loadHiyariStore().catch(() => null);
    const base = store ? store.posts : hiyariReports;
    const next = base.map((p) =>
      p.id === id ? { ...p, deleted, updatedAt: new Date().toISOString() } : p
    );
    const ok = await saveHiyariStore(next);
    setBusyHiyariReportId(null);
    if (ok) {
      setHiyariReports(next);
      flash(deleted ? "🗑️ 削除しました（復元できます）" : "♻️ 復元しました");
    } else {
      flash("⚠ 保存に失敗しました");
    }
  };

  // ─────────────────────────────────────
  // マニュアル下書き（manual_drafts・指示書107）: 論理削除・復元・資料庫紐付け
  // 運用フロー想定: スタッフが下書き → 院長が内容確認 → 正式マニュアルを作成し
  // 資料庫に登録（従来の資料庫の登録手順） → このタブで下書きに紐付け（📗登録済みにする）
  // ─────────────────────────────────────
  const setManualDraftDeleted = async (id: string, deleted: boolean) => {
    if (busyManualDraftId) return;
    if (deleted && !confirm("この下書きを削除しますか？（あとで復元できます）")) {
      return;
    }
    setBusyManualDraftId(id);
    const store = await loadManualDraftStore().catch(() => null);
    const base = store ? store.posts : manualDrafts;
    const next = base.map((p) =>
      p.id === id ? { ...p, deleted, updatedAt: new Date().toISOString() } : p
    );
    const ok = await saveManualDraftStore(next);
    setBusyManualDraftId(null);
    if (ok) {
      setManualDrafts(next);
      flash(deleted ? "🗑️ 削除しました（復元できます）" : "♻️ 復元しました");
    } else {
      flash("⚠ 保存に失敗しました");
    }
  };

  // 資料選択で status: "registered" ＋ libraryRef を設定（docId 参照方式）
  const registerManualDraft = async (id: string, doc: LibraryDoc) => {
    if (busyManualDraftId) return;
    setBusyManualDraftId(id);
    const store = await loadManualDraftStore().catch(() => null);
    const base = store ? store.posts : manualDrafts;
    const next = base.map((p) =>
      p.id === id
        ? {
            ...p,
            status: "registered" as const,
            libraryRef: { docId: doc.id },
            updatedAt: new Date().toISOString(),
          }
        : p
    );
    const ok = await saveManualDraftStore(next);
    setBusyManualDraftId(null);
    if (ok) {
      setManualDrafts(next);
      setLinkTargetId(null);
      flash(`📗 「${doc.title}」に紐付けて登録済みにしました`);
    } else {
      flash("⚠ 保存に失敗しました");
    }
  };

  // 執筆中に戻す（libraryRef はフィールドごと除去）
  const unregisterManualDraft = async (id: string) => {
    if (busyManualDraftId) return;
    setBusyManualDraftId(id);
    const store = await loadManualDraftStore().catch(() => null);
    const base = store ? store.posts : manualDrafts;
    const next = base.map((p) => {
      if (p.id !== id) return p;
      const { libraryRef: _drop, ...rest } = p;
      return {
        ...rest,
        status: "draft" as const,
        updatedAt: new Date().toISOString(),
      };
    });
    const ok = await saveManualDraftStore(next);
    setBusyManualDraftId(null);
    if (ok) {
      setManualDrafts(next);
      flash("✏️ 執筆中に戻しました");
    } else {
      flash("⚠ 保存に失敗しました");
    }
  };

  // ─────────────────────────────────────
  // 自己評価シート（private_store self_review・指示書111）: 評価期設定・提出一覧・差し戻し
  // ─────────────────────────────────────
  const handleSaveSrConfig = async () => {
    const currentPeriod = srPeriodDraft.trim();
    if (!RECORD_KEY_RE.test(currentPeriod)) {
      flash("⚠ 評価期は英数・ハイフン・ドット・アンダースコア（64字まで）で入力してください");
      return;
    }
    setSavingSrConfig(true);
    const next: SelfReviewConfig = {
      currentPeriod,
      label: srLabelDraft.trim() || currentPeriod,
    };
    const ok = await saveSelfReviewConfig(next);
    setSavingSrConfig(false);
    if (ok) {
      setSrConfig(next);
      flash("💾 評価期を保存しました");
    } else {
      flash("⚠ 評価期の保存に失敗しました");
    }
  };

  // 差し戻し: status を draft に戻す（他フィールドは保持・管理者PUT・owner指定）
  const returnSelfReview = async (record: PrivateRecord) => {
    if (busySelfReviewId) return;
    const data = normalizeSelfReviewData(record.data);
    const name = data.name || "このスタッフ";
    if (
      !confirm(
        `${name}さんの自己評価シートを差し戻しますか？（下書きに戻り、本人が再編集できるようになります）`
      )
    ) {
      return;
    }
    setBusySelfReviewId(record.id);
    try {
      await upsertPrivateRecord(
        "self_review",
        record.recordKey,
        { ...data, status: "draft" },
        record.ownerId
      );
      const records = await listAllPrivate("self_review");
      setSelfReviews(records);
      flash("↩ 差し戻しました（本人が再編集できます）");
    } catch (e) {
      flash(
        e instanceof PrivateStoreError
          ? `⚠ ${e.message}`
          : "⚠ 差し戻しに失敗しました"
      );
    } finally {
      setBusySelfReviewId(null);
    }
  };

  // ─────────────────────────────────────
  // 1on1ノート（private_store one_on_one・指示書112）: 全件閲覧・物理削除
  // ─────────────────────────────────────
  const deleteOneOnOne = async (record: PrivateRecord) => {
    if (busyOneOnOneId) return;
    const d = normalizeOneOnOneData(record.data);
    if (
      !confirm(
        `${d.authorName || "名前未設定"}さんの1on1記録（${d.heldOn}）を削除しますか？（削除すると元に戻せません）`
      )
    ) {
      return;
    }
    setBusyOneOnOneId(record.id);
    try {
      await deletePrivateRecord("one_on_one", record.recordKey, record.ownerId);
      setOneOnOnes((prev) => prev.filter((r) => r.id !== record.id));
      flash("🗑️ 削除しました");
    } catch (e) {
      flash(
        e instanceof PrivateStoreError ? `⚠ ${e.message}` : "⚠ 削除に失敗しました"
      );
    } finally {
      setBusyOneOnOneId(null);
    }
  };

  // ─────────────────────────────────────
  // オンボーディング（指示書113）: テンプレ2階層編集（ローカル編集→丸ごと保存）・進捗削除
  // ─────────────────────────────────────
  // 並べ替えヘルパ（質問プール movePoolItem と同型・隣接swap）。セクション/項目の両階層で共用
  const moveInArray = <T,>(arr: T[], index: number, dir: -1 | 1): T[] => {
    const to = index + dir;
    if (to < 0 || to >= arr.length) return arr;
    const next = [...arr];
    [next[index], next[to]] = [next[to], next[index]];
    return next;
  };

  const mutateOnbSections = (
    fn: (sections: OnboardingSection[]) => OnboardingSection[]
  ) => setOnbTemplate((t) => ({ ...t, sections: fn(t.sections) }));

  const addOnbSection = () => {
    const title = newOnbSectionTitle.trim();
    if (!title) return;
    // id は不変ID（改名しても変わらない。項目のチェックが id に紐づくため）
    mutateOnbSections((ss) => [
      ...ss,
      { id: genOnboardingId(), title, items: [] },
    ]);
    setNewOnbSectionTitle("");
  };

  const renameOnbSection = (sectionId: string, title: string) =>
    mutateOnbSections((ss) =>
      ss.map((s) => (s.id === sectionId ? { ...s, title } : s))
    );

  const removeOnbSection = (sectionId: string) => {
    const sec = onbTemplate.sections.find((s) => s.id === sectionId);
    if (
      sec &&
      sec.items.length > 0 &&
      !confirm(
        `「${sec.title || "無題のセクション"}」を項目${sec.items.length}件ごと削除しますか？（保存すると反映されます）`
      )
    ) {
      return;
    }
    mutateOnbSections((ss) => ss.filter((s) => s.id !== sectionId));
  };

  const addOnbItem = (sectionId: string) => {
    const label = (newOnbItemLabels[sectionId] ?? "").trim();
    if (!label) return;
    mutateOnbSections((ss) =>
      ss.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: [
                ...s.items,
                { id: genOnboardingId(), label, note: "", docId: "" },
              ],
            }
          : s
      )
    );
    setNewOnbItemLabels((m) => ({ ...m, [sectionId]: "" }));
  };

  // ラベル・補足・資料紐付けの編集（id は触らない＝チェックが外れない）
  const updateOnbItem = (
    sectionId: string,
    itemId: string,
    patch: Partial<Pick<OnboardingItem, "label" | "note" | "docId">>
  ) =>
    mutateOnbSections((ss) =>
      ss.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              items: s.items.map((it) =>
                it.id === itemId ? { ...it, ...patch } : it
              ),
            }
          : s
      )
    );

  const moveOnbItem = (sectionId: string, index: number, dir: -1 | 1) =>
    mutateOnbSections((ss) =>
      ss.map((s) =>
        s.id === sectionId ? { ...s, items: moveInArray(s.items, index, dir) } : s
      )
    );

  const removeOnbItem = (sectionId: string, itemId: string) =>
    mutateOnbSections((ss) =>
      ss.map((s) =>
        s.id === sectionId
          ? { ...s, items: s.items.filter((it) => it.id !== itemId) }
          : s
      )
    );

  const handleSaveOnbTemplate = async () => {
    if (savingOnb) return;
    setSavingOnb(true);
    const ok = await saveOnboardingTemplate(onbTemplate);
    setSavingOnb(false);
    flash(ok ? "💾 チェックリストを保存しました" : "⚠ 保存に失敗しました");
  };

  // 進捗一覧の氏名解決（selfReview と同じ流儀: プロフィール∪名簿の候補から ownerId で解決）
  const onbOwnerName = (ownerId: string): string =>
    choreiCandidates.find((c) => c.staffId === ownerId)?.name || "名前未設定";

  // 進捗の削除（退職者整理用・確認付き物理削除）
  const deleteOnbProgress = async (record: PrivateRecord) => {
    if (busyOnbProgressId) return;
    if (
      !confirm(
        `${onbOwnerName(record.ownerId)}さんのチェック進捗を削除しますか？（退職者の整理用です。削除すると元に戻せません）`
      )
    ) {
      return;
    }
    setBusyOnbProgressId(record.id);
    try {
      await deletePrivateRecord("onboarding", record.recordKey, record.ownerId);
      setOnbProgressList((prev) => prev.filter((r) => r.id !== record.id));
      flash("🗑️ 削除しました");
    } catch (e) {
      flash(
        e instanceof PrivateStoreError ? `⚠ ${e.message}` : "⚠ 削除に失敗しました"
      );
    } finally {
      setBusyOnbProgressId(null);
    }
  };

  // ─────────────────────────────────────
  // 勉強会アーカイブ（benkyokai_posts・指示書109）: 論理削除・復元・紐付け編集（全投稿対象）
  // ─────────────────────────────────────
  const mutateBenkyokai = async (
    fn: (posts: BenkyokaiPost[]) => BenkyokaiPost[],
    okMsg: string,
    id: string
  ) => {
    if (busyBenkyokaiId) return;
    setBusyBenkyokaiId(id);
    const store = await loadBenkyokaiStore().catch(() => null);
    const base = store ? store.posts : benkyokaiPosts;
    const next = fn(base);
    const ok = await saveBenkyokaiStore(next);
    setBusyBenkyokaiId(null);
    if (ok) {
      setBenkyokaiPosts(next);
      flash(okMsg);
    } else {
      flash("⚠ 保存に失敗しました");
    }
  };

  const setBenkyokaiDeleted = (id: string, deleted: boolean) => {
    if (deleted && !confirm("この記録を削除しますか？（あとで復元できます）")) {
      return;
    }
    mutateBenkyokai(
      (posts) =>
        posts.map((p) =>
          p.id === id
            ? { ...p, deleted, updatedAt: new Date().toISOString() }
            : p
        ),
      deleted ? "🗑️ 削除しました（復元できます）" : "♻️ 復元しました",
      id
    );
  };

  const benkyokaiAddRef = (id: string, doc: LibraryDoc) =>
    mutateBenkyokai(
      (posts) =>
        posts.map((p) =>
          p.id === id
            ? {
                ...p,
                libraryRefs: normalizeLibraryRefs([
                  ...p.libraryRefs,
                  { docId: doc.id },
                ]),
                updatedAt: new Date().toISOString(),
              }
            : p
        ),
      `📎 「${doc.title}」を紐付けました`,
      id
    );

  const benkyokaiRemoveRef = (id: string, docId: string) =>
    mutateBenkyokai(
      (posts) =>
        posts.map((p) =>
          p.id === id
            ? {
                ...p,
                libraryRefs: p.libraryRefs.filter((r) => r.docId !== docId),
                updatedAt: new Date().toISOString(),
              }
            : p
        ),
      "📎 紐付けを外しました",
      id
    );

  // ─────────────────────────────────────
  // 朝礼サポート（chorei_data・指示書108）: 輪番編集・手動操作・投稿の論理削除/復元
  // ─────────────────────────────────────
  // 最新データを読み直して変換を適用し保存（輪番と投稿の同居キーを1回で更新）
  const mutateChorei = async (
    fn: (rotation: ChoreiRotation, posts: ChoreiPost[]) => {
      rotation: ChoreiRotation;
      posts: ChoreiPost[];
    },
    okMsg: string
  ) => {
    if (busyChorei) return;
    setBusyChorei(true);
    const data = await loadChoreiData().catch(() => null);
    const base = data ?? { rotation: choreiRotation, posts: choreiPosts };
    const next = fn(base.rotation, base.posts);
    const ok = await saveChoreiData(next);
    setBusyChorei(false);
    if (ok) {
      setChoreiRotation(next.rotation);
      setChoreiPosts(next.posts);
      flash(okMsg);
    } else {
      flash("⚠ 保存に失敗しました");
    }
  };

  // 当番順の編集（追加・↑↓・削除）。ポインタは applyOrderEdit が現在当番に追随させる
  const editChoreiOrder = (
    edit: (order: ChoreiMember[]) => ChoreiMember[],
    okMsg: string
  ) =>
    mutateChorei(
      (rotation, posts) => ({
        rotation: applyOrderEdit(rotation, edit(rotation.order)),
        posts,
      }),
      okMsg
    );

  const choreiMemberKey = (m: ChoreiMember) =>
    m.staffId || `name:${normalizeThankyouName(m.name)}`;

  const addChoreiMember = (m: ChoreiMember) =>
    editChoreiOrder(
      (order) =>
        order.some((x) => choreiMemberKey(x) === choreiMemberKey(m))
          ? order
          : [...order, m],
      `➕ ${m.name}さんを当番順に追加しました`
    );

  const moveChoreiMember = (index: number, dir: -1 | 1) =>
    editChoreiOrder((order) => {
      const to = index + dir;
      if (to < 0 || to >= order.length) return order;
      const next = [...order];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    }, "💾 並び順を変更しました");

  const removeChoreiMember = (index: number) =>
    editChoreiOrder(
      (order) => order.filter((_, i) => i !== index),
      "🗑️ 当番順から外しました"
    );

  // ⏭ 次へ送る（ポインタ前進のみ・投稿なし）
  const advanceChorei = () =>
    mutateChorei(
      (rotation, posts) => ({ rotation: advancePointer(rotation), posts }),
      "⏭ 当番を次へ送りました"
    );

  // この人を当番にする（任意位置へジャンプ）
  const jumpChorei = (index: number, name: string) =>
    mutateChorei(
      (rotation, posts) => ({ rotation: setPointer(rotation, index), posts }),
      `🎤 ${name}さんを当番にしました`
    );

  // 投稿の論理削除/復元（ポインタは巻き戻さない＝rotation はそのまま）
  const setChoreiPostDeleted = (id: string, deleted: boolean) => {
    if (
      deleted &&
      !confirm("この記録を削除しますか？（あとで復元できます。当番は巻き戻りません）")
    ) {
      return;
    }
    mutateChorei(
      (rotation, posts) => ({
        rotation,
        posts: posts.map((p) =>
          p.id === id
            ? { ...p, deleted, updatedAt: new Date().toISOString() }
            : p
        ),
      }),
      deleted ? "🗑️ 削除しました（復元できます）" : "♻️ 復元しました"
    );
  };

  // ─────────────────────────────────────
  // ありがとうカード
  // ─────────────────────────────────────
  // 指示書105: 物理削除から論理削除に変更（deleted: true・復元可）。
  // ホーム/profile/専用ページの表示側は deleted を除外する。
  const setThankyouDeleted = async (id: string, deleted: boolean) => {
    if (deleted && !confirm("このカードを削除しますか？（あとで復元できます）")) {
      return;
    }
    setSaving(true);
    const next = thankyou.map((t) => (t.id === id ? { ...t, deleted } : t));
    const ok = await savePortalItems(PORTAL_KEYS.thankyou, next);
    setSaving(false);
    if (ok) {
      setThankyou(next);
      flash(deleted ? "🗑️ 削除しました（復元できます）" : "♻️ 復元しました");
    }
  };

  // ─────────────────────────────────────
  // 経営方針
  // ─────────────────────────────────────
  const resetPolicyForm = () => {
    setPolicyForm({
      id: "",
      year: new Date().getFullYear(),
      purpose: "",
      mission: "",
      vision: "",
      value: "",
      fullText: "",
      isActive: false,
    });
    setEditingPolicyId(null);
  };

  const handleSavePolicy = async () => {
    if (!policyForm.purpose.trim()) {
      alert("パーパスは必須です");
      return;
    }
    setSaving(true);
    let next: PolicyItem[];
    if (editingPolicyId) {
      // 編集
      next = policies.map((p) =>
        p.id === editingPolicyId
          ? { ...policyForm, id: editingPolicyId }
          : policyForm.isActive
          ? { ...p, isActive: false }
          : p
      );
    } else {
      // 新規追加
      // eslint-disable-next-line react-hooks/purity -- 保存ボタン押下時のみ実行される既存のID採番（レンダー中には呼ばれない）
      const id = `policy_${policyForm.year}_${Date.now()}`;
      const newItem: PolicyItem = { ...policyForm, id };
      next = policyForm.isActive
        ? [newItem, ...policies.map((p) => ({ ...p, isActive: false }))]
        : [newItem, ...policies];
    }
    const ok = await savePortalItems(PORTAL_KEYS.policy, next);
    setSaving(false);
    if (ok) {
      setPolicies(next);
      resetPolicyForm();
      flash("💾 保存しました");
    } else {
      alert("保存に失敗しました");
    }
  };

  const handleEditPolicy = (p: PolicyItem) => {
    setPolicyForm(p);
    setEditingPolicyId(p.id);
  };

  const handleDeletePolicy = async (id: string) => {
    if (!confirm("この経営方針を削除しますか？")) return;
    setSaving(true);
    const next = policies.filter((p) => p.id !== id);
    const ok = await savePortalItems(PORTAL_KEYS.policy, next);
    setSaving(false);
    if (ok) {
      setPolicies(next);
      if (editingPolicyId === id) resetPolicyForm();
      flash("🗑️ 削除しました");
    }
  };

  const handleSetActivePolicy = async (id: string) => {
    setSaving(true);
    const next = policies.map((p) => ({ ...p, isActive: p.id === id }));
    const ok = await savePortalItems(PORTAL_KEYS.policy, next);
    setSaving(false);
    if (ok) {
      setPolicies(next);
      flash("✅ アクティブな年度を更新しました");
    }
  };

  // ─────────────────────────────────────
  // 今日の一言
  // ─────────────────────────────────────
  const handleSaveTodayWord = async () => {
    if (!todayWord.text.trim()) return;
    setSaving(true);
    const next: TodayWord = {
      ...todayWord,
      updatedAt: new Date().toISOString(),
    };
    const ok = await saveTodayWord(next);
    setSaving(false);
    if (ok) {
      setTodayWord(next);
      flash("💾 更新しました");
    } else {
      alert("保存に失敗しました");
    }
  };

  // ─────────────────────────────────────
  // キャラクター通知設定
  // ─────────────────────────────────────
  const handleSaveCharSettings = async () => {
    setSavingChar(true);
    const ok = await saveCharacterSettings(charSettings);
    setSavingChar(false);
    if (ok) {
      flash("✅ キャラクター設定を保存しました");
    } else {
      alert("保存に失敗しました");
    }
  };

  // ─────────────────────────────────────
  // 共有履歴（現行＋アーカイブの統合ビュー。データの持ち方は変えない）
  // ─────────────────────────────────────
  const newsHistoryAll = buildNewsHistory(news, newsArchive);
  const newsHistoryFiltered = filterNewsHistory(newsHistoryAll, {
    keyword: historyKeyword,
    category: historyCategory,
    urgency: historyUrgency,
    status: historyStatus,
    dateFrom: historyFrom,
    dateTo: historyTo,
  });
  const newsHistoryGroups = groupNewsHistory(newsHistoryFiltered, historyAxis);
  const historyFilterActive =
    historyKeyword.trim() !== "" ||
    historyCategory !== "all" ||
    historyUrgency !== "all" ||
    historyStatus !== "all" ||
    historyFrom !== "" ||
    historyTo !== "";

  const resetHistoryFilters = () => {
    setHistoryKeyword("");
    setHistoryCategory("all");
    setHistoryUrgency("all");
    setHistoryStatus("all");
    setHistoryFrom("");
    setHistoryTo("");
  };

  if (loading) {
    return (
      <p className="text-sm text-slate-600 animate-pulse">読み込み中...</p>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏠 ポータル管理</h1>
          <p className="text-sm text-gray-600 mt-1">
            ポータルトップに表示するコンテンツを管理します
          </p>
        </div>
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50 text-gray-600 self-start sm:self-auto"
        >
          👁️ ポータルを確認
        </a>
      </div>

      {msg && (
        <div className="rounded-md px-4 py-2 text-sm bg-green-50 text-green-700">
          {msg}
        </div>
      )}

      {/* タブ */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-4 py-2 text-sm border-b-2 transition-colors ${
              tab === t.key
                ? "border-teal-500 text-teal-700 font-medium"
                : "border-transparent text-gray-700 hover:text-gray-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* タブ別コンテンツ */}
      {tab === "news" && (
        <div className="space-y-5">
          {/* 追加フォーム */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <h2 className="text-base font-semibold text-gray-800">
              新規追加
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-800 mb-1 block">
                  タイトル <span className="text-red-500">*</span>
                </label>
                <input
                  value={newsForm.title}
                  onChange={(e) =>
                    setNewsForm({ ...newsForm, title: e.target.value })
                  }
                  placeholder="新着情報のタイトル"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-800 mb-1 block">
                  カテゴリ
                </label>
                <select
                  value={newsForm.category}
                  onChange={(e) =>
                    setNewsForm({
                      ...newsForm,
                      category: e.target.value as NewsCategory,
                    })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {NEWS_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-800 mb-1 block">
                  緊急度
                </label>
                <select
                  value={newsForm.urgency}
                  onChange={(e) =>
                    setNewsForm({
                      ...newsForm,
                      urgency: e.target.value as Urgency,
                    })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                >
                  {URGENCY_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {URGENCY_META[u.value].emoji} {u.label}
                    </option>
                  ))}
                </select>
                <div className="mt-1">
                  <span
                    className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                      URGENCY_META[newsForm.urgency].badge
                    }`}
                  >
                    {URGENCY_META[newsForm.urgency].emoji}{" "}
                    {URGENCY_META[newsForm.urgency].label}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-800 mb-1 block">
                  投稿者
                </label>
                <input
                  value={newsForm.author}
                  onChange={(e) =>
                    setNewsForm({ ...newsForm, author: e.target.value })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-800 mb-1 block">
                  本文
                </label>
                <textarea
                  value={newsForm.content}
                  onChange={(e) =>
                    setNewsForm({ ...newsForm, content: e.target.value })
                  }
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-800 mb-1 block">
                  通知アニメの表示期限（この日時まで毎回表示）
                </label>
                <input
                  type="datetime-local"
                  value={newsForm.noticeUntil}
                  onChange={(e) =>
                    setNewsForm({ ...newsForm, noticeUntil: e.target.value })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-800 mb-1 block">
                  通知アニメのキャラクター
                </label>
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                  {/* おまかせ（自動）：未設定（undefined） */}
                  <button
                    type="button"
                    onClick={() =>
                      setNewsForm({ ...newsForm, character: undefined })
                    }
                    className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border text-[10px] leading-tight ${
                      !newsForm.character
                        ? "bg-teal-50 border-teal-300 text-teal-800"
                        : "border-gray-200 hover:bg-gray-50 text-gray-600"
                    }`}
                  >
                    <span className="text-xl leading-none">🎲</span>
                    おまかせ
                  </button>
                  {CHARACTER_SVGS.map((item) => (
                    <button
                      type="button"
                      key={item.type}
                      onClick={() =>
                        setNewsForm({ ...newsForm, character: item.type })
                      }
                      className={`flex flex-col items-center justify-center gap-1 p-2 rounded-lg border text-[10px] leading-tight ${
                        newsForm.character === item.type
                          ? "bg-teal-50 border-teal-300 text-teal-800"
                          : "border-gray-200 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <CharacterSVG type={item.type} size={28} />
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  未設定（おまかせ）の場合は自動で割り当てます
                </p>
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={newsForm.isActive}
                    onChange={(e) =>
                      setNewsForm({ ...newsForm, isActive: e.target.checked })
                    }
                  />
                  有効（スタッフに表示）
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddNews}
              disabled={saving || !newsForm.title.trim()}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "保存中..." : "+ 追加"}
            </button>
          </div>

          {/* 一覧 */}
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-gray-800">
              一覧（{news.length}件）
            </h2>
            {news.map((n) => (
              <div
                key={n.id}
                className={`rounded-xl p-4 space-y-2 ${
                  urgencyCardClass(n) || "bg-white border border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">
                        {n.title}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                          URGENCY_META[urgencyOf(n)].badge
                        }`}
                      >
                        {URGENCY_META[urgencyOf(n)].emoji}{" "}
                        {URGENCY_META[urgencyOf(n)].label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {NEWS_CATEGORIES.find((c) => c.value === n.category)?.label}{" "}
                      · {n.author} · {formatDateTime(n.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={n.isActive}
                        onChange={(e) =>
                          updateNewsItem(n.id, { isActive: e.target.checked })
                        }
                      />
                      有効
                    </label>
                    <button
                      type="button"
                      onClick={() => deleteNewsItem(n.id)}
                      className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                    >
                      削除
                    </button>
                  </div>
                </div>
                {n.content && (
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {n.content}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <label className="text-xs text-gray-800">
                    通知期限
                  </label>
                  <input
                    type="datetime-local"
                    value={isoToDatetimeLocal(n.noticeUntil)}
                    onChange={(e) =>
                      updateNewsItem(n.id, {
                        noticeUntil: datetimeLocalToIso(e.target.value),
                      })
                    }
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                  />
                  <span className="text-xs text-gray-600">
                    （未設定なら {charSettings.newsNoticeDays}日間）
                  </span>
                  <label className="text-xs text-gray-800 ml-2">
                    緊急度
                  </label>
                  <select
                    value={urgencyOf(n)}
                    onChange={(e) =>
                      updateNewsItem(n.id, {
                        urgency: e.target.value as Urgency,
                      })
                    }
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
                  >
                    {URGENCY_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {URGENCY_META[u.value].emoji} {u.label}
                      </option>
                    ))}
                  </select>
                  <label className="text-xs text-gray-800 ml-2">
                    キャラ
                  </label>
                  <select
                    value={n.character ?? ""}
                    onChange={(e) =>
                      updateNewsItem(n.id, {
                        character: e.target.value
                          ? (e.target.value as CharacterSvgType)
                          : undefined,
                      })
                    }
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white"
                  >
                    <option value="">おまかせ（自動）</option>
                    {CHARACTER_SVGS.map((c) => (
                      <option key={c.type} value={c.type}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {n.character && (
                    <CharacterSVG type={n.character} size={24} />
                  )}
                </div>
              </div>
            ))}
            {news.length === 0 && (
              <p className="text-sm text-gray-600 text-center py-8">
                まだ新着情報がありません
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "archive" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            通知期限が過ぎたお知らせです。復元すると新着情報の一覧に戻ります（データは削除されません）。
          </p>
          <h2 className="text-base font-semibold text-gray-800">
            アーカイブ（{newsArchive.length}件）
          </h2>
          {[...newsArchive]
            .sort((a, b) => (a.archivedAt < b.archivedAt ? 1 : -1))
            .map((n) => (
              <div
                key={n.id}
                className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900">
                        {n.title}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                          URGENCY_META[urgencyOf(n)].badge
                        }`}
                      >
                        {URGENCY_META[urgencyOf(n)].emoji}{" "}
                        {URGENCY_META[urgencyOf(n)].label}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {NEWS_CATEGORIES.find((c) => c.value === n.category)?.label}{" "}
                      · {n.author} · 投稿: {formatDateTime(n.createdAt)} ·
                      アーカイブ: {formatDateTime(n.archivedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => restoreArchivedNews(n.id)}
                      className="text-xs px-2 py-1 border border-teal-200 text-teal-600 rounded hover:bg-teal-50"
                    >
                      復元
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteArchivedNewsForever(n.id)}
                      className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                    >
                      完全削除
                    </button>
                  </div>
                </div>
                {n.content && (
                  <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {n.content}
                  </p>
                )}
              </div>
            ))}
          {newsArchive.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-8">
              アーカイブはありません
            </p>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            現行掲載中とアーカイブ（期限切れ）を横断した共有履歴です。削除しない限りお知らせはここに残り続けます。
          </p>

          {/* 検索・グループ切替・フィルタ */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <input
              value={historyKeyword}
              onChange={(e) => setHistoryKeyword(e.target.value)}
              placeholder="🔍 キーワード検索（タイトル・本文、空白区切りでAND検索）"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-600">グループ：</span>
              {(
                [
                  { value: "flat", label: "新しい順" },
                  { value: "category", label: "カテゴリ別" },
                  { value: "urgency", label: "緊急度別" },
                  { value: "month", label: "年月別" },
                ] as { value: NewsHistoryGroupAxis; label: string }[]
              ).map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setHistoryAxis(a.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    historyAxis === a.value
                      ? "bg-teal-50 border-teal-300 text-teal-800 font-medium"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              <div>
                <label className="text-xs text-gray-800 mb-1 block">状態</label>
                <select
                  value={historyStatus}
                  onChange={(e) =>
                    setHistoryStatus(e.target.value as NewsHistoryStatus | "all")
                  }
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  <option value="all">すべて</option>
                  <option value="live">掲載中</option>
                  <option value="archived">期限切れ</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-800 mb-1 block">
                  カテゴリ
                </label>
                <select
                  value={historyCategory}
                  onChange={(e) =>
                    setHistoryCategory(e.target.value as NewsCategory | "all")
                  }
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  <option value="all">すべて</option>
                  {NEWS_CATEGORY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-800 mb-1 block">
                  緊急度
                </label>
                <select
                  value={historyUrgency}
                  onChange={(e) =>
                    setHistoryUrgency(e.target.value as Urgency | "all")
                  }
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                >
                  <option value="all">すべて</option>
                  {URGENCY_OPTIONS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {URGENCY_META[u.value].emoji} {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-800 mb-1 block">
                  開始日（投稿日）
                </label>
                <input
                  type="date"
                  value={historyFrom}
                  onChange={(e) => setHistoryFrom(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="text-xs text-gray-800 mb-1 block">
                  終了日（投稿日）
                </label>
                <input
                  type="date"
                  value={historyTo}
                  onChange={(e) => setHistoryTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-gray-600">
                表示中 {newsHistoryFiltered.length}件 ／ 全
                {newsHistoryAll.length}件
              </p>
              {historyFilterActive && (
                <button
                  type="button"
                  onClick={resetHistoryFilters}
                  className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 text-gray-600"
                >
                  ✕ 条件をクリア
                </button>
              )}
            </div>
          </div>

          {/* 0件メッセージ */}
          {newsHistoryFiltered.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
              <p className="text-sm text-gray-700">
                {historyFilterActive
                  ? "🔍 検索・絞り込み条件に一致するお知らせが見つかりませんでした"
                  : "お知らせの履歴はまだありません"}
              </p>
              {historyFilterActive && (
                <p className="text-xs text-gray-500 mt-1">
                  条件を変えるか「✕ 条件をクリア」で全件表示に戻せます
                </p>
              )}
            </div>
          )}

          {/* グループごとの一覧 */}
          {newsHistoryGroups.map((g) => (
            <div key={g.key} className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-800">
                {g.label}
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {g.items.length}件
                </span>
              </h2>
              {g.items.map((item) => (
                <div
                  key={`${item.status}_${item.id}`}
                  className={`rounded-xl p-4 space-y-2 ${
                    urgencyCardClass(item) ||
                    (item.status === "archived"
                      ? "bg-gray-50 border border-gray-200"
                      : "bg-white border border-gray-200")
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">
                          {item.title}
                        </p>
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                            URGENCY_META[urgencyOf(item)].badge
                          }`}
                        >
                          {URGENCY_META[urgencyOf(item)].emoji}{" "}
                          {URGENCY_META[urgencyOf(item)].label}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            newsCategoryMeta(item.category).badge
                          }`}
                        >
                          {newsCategoryMeta(item.category).label}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            HISTORY_STATUS_META[item.status].badge
                          }`}
                        >
                          {HISTORY_STATUS_META[item.status].label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        👤 {item.author} · 投稿: {formatDateTime(item.createdAt)}
                        {item.status === "archived" && item.archivedAt
                          ? ` · アーカイブ: ${formatDateTime(item.archivedAt)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.status === "live" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setTab("news")}
                            className="text-xs px-2 py-1 border border-teal-200 text-teal-600 rounded hover:bg-teal-50"
                            title="新着情報タブで通知期限・緊急度などを編集"
                          >
                            📢 編集（新着情報タブへ）
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteNewsItem(item.id)}
                            className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                          >
                            削除
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => restoreArchivedNews(item.id)}
                            className="text-xs px-2 py-1 border border-teal-200 text-teal-600 rounded hover:bg-teal-50"
                          >
                            復元
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteArchivedNewsForever(item.id)}
                            className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                          >
                            完全削除
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {item.content && (
                    <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                      {item.content}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {tab === "contrib" && (
        <div className="space-y-6">
          {/* 貢献集計 */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-800">
              📈 共有の貢献（発信者別）
            </h2>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              件数は評価の参考情報です。共有の質・内容と合わせてご覧ください。
            </p>
            {contributionRows.length === 0 ? (
              <p className="text-sm text-gray-500">まだ投稿がありません。</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-500 border-b border-gray-200">
                      <th className="text-left py-2 pr-3 font-medium">発信者</th>
                      <th className="text-right py-2 px-3 font-medium">今月</th>
                      <th className="text-right py-2 px-3 font-medium">先月</th>
                      <th className="text-right py-2 px-3 font-medium">累計</th>
                      <th className="text-right py-2 pl-3 font-medium">
                        もらったリアクション
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {contributionRows.map((r) => (
                      <tr
                        key={r.author}
                        className="border-b border-gray-100 last:border-0"
                      >
                        <td className="py-2 pr-3 text-gray-800">
                          👤 {r.author}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-gray-900">
                          {r.thisMonth}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {r.lastMonth}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600">
                          {r.total}
                        </td>
                        <td className="py-2 pl-3 text-right text-gray-600">
                          {reactionsByAuthor.get(r.author) ?? 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 操作ログ */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-800 mb-3">
              🕘 操作ログ（最新{NEWS_LOG_MAX}件まで保持）
            </h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <select
                value={logAction}
                onChange={(e) =>
                  setLogAction(e.target.value as NewsLogAction | "all")
                }
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
              >
                <option value="all">すべての操作</option>
                {(
                  Object.keys(NEWS_LOG_ACTION_META) as NewsLogAction[]
                ).map((a) => (
                  <option key={a} value={a}>
                    {NEWS_LOG_ACTION_META[a].label}
                  </option>
                ))}
              </select>
              <select
                value={logActor}
                onChange={(e) => setLogActor(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
              >
                <option value="all">すべての操作者</option>
                {logActors.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={logKeyword}
                onChange={(e) => setLogKeyword(e.target.value)}
                placeholder="キーワード検索（タイトル・操作者・詳細）"
                className="flex-1 min-w-[180px] px-3 py-1.5 text-xs border border-gray-200 rounded-lg"
              />
            </div>
            {filteredLog.length === 0 ? (
              <p className="text-sm text-gray-500">
                該当するログがありません。
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
                {filteredLog.map((l) => (
                  <div
                    key={l.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs"
                  >
                    <span className="text-gray-500 tabular-nums">
                      {formatDateTime(l.at)}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full font-medium ${NEWS_LOG_ACTION_META[l.action]?.badge ?? "bg-gray-200 text-gray-600"}`}
                    >
                      {NEWS_LOG_ACTION_META[l.action]?.label ?? l.action}
                    </span>
                    <span className="font-medium text-gray-800 truncate max-w-[240px]">
                      {l.newsTitle || "（無題）"}
                    </span>
                    <span className="text-gray-600">👤 {l.actor}</span>
                    <span className="text-gray-400">
                      {l.source === "top" ? "トップ投稿" : "管理画面"}
                    </span>
                    {l.detail && (
                      <span className="text-gray-500">｜{l.detail}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 📋 タスク操作ログ（指示書56） */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-800">
              📋 タスク操作ログ（最新{TASK_LOG_MAX}件まで保持）
            </h2>
            <p className="text-xs text-gray-500 mt-1 mb-3">
              操作の記録です。編集・削除は全員が自由に行えます（記録は原因究明と安心のためのものです）。
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              <select
                value={taskLogAction}
                onChange={(e) =>
                  setTaskLogAction(e.target.value as TaskLogAction | "all")
                }
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
              >
                <option value="all">すべての操作</option>
                {(
                  Object.keys(TASK_LOG_ACTION_META) as TaskLogAction[]
                ).map((a) => (
                  <option key={a} value={a}>
                    {TASK_LOG_ACTION_META[a].label}
                  </option>
                ))}
              </select>
              <select
                value={taskLogActor}
                onChange={(e) => setTaskLogActor(e.target.value)}
                className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white"
              >
                <option value="all">すべての操作者</option>
                {taskLogActors.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={taskLogKeyword}
                onChange={(e) => setTaskLogKeyword(e.target.value)}
                placeholder="キーワード検索（タスク名・操作者・詳細）"
                className="flex-1 min-w-[180px] px-3 py-1.5 text-xs border border-gray-200 rounded-lg"
              />
            </div>
            {filteredTaskLog.length === 0 ? (
              <p className="text-sm text-gray-500">
                該当するログがありません。
              </p>
            ) : (
              <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
                {filteredTaskLog.map((l) => (
                  <div
                    key={l.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs"
                  >
                    <span className="text-gray-500 tabular-nums">
                      {formatDateTime(l.at)}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-full font-medium ${TASK_LOG_ACTION_META[l.action]?.badge ?? "bg-gray-200 text-gray-600"}`}
                    >
                      {TASK_LOG_ACTION_META[l.action]?.label ?? l.action}
                    </span>
                    <span className="font-medium text-gray-800 truncate max-w-[240px]">
                      {l.taskTitle || "（無題）"}
                    </span>
                    <span className="text-gray-600">👤 {l.actor}</span>
                    {l.detail && (
                      <span className="text-gray-500">｜{l.detail}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "hiyari" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            気づきシェアの一覧です（投稿はスタッフ画面から行います）
          </p>
          {hiyari.map((h) => (
            <div
              key={h.id}
              className="bg-white border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      h.type === "hiyari"
                        ? "bg-amber-50 text-amber-800"
                        : "bg-green-50 text-green-800"
                    }`}
                  >
                    {h.type === "hiyari" ? "ヒヤリハット" : "良いこと共有"}
                  </span>
                  <span className="text-xs text-gray-600">
                    {formatDateTime(h.createdAt)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => deleteHiyari(h.id)}
                  className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                >
                  削除
                </button>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {h.text}
              </p>
              <p className="text-xs text-gray-600 mt-2">
                {h.role} · {h.isAnonymous ? "匿名" : h.role}
              </p>
            </div>
          ))}
          {hiyari.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-8">
              まだ投稿がありません
            </p>
          )}
        </div>
      )}

      {/* 日々の気づき（kizuki_posts・指示書104）: 一覧・論理削除・復元 */}
      {tab === "kizuki" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            「💡 日々の気づき」（/kizuki）の投稿一覧です（投稿・編集はスタッフ画面から）。
            削除は非表示化で、ここからいつでも復元できます。
          </p>
          {[...kizukiPosts]
            .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
            .map((p) => (
              <div
                key={p.id}
                className={`border rounded-xl p-4 ${
                  p.deleted
                    ? "bg-gray-50 border-gray-200 opacity-70"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">
                      {p.authorName || "名前未設定"}
                    </span>
                    <span className="text-xs text-gray-600">
                      {formatDateTime(p.createdAt)}
                    </span>
                    {p.deleted && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
                        削除済み
                      </span>
                    )}
                  </div>
                  {p.deleted ? (
                    <button
                      type="button"
                      onClick={() => setKizukiDeleted(p.id, false)}
                      disabled={busyKizukiId === p.id}
                      className="text-xs px-2 py-1 border border-teal-200 text-teal-700 rounded hover:bg-teal-50 disabled:opacity-50"
                    >
                      ♻️ 復元
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setKizukiDeleted(p.id, true)}
                      disabled={busyKizukiId === p.id}
                      className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                    >
                      削除
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {p.body}
                </p>
              </div>
            ))}
          {kizukiPosts.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-8">
              まだ投稿がありません
            </p>
          )}
        </div>
      )}

      {/* ヒヤリハット報告（hiyari_reports・指示書106）: 一覧・論理削除・復元。
          「💛 気づきシェア」タブ（既存 portal_hiyari）とは別機能 */}
      {tab === "hiyariReport" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            「🚨 ヒヤリハット報告」（/hiyari-report）の一覧です（報告はスタッフ画面から）。
            匿名報告は誰が書いたか記録されていません。削除は非表示化で、ここからいつでも復元できます。
          </p>
          {[...hiyariReports]
            .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
            .map((p) => (
              <div
                key={p.id}
                className={`border rounded-xl p-4 ${
                  p.deleted
                    ? "bg-gray-50 border-gray-200 opacity-70"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">
                      {p.authorId ? p.authorName || "名前未設定" : "匿名"}
                    </span>
                    <span className="text-xs text-gray-600">
                      {formatDateTime(p.createdAt)}
                    </span>
                    {p.deleted && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
                        削除済み
                      </span>
                    )}
                  </div>
                  {p.deleted ? (
                    <button
                      type="button"
                      onClick={() => setHiyariReportDeleted(p.id, false)}
                      disabled={busyHiyariReportId === p.id}
                      className="text-xs px-2 py-1 border border-teal-200 text-teal-700 rounded hover:bg-teal-50 disabled:opacity-50"
                    >
                      ♻️ 復元
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setHiyariReportDeleted(p.id, true)}
                      disabled={busyHiyariReportId === p.id}
                      className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                    >
                      削除
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {p.body}
                </p>
              </div>
            ))}
          {hiyariReports.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-8">
              まだ報告がありません
            </p>
          )}
        </div>
      )}

      {/* マニュアル下書き（manual_drafts・指示書107）: 一覧・論理削除・復元・資料庫紐付け */}
      {tab === "manualDraft" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            「✍️ マニュアル下書き」（/manual-drafts）の一覧です（投稿・編集はスタッフ画面から）。
            正式マニュアルを資料庫に登録したら「📗 登録済みにする」で下書きに紐付けてください。
          </p>
          {[...manualDrafts]
            .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
            .map((p) => {
              const meta = MANUAL_DRAFT_STATUS_META[p.status];
              const refDoc = p.libraryRef
                ? libraryDocs.find((d) => d.id === p.libraryRef!.docId)
                : undefined;
              const linking = linkTargetId === p.id;
              return (
                <div
                  key={p.id}
                  className={`border rounded-xl p-4 space-y-2 ${
                    p.deleted
                      ? "bg-gray-50 border-gray-200 opacity-70"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-sm font-semibold text-gray-900 break-words">
                        {p.title}
                      </span>
                      <span
                        className={`text-[10px] font-medium rounded-full px-2 py-0.5 shrink-0 ${meta.className}`}
                      >
                        {meta.label}
                      </span>
                      {p.deleted && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
                          削除済み
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-600 shrink-0">
                      {p.authorName || "名前未設定"}・{formatDateTime(p.createdAt)}
                    </span>
                  </div>

                  {refDoc && (
                    <p className="text-xs text-emerald-700">
                      📗 紐付け先: {refDoc.title}（{refDoc.category}）
                    </p>
                  )}
                  {p.libraryRef && !refDoc && (
                    <p className="text-xs text-amber-700">
                      ⚠ 紐付け先の資料が見つかりません（削除された可能性があります）
                    </p>
                  )}

                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {p.body}
                  </p>

                  <div className="flex items-center gap-2 flex-wrap">
                    {!p.deleted && p.status === "draft" && (
                      <button
                        type="button"
                        onClick={() => setLinkTargetId(linking ? null : p.id)}
                        disabled={busyManualDraftId === p.id}
                        className="text-xs px-2 py-1 border border-emerald-200 text-emerald-700 rounded hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {linking ? "選択をやめる" : "📗 資料庫登録済みにする"}
                      </button>
                    )}
                    {!p.deleted && p.status === "registered" && (
                      <button
                        type="button"
                        onClick={() => unregisterManualDraft(p.id)}
                        disabled={busyManualDraftId === p.id}
                        className="text-xs px-2 py-1 border border-amber-200 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
                      >
                        ↩ 執筆中に戻す
                      </button>
                    )}
                    {p.deleted ? (
                      <button
                        type="button"
                        onClick={() => setManualDraftDeleted(p.id, false)}
                        disabled={busyManualDraftId === p.id}
                        className="text-xs px-2 py-1 border border-teal-200 text-teal-700 rounded hover:bg-teal-50 disabled:opacity-50"
                      >
                        ♻️ 復元
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setManualDraftDeleted(p.id, true)}
                        disabled={busyManualDraftId === p.id}
                        className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                      >
                        削除
                      </button>
                    )}
                  </div>

                  {/* 資料選択パネル（109で LibraryDocPicker に共有化・マニュアル既定フィルタは維持） */}
                  {linking && (
                    <LibraryDocPicker
                      onPick={(d) => registerManualDraft(p.id, d)}
                      defaultCategory="マニュアル"
                      disabled={busyManualDraftId === p.id}
                    />
                  )}
                </div>
              );
            })}
          {manualDrafts.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-8">
              まだ下書きがありません
            </p>
          )}
        </div>
      )}

      {/* 朝礼サポート（chorei_data・指示書108）: 当番順リスト編集・手動操作・投稿管理 */}
      {tab === "chorei" && (
        <div className="space-y-6">
          {/* 当番順リストの編集（質問プールのUIパターン流用） */}
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                🎤 当番順リスト
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                スタッフ側で「当番を次へ進める」チェック付きの投稿があると自動で次の人へ進みます。
                シフト等でズレたときは「⏭ 次へ送る」「この人を当番にする」で調整してください。
              </p>
            </div>
            {choreiRotation.order.length === 0 ? (
              <p className="text-xs text-gray-500">
                当番はまだ設定されていません。下の候補から追加してください。
              </p>
            ) : (
              <ul className="space-y-1">
                {choreiRotation.order.map((m, i) => {
                  const isCurrent = i === choreiRotation.pointer;
                  return (
                    <li
                      key={`${m.staffId || m.name}_${i}`}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
                        isCurrent
                          ? "border-orange-300 bg-orange-50"
                          : "border-gray-100 bg-gray-50"
                      }`}
                    >
                      <span className="text-xs text-gray-400 tabular-nums w-5 shrink-0">
                        {i + 1}.
                      </span>
                      <span className="text-sm flex-1 min-w-0 truncate">
                        {m.name}
                        {isCurrent && (
                          <span className="ml-2 text-[10px] font-medium bg-orange-200 text-orange-900 rounded-full px-2 py-0.5">
                            🎤 現在の当番
                          </span>
                        )}
                      </span>
                      {!isCurrent && (
                        <button
                          type="button"
                          onClick={() => jumpChorei(i, m.name)}
                          disabled={busyChorei}
                          className="text-xs px-2 py-1 border border-orange-200 text-orange-700 rounded hover:bg-orange-50 disabled:opacity-30"
                        >
                          この人を当番に
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => moveChoreiMember(i, -1)}
                        disabled={busyChorei || i === 0}
                        className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-white disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveChoreiMember(i, 1)}
                        disabled={busyChorei || i === choreiRotation.order.length - 1}
                        className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-white disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeChoreiMember(i)}
                        disabled={busyChorei}
                        className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-30"
                      >
                        削除
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {choreiRotation.order.length > 0 && (
              <button
                type="button"
                onClick={advanceChorei}
                disabled={busyChorei}
                className="text-sm px-4 py-2 rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
              >
                ⏭ 次へ送る（投稿なしで前進）
              </button>
            )}
            {/* 未追加者チップ（プロフィール ∪ 名簿・タップで追加） */}
            {(() => {
              const inOrder = new Set(
                choreiRotation.order.map((m) => choreiMemberKey(m))
              );
              const rest = choreiCandidates.filter(
                (c) => !inOrder.has(choreiMemberKey(c))
              );
              if (rest.length === 0) return null;
              return (
                <div className="space-y-1">
                  <p className="text-xs text-gray-500">
                    候補から追加（タップで当番順の末尾に入ります）:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {rest.map((c) => (
                      <button
                        key={choreiMemberKey(c)}
                        type="button"
                        onClick={() => addChoreiMember(c)}
                        disabled={busyChorei}
                        className="px-2.5 py-1 rounded-full text-xs border bg-white border-gray-200 text-gray-700 hover:bg-orange-50 disabled:opacity-50"
                      >
                        ＋ {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </section>

          {/* 投稿の一覧・論理削除・復元 */}
          <section className="space-y-2 border-t border-gray-200 pt-6">
            <h2 className="text-sm font-semibold text-gray-800">
              🌅 共有の記録
            </h2>
            {[...choreiPosts]
              .sort((a, b) =>
                (b.createdAt || "").localeCompare(a.createdAt || "")
              )
              .map((p) => (
                <div
                  key={p.id}
                  className={`border rounded-xl p-4 ${
                    p.deleted
                      ? "bg-gray-50 border-gray-200 opacity-70"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">
                        {p.authorName || "名前未設定"}
                      </span>
                      {p.onDutyName && (
                        <span className="text-[10px] font-medium bg-orange-100 text-orange-800 rounded-full px-2 py-0.5">
                          🎤 当番: {p.onDutyName}
                        </span>
                      )}
                      <span className="text-xs text-gray-600">
                        {formatDateTime(p.createdAt)}
                      </span>
                      {p.deleted && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
                          削除済み
                        </span>
                      )}
                    </div>
                    {p.deleted ? (
                      <button
                        type="button"
                        onClick={() => setChoreiPostDeleted(p.id, false)}
                        disabled={busyChorei}
                        className="text-xs px-2 py-1 border border-teal-200 text-teal-700 rounded hover:bg-teal-50 disabled:opacity-50"
                      >
                        ♻️ 復元
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setChoreiPostDeleted(p.id, true)}
                        disabled={busyChorei}
                        className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                      >
                        削除
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {p.body}
                  </p>
                </div>
              ))}
            {choreiPosts.length === 0 && (
              <p className="text-sm text-gray-600 text-center py-8">
                まだ記録がありません
              </p>
            )}
          </section>
        </div>
      )}

      {/* 勉強会アーカイブ（benkyokai_posts・指示書109）: 一覧・論理削除・復元・紐付け編集 */}
      {tab === "benkyokai" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            「📖 勉強会アーカイブ」（/benkyokai）の記録一覧です（投稿・編集はスタッフ画面から）。
            資料の紐付けはここからも編集できます。削除は非表示化で、いつでも復元できます。
          </p>
          {[...benkyokaiPosts]
            .sort(
              (a, b) =>
                (b.heldOn || "").localeCompare(a.heldOn || "") ||
                (b.createdAt || "").localeCompare(a.createdAt || "")
            )
            .map((p) => {
              const linking = benkyokaiLinkId === p.id;
              return (
                <div
                  key={p.id}
                  className={`border rounded-xl p-4 space-y-2 ${
                    p.deleted
                      ? "bg-gray-50 border-gray-200 opacity-70"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-[10px] font-medium bg-sky-100 text-sky-800 rounded-full px-2 py-0.5 shrink-0">
                        📅 {formatHeldOn(p.heldOn)}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 break-words">
                        {p.title}
                      </span>
                      {p.deleted && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
                          削除済み
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-600 shrink-0">
                      {p.authorName || "名前未設定"}・{formatDateTime(p.createdAt)}
                    </span>
                  </div>

                  {/* 紐付け資料（タイトル解決は libraryDocs・× で解除） */}
                  {p.libraryRefs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {p.libraryRefs.map((r) => {
                        const doc = libraryDocs.find((d) => d.id === r.docId);
                        return (
                          <span
                            key={r.docId}
                            className={`inline-flex items-center gap-1 text-xs rounded-full px-3 py-1 border ${
                              doc
                                ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                : "text-amber-700 bg-amber-50 border-amber-200"
                            }`}
                          >
                            {doc ? `📄 ${doc.title}` : "⚠ 資料が見つかりません"}
                            {!p.deleted && (
                              <button
                                type="button"
                                onClick={() => benkyokaiRemoveRef(p.id, r.docId)}
                                disabled={busyBenkyokaiId === p.id}
                                aria-label="紐付けを外す"
                                className="text-gray-400 hover:text-red-600 leading-none disabled:opacity-50"
                              >
                                ×
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {p.body && (
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {p.body}
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    {!p.deleted && (
                      <button
                        type="button"
                        onClick={() =>
                          setBenkyokaiLinkId(linking ? null : p.id)
                        }
                        disabled={busyBenkyokaiId === p.id}
                        className="text-xs px-2 py-1 border border-emerald-200 text-emerald-700 rounded hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {linking ? "選択をやめる" : "📎 資料を紐付ける"}
                      </button>
                    )}
                    {p.deleted ? (
                      <button
                        type="button"
                        onClick={() => setBenkyokaiDeleted(p.id, false)}
                        disabled={busyBenkyokaiId === p.id}
                        className="text-xs px-2 py-1 border border-teal-200 text-teal-700 rounded hover:bg-teal-50 disabled:opacity-50"
                      >
                        ♻️ 復元
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setBenkyokaiDeleted(p.id, true)}
                        disabled={busyBenkyokaiId === p.id}
                        className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                      >
                        削除
                      </button>
                    )}
                  </div>

                  {linking && (
                    <LibraryDocPicker
                      onPick={(d) => benkyokaiAddRef(p.id, d)}
                      excludeIds={p.libraryRefs.map((r) => r.docId)}
                      disabled={busyBenkyokaiId === p.id}
                    />
                  )}
                </div>
              );
            })}
          {benkyokaiPosts.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-8">
              まだ記録がありません
            </p>
          )}
        </div>
      )}

      {/* 自己評価シート（private_store self_review・指示書111）:
          評価期設定・提出一覧（氏名解決）・全文閲覧・差し戻し。
          禁止事項: ランクの集計・スタッフ間の比較表示は作らない（一覧にランク列を並べない） */}
      {tab === "selfReview" && (
        <div className="space-y-6">
          {/* 評価期設定 */}
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                📅 評価期の設定
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                スタッフの記入対象になる評価期です。変更すると全員が新しい評価期のシート（白紙）に記入します（過去の評価期のデータは残ります）。
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-xs text-gray-600">
                評価期キー
                <input
                  value={srPeriodDraft}
                  onChange={(e) => setSrPeriodDraft(e.target.value)}
                  placeholder="2026"
                  className="block border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-36"
                />
              </label>
              <label className="text-xs text-gray-600">
                表示ラベル
                <input
                  value={srLabelDraft}
                  onChange={(e) => setSrLabelDraft(e.target.value)}
                  placeholder="2026年度"
                  className="block border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-44"
                />
              </label>
              <button
                type="button"
                onClick={handleSaveSrConfig}
                disabled={savingSrConfig}
                className="text-sm px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 self-end"
              >
                {savingSrConfig ? "保存中..." : "💾 保存"}
              </button>
              <span className="text-xs text-gray-500 self-end">
                現在: {srConfig.label}（{srConfig.currentPeriod}）
              </span>
            </div>
          </section>

          {/* 提出一覧 */}
          <section className="space-y-2 border-t border-gray-200 pt-6">
            <h2 className="text-sm font-semibold text-gray-800">
              📝 提出一覧
            </h2>
            {selfReviewLoadError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
                {selfReviewLoadError}
                （private_store テーブルが未作成の場合は、指示書110のSQLを Supabase SQL Editor で実行してください）
              </p>
            )}
            {selfReviews.length === 0 && !selfReviewLoadError && (
              <p className="text-sm text-gray-600 text-center py-8">
                まだ記入がありません
              </p>
            )}
            {selfReviews.map((record) => {
              const data = normalizeSelfReviewData(record.data);
              const name =
                data.name ||
                choreiCandidates.find((c) => c.staffId === record.ownerId)
                  ?.name ||
                "名前未設定";
              const open = openSelfReviewId === record.id;
              return (
                <div
                  key={record.id}
                  className="border border-gray-200 bg-white rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenSelfReviewId(open ? null : record.id)
                      }
                      className="flex items-center gap-2 flex-wrap text-left hover:opacity-70"
                    >
                      <span
                        className={`text-xs transition-transform ${open ? "rotate-90" : ""}`}
                      >
                        ▶
                      </span>
                      <span className="text-sm font-medium text-gray-800">
                        {name}
                      </span>
                      {data.grade && (
                        <span className="text-[10px] font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                          {data.grade}
                        </span>
                      )}
                      <span className="text-[10px] font-medium bg-gray-100 text-gray-600 rounded-full px-2 py-0.5">
                        {data.period_label || record.recordKey}
                      </span>
                      {data.status === "submitted" ? (
                        <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">
                          ✅ 提出済み
                          {data.filled_at &&
                            `・${new Date(data.filled_at).toLocaleDateString("ja-JP")}`}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                          ✏️ 下書き
                        </span>
                      )}
                    </button>
                    {data.status === "submitted" && (
                      <button
                        type="button"
                        onClick={() => returnSelfReview(record)}
                        disabled={busySelfReviewId === record.id}
                        className="text-xs px-2 py-1 border border-amber-200 text-amber-700 rounded hover:bg-amber-50 disabled:opacity-50"
                      >
                        ↩ 差し戻し
                      </button>
                    )}
                  </div>

                  {/* 読み取り専用のシート全文（ランクはここでのみ見える） */}
                  {open && (
                    <div className="space-y-4 border-t border-gray-100 pt-3">
                      {[
                        {
                          heading: "1. 今期の実",
                          rows: MINORI_ITEMS.map((it) => ({
                            label: it.label,
                            value: data.sections.minori[it.key],
                          })),
                        },
                        {
                          heading: "2. 在り方の振り返り",
                          rows: ARIKATA_ITEMS.map((it) => ({
                            label: it.label,
                            value: data.sections.arikata[it.key],
                          })),
                        },
                        {
                          heading: "3. 分かち合い・アウトプット",
                          rows: OUTPUT_ITEMS.map((it) => ({
                            label: it.label,
                            value: data.sections.output[it.key],
                          })),
                        },
                        {
                          heading: "4. 自己評価ランク",
                          rows: [
                            {
                              label: "自己評価ランク",
                              value: data.sections.rank.value || "（未選択）",
                            },
                            {
                              label: RANK_REASON_LABEL,
                              value: data.sections.rank.reason,
                            },
                          ],
                        },
                        {
                          heading: "5. 来期に向けて",
                          rows: RAIKI_ITEMS.map((it) => ({
                            label: it.label,
                            value: data.sections.raiki[it.key],
                          })),
                        },
                      ].map((sec) => (
                        <div key={sec.heading} className="space-y-2">
                          <h3 className="text-xs font-semibold text-gray-700">
                            {sec.heading}
                          </h3>
                          {sec.rows.map((row) => (
                            <div key={row.label}>
                              <p className="text-xs text-gray-500">{row.label}</p>
                              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                                {row.value || "（未記入）"}
                              </p>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      )}

      {/* 1on1ノート（private_store one_on_one・指示書112）:
          全記録の閲覧・物理削除。集計・回数列は置かない（111と同じ思想） */}
      {tab === "oneOnOne" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            「🤝 1on1ノート」（/one-on-one）の全記録です（記録・編集はスタッフ画面から。閲覧は本人・ペア相手・管理者のみ）。
            削除は物理削除で、元に戻せません。
          </p>
          {oneOnOneLoadError && (
            <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
              {oneOnOneLoadError}
              （private_store テーブルが未作成の場合は、指示書110のSQLを Supabase SQL Editor で実行してください）
            </p>
          )}
          {oneOnOnes.length === 0 && !oneOnOneLoadError && (
            <p className="text-sm text-gray-600 text-center py-8">
              まだ記録がありません
            </p>
          )}
          {sortOneOnOne(oneOnOnes).map((record) => {
            const d = normalizeOneOnOneData(record.data);
            const open = openOneOnOneId === record.id;
            return (
              <div
                key={record.id}
                className="border border-gray-200 bg-white rounded-xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setOpenOneOnOneId(open ? null : record.id)}
                    className="flex items-center gap-2 flex-wrap text-left hover:opacity-70"
                  >
                    <span
                      className={`text-xs transition-transform ${open ? "rotate-90" : ""}`}
                    >
                      ▶
                    </span>
                    <span className="text-[10px] font-medium bg-violet-100 text-violet-800 rounded-full px-2 py-0.5">
                      📅 {d.heldOn.replaceAll("-", "/")}
                    </span>
                    <span className="text-sm text-gray-800">
                      記録: {d.authorName || "名前未設定"}さん → 相手:{" "}
                      {d.partnerName || "名前未設定"}さん
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteOneOnOne(record)}
                    disabled={busyOneOnOneId === record.id}
                    className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                  >
                    削除
                  </button>
                </div>
                {open && (
                  <div className="space-y-2 border-t border-gray-100 pt-3">
                    {ONE_ON_ONE_SECTIONS.map((sec) => (
                      <div key={sec.key}>
                        <p className="text-xs text-gray-500">{sec.label}</p>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                          {d.sections[sec.key] || "（未記入）"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* オンボーディング（指示書113）: テンプレ2階層編集＋進捗一覧。
          禁止事項: 一覧に進捗率の列を横並びにしない（111の「ランク列を並べない」と同じ思想） */}
      {tab === "onboarding" && (
        <div className="space-y-6">
          {/* テンプレ編集 */}
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                ✅ チェックリストの編集
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                スタッフ画面「✅ はじめてガイド」（/onboarding）に表示される項目です。
                項目のIDは編集で変わらないため、名前や補足を直してもスタッフのチェックは外れません。
                「💾 チェックリストを保存」で全体を反映します。
              </p>
            </div>
            {!onbLoaded ? (
              <p className="text-sm text-gray-500 animate-pulse">
                読み込み中...
              </p>
            ) : (
              <>
                {onbTemplate.sections.length === 0 && (
                  <p className="text-sm text-gray-600 text-center py-6">
                    まだセクションがありません。下の入力欄から「最初の1週間」などの段階を追加してください。
                  </p>
                )}
                {onbTemplate.sections.map((section, si) => (
                  <div
                    key={section.id}
                    className="border border-gray-200 bg-white rounded-xl p-4 space-y-3"
                  >
                    {/* セクション: 改名・↑↓・削除 */}
                    <div className="flex items-center gap-2">
                      <input
                        value={section.title}
                        onChange={(e) =>
                          renameOnbSection(section.id, e.target.value)
                        }
                        placeholder="段階名（例: 最初の1週間）"
                        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-medium"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          mutateOnbSections((ss) => moveInArray(ss, si, -1))
                        }
                        disabled={si === 0}
                        className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          mutateOnbSections((ss) => moveInArray(ss, si, 1))
                        }
                        disabled={si === onbTemplate.sections.length - 1}
                        className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => removeOnbSection(section.id)}
                        className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>

                    {/* 項目: ラベル・補足・↑↓・削除・資料紐付け */}
                    <ul className="space-y-2">
                      {section.items.map((item, ii) => {
                        const doc = item.docId
                          ? libraryDocs.find((d) => d.id === item.docId)
                          : undefined;
                        const picking = onbPickItemId === item.id;
                        return (
                          <li
                            key={item.id}
                            className="border border-gray-100 bg-gray-50/60 rounded-lg p-2.5 space-y-2"
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-gray-400 tabular-nums w-5 shrink-0 mt-2">
                                {ii + 1}.
                              </span>
                              <div className="flex-1 min-w-0 space-y-1.5">
                                <input
                                  value={item.label}
                                  onChange={(e) =>
                                    updateOnbItem(section.id, item.id, {
                                      label: e.target.value,
                                    })
                                  }
                                  placeholder="項目名"
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white"
                                />
                                <input
                                  value={item.note}
                                  onChange={(e) =>
                                    updateOnbItem(section.id, item.id, {
                                      note: e.target.value,
                                    })
                                  }
                                  placeholder="補足（任意）"
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-white"
                                />
                              </div>
                              <div className="flex items-center gap-1 shrink-0 mt-1">
                                <button
                                  type="button"
                                  onClick={() => moveOnbItem(section.id, ii, -1)}
                                  disabled={ii === 0}
                                  className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-white disabled:opacity-30"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveOnbItem(section.id, ii, 1)}
                                  disabled={ii === section.items.length - 1}
                                  className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-white disabled:opacity-30"
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeOnbItem(section.id, item.id)
                                  }
                                  className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                                >
                                  削除
                                </button>
                              </div>
                            </div>

                            {/* 資料紐付け（LibraryDocPicker・単一選択・解除可） */}
                            <div className="flex items-center gap-2 flex-wrap pl-7">
                              {item.docId ? (
                                <span
                                  className={`inline-flex items-center gap-1 text-xs rounded-full px-3 py-1 border ${
                                    doc
                                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                      : "text-amber-700 bg-amber-50 border-amber-200"
                                  }`}
                                >
                                  {doc
                                    ? `📄 ${doc.title}`
                                    : "⚠ 資料が見つかりません（スタッフ側では非表示）"}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateOnbItem(section.id, item.id, {
                                        docId: "",
                                      })
                                    }
                                    aria-label="紐付けを外す"
                                    className="text-gray-400 hover:text-red-600 leading-none"
                                  >
                                    ×
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOnbPickItemId(picking ? null : item.id)
                                  }
                                  className="text-xs px-2 py-1 border border-emerald-200 text-emerald-700 rounded hover:bg-emerald-50"
                                >
                                  {picking ? "選択をやめる" : "📎 資料を紐付ける"}
                                </button>
                              )}
                            </div>
                            {picking && !item.docId && (
                              <div className="pl-7">
                                <LibraryDocPicker
                                  onPick={(d) => {
                                    updateOnbItem(section.id, item.id, {
                                      docId: d.id,
                                    });
                                    setOnbPickItemId(null);
                                  }}
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    {/* 項目の追加 */}
                    <div className="flex items-center gap-2">
                      <input
                        value={newOnbItemLabels[section.id] ?? ""}
                        onChange={(e) =>
                          setNewOnbItemLabels((m) => ({
                            ...m,
                            [section.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addOnbItem(section.id);
                          }
                        }}
                        placeholder="新しい項目名を入力"
                        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => addOnbItem(section.id)}
                        disabled={!(newOnbItemLabels[section.id] ?? "").trim()}
                        className="text-xs px-3 py-1.5 border border-teal-200 text-teal-700 rounded-lg hover:bg-teal-50 disabled:opacity-30 shrink-0"
                      >
                        ＋ 項目を追加
                      </button>
                    </div>
                  </div>
                ))}

                {/* セクションの追加 */}
                <div className="flex items-center gap-2">
                  <input
                    value={newOnbSectionTitle}
                    onChange={(e) => setNewOnbSectionTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addOnbSection();
                      }
                    }}
                    placeholder="新しいセクション名（例: 最初の1週間）"
                    className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={addOnbSection}
                    disabled={!newOnbSectionTitle.trim()}
                    className="text-xs px-3 py-1.5 border border-teal-200 text-teal-700 rounded-lg hover:bg-teal-50 disabled:opacity-30 shrink-0"
                  >
                    ＋ セクションを追加
                  </button>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveOnbTemplate}
                    disabled={savingOnb}
                    className="text-sm px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {savingOnb ? "保存中..." : "💾 チェックリストを保存"}
                  </button>
                </div>
              </>
            )}
          </section>

          {/* 進捗一覧（氏名・最終更新のみ。行展開で詳細） */}
          <section className="space-y-2 border-t border-gray-200 pt-6">
            <h2 className="text-sm font-semibold text-gray-800">
              👣 スタッフの進捗
            </h2>
            {onbProgressLoadError && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
                {onbProgressLoadError}
                （private_store テーブルが未作成の場合は、指示書110のSQLを Supabase SQL Editor で実行してください）
              </p>
            )}
            {onbProgressList.length === 0 && !onbProgressLoadError && (
              <p className="text-sm text-gray-600 text-center py-8">
                まだチェックした人はいません
              </p>
            )}
            {onbProgressList.map((record) => {
              const prog = normalizeOnboardingProgress(record.data);
              const open = openOnbProgressId === record.id;
              return (
                <div
                  key={record.id}
                  className="border border-gray-200 bg-white rounded-xl p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenOnbProgressId(open ? null : record.id)
                      }
                      className="flex items-center gap-2 flex-wrap text-left hover:opacity-70"
                    >
                      <span
                        className={`text-xs transition-transform ${open ? "rotate-90" : ""}`}
                      >
                        ▶
                      </span>
                      <span className="text-sm text-gray-800">
                        {onbOwnerName(record.ownerId)}さん
                      </span>
                      <span className="text-xs text-gray-500">
                        最終更新: {formatDateTime(record.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteOnbProgress(record)}
                      disabled={busyOnbProgressId === record.id}
                      className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                    >
                      削除
                    </button>
                  </div>
                  {open && (
                    <div className="space-y-3 border-t border-gray-100 pt-3">
                      {/* テンプレに現存する項目だけを表示＝孤児ID（削除済み項目のチェック）は無視 */}
                      {onbTemplate.sections.map((section) => (
                        <div key={section.id}>
                          <p className="text-xs font-medium text-gray-600">
                            {section.title}
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {section.items.map((item) => {
                              const checkedAt = prog.checked[item.id] || "";
                              return (
                                <li
                                  key={item.id}
                                  className="text-sm flex items-center gap-2"
                                >
                                  <span
                                    className={
                                      checkedAt
                                        ? "text-teal-600"
                                        : "text-gray-300"
                                    }
                                  >
                                    {checkedAt ? "✓" : "・"}
                                  </span>
                                  <span
                                    className={
                                      checkedAt
                                        ? "text-gray-800"
                                        : "text-gray-500"
                                    }
                                  >
                                    {item.label}
                                  </span>
                                  {checkedAt && (
                                    <span className="text-[10px] text-gray-400 tabular-nums">
                                      {formatDateTime(checkedAt)}
                                    </span>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ))}
                      {onbTemplate.sections.length === 0 && (
                        <p className="text-xs text-gray-500">
                          テンプレが未設定のため詳細を表示できません
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      )}

      {tab === "thankyou" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            ありがとうカードの一覧です（投稿はスタッフ画面から行います）。
            削除は非表示化で、ここからいつでも復元できます（指示書105）。
          </p>
          {thankyou.map((t) => (
            <div
              key={t.id}
              className={`border rounded-xl p-4 ${
                t.deleted
                  ? "bg-gray-50 border-gray-200 opacity-70"
                  : "bg-white border-gray-200"
              }`}
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <p className="text-sm text-gray-800 leading-relaxed flex-1 whitespace-pre-wrap">
                  {t.message}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  {t.deleted && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">
                      削除済み
                    </span>
                  )}
                  {t.deleted ? (
                    <button
                      type="button"
                      onClick={() => setThankyouDeleted(t.id, false)}
                      disabled={saving}
                      className="text-xs px-2 py-1 border border-teal-200 text-teal-700 rounded hover:bg-teal-50 disabled:opacity-50"
                    >
                      ♻️ 復元
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setThankyouDeleted(t.id, true)}
                      disabled={saving}
                      className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {t.fromName} → {formatThankyouTo(t)} ·{" "}
                {formatDateTime(t.createdAt)}
              </p>
            </div>
          ))}
          {thankyou.length === 0 && (
            <p className="text-sm text-gray-600 text-center py-8">
              まだ投稿がありません
            </p>
          )}
        </div>
      )}

      {tab === "policy" && (
        <div className="space-y-5">
          {/* 編集フォーム */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-800">
                {editingPolicyId ? "編集" : "新規追加"}
              </h2>
              {editingPolicyId && (
                <button
                  type="button"
                  onClick={resetPolicyForm}
                  className="text-xs text-gray-500 hover:underline"
                >
                  キャンセル
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-800 mb-1 block">年度</label>
                <input
                  type="number"
                  value={policyForm.year}
                  onChange={(e) =>
                    setPolicyForm({
                      ...policyForm,
                      year: Number(e.target.value),
                    })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={policyForm.isActive}
                    onChange={(e) =>
                      setPolicyForm({
                        ...policyForm,
                        isActive: e.target.checked,
                      })
                    }
                  />
                  アクティブ（スタッフ画面に表示）
                </label>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-800 mb-1 block">
                  パーパス <span className="text-red-500">*</span>
                </label>
                <input
                  value={policyForm.purpose}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, purpose: e.target.value })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-800 mb-1 block">
                  ミッション
                </label>
                <input
                  value={policyForm.mission}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, mission: e.target.value })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-800 mb-1 block">
                  ビジョン
                </label>
                <input
                  value={policyForm.vision}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, vision: e.target.value })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-800 mb-1 block">
                  バリュー
                </label>
                <input
                  value={policyForm.value}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, value: e.target.value })
                  }
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-gray-800 mb-1 block">
                  詳細テキスト（任意）
                </label>
                <textarea
                  value={policyForm.fullText}
                  onChange={(e) =>
                    setPolicyForm({ ...policyForm, fullText: e.target.value })
                  }
                  rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSavePolicy}
              disabled={saving || !policyForm.purpose.trim()}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "保存中..." : editingPolicyId ? "更新" : "+ 追加"}
            </button>
          </div>

          {/* 一覧 */}
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-gray-800">
              年度別経営方針（{policies.length}件）
            </h2>
            {policies
              .slice()
              .sort((a, b) => b.year - a.year)
              .map((p) => (
                <div
                  key={p.id}
                  className={`bg-white border rounded-xl p-4 ${
                    p.isActive
                      ? "border-purple-300 ring-2 ring-purple-100"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-purple-700">
                          {p.year}年度
                        </p>
                        {p.isActive && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
                            アクティブ
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800 mt-1">{p.purpose}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2 text-xs text-gray-600">
                        <p>
                          <span className="text-gray-600">ミッション：</span>
                          {p.mission}
                        </p>
                        <p>
                          <span className="text-gray-600">ビジョン：</span>
                          {p.vision}
                        </p>
                        <p>
                          <span className="text-gray-600">バリュー：</span>
                          {p.value}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!p.isActive && (
                        <button
                          type="button"
                          onClick={() => handleSetActivePolicy(p.id)}
                          className="text-xs px-2 py-1 border border-purple-200 text-purple-700 rounded hover:bg-purple-50"
                        >
                          アクティブにする
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEditPolicy(p)}
                        className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePolicy(p.id)}
                        className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            {policies.length === 0 && (
              <p className="text-sm text-gray-600 text-center py-8">
                まだ経営方針がありません
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "word" && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 max-w-2xl">
          <h2 className="text-base font-semibold text-gray-800">
            今日の一言（ヒーローセクションに表示）
          </h2>
          <div>
            <label className="text-xs text-gray-800 mb-1 block">
              一言テキスト
            </label>
            <textarea
              value={todayWord.text}
              onChange={(e) =>
                setTodayWord({ ...todayWord, text: e.target.value })
              }
              rows={3}
              placeholder="例：「当たり前のことを、特別熱心に、しかも徹底的に行う。」"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y"
            />
          </div>
          <div>
            <label className="text-xs text-gray-800 mb-1 block">
              出典・著者
            </label>
            <input
              value={todayWord.author}
              onChange={(e) =>
                setTodayWord({ ...todayWord, author: e.target.value })
              }
              placeholder="例：成功の八原則 第八、凡事徹底"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <p className="text-xs text-gray-600">
            最終更新：{formatDateTime(todayWord.updatedAt)}
          </p>
          <button
            type="button"
            onClick={handleSaveTodayWord}
            disabled={saving || !todayWord.text.trim()}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm hover:bg-teal-700 disabled:opacity-50"
          >
            {saving ? "更新中..." : "更新する"}
          </button>
        </div>
      )}

      {tab === "character" && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5 max-w-2xl">
          {/* 有効化 */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={charSettings.enabled}
                onChange={(e) =>
                  setCharSettings({
                    ...charSettings,
                    enabled: e.target.checked,
                  })
                }
                className="rounded"
              />
              <span className="text-sm font-medium">
                キャラクター通知を有効にする
              </span>
            </label>
            <p className="text-xs text-gray-600 mt-1 ml-6">
              表示期間内の新着情報がある時、キャラクターが画面上方を横切ります
            </p>
          </div>

          {/* スタイル選択 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              キャラクターのスタイル
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setCharSettings({ ...charSettings, characterStyle: "emoji" })
                }
                className={`flex-1 py-3 rounded-xl border text-sm ${
                  charSettings.characterStyle === "emoji"
                    ? "bg-teal-50 border-teal-300 text-teal-800"
                    : "border-gray-200"
                }`}
              >
                😺 絵文字
              </button>
              <button
                type="button"
                onClick={() =>
                  setCharSettings({ ...charSettings, characterStyle: "svg" })
                }
                className={`flex-1 py-3 rounded-xl border text-sm ${
                  charSettings.characterStyle === "svg"
                    ? "bg-teal-50 border-teal-300 text-teal-800"
                    : "border-gray-200"
                }`}
              >
                🎨 イラスト
              </button>
            </div>
          </div>

          {/* 絵文字選択 */}
          {charSettings.characterStyle === "emoji" && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                絵文字を選択
              </label>
              <div className="grid grid-cols-8 gap-2">
                {CHARACTER_EMOJIS.map((emoji) => (
                  <button
                    type="button"
                    key={emoji}
                    onClick={() => setCharSettings({ ...charSettings, emoji })}
                    className={`text-2xl p-2 rounded-lg border ${
                      charSettings.emoji === emoji
                        ? "bg-teal-50 border-teal-300"
                        : "border-gray-100 hover:bg-gray-50"
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* イラスト選択 */}
          {charSettings.characterStyle === "svg" && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                イラストを選択
              </label>
              <div className="grid grid-cols-4 gap-2">
                {CHARACTER_SVGS.map((item) => (
                  <button
                    type="button"
                    key={item.type}
                    onClick={() =>
                      setCharSettings({ ...charSettings, svgType: item.type })
                    }
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm ${
                      charSettings.svgType === item.type
                        ? "bg-teal-50 border-teal-300 text-teal-800"
                        : "border-gray-200"
                    }`}
                  >
                    <CharacterSVG type={item.type} size={40} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* サイズ調整 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              大きさ: {charSettings.size}px
            </label>
            <input
              type="range"
              min="30"
              max="120"
              step="5"
              value={charSettings.size}
              onChange={(e) =>
                setCharSettings({
                  ...charSettings,
                  size: Number(e.target.value),
                })
              }
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>小さい</span>
              <span>大きい</span>
            </div>
          </div>

          {/* 速度調整 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              横切る速度: {charSettings.speed}秒で1往復
            </label>
            <input
              type="range"
              min="5"
              max="30"
              step="1"
              value={charSettings.speed}
              onChange={(e) =>
                setCharSettings({
                  ...charSettings,
                  speed: Number(e.target.value),
                })
              }
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>速い（5秒）</span>
              <span>ゆっくり（30秒）</span>
            </div>
          </div>

          {/* 新着通知アニメの表示期間（日数） */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              新着通知アニメの表示期間（日数）
            </label>
            <select
              value={charSettings.newsNoticeDays}
              onChange={(e) =>
                setCharSettings({
                  ...charSettings,
                  newsNoticeDays: Number(e.target.value),
                })
              }
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              {[1, 3, 5, 7, 14, 30].map((d) => (
                <option key={d} value={d}>
                  {d}日
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-600 mt-1">
              新規お知らせの通知期限の既定値（日数）。お知らせごとに日時で上書きできます（デフォルト3日）
            </p>
          </div>

          {/* プレビュー */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 relative overflow-hidden">
            <p className="text-xs text-gray-800 mb-2">プレビュー</p>
            <div className="relative" style={{ height: charSettings.size + 10 }}>
              <div
                className="absolute top-0"
                style={
                  {
                    animation: `charPreviewWalk ${charSettings.speed}s linear infinite`,
                    "--char-walk-to": `calc(100% - ${charSettings.size}px)`,
                  } as React.CSSProperties
                }
              >
                {charSettings.characterStyle === "emoji" ? (
                  <span
                    className="select-none"
                    style={{ fontSize: charSettings.size, lineHeight: 1 }}
                  >
                    {charSettings.emoji}
                  </span>
                ) : (
                  <CharacterSVG
                    type={charSettings.svgType}
                    size={charSettings.size}
                  />
                )}
              </div>
            </div>
          </div>

          {/* 保存ボタン */}
          <button
            type="button"
            onClick={handleSaveCharSettings}
            disabled={savingChar}
            className="w-full py-3 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
          >
            {savingChar ? "保存中..." : "💾 設定を保存"}
          </button>
        </div>
      )}

      {tab === "layout" && (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-800">
              🏠 ホーム画面のセクション並び
            </h2>
            <SectionLayoutEditor
              layout={homeLayout}
              labels={HOME_SECTION_LABELS}
              onChange={setHomeLayout}
              onSave={handleSaveLayout}
              saving={savingLayout}
              onReload={handleReloadSavedLayout}
              onReset={handleResetLayoutToDefault}
              description="スタッフ側ホーム画面のセクション表示順を編集します（サイドバー構成とは別の設定です）。ドラッグ&ドロップ、または「上へ／下へ」ボタンで並び替え、チェックを外すと該当セクションをホームから非表示にできます。"
              previewTitle="プレビュー（ホームでの表示順）"
            />
          </section>

          <section className="space-y-3 border-t border-gray-200 pt-6">
            <h2 className="text-sm font-semibold text-gray-800">
              📋 みんなのタスクのセクション並び
            </h2>
            <SectionLayoutEditor
              layout={tasksLayout}
              labels={TASKS_SECTION_LABELS}
              onChange={setTasksLayout}
              onSave={handleSaveTasksLayout}
              saving={savingTasksLayout}
              onReload={handleReloadSavedTasksLayout}
              onReset={handleResetTasksLayoutToDefault}
              description="スタッフ側「みんなのタスク」（/tasks）のセクション表示順を編集します。保存するとスタッフ側は次回表示（リロード）から反映されます。ページタイトルは常に先頭固定です。"
              previewTitle="プレビュー（/tasks での表示順）"
            />
          </section>
        </div>
      )}

      {/* ⚙ 機能（46R: 機能スイッチの集約＋質問プール編集） */}
      {tab === "features" && (
        <div className="space-y-8">
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                ⚙ 機能スイッチ
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                OFFにした機能は該当UIが非表示になります（データは保持され、ONに戻すと再表示されます）。
              </p>
            </div>
            <div className="space-y-3">
              {PORTAL_FEATURE_META.map((m) => (
                <div
                  key={m.key}
                  className="rounded-xl border border-gray-200 bg-white p-4 space-y-1.5"
                >
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                    <input
                      type="checkbox"
                      checked={features[m.key]}
                      disabled={savingFeatures}
                      onChange={(e) =>
                        handleToggleFeature(m.key, e.target.checked)
                      }
                    />
                    {m.label}
                  </label>
                  <p className="text-xs text-gray-500 pl-6">{m.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 配信間隔（指示書75） */}
          <section className="space-y-3 border-t border-gray-200 pt-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                📅 みんなへの質問 — 配信間隔
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                質問が新しいものに切り替わる間隔を設定します。間隔を変えて保存すると、その場で新しい質問に切り替わります（同じ間隔のまま保存し直しても切り替わりません）。
              </p>
            </div>
            {!scheduleLoaded ? (
              <p className="text-xs text-gray-500">読み込み中...</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-4">
                  {QUESTION_INTERVAL_META.map((m) => (
                    <label
                      key={m.key}
                      className="flex items-center gap-1.5 text-sm text-gray-700"
                    >
                      <input
                        type="radio"
                        name="question-interval"
                        checked={intervalDraft === m.key}
                        disabled={savingSchedule}
                        onChange={() => setIntervalDraft(m.key)}
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-gray-600">
                  {currentIntervalKey === "off" ? (
                    <>現在: 停止中（ホームに表示されません）</>
                  ) : (
                    <>
                      現在: {currentIntervalLabel}
                      {schedule ? "" : "（既定）"}
                      {nextSwitchMs !== null &&
                        ` ／ 次の切替: ${formatSwitchDate(nextSwitchMs)}`}
                    </>
                  )}
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveSchedule}
                    disabled={savingSchedule}
                    className="text-sm px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {savingSchedule ? "保存中..." : "💾 配信間隔を保存"}
                  </button>
                </div>
              </>
            )}
          </section>

          {/* 質問プール（期間ごとの自動ローテーション） */}
          <section className="space-y-3 border-t border-gray-200 pt-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                ❓ みんなへの質問 — 質問プール
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                期間が切り替わるとこのプールから上から順（循環）に自動で出題されます。切替間隔は上の「配信間隔」で設定できます。ホームの「✏️
                質問を編集」（管理者のみ）で手動上書きした期間はそれが優先され、次の切替からまた自動に戻ります。プールを空にすると自動出題は止まります。
              </p>
            </div>
            {!poolLoaded ? (
              <p className="text-xs text-gray-500">読み込み中...</p>
            ) : (
              <>
                {pool.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    プールが空です（自動出題は停止中）。下から質問を追加できます。
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {pool.map((q, i) => (
                      <li
                        key={`${i}_${q}`}
                        className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-1.5"
                      >
                        <span className="text-xs text-gray-400 tabular-nums w-5 shrink-0">
                          {i + 1}.
                        </span>
                        <span className="text-sm flex-1 min-w-0 truncate">
                          {q}
                        </span>
                        <button
                          type="button"
                          onClick={() => movePoolItem(i, -1)}
                          disabled={i === 0}
                          className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-white disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => movePoolItem(i, 1)}
                          disabled={i === pool.length - 1}
                          className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-white disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removePoolItem(i)}
                          className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                        >
                          削除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2">
                  <input
                    value={newPoolQuestion}
                    onChange={(e) => setNewPoolQuestion(e.target.value)}
                    placeholder="質問を追加（例：座右の銘は？）"
                    className="flex-1 h-8 rounded border border-gray-200 bg-white px-2.5 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        addPoolItem();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={addPoolItem}
                    className="text-xs px-3 rounded bg-teal-600 text-white hover:bg-teal-700"
                  >
                    追加
                  </button>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSavePool}
                    disabled={savingPool}
                    className="text-sm px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {savingPool ? "保存中..." : "💾 質問プールを保存"}
                  </button>
                </div>
              </>
            )}
          </section>

          {/* 📈 クリニックの歩み — データ入力（指示書80） */}
          <section className="space-y-3 border-t border-gray-200 pt-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                📈 クリニックの歩み — データ入力
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                月別の売上（万円）とカウンセリング数（件）・施策を入力すると、ホームの「📈
                クリニックの歩み」に反映されます。数字は目的ではなく、みなさんが質を尽くした結果を映す鏡です（個人別の数字は扱わず、チーム全体のみ）。
              </p>
            </div>
            {!metrics ? (
              <p className="text-xs text-gray-500">読み込み中...</p>
            ) : (
              <>
                {/* 月次データ */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1">
                    月次データ
                  </p>
                  {metrics.months.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      まだありません。下の欄から追加してください。
                    </p>
                  ) : (
                    <div className="space-y-1 overflow-x-auto">
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 px-1 min-w-[520px]">
                        <span className="w-20">年月</span>
                        <span className="w-20">保険(万円)</span>
                        <span className="w-20">自費(万円)</span>
                        <span className="w-24">カウンセリング</span>
                        <span className="w-24">合算(万円)</span>
                        <span />
                      </div>
                      {metrics.months.map((m) => {
                        const total = monthTotal(m);
                        const legacy = isLegacyOnly(m);
                        return (
                          <div
                            key={m.ym}
                            className="flex items-center gap-2 min-w-[520px]"
                          >
                            <span className="w-20 text-sm tabular-nums">
                              {m.ym}
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={m.insurance ?? ""}
                              onChange={(e) =>
                                updateMonth(m.ym, "insurance", e.target.value)
                              }
                              placeholder="—"
                              className="w-20 h-8 rounded border border-gray-200 px-2 text-sm"
                            />
                            <input
                              type="number"
                              min={0}
                              value={m.selfPay ?? ""}
                              onChange={(e) =>
                                updateMonth(m.ym, "selfPay", e.target.value)
                              }
                              placeholder="—"
                              className="w-20 h-8 rounded border border-gray-200 px-2 text-sm"
                            />
                            <input
                              type="number"
                              min={0}
                              value={m.counseling ?? ""}
                              onChange={(e) =>
                                updateMonth(m.ym, "counseling", e.target.value)
                              }
                              placeholder="—"
                              className="w-24 h-8 rounded border border-gray-200 px-2 text-sm"
                            />
                            <span
                              className="w-24 text-sm tabular-nums text-gray-600"
                              title={
                                legacy
                                  ? "内訳未入力（合算のみ）。保険/自費を入力すると内訳ありに移行します。"
                                  : undefined
                              }
                            >
                              {total ?? "—"}
                              {legacy && (
                                <span className="text-[9px] text-amber-600 ml-1">
                                  内訳未
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeMonth(m.ym)}
                              className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                            >
                              削除
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <input
                      type="month"
                      value={newMonth.ym}
                      onChange={(e) =>
                        setNewMonth({ ...newMonth, ym: e.target.value })
                      }
                      className="w-32 h-8 rounded border border-gray-200 px-2 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      value={newMonth.insurance}
                      onChange={(e) =>
                        setNewMonth({ ...newMonth, insurance: e.target.value })
                      }
                      placeholder="保険(万円)"
                      className="w-24 h-8 rounded border border-gray-200 px-2 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      value={newMonth.selfPay}
                      onChange={(e) =>
                        setNewMonth({ ...newMonth, selfPay: e.target.value })
                      }
                      placeholder="自費(万円)"
                      className="w-24 h-8 rounded border border-gray-200 px-2 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      value={newMonth.counseling}
                      onChange={(e) =>
                        setNewMonth({ ...newMonth, counseling: e.target.value })
                      }
                      placeholder="件数"
                      className="w-24 h-8 rounded border border-gray-200 px-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={addMetricMonth}
                      className="text-xs px-3 h-8 rounded bg-teal-600 text-white hover:bg-teal-700"
                    >
                      追加
                    </button>
                  </div>
                </div>

                {/* 施策 */}
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1">
                    施策（グラフに縦線＋番号で表示）
                  </p>
                  {metrics.initiatives.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      まだありません。下の欄から追加してください。
                    </p>
                  ) : (
                    <div className="space-y-1 overflow-x-auto">
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 px-1 min-w-[480px]">
                        <span className="w-32">開始日</span>
                        <span className="w-32">終了日（任意）</span>
                        <span className="flex-1">ラベル</span>
                        <span />
                      </div>
                      {metrics.initiatives.map((it) => (
                        <div
                          key={it.id}
                          className="flex items-center gap-2 min-w-[480px]"
                        >
                          <input
                            type="date"
                            value={it.date}
                            onChange={(e) =>
                              updateInit(it.id, "date", e.target.value)
                            }
                            className="w-32 h-8 rounded border border-gray-200 px-2 text-sm"
                          />
                          <input
                            type="date"
                            value={it.endDate ?? ""}
                            min={it.date || undefined}
                            onChange={(e) =>
                              updateInit(it.id, "endDate", e.target.value)
                            }
                            className="w-32 h-8 rounded border border-gray-200 px-2 text-sm"
                          />
                          <input
                            value={it.label}
                            onChange={(e) =>
                              updateInit(it.id, "label", e.target.value)
                            }
                            className="flex-1 min-w-0 h-8 rounded border border-gray-200 px-2 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => removeInit(it.id)}
                            className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                          >
                            削除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <input
                      type="date"
                      value={newInit.date}
                      onChange={(e) =>
                        setNewInit({ ...newInit, date: e.target.value })
                      }
                      className="w-32 h-8 rounded border border-gray-200 px-2 text-sm"
                      aria-label="施策の開始日"
                    />
                    <input
                      type="date"
                      value={newInit.endDate}
                      min={newInit.date || undefined}
                      onChange={(e) =>
                        setNewInit({ ...newInit, endDate: e.target.value })
                      }
                      className="w-32 h-8 rounded border border-gray-200 px-2 text-sm"
                      aria-label="施策の終了日（任意）"
                    />
                    <input
                      value={newInit.label}
                      onChange={(e) =>
                        setNewInit({ ...newInit, label: e.target.value })
                      }
                      placeholder="施策ラベル（例：LINE予約開始）"
                      className="flex-1 min-w-0 h-8 rounded border border-gray-200 px-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={addInitiative}
                      className="text-xs px-3 h-8 rounded bg-teal-600 text-white hover:bg-teal-700"
                    >
                      追加
                    </button>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveMetrics}
                    disabled={savingMetrics}
                    className="text-sm px-4 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {savingMetrics ? "保存中..." : "💾 クリニックの歩みを保存"}
                  </button>
                </div>
              </>
            )}
          </section>

          {/* 機能の表示設定（portal_feature_flags・指示書103） */}
          <section className="space-y-4 border-t border-gray-200 pt-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                🚀 機能の表示設定
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                今後追加される新機能の公開スイッチです。OFFの機能はメニューに表示されず、
                URLを直接開いても「準備中」と表示されます。既定はすべてOFFです。
              </p>
            </div>
            <div className="space-y-3">
              {FEATURE_META.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 space-y-1.5"
                >
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-800 flex-wrap">
                    <input
                      type="checkbox"
                      checked={featureFlags[m.id]}
                      disabled={savingFlags}
                      onChange={(e) => handleToggleFlag(m.id, e.target.checked)}
                    />
                    {m.label}
                    <span className="text-[10px] font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                      Phase {m.phase}
                    </span>
                    {!IMPLEMENTED_FEATURES.has(m.id) && (
                      <span className="text-[10px] font-medium bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
                        未実装
                      </span>
                    )}
                  </label>
                  <p className="text-xs text-gray-500 pl-6">{m.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
