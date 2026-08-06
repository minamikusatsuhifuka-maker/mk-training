"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  loadPortalItems,
  savePortalItems,
  loadTodayWord,
  loadCharacterSettings,
  appendNewsLog,
} from "@/lib/portal-store";
import CharacterNotification from "@/components/CharacterNotification";
import { loadTasks, taskCounts } from "@/lib/staff-tasks";
import { getCurrentActorName, monthlyTopContributors } from "@/lib/news-log";
import { ThankyouFormModal } from "@/components/ThankyouFormModal";
import { useFeatureFlags } from "@/lib/use-feature-flags";
import {
  useNewsReactions,
  ReactionBar,
  ReactionSummary,
} from "@/components/NewsReactions";
import {
  useNewsColumns,
  NewsColumnsSelector,
  NewsGrid,
} from "@/components/NewsColumns";
import { NEWS_AUTHOR_LS_KEY } from "@/lib/news-reactions";
import { AI_INCHO_URL } from "@/lib/external-links";
import {
  CHARACTER_CHOICES,
  loadCharacterOrderedChoices,
} from "@/lib/character-order";
import { WeeklyQuestionSection } from "@/components/WeeklyQuestionSection";
import { MonthlySloganSection } from "@/components/MonthlySloganSection";
import { MonthOpeningShow } from "@/components/MonthOpeningShow";
import { MonthlyDigestSection } from "@/components/MonthlyDigestSection";
import { seasonalThemeFor } from "@/lib/seasonal";
import { CharacterSVG } from "@/components/CharacterNotification";
import {
  currentYm as currentMascotYm,
  loadMascotDuty,
  mascotForYm,
  mascotLabel,
} from "@/lib/mascot-duty";
import { GanttSummarySection } from "@/components/GanttSummarySection";
import { ClinicMetricsSection } from "@/components/ClinicMetricsSection";
import { LibraryNewsSection } from "@/components/LibraryNewsSection";
import {
  DEFAULT_PORTAL_FEATURES,
  loadPortalFeatures,
  type PortalFeatures,
} from "@/lib/portal-features";
import {
  PORTAL_KEYS,
  URGENCY_META,
  URGENCY_OPTIONS,
  urgencyOf,
  urgencyCardClass,
  isNewsExpired,
  DEFAULT_CHARACTER_SETTINGS,
  DEFAULT_HOME_LAYOUT,
  visibleHomeSectionKeys,
  thankyouToNames,
  formatThankyouTo,
  type ArchivedNewsItem,
  type NewsItem,
  type NewsCategory,
  type Urgency,
  type CharacterSvgType,
  type HiyariItem,
  type HiyariType,
  type ThankyouItem,
  type PolicyItem,
  type TodayWord,
  type HomeSectionConfig,
  type HomeSectionKey,
} from "@/types/portal";

// 投稿フォームのカテゴリ・キャラ選択肢（管理画面と同じ内容）
const NEWS_CATEGORY_CHOICES: { value: NewsCategory; label: string }[] = [
  { value: "important", label: "重要" },
  { value: "drug_info", label: "新薬情報" },
  { value: "notice", label: "お知らせ" },
  { value: "event", label: "イベント" },
];

// キャラ選択肢は lib/character-order.ts に集約（指示書137・並び順は管理画面で変更可能）

// ─── 初期データ（Supabaseが空のときのフォールバック） ───
const DEFAULT_NEWS: NewsItem[] = [
  {
    id: "1",
    title: "スタッフポータルへようこそ",
    category: "notice",
    author: "管理者",
    content:
      "新しいスタッフポータルが完成しました。新着情報・気づきシェア・ありがとうカードなどをご活用ください。",
    createdAt: new Date().toISOString(),
    isActive: true,
  },
];

const DEFAULT_TODAY_WORD: TodayWord = {
  text: "「当たり前のことを、特別熱心に、しかも徹底的に行う。」",
  author: "アチーブメント 成功の八原則 第八原則",
  updatedAt: new Date().toISOString(),
};

const DEFAULT_POLICY: PolicyItem = {
  id: "2026",
  year: 2026,
  purpose: "肌すこやかに、心かろやかに — 大切な人生を次のステージへ",
  mission: "患者様の人生好転・物心両面の幸福への貢献",
  vision: "ティール組織・全員主役・自律型生命体",
  value: "凡事徹底・先払い・インサイドアウト",
  fullText: "",
  isActive: true,
};

// ─── カテゴリ別スタイル ───
function dotColor(c: NewsCategory): string {
  switch (c) {
    case "important":
      return "bg-red-500";
    case "drug_info":
      return "bg-green-500";
    case "event":
      return "bg-blue-500";
    case "notice":
    default:
      return "bg-gray-400";
  }
}

