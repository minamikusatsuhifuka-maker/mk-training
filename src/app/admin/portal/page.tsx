"use client";

import { useEffect, useState } from "react";
import {
  loadPortalItems,
  savePortalItems,
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
  loadWeeklyQuestions,
  saveWeeklyQuestions,
} from "@/lib/weekly-questions";
import {
  TASKS_PAGE_LAYOUT_KEY,
  TASKS_SECTION_LABELS,
  DEFAULT_TASKS_LAYOUT,
  resolveTasksLayout,
  type TasksSectionConfig,
} from "@/lib/section-layout";
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
  | "thankyou"
  | "policy"
  | "word"
  | "character"
  | "layout"
  | "features";

const TABS: { key: TabKey; label: string }[] = [
  { key: "news", label: "📢 新着情報" },
  { key: "archive", label: "🗄️ アーカイブ" },
  { key: "history", label: "🕘 共有履歴" },
  { key: "contrib", label: "📊 共有ログ・貢献" },
  { key: "hiyari", label: "💛 気づきシェア" },
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

  // 今週の質問の質問プール（weekly_questions.pool。「⚙ 機能」タブで編集）
  const [pool, setPool] = useState<string[]>([]);
  const [poolLoaded, setPoolLoaded] = useState(false);
  const [newPoolQuestion, setNewPoolQuestion] = useState("");
  const [savingPool, setSavingPool] = useState(false);

  useEffect(() => {
    loadPortalFeatures().then(setFeatures).catch(() => {});
    loadWeeklyQuestions()
      .then((d) => setPool(d.pool))
      .catch(() => {})
      .finally(() => setPoolLoaded(true));
  }, []);

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

  useEffect(() => {
    const fetchAll = async () => {
      // 管理画面を開くたびに期限切れの新着をアーカイブへ移動（冪等）
      await archiveExpiredNews().catch(() => {});
      const [n, na, h, t, p, w, c, layout, tLayout, nlog, rx] =
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
  // ありがとうカード
  // ─────────────────────────────────────
  const deleteThankyou = async (id: string) => {
    if (!confirm("このカードを削除しますか？")) return;
    setSaving(true);
    const next = thankyou.filter((t) => t.id !== id);
    const ok = await savePortalItems(PORTAL_KEYS.thankyou, next);
    setSaving(false);
    if (ok) {
      setThankyou(next);
      flash("🗑️ 削除しました");
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

      {tab === "thankyou" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">
            ありがとうカードの一覧です（投稿はスタッフ画面から行います）
          </p>
          {thankyou.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <p className="text-sm text-gray-800 leading-relaxed flex-1 whitespace-pre-wrap">
                  {t.message}
                </p>
                <button
                  type="button"
                  onClick={() => deleteThankyou(t.id)}
                  className="text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50"
                >
                  削除
                </button>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                {t.fromName} → {t.toName} · {formatDateTime(t.createdAt)}
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

          {/* 質問プール（週次自動ローテーション） */}
          <section className="space-y-3 border-t border-gray-200 pt-6">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">
                ❓ 今週の質問 — 質問プール
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                週が変わるとこのプールから上から順（循環）に自動で出題されます。ホームの「✏️
                質問を編集」（管理者のみ）で手動上書きした週はそれが優先され、翌週からまた自動に戻ります。プールを空にすると自動出題は止まります。
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
        </div>
      )}
    </div>
  );
}
