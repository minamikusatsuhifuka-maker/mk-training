"use client";

// スタッフ育成カルテ 一覧（指示書179 A-3／A-5）— 管理者のみ到達する
// - 在籍スタッフの一覧（職種・入職日・在籍年数）。「退職者も表示」の切り替え（169と同じ）
// - 検索: カルテに集約した本文を横断（サーバー側・管理者のみ）
// - 絞り込み: 職種・入職年・在籍/退職・受講した講座・タグ **だけ**
//   （家族構成・適性検査・サーベイの値・評価点は、一覧のデータに項目として存在しない）

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  EMPTY_KARTE_FILTER,
  TIMELINE_KIND_LABEL,
  filterKarteEntries,
  joinedYearOf,
  tenureLabel,
  type Course,
  type KarteFilter,
  type KarteListEntry,
  type SearchHit,
  type TimelineKind,
} from "@/lib/staff-growth";
import { fetchKarteListApi, searchKarteApi } from "@/lib/staff-growth-client";

export function StaffGrowthKarte() {
  const [entries, setEntries] = useState<KarteListEntry[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [today, setToday] = useState("");
  const [tableMissing, setTableMissing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<KarteFilter>(EMPTY_KARTE_FILTER);
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const j = await fetchKarteListApi();
      setEntries(j.entries);
      setCourses(j.courses);
      setToday(j.today);
      setTableMissing(j.tableMissing);
      setIsAdmin(j.isAdmin !== false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) if (e.roleId) m.set(e.roleId, e.roleLabel || e.roleId);
    return Array.from(m, ([id, label]) => ({ id, label }));
  }, [entries]);
  const yearOptions = useMemo(
    () =>
      Array.from(new Set(entries.map((e) => joinedYearOf(e.joinedOn)).filter(Boolean))).sort(
        (a, b) => b.localeCompare(a)
      ),
    [entries]
  );
  const tagOptions = useMemo(
    () => Array.from(new Set(entries.flatMap((e) => e.tags))).sort((a, b) => a.localeCompare(b, "ja")),
    [entries]
  );
  const usedCourses = useMemo(() => {
    const used = new Set(entries.flatMap((e) => e.courseIds));
    return courses.filter((c) => used.has(c.id));
  }, [entries, courses]);

  const hitMap = useMemo(() => new Map((hits ?? []).map((h) => [h.userId, h.hits])), [hits]);

  const visible = useMemo(() => {
    const filtered = filterKarteEntries(entries, filter);
    return hits ? filtered.filter((e) => hitMap.has(e.userId)) : filtered;
  }, [entries, filter, hits, hitMap]);

  const runSearch = async () => {
    const term = q.trim();
    if (!term) {
      setHits(null);
      return;
    }
    setSearching(true);
    setError("");
    try {
      const j = await searchKarteApi(term);
      setHits(j.hits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "検索に失敗しました");
    } finally {
      setSearching(false);
    }
  };

  const retiredCount = entries.filter((e) => e.retired).length;

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">📗 スタッフ育成カルテ</h1>
          {isAdmin ? (
            <p className="text-[11px] text-gray-600 mt-1 leading-relaxed">
              1on1・学びの記録・メンバーノート・自己評価・公開されたサーベイ・権限委譲を、人ごとに時系列で見る画面です。
              <strong>元の画面で見られないものは、ここでも見えません</strong>（非公開のサーベイは管理者にも出ません）。
              家族構成はこの画面には出しません。
            </p>
          ) : (
            <p className="text-[11px] text-gray-600 mt-1 leading-relaxed" data-delegate-note>
              院長から担当を指定されたスタッフのカルテを<strong>閲覧</strong>できます（追加・編集はできません）。
              見られるのは「学びの記録・本人の目標・1on1の約束と取り組み状況・本人が公開したサーベイ」だけです。
              閲覧は記録されます。
            </p>
          )}
        </div>
        {isAdmin && (
          <Link
            href="/staff-growth/courses"
            className="px-3 py-2 border border-teal-300 text-teal-800 rounded-full text-xs hover:bg-teal-50 min-h-[40px] flex items-center"
          >
            🗂 講座マスタ・設定
          </Link>
        )}
      </header>

      {tableMissing && isAdmin && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-gray-800 leading-relaxed">
          学びの記録のテーブルがまだ作られていません。
          <code className="mx-1">~/Downloads/179_スタッフ育成カルテ_テーブル作成.sql</code>
          を Supabase の SQL Editor で実行してください（実行までは学びの記録が空のまま表示されます）。
        </div>
      )}
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
      )}

      {/* 検索（管理者のみ・サーバー側で本文を横断） */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch();
          }}
          className="flex gap-2"
        >
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="本文を横断検索（例: レーザー 接遇）"
            className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm min-h-[44px]"
          />
          <button
            type="submit"
            disabled={searching}
            className="px-4 py-2 bg-teal-600 text-white rounded-full text-sm hover:bg-teal-700 disabled:opacity-40 min-h-[44px]"
          >
            {searching ? "検索中…" : "検索"}
          </button>
          {hits && (
            <button
              type="button"
              onClick={() => {
                setHits(null);
                setQ("");
              }}
              className="px-3 py-2 border border-gray-300 text-gray-700 rounded-full text-sm hover:bg-gray-50 min-h-[44px]"
            >
              解除
            </button>
          )}
        </form>

        {/* 絞り込み（A-5の5軸だけ） */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <select
            value={filter.roleId}
            onChange={(e) => setFilter((f) => ({ ...f, roleId: e.target.value }))}
            className={selectClass}
            aria-label="職種"
          >
            <option value="">職種: すべて</option>
            {roleOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={filter.joinedYear}
            onChange={(e) => setFilter((f) => ({ ...f, joinedYear: e.target.value }))}
            className={selectClass}
            aria-label="入職年"
          >
            <option value="">入職年: すべて</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}年
              </option>
            ))}
          </select>
          <select
            value={filter.employment}
            onChange={(e) =>
              setFilter((f) => ({ ...f, employment: e.target.value as KarteFilter["employment"] }))
            }
            className={selectClass}
            aria-label="在籍"
          >
            <option value="active">在籍のみ</option>
            <option value="all">退職者も表示{retiredCount ? `（${retiredCount}人）` : ""}</option>
            <option value="retired">退職者のみ</option>
          </select>
          <select
            value={filter.courseId}
            onChange={(e) => setFilter((f) => ({ ...f, courseId: e.target.value }))}
            className={selectClass}
            aria-label="受講した講座"
          >
            <option value="">講座: すべて</option>
            {usedCourses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={filter.tag}
            onChange={(e) => setFilter((f) => ({ ...f, tag: e.target.value }))}
            className={selectClass}
            aria-label="タグ"
          >
            <option value="">タグ: すべて</option>
            {tagOptions.map((t) => (
              <option key={t} value={t}>
                #{t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loaded ? (
        <p className="text-xs text-gray-500">読み込み中…</p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-gray-600">
          {hits ? "検索に当たる人がいません。" : "条件に合う人がいません。"}
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((e) => {
            const tenure = tenureLabel(e.joinedOn, today);
            const h = hitMap.get(e.userId);
            return (
              <li key={e.userId}>
                <Link
                  href={`/staff-growth/${encodeURIComponent(e.userId)}`}
                  className="block rounded-xl border border-gray-200 bg-white px-3 py-2.5 hover:bg-gray-50 min-h-[52px]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="text-sm font-medium text-gray-900">{e.name}</span>
                      {e.roleLabel && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          {e.roleLabel}
                        </span>
                      )}
                      {e.retired && (
                        <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded border border-gray-300 bg-gray-50 text-gray-600">
                          退職
                        </span>
                      )}
                      <span className="block text-[11px] text-gray-600">
                        {e.joinedOn
                          ? `入職 ${e.joinedOn.replaceAll("-", "/")}${tenure ? `（${tenure}）` : ""}`
                          : "入職日 未登録"}
                        {" ・ "}学び {e.learningCount}件
                        {e.lastLearningOn ? `（最新 ${e.lastLearningOn.replaceAll("-", "/")}）` : ""}
                      </span>
                      {h && (
                        <span className="block text-[11px] text-teal-800">
                          🔍{" "}
                          {(Object.keys(h) as TimelineKind[])
                            .map((k) => `${TIMELINE_KIND_LABEL[k]} ${h[k]}件`)
                            .join(" / ")}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">›</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const selectClass =
  "w-full rounded-md border border-gray-200 px-2 py-2 text-[12px] min-h-[40px] bg-white";
