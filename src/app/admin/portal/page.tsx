"use client";

import { useEffect, useState } from "react";
import {
  loadPortalItems,
  savePortalItems,
  loadTodayWord,
  saveTodayWord,
  loadCharacterSettings,
  saveCharacterSettings,
} from "@/lib/portal-store";
import {
  PORTAL_KEYS,
  DEFAULT_CHARACTER_SETTINGS,
  type NewsItem,
  type NewsCategory,
  type HiyariItem,
  type ThankyouItem,
  type PolicyItem,
  type TodayWord,
  type CharacterSettings,
  type CharacterSvgType,
} from "@/types/portal";
import { CharacterSVG } from "@/components/CharacterNotification";

type TabKey = "news" | "hiyari" | "thankyou" | "policy" | "word" | "character";

const TABS: { key: TabKey; label: string }[] = [
  { key: "news", label: "📢 新着情報" },
  { key: "hiyari", label: "💛 気づきシェア" },
  { key: "thankyou", label: "♥ ありがとうカード" },
  { key: "policy", label: "🎯 経営方針" },
  { key: "word", label: "💬 今日の一言" },
  { key: "character", label: "🐾 キャラクター" },
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

export default function AdminPortalPage() {
  const [tab, setTab] = useState<TabKey>("news");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // データ
  const [news, setNews] = useState<NewsItem[]>([]);
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
    author: string;
    content: string;
    isActive: boolean;
  }>({
    title: "",
    category: "notice",
    author: "管理者",
    content: "",
    isActive: true,
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

  useEffect(() => {
    const fetchAll = async () => {
      const [n, h, t, p, w, c] = await Promise.all([
        loadPortalItems<NewsItem>(PORTAL_KEYS.news, []),
        loadPortalItems<HiyariItem>(PORTAL_KEYS.hiyari, []),
        loadPortalItems<ThankyouItem>(PORTAL_KEYS.thankyou, []),
        loadPortalItems<PolicyItem>(PORTAL_KEYS.policy, []),
        loadTodayWord({
          text: "",
          author: "",
          updatedAt: new Date().toISOString(),
        }),
        loadCharacterSettings(),
      ]);
      setNews(n);
      setHiyari(h);
      setThankyou(t);
      setPolicies(p);
      setTodayWord(w);
      setCharSettings(c);
      setLoading(false);
    };
    fetchAll().catch(() => setLoading(false));
  }, []);

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
      id: `news_${Date.now()}`,
      title: newsForm.title.trim(),
      category: newsForm.category,
      author: newsForm.author.trim() || "管理者",
      content: newsForm.content.trim(),
      createdAt: new Date().toISOString(),
      isActive: newsForm.isActive,
    };
    const next = [item, ...news];
    const ok = await savePortalItems(PORTAL_KEYS.news, next);
    setSaving(false);
    if (ok) {
      setNews(next);
      setNewsForm({
        title: "",
        category: "notice",
        author: "管理者",
        content: "",
        isActive: true,
      });
      flash("💾 追加しました");
    } else {
      alert("保存に失敗しました");
    }
  };

  const updateNewsItem = async (id: string, patch: Partial<NewsItem>) => {
    setSaving(true);
    const next = news.map((n) => (n.id === id ? { ...n, ...patch } : n));
    const ok = await savePortalItems(PORTAL_KEYS.news, next);
    setSaving(false);
    if (ok) {
      setNews(next);
      flash("💾 更新しました");
    }
  };

  const deleteNewsItem = async (id: string) => {
    if (!confirm("この新着情報を削除しますか？")) return;
    setSaving(true);
    const next = news.filter((n) => n.id !== id);
    const ok = await savePortalItems(PORTAL_KEYS.news, next);
    setSaving(false);
    if (ok) {
      setNews(next);
      flash("🗑️ 削除しました");
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

  if (loading) {
    return (
      <p className="text-sm text-slate-500 animate-pulse">読み込み中...</p>
    );
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🏠 ポータル管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            LUMINAポータルトップに表示するコンテンツを管理します
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
                : "border-transparent text-gray-500 hover:text-gray-700"
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
                <label className="text-xs text-gray-500 mb-1 block">
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
                <label className="text-xs text-gray-500 mb-1 block">
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
                <label className="text-xs text-gray-500 mb-1 block">
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
                <label className="text-xs text-gray-500 mb-1 block">
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
                className="bg-white border border-gray-200 rounded-xl p-4 space-y-2"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {n.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
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
              </div>
            ))}
            {news.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">
                まだ新着情報がありません
              </p>
            )}
          </div>
        </div>
      )}

      {tab === "hiyari" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
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
                  <span className="text-xs text-gray-400">
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
              <p className="text-xs text-gray-400 mt-2">
                {h.role} · {h.isAnonymous ? "匿名" : h.role}
              </p>
            </div>
          ))}
          {hiyari.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              まだ投稿がありません
            </p>
          )}
        </div>
      )}

      {tab === "thankyou" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">
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
              <p className="text-xs text-gray-400 mt-2">
                {t.fromName} → {t.toName} · {formatDateTime(t.createdAt)}
              </p>
            </div>
          ))}
          {thankyou.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
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
                <label className="text-xs text-gray-500 mb-1 block">年度</label>
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
                <label className="text-xs text-gray-500 mb-1 block">
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
                <label className="text-xs text-gray-500 mb-1 block">
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
                <label className="text-xs text-gray-500 mb-1 block">
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
                <label className="text-xs text-gray-500 mb-1 block">
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
                <label className="text-xs text-gray-500 mb-1 block">
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
                          <span className="text-gray-400">ミッション：</span>
                          {p.mission}
                        </p>
                        <p>
                          <span className="text-gray-400">ビジョン：</span>
                          {p.vision}
                        </p>
                        <p>
                          <span className="text-gray-400">バリュー：</span>
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
              <p className="text-sm text-gray-400 text-center py-8">
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
            <label className="text-xs text-gray-500 mb-1 block">
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
            <label className="text-xs text-gray-500 mb-1 block">
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
          <p className="text-xs text-gray-400">
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
            <p className="text-xs text-gray-400 mt-1 ml-6">
              未読の新着情報がある時、キャラクターが画面上方を横切ります
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
            <div className="flex justify-between text-xs text-gray-400 mt-1">
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
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>速い（5秒）</span>
              <span>ゆっくり（30秒）</span>
            </div>
          </div>

          {/* プレビュー */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 relative overflow-hidden">
            <p className="text-xs text-gray-400 mb-2">プレビュー</p>
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
    </div>
  );
}