function badgeStyle(c: NewsCategory): string {
  switch (c) {
    case "important":
      return "bg-red-50 text-red-700";
    case "drug_info":
      return "bg-green-50 text-green-700";
    case "event":
      return "bg-blue-50 text-blue-700";
    case "notice":
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function categoryLabel(c: NewsCategory): string {
  switch (c) {
    case "important":
      return "重要";
    case "drug_info":
      return "新薬情報";
    case "event":
      return "イベント";
    case "notice":
    default:
      return "お知らせ";
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ja-JP", {
      month: "numeric",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

// ─── datetime-local（"YYYY-MM-DDTHH:mm"）⇔ ISO 変換（管理画面と同じロジック） ───
function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string | undefined {
  if (!local) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

// 現在 + days日 を datetime-local 形式で返す（投稿フォームの通知期限の既定値）
function defaultNoticeLocal(days: number): string {
  return toDatetimeLocal(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
}

// ─── クイックアクセス ───
type QuickLink = {
  icon: string;
  name: string;
  sub: string;
  href: string;
  external?: boolean;
  highlight?: boolean;
};

const quickLinks: QuickLink[] = [
  {
    icon: "🏛️",
    name: "組織知識ベース",
    sub: "マニュアル・スキルマップ",
    href: "/knowledge",
  },
  {
    icon: "📚",
    name: "医療知識",
    sub: "疾患・薬剤・生物学的製剤",
    href: "/diseases",
  },
  {
    icon: "🤖",
    name: "AI相談",
    sub: "チャット・症例・ロールプレイ",
    href: "/ai-chat",
  },
  {
    icon: "✅",
    name: "業務チェック",
    sub: "ロール別チェックリスト",
    href: "/operations",
  },
  {
    icon: "⭐",
    name: "エキスパート",
    sub: "成長ロードマップ",
    href: "/expert",
  },
  {
    icon: "💛",
    name: "気づきシェア",
    sub: "ヒヤリハット・良いこと",
    href: "#hiyari",
  },
  {
    icon: "🌱",
    name: "理念・想い",
    sub: "理念・8原則",
    href: "/philosophy",
  },
  {
    icon: "📊",
    name: "等級制度",
    sub: "G1〜G5・評価項目",
    href: "/grade-system",
  },
  {
    icon: "🚀",
    name: "成長ロードマップ",
    sub: "AIでスキル・知識を一括生成",
    href: "/growth-builder",
  },
  {
    icon: "📖",
    name: "学習",
    sub: "クイズ・症例学習",
    href: "/quiz",
  },
  {
    icon: "👨‍⚕️",
    name: "AI院長",
    sub: "判断基準・理念を確認",
    href: AI_INCHO_URL,
    external: true,
    highlight: true,
  },
];

export default function PortalHome() {
  // データ
  const [news, setNews] = useState<NewsItem[]>(DEFAULT_NEWS);
  // キャラ選択肢（表示順は管理画面の character_order・失敗時は既定順のまま）
  const [characterChoices, setCharacterChoices] = useState(CHARACTER_CHOICES);
  useEffect(() => {
    loadCharacterOrderedChoices()
      .then(setCharacterChoices)
      .catch(() => {});
  }, []);
  const [hiyariItems, setHiyariItems] = useState<HiyariItem[]>([]);
  const [thankyouItems, setThankyouItems] = useState<ThankyouItem[]>([]);
  const [activePolicy, setActivePolicy] = useState<PolicyItem | null>(
    DEFAULT_POLICY
  );
  const [todayWord, setTodayWord] = useState<TodayWord>(DEFAULT_TODAY_WORD);

  // ホーム画面のセクション表示順（管理画面「ポータル管理→レイアウト」で編集）
  const [sectionOrder, setSectionOrder] = useState<HomeSectionKey[]>(
    DEFAULT_HOME_LAYOUT.map((s) => s.key)
  );

  // 機能スイッチ（46R。thanksShowcase=ありがとうの常時表示）
  const [features, setFeatures] = useState<PortalFeatures>(
    DEFAULT_PORTAL_FEATURES
  );
  useEffect(() => {
    loadPortalFeatures().then(setFeatures).catch(() => {});
  }, []);

  // タスクの期限切れ・今日件数（バッジ用）
  const [taskAlert, setTaskAlert] = useState<{
    overdue: number;
    today: number;
  } | null>(null);

  // モーダル状態
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  // お知らせ投稿フォーム（トップから誰でも投稿・指示書36）
  const [showNewsForm, setShowNewsForm] = useState(false);
  const [noticeDays, setNoticeDays] = useState(
    DEFAULT_CHARACTER_SETTINGS.newsNoticeDays
  );
  const [nfAuthor, setNfAuthor] = useState("");
  const [nfTitle, setNfTitle] = useState("");
  const [nfCategory, setNfCategory] = useState<NewsCategory>("notice");
  const [nfUrgency, setNfUrgency] = useState<Urgency>("normal");
  const [nfContent, setNfContent] = useState("");
  const [nfNoticeUntil, setNfNoticeUntil] = useState("");
  const [nfCharacter, setNfCharacter] = useState<CharacterSvgType | "">("");

  // 🙌 今月の共有（貢献の称賛表示。0件の月は非表示）
  const [monthlyTop, setMonthlyTop] = useState<
    { author: string; count: number }[]
  >([]);

  // お知らせリアクション（👍✅❤️🙏🎉・匿名OK）
  const reactions = useNewsReactions();

  // 新着情報カードの列数（既定2列・1〜4列・localStorage保持）
  const { columns, effectiveCols, changeColumns } = useNewsColumns();

  // 106: hiyari フラグON時、気づきシェアを「✨良いこと共有」専用に縮小
  //（見出し・種別2択・クイックアクセス・投稿typeを連動。OFF時は従来と完全に同一表示）
  const { flags: featureFlags } = useFeatureFlags();
  // 146-D: 当月の季節テーマ（純粋計算・データ取得なし）
  const seasonal = seasonalThemeFor();

  // 146-A: 当月の当番マスコット（フラグOFFなら読み込まない）
  const [dutyMascot, setDutyMascot] = useState<CharacterSvgType | null>(null);
  useEffect(() => {
    if (!featureFlags.mascot_duty) {
      setDutyMascot(null);
      return;
    }
    let cancelled = false;
    loadMascotDuty()
      .then((store) => {
        if (!cancelled) setDutyMascot(mascotForYm(store, currentMascotYm()));
      })
      .catch(() => {
        /* 取得失敗時は非表示のまま（ホームは壊さない） */
      });
    return () => {
      cancelled = true;
    };
  }, [featureFlags.mascot_duty]);

  // 気づきシェア投稿フォーム
  const [showHiyariForm, setShowHiyariForm] = useState(false);
  const [hiyariType, setHiyariType] = useState<HiyariType>("hiyari");
  const [hiyariText, setHiyariText] = useState("");
  const [hiyariRole, setHiyariRole] = useState("マルチタスク医療事務");
  const [isAnonymous, setIsAnonymous] = useState(true);

  // ありがとうカード投稿フォーム（指示書105で ThankyouFormModal に切り出し・挙動は従来と同一）
  const [showThankyouForm, setShowThankyouForm] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  // 新着情報セクションへのスクロール用ref
  const newsSectionRef = useRef<HTMLElement>(null);

  // モーダル表示中は背景スクロールをロックし、Escで閉じる
  useEffect(() => {
    if (!selectedNews) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedNews(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedNews]);

  // 投稿フォームモーダルも同様（背景スクロールロック＋Escで閉じる）
  useEffect(() => {
    if (!showNewsForm) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowNewsForm(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showNewsForm]);

  // 発信者名のプリフィル: 前回入力（localStorage）→ ログイン中ならプロフィール名で上書き
  useEffect(() => {
    try {
      const saved = localStorage.getItem(NEWS_AUTHOR_LS_KEY);
      if (saved) setNfAuthor(saved);
    } catch {
      // localStorage不可の環境では空のまま（手入力）
    }
    getCurrentActorName()
      .then((name) => {
        if (name) setNfAuthor(name);
      })
      .catch(() => {});
  }, []);

  const todayStr = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  useEffect(() => {
    const fetchAll = async () => {
      const [
        newsList,
        newsArchiveList,
        hiyariList,
        tyList,
        policyList,
        word,
        charSettings,
        layout,
      ] = await Promise.all([
        loadPortalItems<NewsItem>(PORTAL_KEYS.news, DEFAULT_NEWS),
        loadPortalItems<ArchivedNewsItem>(PORTAL_KEYS.newsArchive, []),
        loadPortalItems<HiyariItem>(PORTAL_KEYS.hiyari, []),
        loadPortalItems<ThankyouItem>(PORTAL_KEYS.thankyou, []),
        loadPortalItems<PolicyItem>(PORTAL_KEYS.policy, [DEFAULT_POLICY]),
        loadTodayWord(DEFAULT_TODAY_WORD),
        loadCharacterSettings(),
        loadPortalItems<HomeSectionConfig>(
          PORTAL_KEYS.homeLayout,
          DEFAULT_HOME_LAYOUT
        ),
      ]);

      setSectionOrder(visibleHomeSectionKeys(layout));

      // 期限切れ（noticeUntil超過 or createdAt+newsNoticeDays超過）は表示しない。
      const days =
        charSettings.newsNoticeDays ?? DEFAULT_CHARACTER_SETTINGS.newsNoticeDays;
      setNoticeDays(days);
      setNews(
        newsList
          .filter((n) => n.isActive && !isNewsExpired(n, days))
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, 5)
      );
      // 🙌 今月の共有: 掲載中＋アーカイブの全投稿から今月分を集計
      setMonthlyTop(monthlyTopContributors([...newsList, ...newsArchiveList]));
      setHiyariItems(
        [...hiyariList]
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, 3)
      );
      setThankyouItems(
        // 論理削除済みは表示しない（指示書105。deleted 未定義の既存データはそのまま表示）
        tyList
          .filter((t) => !t.deleted)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, 3)
      );
      const active = policyList.find((p) => p.isActive) ?? policyList[0] ?? null;
      setActivePolicy(active);
      setTodayWord(word);
    };
    fetchAll().catch(() => {});
  }, []);

  // タスクの超過/今日件数を算出（クライアント側＝SSR安全）
  useEffect(() => {
    loadTasks()
      .then((tasks) => {
        const c = taskCounts(tasks, new Date());
        setTaskAlert({ overdue: c.overdue, today: c.today });
      })
      .catch(() => {});
  }, []);

  // お知らせ投稿フォームを開く（通知期限の既定値をセット）
  const openNewsForm = () => {
    setNfNoticeUntil(defaultNoticeLocal(noticeDays));
    setShowNewsForm(true);
  };

  // お知らせ投稿（管理画面の追加と同じデータ形式で portal_news へ保存）
  const handleNewsSubmit = async () => {
    const author = nfAuthor.trim();
    const title = nfTitle.trim();
    if (!author || !title) return;
    setSubmitting(true);
    try {
      const current = await loadPortalItems<NewsItem>(PORTAL_KEYS.news, []);
      const item: NewsItem = {
        id: `news_${Date.now()}`,
        title,
        category: nfCategory,
        urgency: nfUrgency,
        author,
        content: nfContent.trim(),
        createdAt: new Date().toISOString(),
        isActive: true,
        noticeUntil: datetimeLocalToIso(nfNoticeUntil),
        character: nfCharacter || undefined,
      };
      const ok = await savePortalItems(PORTAL_KEYS.news, [item, ...current]);
      if (!ok) {
        alert("保存に失敗しました");
        return;
      }
      // 操作ログ（失敗しても投稿自体は成立させる）
      await appendNewsLog({
        action: "create",
        newsId: item.id,
        newsTitle: item.title,
        actor: author,
        source: "top",
      }).catch(() => {});
      try {
        localStorage.setItem(NEWS_AUTHOR_LS_KEY, author);
      } catch {
        // 記憶できない環境では次回も手入力
      }
      // 画面へ即時反映（新着一覧・通知アニメ・今月の共有）
      setNews((prev) => [item, ...prev].slice(0, 5));
      setMonthlyTop((prev) => {
        const next = prev.map((t) =>
          t.author === author ? { ...t, count: t.count + 1 } : t
        );
        if (!next.some((t) => t.author === author)) {
          next.push({ author, count: 1 });
        }
        return next.sort((a, b) => b.count - a.count).slice(0, 3);
      });
      setNfTitle("");
      setNfContent("");
      setNfCategory("notice");
      setNfUrgency("normal");
      setNfCharacter("");
      setShowNewsForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  // 気づきシェア投稿
  const handleHiyariSubmit = async () => {
    if (!hiyariText.trim()) return;
    setSubmitting(true);
    try {
      const current = await loadPortalItems<HiyariItem>(PORTAL_KEYS.hiyari, []);
      const newItem: HiyariItem = {
        id: `hi_${Date.now()}`,
        // 106: hiyari フラグON時、このフォームは「良いこと共有」専用（ヒヤリは /hiyari-report へ）
        type: featureFlags.hiyari ? "good" : hiyariType,
        text: hiyariText.trim(),
        role: hiyariRole,
        isAnonymous,
        createdAt: new Date().toISOString(),
      };
      const next = [newItem, ...current];
      const ok = await savePortalItems(PORTAL_KEYS.hiyari, next);
      if (!ok) {
        alert("保存に失敗しました");
        return;
      }
      setHiyariItems(next.slice(0, 3));
      setHiyariText("");
      setHiyariType("hiyari");
      setIsAnonymous(true);
      setShowHiyariForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  // セクション単位のJSX（管理画面「レイアウト」タブの並び順・表示設定に従って描画順を決める）
  const sectionNodes: Record<HomeSectionKey, React.ReactNode> = {
    today_word: (
      <section className="px-4 py-5 border-b border-gray-100">
        {/* 146-A: 当番マスコットはあいさつの横に常駐（文字に重ねない） */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xl font-medium text-gray-900 leading-snug">
              おはようございます
            </p>
            <p className="text-sm text-gray-600 mt-1">
              本日の診療も、四方よしの精神で。
            </p>
          </div>
          {featureFlags.mascot_duty && dutyMascot && (
            <div className="shrink-0 text-center">
              <CharacterSVG type={dutyMascot} size={44} />
              <p className="text-[10px] text-gray-600 mt-0.5 leading-tight">
                今月の当番
                <br />
                {mascotLabel(dutyMascot)}
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 p-4 bg-teal-50 rounded-xl border border-teal-100">
          <p className="text-xs font-medium text-teal-600 mb-2">今日の一言</p>
          <p className="text-sm text-teal-900 leading-relaxed max-w-prose">
            {todayWord.text}
          </p>
          <p className="text-xs text-teal-600 mt-2">— {todayWord.author}</p>
        </div>
      </section>
    ),
    // 141: 当月未設定なら null（カードごと非表示）
    monthly_slogan: <MonthlySloganSection />,
    // 146-C: 前月分の分かち愛ダイジェスト（投稿0件なら null）
    monthly_digest: featureFlags.monthly_digest ? (
      <MonthlyDigestSection />
    ) : null,
    news: (
      <section
        ref={newsSectionRef}
        className="px-4 py-5 border-b border-gray-100 scroll-mt-16"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
            お知らせ
          </h2>
          {/* 130: 投稿導線の視認性向上（ボタン拡大+最濃階調+影）。flex-wrapは375pxはみ出し防止 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-600">
              {news.length}件表示中
            </span>
            <NewsColumnsSelector columns={columns} onChange={changeColumns} />
            <button
              type="button"
              onClick={openNewsForm}
              className="text-sm font-medium px-4 py-2 rounded-full bg-teal-700 text-white shadow-md hover:bg-teal-800 hover:shadow-lg transition-colors"
            >
              ＋ お知らせを共有
            </button>
          </div>
        </div>

        <NewsGrid cols={effectiveCols}>
          {news.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedNews(item)}
              className={`p-4 rounded-xl cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors ${
                urgencyCardClass(item) || "bg-white border border-gray-100"
              }`}
            >
              {/* 上段: 未読ドット＋タイトル（2行省略） */}
              <div className="flex items-start gap-2">
                <div
                  className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${dotColor(
                    item.category
                  )}`}
                />
                <p className="flex-1 min-w-0 text-base text-gray-900 leading-snug line-clamp-2">
                  {item.title}
                </p>
              </div>
              {/* 中段: 日付・発信者・リアクション */}
              <p className="text-xs text-gray-600 mt-1 pl-4">
                {formatDate(item.createdAt)} · 👤 {item.author}{" "}
                <ReactionSummary map={reactions.map} newsId={item.id} />
              </p>
              {/* 下段: バッジ（折り返し） */}
              <div className="flex flex-wrap gap-1 mt-2 pl-4">
                <span
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                    URGENCY_META[urgencyOf(item)].badge
                  }`}
                >
                  {URGENCY_META[urgencyOf(item)].emoji}{" "}
                  {URGENCY_META[urgencyOf(item)].label}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeStyle(
                    item.category
                  )}`}
                >
                  {categoryLabel(item.category)}
                </span>
              </div>
            </div>
          ))}
        </NewsGrid>
        {news.length === 0 && (
          <p className="text-xs text-gray-600 py-4 text-center">
            お知らせはありません
          </p>
        )}

        {/* 🙌 今月の共有（称賛表示。競争を煽らず名前と件数のみ・0件の月は非表示） */}
        {monthlyTop.length > 0 && (
          <div className="mt-3 p-3 bg-gray-50 border border-gray-100 rounded-xl">
            <p className="text-xs font-medium text-gray-700 mb-1">
              🙌 今月の共有
            </p>
            <p className="text-xs text-gray-600">
              {monthlyTop
                .map((t) => `${t.author}さん ${t.count}件`)
                .join("・")}
              　ありがとうございます
            </p>
          </div>
        )}
      </section>
    ),
    quick_access: (
      <section className="px-4 py-5 border-b border-gray-100">
        <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider mb-3">
          クイックアクセス
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          {(featureFlags.hiyari
            ? // 106: ヒヤリハット報告の分離後は「良いこと共有」のリンクとして表示（OFF時は無変化）
              quickLinks.map((link) =>
                link.href === "#hiyari"
                  ? {
                      ...link,
                      icon: "✨",
                      name: "良いこと共有",
                      sub: "今日の小さなGood",
                    }
                  : link
              )
            : quickLinks
          ).map((link) => {
            const cardClass = link.highlight
              ? "p-4 bg-teal-50 border border-teal-200 rounded-xl cursor-pointer hover:bg-teal-100 transition-colors text-center min-h-[100px] flex flex-col justify-center"
              : "p-4 bg-white border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors text-center min-h-[100px] flex flex-col justify-center";
            const inner = (
              <div className={cardClass}>
                <p className="text-2xl mb-1.5">{link.icon}</p>
                <p className="text-sm font-medium text-gray-800">{link.name}</p>
                <p className="text-xs text-gray-600 mt-1 leading-tight">
                  {link.sub}
                </p>
              </div>
            );
            return link.external ? (
              <a
                key={`${link.name}-${link.href}`}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {inner}
              </a>
            ) : (
              <Link key={`${link.name}-${link.href}`} href={link.href}>
                {inner}
              </Link>
            );
          })}
        </div>
      </section>
    ),
    // クリニック目標の要約（指示書77）: 進行中0件のときはコンポーネント側でnullを返す
    gantt_summary: <GanttSummarySection />,
    // クリニックの歩みグラフ（指示書80）: データ0件のときはコンポーネント側でnullを返す
    clinic_metrics: <ClinicMetricsSection />,
    // 資料庫の新着・更新（指示書97-H）: 0件ならコンポーネント側でnullを返す
    library_news: <LibraryNewsSection />,
    // みんなへの質問（指示書46-A/47、75）: 機能スイッチOFF・配信停止時はコンポーネント側でnullを返す
    weekly_question: (
      <WeeklyQuestionSection profileNames={reactions.profileNames} />
    ),
    kizuki: (
      <section id="hiyari" className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
            {featureFlags.hiyari ? "✨ 良いこと共有" : "気づきシェア"}
          </h2>
          <button
            type="button"
            onClick={() => setShowHiyariForm(true)}
            className="text-sm px-4 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700 min-h-[40px]"
          >
            + 投稿する
          </button>
        </div>

        <div className="space-y-2">
          {hiyariItems.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-white border border-gray-100 rounded-xl"
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    item.type === "hiyari"
                      ? "bg-amber-50 text-amber-800"
                      : "bg-green-50 text-green-800"
                  }`}
                >
                  {item.type === "hiyari" ? "ヒヤリハット" : "良いこと共有"}
                </span>
                <span className="text-xs text-gray-600">
                  {formatDate(item.createdAt)}
                </span>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">{item.text}</p>
              <p className="text-xs text-gray-600 mt-2">
                {item.role} · {item.isAnonymous ? "匿名" : item.role}
              </p>
            </div>
          ))}
          {hiyariItems.length === 0 && (
            <p className="text-xs text-gray-600 py-4 text-center">
              まだ投稿がありません。最初の気づきを共有しませんか？
            </p>
          )}
        </div>

        {showHiyariForm && (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            onClick={() => setShowHiyariForm(false)}
          >
            <div
              className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-8 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium text-gray-900">
                  気づきを共有する
                </h3>
                <button
                  type="button"
                  onClick={() => setShowHiyariForm(false)}
                  className="text-gray-400 text-xl"
                >
                  ✕
                </button>
              </div>
              {featureFlags.hiyari ? (
                // 106: ヒヤリハットは専用ページへ分離（このフォームは良いこと共有専用）
                <p className="text-xs text-gray-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  ⚡ ヒヤリハットの報告は
                  <Link
                    href="/hiyari-report"
                    className="text-amber-700 underline font-medium mx-1"
                    onClick={() => setShowHiyariForm(false)}
                  >
                    「ヒヤリハット報告」ページ
                  </Link>
                  へ
                </p>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setHiyariType("hiyari")}
                    className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                      hiyariType === "hiyari"
                        ? "bg-amber-50 border-amber-300 text-amber-800"
                        : "border-gray-200 text-gray-600"
                    }`}
                  >
                    ⚡ ヒヤリハット
                  </button>
                  <button
                    type="button"
                    onClick={() => setHiyariType("good")}
                    className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                      hiyariType === "good"
                        ? "bg-green-50 border-green-300 text-green-800"
                        : "border-gray-200 text-gray-600"
                    }`}
                  >
                    ✨ 良いこと共有
                  </button>
                </div>
              )}
              <textarea
                value={hiyariText}
                onChange={(e) => setHiyariText(e.target.value)}
                rows={5}
                placeholder={
                  !featureFlags.hiyari && hiyariType === "hiyari"
                    ? "気づいたヒヤリハットを共有してください..."
                    : "良かったこと・嬉しかったことを共有してください..."
                }
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
              />
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="rounded"
                  />
                  匿名で投稿する
                </label>
                <select
                  value={hiyariRole}
                  onChange={(e) => setHiyariRole(e.target.value)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
                >
                  <option>マルチタスク医療事務</option>
                  <option>看護師</option>
                  <option>院長・医師</option>
                  <option>その他</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleHiyariSubmit}
                disabled={!hiyariText.trim() || submitting}
                className="w-full py-3 bg-teal-600 text-white rounded-xl text-base font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {submitting ? "投稿中..." : "投稿する"}
              </button>
            </div>
          </div>
        )}
      </section>
    ),
    thanks: (
      <section className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
            ありがとうカード
          </h2>
          <button
            type="button"
            onClick={() => setShowThankyouForm(true)}
            className="text-sm px-4 py-2 bg-pink-500 text-white rounded-full hover:bg-pink-600 min-h-[40px]"
          >
            + 送る
          </button>
        </div>

        {/* 最新カードの常時表示（46R-B: thanksShowcase OFF時は非表示・投稿は従来どおり） */}
        {features.thanksShowcase && (
          <div className="space-y-2">
            {thankyouItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl"
              >
                <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center text-xs font-medium text-pink-700 flex-shrink-0">
                  {(thankyouToNames(item)[0] ?? "?").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 leading-relaxed">
                    {item.message}
                  </p>
                  <p className="text-xs text-gray-600 mt-1.5">
                    {item.fromName} → {formatThankyouTo(item)} ·{" "}
                    {formatDate(item.createdAt)}
                  </p>
                </div>
                <span className="text-pink-400 flex-shrink-0 text-base">♥</span>
              </div>
            ))}
            {thankyouItems.length === 0 && (
              <p className="text-xs text-gray-600 py-4 text-center">
                まだ投稿がありません。同僚に感謝を伝えましょう。
              </p>
            )}
          </div>
        )}

        <ThankyouFormModal
          open={showThankyouForm}
          onClose={() => setShowThankyouForm(false)}
          onSubmitted={(next) =>
            setThankyouItems(next.filter((t) => !t.deleted).slice(0, 3))
          }
        />
      </section>
    ),
    policy: (
      <section className="px-4 py-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
            経営方針
          </h2>
        </div>

        {activePolicy && (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
            <p className="text-xs font-medium text-purple-600 mb-2">
              {activePolicy.year}年度
            </p>
            <p className="text-sm font-medium text-purple-900 leading-snug max-w-prose">
              {activePolicy.purpose}
            </p>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 mt-3">
              {[
                { label: "パーパス", value: activePolicy.purpose },
                { label: "ミッション", value: activePolicy.mission },
                { label: "ビジョン", value: activePolicy.vision },
                { label: "バリュー", value: activePolicy.value },
              ].map((item) => (
                <div
                  key={item.label}
                  className="text-xs text-purple-800 px-2 py-1.5 bg-white rounded-lg opacity-90"
                >
                  <span className="text-purple-500">{item.label}：</span>
                  {item.value}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    ),
  };

  return (
    <div className="max-w-[1536px] mx-auto -m-3 md:-m-6 bg-white min-h-screen">
      {/* 146-A/B: 月初の初回アクセス時に1回だけ（行進→今月の意識目標） */}
      <MonthOpeningShow
        mascotEnabled={featureFlags.mascot_duty}
        sloganEnabled={featureFlags.slogan_show}
      />

      {/* キャラクター通知（投稿から一定期間内は毎回再生／クリックで中央モーダル） */}
      <CharacterNotification news={news} onOpenNews={setSelectedNews} />

      {/* ① ヘッダーバー（並び替え対象外・常に先頭固定） */}
      <header className="relative overflow-hidden flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
        {/* 146-D: 季節の装飾。文字に重ならないようヘッダー帯の背面だけに置く */}
        {featureFlags.seasonal_skin && (
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${seasonal.bandClass}`}
          >
            {seasonal.marks.slice(0, 4).map((mark, i) => (
              <span
                key={`${mark}-${i}`}
                className="absolute text-base opacity-40 seasonal-sway"
                style={{
                  right: `${8 + i * 22}px`,
                  top: i % 2 === 0 ? "6px" : "26px",
                  animationDelay: `${i * 0.7}s`,
                }}
              >
                {mark}
              </span>
            ))}
          </div>
        )}
        <div className="relative">
          <p className="text-base font-medium text-gray-900">南草津皮フ科</p>
          <p className="text-xs text-gray-600">スタッフポータル</p>
        </div>
        <div className="relative flex items-center gap-3">
          <span className="text-xs text-gray-600">{todayStr}</span>
          <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-xs font-medium text-teal-700">
            あ
          </div>
        </div>
      </header>

      {/* タスク期限アラート（超過/今日が0なら非表示・並び替え対象外） */}
      {taskAlert && (taskAlert.overdue > 0 || taskAlert.today > 0) && (
        <section className="px-4 pt-4">
          <Link
            href="/tasks"
            className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <span className="text-xl">📋</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">みんなのタスク</p>
              <p className="text-xs text-gray-600">未完了の期限を確認</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {taskAlert.overdue > 0 && (
                <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-50 text-red-700">
                  期限切れ {taskAlert.overdue}件
                </span>
              )}
              {taskAlert.today > 0 && (
                <span className="text-xs px-2 py-1 rounded-full font-medium bg-yellow-50 text-yellow-700">
                  今日 {taskAlert.today}件
                </span>
              )}
            </div>
          </Link>
        </section>
      )}

      {/* ②〜⑦ 管理画面「ポータル管理→レイアウト」で設定した順・表示設定で描画 */}
      {sectionOrder.map((key) => (
        <Fragment key={key}>{sectionNodes[key]}</Fragment>
      ))}

      {/* ニュース詳細モーダル（画面中央配置） */}
      {selectedNews && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setSelectedNews(null)}
        >
          <div
            className={`relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl shadow-xl p-6 ${
              urgencyCardClass(selectedNews) || "bg-white"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                    URGENCY_META[urgencyOf(selectedNews)].badge
                  }`}
                >
                  {URGENCY_META[urgencyOf(selectedNews)].emoji}{" "}
                  {URGENCY_META[urgencyOf(selectedNews)].label}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeStyle(
                    selectedNews.category
                  )}`}
                >
                  {categoryLabel(selectedNews.category)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNews(null)}
                className="text-gray-400 text-xl"
              >
                ✕
              </button>
            </div>
            <h3 className="text-base font-medium text-gray-900 mb-2">
              {selectedNews.title}
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              {formatDate(selectedNews.createdAt)} · 👤 {selectedNews.author}
            </p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {selectedNews.content}
            </p>
            <ReactionBar newsId={selectedNews.id} controller={reactions} />
          </div>
        </div>
      )}

      {/* お知らせ投稿モーダル（トップから誰でも投稿・画面中央配置） */}
      {showNewsForm && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setShowNewsForm(false)}
        >
          <div
            className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl shadow-xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-medium text-gray-900">
                📢 お知らせを共有
              </h3>
              <button
                type="button"
                onClick={() => setShowNewsForm(false)}
                className="text-gray-400 text-xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  発信者名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nfAuthor}
                  onChange={(e) => setNfAuthor(e.target.value)}
                  placeholder="例：山田 花子"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  タイトル <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={nfTitle}
                  onChange={(e) => setNfTitle(e.target.value)}
                  placeholder="例：新しい物品の置き場所について"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    カテゴリ
                  </label>
                  <select
                    value={nfCategory}
                    onChange={(e) =>
                      setNfCategory(e.target.value as NewsCategory)
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                  >
                    {NEWS_CATEGORY_CHOICES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    緊急度
                  </label>
                  <select
                    value={nfUrgency}
                    onChange={(e) => setNfUrgency(e.target.value as Urgency)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                  >
                    {URGENCY_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  本文（任意）
                </label>
                <textarea
                  rows={4}
                  value={nfContent}
                  onChange={(e) => setNfContent(e.target.value)}
                  placeholder="詳しい内容があれば記入してください"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    通知期限
                  </label>
                  <input
                    type="datetime-local"
                    value={nfNoticeUntil}
                    onChange={(e) => setNfNoticeUntil(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    通知キャラクター
                  </label>
                  <select
                    value={nfCharacter}
                    onChange={(e) =>
                      setNfCharacter(e.target.value as CharacterSvgType | "")
                    }
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white"
                  >
                    <option value="">おまかせ</option>
                    {characterChoices.map((c) => (
                      <option key={c.type} value={c.type}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNewsForm(false)}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleNewsSubmit}
                  disabled={submitting || !nfAuthor.trim() || !nfTitle.trim()}
                  className="px-4 py-2 text-sm bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {submitting ? "共有中..." : "共有する"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
