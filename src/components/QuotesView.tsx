"use client";

// 格言の閲覧画面（quotes_port）
// 本文は /api/quotes（ログイン必須）から取得する。クライアントJSにデータを埋め込まない。
// お気に入りは private_store（content_type="quote_favorites"・1ユーザー1レコード）に保存。
// 外部共有・SNS書き出しの導線は作らない（社内閲覧のみ）。

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  THEME_LABELS,
  THEME_ORDER,
  type Quote,
  type QuoteTheme,
} from "@/lib/quotes";
import {
  getRecord,
  upsertRecord,
  PrivateStoreError,
} from "@/lib/private-store-client";

const FAV_TYPE = "quote_favorites";
const FAV_KEY = "favorites";

type Filter = QuoteTheme | "all" | "fav";

export function QuotesView() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [todayId, setTodayId] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/quotes", { credentials: "same-origin" });
        if (!res.ok) throw new Error("格言の読み込みに失敗しました");
        const json = (await res.json()) as { quotes: Quote[]; todayId: number };
        setQuotes(json.quotes ?? []);
        setTodayId(json.todayId ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        setLoaded(true);
      }
    })();

    // お気に入り（本人のみ・取得できなくても閲覧は続行）
    getRecord<{ ids?: number[] }>(FAV_TYPE, FAV_KEY)
      .then((rec) => {
        const ids = rec?.data?.ids;
        if (Array.isArray(ids)) {
          setFavorites(new Set(ids.filter((v) => typeof v === "number")));
        }
      })
      .catch(() => {});
  }, []);

  const persist = useCallback(async (next: Set<number>) => {
    try {
      await upsertRecord(FAV_TYPE, FAV_KEY, {
        ids: Array.from(next).sort((a, b) => a - b),
        updatedAt: new Date().toISOString(),
      });
    } catch (e) {
      setError(
        e instanceof PrivateStoreError
          ? e.message
          : "お気に入りの保存に失敗しました"
      );
    }
  }, []);

  const toggleFav = (id: number) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
      return next;
    });
  };

  const today = useMemo(
    () => quotes.find((x) => x.id === todayId) ?? null,
    [quotes, todayId]
  );

  const counts = useMemo(() => {
    const m = {} as Record<QuoteTheme, number>;
    for (const t of THEME_ORDER) m[t] = 0;
    for (const x of quotes) m[x.theme] = (m[x.theme] ?? 0) + 1;
    return m;
  }, [quotes]);

  const visible = useMemo(() => {
    const key = q.trim();
    return quotes.filter((x) => {
      if (filter === "fav" && !favorites.has(x.id)) return false;
      if (filter !== "all" && filter !== "fav" && x.theme !== filter) {
        return false;
      }
      if (key && !x.text.includes(key) && !x.author.includes(key)) return false;
      return true;
    });
  }, [quotes, filter, favorites, q]);

  const Card = ({ x, big = false }: { x: Quote; big?: boolean }) => {
    const meta = THEME_LABELS[x.theme];
    const fav = favorites.has(x.id);
    return (
      <div className="p-4 bg-white border border-gray-200 rounded-xl">
        <div className="flex items-start justify-between gap-2">
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full border ${meta.chip} shrink-0`}
          >
            {meta.icon} {meta.label}
          </span>
          <button
            type="button"
            onClick={() => toggleFav(x.id)}
            aria-label={fav ? "お気に入り解除" : "お気に入りに追加"}
            aria-pressed={fav}
            className={`shrink-0 min-w-[44px] min-h-[44px] -mt-2 -mr-2 rounded-full text-xl leading-none ${
              fav ? "text-amber-500" : "text-gray-300 hover:text-gray-400"
            }`}
          >
            {fav ? "★" : "☆"}
          </button>
        </div>
        <p
          className={`mt-2 text-gray-900 leading-relaxed max-w-prose ${
            big ? "text-lg font-medium" : "text-sm"
          }`}
        >
          {x.text}
        </p>
        {/* 出典（著者）は社内利用でも必ず表示する */}
        <p className="text-xs text-gray-600 mt-2">— {x.author}</p>
      </div>
    );
  };

  return (
    <div
      className="max-w-3xl mx-auto p-4 space-y-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div>
        <h1 className="text-lg font-bold text-gray-900">💬 格言</h1>
        <p className="text-xs text-gray-600 mt-1">
          スタッフ専用の閲覧ページです（社外への共有はご遠慮ください）。
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </p>
      )}

      {/* 今日の1件 */}
      {today && (
        <section>
          <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider mb-2">
            今日の1件
          </h2>
          <Card x={today} big />
        </section>
      )}

      {/* 絞り込み */}
      <div className="space-y-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="キーワードで探す（言葉・著者名）"
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", `すべて ${quotes.length}`],
              ["fav", `★ お気に入り ${favorites.size}`],
            ] as const
          ).map(([k, label]) => (
            <button
              type="button"
              key={k}
              onClick={() => setFilter(k)}
              className={`text-xs px-3 rounded-full border min-h-[44px] ${
                filter === k
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
          {THEME_ORDER.map((t) => (
            <button
              type="button"
              key={t}
              onClick={() => setFilter(t)}
              className={`text-xs px-3 rounded-full border min-h-[44px] ${
                filter === t
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {THEME_LABELS[t].icon} {THEME_LABELS[t].label} {counts[t] ?? 0}
            </button>
          ))}
        </div>
      </div>

      {/* 一覧 */}
      <section className="space-y-2">
        <p className="text-xs text-gray-600">{visible.length}件</p>
        {!loaded && <p className="text-sm text-gray-600">読み込んでいます…</p>}
        {loaded && visible.length === 0 && (
          <p className="text-sm text-gray-600">
            {filter === "fav"
              ? "お気に入りはまだありません。☆ を押すと追加できます。"
              : "該当する格言がありません。"}
          </p>
        )}
        {visible.map((x) => (
          <Card key={x.id} x={x} />
        ))}
      </section>
    </div>
  );
}
