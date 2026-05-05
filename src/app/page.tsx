"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  loadPortalItems,
  savePortalItems,
  loadTodayWord,
} from "@/lib/portal-store";
import {
  PORTAL_KEYS,
  type NewsItem,
  type NewsCategory,
  type HiyariItem,
  type HiyariType,
  type ThankyouItem,
  type PolicyItem,
  type TodayWord,
} from "@/types/portal";

// ─── 初期データ（Supabaseが空のときのフォールバック） ───
const DEFAULT_NEWS: NewsItem[] = [
  {
    id: "1",
    title: "LUMINAポータルサイトへようこそ",
    category: "notice",
    author: "管理者",
    content:
      "新しいスタッフポータルが完成しました。新着情報・気づきシェア・ありがとうカードなどをご活用ください。",
    createdAt: new Date().toISOString(),
    isActive: true,
  },
];

const DEFAULT_TODAY_WORD: TodayWord = {
  text: "「当たり前のことを、特別熱心に、しかも徹底的に行なう。」",
  author: "成功の八原則 第八、凡事徹底",
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

// ─── クイックアクセス ───
const quickLinks = [
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
    sub: "LUMINA哲学・8原則",
    href: "/philosophy",
  },
  {
    icon: "📊",
    name: "等級制度",
    sub: "G1〜G5・評価項目",
    href: "/expert",
  },
  {
    icon: "📖",
    name: "学習",
    sub: "クイズ・症例学習",
    href: "/quiz",
  },
];

