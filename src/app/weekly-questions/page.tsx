"use client";

// 今週の質問アーカイブ（指示書47 ■2）
// 週ごと（新しい順）に「日付範囲＋質問文」を見出しに、その週の全回答（名前＋ひと言＋👍🙏件数）を表示。
// アコーディオン折りたたみ＋簡易キーワード検索（質問文・回答・名前）。
// サイドバー登録なし（ホームの「📚 過去の質問をみる」からのリンク遷移のみ）。
// portal_features.weeklyQuestion OFF 時は非表示（データは保持）。

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { loadPortalFeatures } from "@/lib/portal-features";
import {
  currentWeekKey,
  loadWeeklyQuestions,
  weeklyReactionCount,
  weekRangeLabel,
  WEEKLY_REACTION_META,
  type WeeklyQuestionsData,
} from "@/lib/weekly-questions";

// メールアドレスのままの名前は @ 前だけ表示（/members と同じ方針）
function shortName(name: string): string {
  if (!name.trim()) return "匿名";
  return name.includes("@") ? name.split("@")[0] : name;
}

export default function WeeklyQuestionsArchivePage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [data, setData] = useState<WeeklyQuestionsData | null>(null);
  const [query, setQuery] = useState("");
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(
    () => new Set([currentWeekKey()])
  );

  useEffect(() => {
    loadPortalFeatures()
      .then((f) => {
        setEnabled(f.weeklyQuestion);
        if (f.weeklyQuestion) {
          loadWeeklyQuestions().then(setData).catch(() => {});
        }
      })
      .catch(() => setEnabled(false));
  }, []);

  const toggleWeek = (wk: string) =>
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(wk)) next.delete(wk);
      else next.add(wk);
      return next;
    });

  // 週ごとの表示データ（新しい順）＋キーワード絞り込み
  const weeks = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return Object.keys(data.answers)
      .sort((a, b) => b.localeCompare(a))
      .map((weekKey) => {
        const question = data.questionByWeek[weekKey]?.trim() || null;
        const all = data.answers[weekKey] ?? [];
        if (!q) return { weekKey, question, answers: all };
        // 質問文がヒット → その週の全回答を表示。回答/名前ヒット → 該当回答のみ。
        if ((question ?? "").toLowerCase().includes(q)) {
          return { weekKey, question, answers: all };
        }
        const hit = all.filter(
          (a) =>
            a.text.toLowerCase().includes(q) ||
            shortName(a.name).toLowerCase().includes(q)
        );
        return { weekKey, question, answers: hit };
      })
      .filter((w) => w.answers.length > 0);
  }, [data, query]);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="📚 今週の質問アーカイブ"
        description="過去の質問とみんなの回答を週ごとに振り返れます"
        badge={data ? `${Object.keys(data.answers).length} 週分` : undefined}
      />
      <Link
        href="/"
        className="inline-block text-xs text-teal-700 underline underline-offset-2"
      >
        ← ホームへ戻る
      </Link>

      {enabled === null ? (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : !enabled ? (
        <p className="text-sm text-muted-foreground">
          「今週の質問」は現在オフになっています。
        </p>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">読み込み中...</p>
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔍 質問文・回答・名前で検索"
            className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 text-sm"
          />

          {weeks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {query.trim()
                ? "検索に一致する回答がありません。"
                : "まだ回答がありません。ホームの「今週の質問」から回答してみましょう。"}
            </p>
          ) : (
            <div className="space-y-3">
              {weeks.map((w) => {
                const open = openWeeks.has(w.weekKey) || !!query.trim();
                return (
                  <div
                    key={w.weekKey}
                    className="rounded-2xl border border-gray-200 bg-white overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => toggleWeek(w.weekKey)}
                      className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-xs text-gray-400 tabular-nums shrink-0">
                        📅 {weekRangeLabel(w.weekKey)}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                        {w.question ?? "（当時の質問）"}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">
                        {w.answers.length}件 {open ? "▲" : "▼"}
                      </span>
                    </button>
                    {open && (
                      <ul className="border-t border-gray-100 divide-y divide-gray-50">
                        {w.answers.map((a) => (
                          <li key={`${w.weekKey}_${a.id}`} className="px-4 py-2.5">
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">
                              {a.text}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              👤 {shortName(a.name)}
                              {WEEKLY_REACTION_META.map((m) => {
                                const n = weeklyReactionCount(
                                  data,
                                  w.weekKey,
                                  a.id,
                                  m.key
                                );
                                return n > 0 ? (
                                  <span key={m.key} className="ml-2">
                                    {m.emoji}
                                    <span className="ml-0.5 tabular-nums">
                                      {n}
                                    </span>
                                  </span>
                                ) : null;
                              })}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
