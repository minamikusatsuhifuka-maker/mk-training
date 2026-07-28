"use client";

// 検索付き資料選択パネル（指示書109で共有コンポーネント化）
// - 指示書107で管理画面（マニュアル下書きタブ）内にインライン実装したものを切り出し、
//   スタッフ側（勉強会アーカイブ等）と共用する。
// - 選択状態は親が管理する最小共有: このコンポーネントは
//   「検索＋カテゴリフィルタ＋候補リスト＋クリック通知(onPick)」だけを担う。
//   単一選択（107: onPick で即確定）にも複数選択（109: 親がトグル・excludeIds で選択済み除外）にも使える。
// - 資料一覧は自律ロード（content_store anon 直読み・LibraryNewsSection と同じ流儀・API不要）。

import { useState, useEffect, useMemo } from "react";
import { loadPortalObject } from "@/lib/portal-store";
import {
  LIBRARY_KEY,
  LIBRARY_CATEGORIES,
  normalizeStore,
  type LibraryDoc,
} from "@/lib/library";

export function LibraryDocPicker({
  onPick,
  excludeIds = [],
  defaultCategory = "all",
  disabled = false,
}: {
  onPick: (doc: LibraryDoc) => void;
  /** 候補から隠す資料ID（複数選択で選択済みを除外する用途） */
  excludeIds?: string[];
  /** 初期カテゴリフィルタ（107のマニュアル既定は "マニュアル" を渡す） */
  defaultCategory?: string;
  disabled?: boolean;
}) {
  const [docs, setDocs] = useState<LibraryDoc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>(defaultCategory);

  useEffect(() => {
    loadPortalObject<unknown>(LIBRARY_KEY, null)
      .then((raw) => setDocs(normalizeStore(raw).docs))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);
  const q = search.trim().toLowerCase();
  const candidates = docs.filter(
    (d) =>
      !excluded.has(d.id) &&
      (catFilter === "all" || d.category === catFilter) &&
      (!q || d.title.toLowerCase().includes(q))
  );

  return (
    <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="資料タイトルで検索"
          className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
        />
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5"
        >
          <option value="all">すべてのカテゴリ</option>
          {LIBRARY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {!loaded ? (
          <p className="text-xs text-gray-500 py-3 text-center animate-pulse">
            資料を読み込んでいます…
          </p>
        ) : (
          <>
            {candidates.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onPick(d)}
                disabled={disabled}
                className="w-full text-left text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 hover:bg-emerald-50 disabled:opacity-50"
              >
                {d.title}
                <span className="text-xs text-gray-500 ml-2">{d.category}</span>
              </button>
            ))}
            {candidates.length === 0 && (
              <p className="text-xs text-gray-500 py-3 text-center">
                該当する資料がありません（カテゴリを「すべて」に切り替えるか、先に資料庫へ登録してください）
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