export default function PortalHome() {
  // データ
  const [news, setNews] = useState<NewsItem[]>(DEFAULT_NEWS);
  const [hiyariItems, setHiyariItems] = useState<HiyariItem[]>([]);
  const [thankyouItems, setThankyouItems] = useState<ThankyouItem[]>([]);
  const [activePolicy, setActivePolicy] = useState<PolicyItem | null>(
    DEFAULT_POLICY
  );
  const [todayWord, setTodayWord] = useState<TodayWord>(DEFAULT_TODAY_WORD);

  // モーダル状態
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  // 気づきシェア投稿フォーム
  const [showHiyariForm, setShowHiyariForm] = useState(false);
  const [hiyariType, setHiyariType] = useState<HiyariType>("hiyari");
  const [hiyariText, setHiyariText] = useState("");
  const [hiyariRole, setHiyariRole] = useState("マルチタスク医療事務");
  const [isAnonymous, setIsAnonymous] = useState(true);

  // ありがとうカード投稿フォーム
  const [showThankyouForm, setShowThankyouForm] = useState(false);
  const [tyTo, setTyTo] = useState("");
  const [tyFrom, setTyFrom] = useState("");
  const [tyMessage, setTyMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const todayStr = new Date().toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  useEffect(() => {
    const fetchAll = async () => {
      const [newsList, hiyariList, tyList, policyList, word] = await Promise.all([
        loadPortalItems<NewsItem>(PORTAL_KEYS.news, DEFAULT_NEWS),
        loadPortalItems<HiyariItem>(PORTAL_KEYS.hiyari, []),
        loadPortalItems<ThankyouItem>(PORTAL_KEYS.thankyou, []),
        loadPortalItems<PolicyItem>(PORTAL_KEYS.policy, [DEFAULT_POLICY]),
        loadTodayWord(DEFAULT_TODAY_WORD),
      ]);

      setNews(
        newsList
          .filter((n) => n.isActive)
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, 5)
      );
      setHiyariItems(
        [...hiyariList]
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, 3)
      );
      setThankyouItems(
        [...tyList]
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
          .slice(0, 3)
      );
      const active = policyList.find((p) => p.isActive) ?? policyList[0] ?? null;
      setActivePolicy(active);
      setTodayWord(word);
    };
    fetchAll().catch(() => {});
  }, []);

  // 気づきシェア投稿
  const handleHiyariSubmit = async () => {
    if (!hiyariText.trim()) return;
    setSubmitting(true);
    try {
      const current = await loadPortalItems<HiyariItem>(PORTAL_KEYS.hiyari, []);
      const newItem: HiyariItem = {
        id: `hi_${Date.now()}`,
        type: hiyariType,
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

  // ありがとうカード投稿
  const handleThankyouSubmit = async () => {
    if (!tyTo.trim() || !tyMessage.trim()) return;
    setSubmitting(true);
    try {
      const current = await loadPortalItems<ThankyouItem>(
        PORTAL_KEYS.thankyou,
        []
      );
      const newItem: ThankyouItem = {
        id: `ty_${Date.now()}`,
        fromName: tyFrom.trim() || "匿名",
        toName: tyTo.trim(),
        message: tyMessage.trim(),
        createdAt: new Date().toISOString(),
      };
      const next = [newItem, ...current];
      const ok = await savePortalItems(PORTAL_KEYS.thankyou, next);
      if (!ok) {
        alert("送信に失敗しました");
        return;
      }
      setThankyouItems(next.slice(0, 3));
      setTyTo("");
      setTyFrom("");
      setTyMessage("");
      setShowThankyouForm(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto -m-3 md:-m-6 bg-white min-h-screen">
      {/* ① ヘッダーバー */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
        <div>
          <p className="text-base font-medium text-gray-900">LUMINA</p>
          <p className="text-xs text-gray-400">南草津皮フ科 スタッフポータル</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{todayStr}</span>
          <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-xs font-medium text-teal-700">
            あ
          </div>
        </div>
      </header>

      {/* ② 今日の一言ヒーローセクション */}
      <section className="px-4 py-5 border-b border-gray-100">
        <p className="text-xl font-medium text-gray-900 leading-snug">
          おはようございます
        </p>
        <p className="text-sm text-gray-500 mt-1">
          本日の診療も、四方よしの精神で。
        </p>

        <div className="mt-4 p-4 bg-teal-50 rounded-xl border border-teal-100">
          <p className="text-xs font-medium text-teal-600 mb-2">今日の一言</p>
          <p className="text-sm text-teal-900 leading-relaxed">
            {todayWord.text}
          </p>
          <p className="text-xs text-teal-600 mt-2">— {todayWord.author}</p>
        </div>
      </section>

      {/* ③ 新着情報 */}
      <section className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            新着情報
          </h2>
          <span className="text-xs text-gray-400">
            {news.length}件表示中
          </span>
        </div>

        <div className="space-y-2">
          {news.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedNews(item)}
              className="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <div
                className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${dotColor(
                  item.category
                )}`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 leading-snug">{item.title}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {formatDate(item.createdAt)} · {item.author}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${badgeStyle(
                  item.category
                )}`}
              >
                {categoryLabel(item.category)}
              </span>
            </div>
          ))}
          {news.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">
              新着情報はありません
            </p>
          )}
        </div>
      </section>

      {/* ④ クイックアクセス */}
      <section className="px-4 py-5 border-b border-gray-100">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
          クイックアクセス
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {quickLinks.map((link) => (
            <Link key={`${link.name}-${link.href}`} href={link.href}>
              <div className="p-3 bg-white border border-gray-100 rounded-xl cursor-pointer hover:bg-gray-50 transition-colors text-center">
                <p className="text-xl mb-1">{link.icon}</p>
                <p className="text-xs font-medium text-gray-800">{link.name}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight hidden sm:block">
                  {link.sub}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ⑤ 気づきシェア */}
      <section id="hiyari" className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            気づきシェア
          </h2>
          <button
            type="button"
            onClick={() => setShowHiyariForm(true)}
            className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-full hover:bg-teal-700"
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
                <span className="text-xs text-gray-400">
                  {formatDate(item.createdAt)}
                </span>
              </div>
              <p className="text-sm text-gray-800 leading-relaxed">{item.text}</p>
              <p className="text-xs text-gray-400 mt-2">
                {item.role} · {item.isAnonymous ? "匿名" : item.role}
              </p>
            </div>
          ))}
          {hiyariItems.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">
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
              <textarea
                value={hiyariText}
                onChange={(e) => setHiyariText(e.target.value)}
                rows={4}
                placeholder={
                  hiyariType === "hiyari"
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
                className="w-full py-2.5 bg-teal-600 text-white rounded-xl text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {submitting ? "投稿中..." : "投稿する"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ⑥ ありがとうカード */}
      <section className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            ありがとうカード
          </h2>
          <button
            type="button"
            onClick={() => setShowThankyouForm(true)}
            className="text-xs px-3 py-1.5 bg-pink-500 text-white rounded-full hover:bg-pink-600"
          >
            + 送る
          </button>
        </div>

        <div className="space-y-2">
          {thankyouItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl"
            >
              <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center text-xs font-medium text-pink-700 flex-shrink-0">
                {item.toName.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-relaxed">
                  {item.message}
                </p>
                <p className="text-xs text-gray-400 mt-1.5">
                  {item.fromName} → {item.toName} · {formatDate(item.createdAt)}
                </p>
              </div>
              <span className="text-pink-400 flex-shrink-0 text-base">♥</span>
            </div>
          ))}
          {thankyouItems.length === 0 && (
            <p className="text-xs text-gray-400 py-4 text-center">
              まだ投稿がありません。同僚に感謝を伝えましょう。
            </p>
          )}
        </div>

        {showThankyouForm && (
          <div
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            onClick={() => setShowThankyouForm(false)}
          >
            <div
              className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-8 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-base font-medium text-gray-900">
                  ありがとうカードを送る
                </h3>
                <button
                  type="button"
                  onClick={() => setShowThankyouForm(false)}
                  className="text-gray-400 text-xl"
                >
                  ✕
                </button>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  宛先（誰に感謝しますか？）
                </label>
                <input
                  value={tyTo}
                  onChange={(e) => setTyTo(e.target.value)}
                  placeholder="〇〇さん"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  あなたの名前
                </label>
                <input
                  value={tyFrom}
                  onChange={(e) => setTyFrom(e.target.value)}
                  placeholder="〇〇より"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  メッセージ
                </label>
                <textarea
                  value={tyMessage}
                  onChange={(e) => setTyMessage(e.target.value)}
                  rows={3}
                  placeholder="感謝の気持ちを伝えましょう..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
                />
              </div>
              <button
                type="button"
                onClick={handleThankyouSubmit}
                disabled={!tyTo.trim() || !tyMessage.trim() || submitting}
                className="w-full py-2.5 bg-pink-500 text-white rounded-xl text-sm font-medium hover:bg-pink-600 disabled:opacity-50"
              >
                ♥ 送る
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ⑦ 経営方針 */}
      <section className="px-4 py-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
            経営方針
          </h2>
        </div>

        {activePolicy && (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
            <p className="text-xs font-medium text-purple-600 mb-2">
              {activePolicy.year}年度
            </p>
            <p className="text-sm font-medium text-purple-900 leading-snug">
              {activePolicy.purpose}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-3">
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

      {/* ニュース詳細モーダル */}
      {selectedNews && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
          onClick={() => setSelectedNews(null)}
        >
          <div
            className="bg-white rounded-t-2xl w-full max-w-lg p-6 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeStyle(
                  selectedNews.category
                )}`}
              >
                {categoryLabel(selectedNews.category)}
              </span>
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
            <p className="text-xs text-gray-400 mb-4">
              {formatDate(selectedNews.createdAt)} · {selectedNews.author}
            </p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {selectedNews.content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
