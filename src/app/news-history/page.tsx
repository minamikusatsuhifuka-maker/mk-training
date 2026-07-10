"use client";

// お知らせ履歴（スタッフ側・閲覧専用）
// 現行掲載中＋期限切れ（アーカイブ）を横断して検索・グループ分けできる。
// 編集/削除の導線は出さない。クリックで中央モーダルの全文表示。

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  getNewsHistory,
  filterNewsHistory,
  groupNewsHistory,
  newsCategoryMeta,
  HISTORY_STATUS_META,
  type NewsHistoryItem,
  type NewsHistoryGroupAxis,
} from "@/lib/news-history";
import { URGENCY_META, urgencyOf, urgencyCardClass } from "@/types/portal";

const GROUP_AXES: { value: NewsHistoryGroupAxis; label: string }[] = [
  { value: "flat", label: "新しい順" },
  { value: "category", label: "カテゴリ別" },
  { value: "urgency", label: "緊急度別" },
  { value: "month", label: "年月別" },
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

export default function NewsHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<NewsHistoryItem[]>([]);
  const [keyword, setKeyword] = useState("");
  const [axis, setAxis] = useState<NewsHistoryGroupAxis>("flat");
  const [selected, setSelected] = useState<NewsHistoryItem | null>(null);

  useEffect(() => {
    getNewsHistory()
      // スタッフ側は「有効（スタッフに表示）」のもののみ（管理側と同じ非公開ルール）
      .then((items) => setHistory(items.filter((n) => n.isActive)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // モーダル表示中は背景スクロールをロックし、Escで閉じる（トップページと同じ挙動）
  useEffect(() => {
    if (!selected) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selected]);

  const filtered = useMemo(
    () => filterNewsHistory(history, { keyword }),
    [history, keyword]
  );
  const groups = useMemo(
    () => groupNewsHistory(filtered, axis),
    [filtered, axis]
  );

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-5">
      <PageHeader
        title="📜 お知らせ履歴"
        description="これまでのお知らせ（掲載中・期限切れ）を検索・グループ分けして振り返れます"
      />

      {/* 検索・グループ切替 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="🔍 キーワード検索（タイトル・本文、空白区切りでAND検索）"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-600">表示：</span>
          {GROUP_AXES.map((a) => (
            <button
              key={a.value}
              type="button"
              onClick={() => setAxis(a.value)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                axis === a.value
                  ? "bg-teal-50 border-teal-300 text-teal-800 font-medium"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-600">
          表示中 {filtered.length}件 ／ 全{history.length}件
        </p>
      </div>

      {loading && (
        <p className="text-sm text-gray-600 animate-pulse">読み込み中...</p>
      )}

      {!loading && filtered.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-700">
            {keyword.trim()
              ? "🔍 検索条件に一致するお知らせが見つかりませんでした"
              : "お知らせの履歴はまだありません"}
          </p>
          {keyword.trim() && (
            <p className="text-xs text-gray-500 mt-1">
              キーワードを変えて再度お試しください
            </p>
          )}
        </div>
      )}

      {/* グループごとの一覧 */}
      {!loading &&
        groups.map((g) => (
          <section key={g.key} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-800">
              {g.label}
              <span className="ml-2 text-xs font-normal text-gray-500">
                {g.items.length}件
              </span>
            </h2>
            {g.items.map((item) => {
              const cat = newsCategoryMeta(item.category);
              return (
                <div
                  key={`${item.status}_${item.id}`}
                  onClick={() => setSelected(item)}
                  className={`flex items-start gap-3 p-4 rounded-xl cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors ${
                    urgencyCardClass(item) || "bg-white border border-gray-100"
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cat.dot}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 leading-snug">
                      {item.title}
                    </p>
                    <p className="text-xs text-gray-600 mt-1">
                      {formatDateTime(item.createdAt)} · 👤 {item.author}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        URGENCY_META[urgencyOf(item)].badge
                      }`}
                    >
                      {URGENCY_META[urgencyOf(item)].emoji}{" "}
                      {URGENCY_META[urgencyOf(item)].label}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${cat.badge}`}
                    >
                      {cat.label}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        HISTORY_STATUS_META[item.status].badge
                      }`}
                    >
                      {HISTORY_STATUS_META[item.status].label}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>
        ))}

      {/* 詳細モーダル（画面中央・×/背景/Escで閉じる） */}
      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setSelected(null)}
        >
          <div
            className={`relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl shadow-xl p-6 ${
              urgencyCardClass(selected) || "bg-white"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                    URGENCY_META[urgencyOf(selected)].badge
                  }`}
                >
                  {URGENCY_META[urgencyOf(selected)].emoji}{" "}
                  {URGENCY_META[urgencyOf(selected)].label}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    newsCategoryMeta(selected.category).badge
                  }`}
                >
                  {newsCategoryMeta(selected.category).label}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    HISTORY_STATUS_META[selected.status].badge
                  }`}
                >
                  {HISTORY_STATUS_META[selected.status].label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-gray-400 text-xl"
              >
                ✕
              </button>
            </div>
            <h3 className="text-base font-medium text-gray-900 mb-2">
              {selected.title}
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              {formatDateTime(selected.createdAt)} · 👤 {selected.author}
            </p>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {selected.content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
