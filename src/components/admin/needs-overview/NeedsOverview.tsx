"use client";

// 🧭 欲求の一覧（指示書276）— 院長だけの画面（判定はサーバー：/admin/needs-overview と /api/admin/needs-overview）
// ・一覧（5つ⇔15項目・並べ替え・職種と今いる段で絞り込み・高い欲求/低い欲求の印）
// ・一人ずつの詳しい画面（?user=）・15項目をスタッフどうしで比べる（最大6列）・チーム全体の傾向
// ・読むだけ。書き出し・一括ダウンロードは作らない。選んだ組み合わせは院長の端末の中（localStorage）だけ

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NeedsRadarChart } from "@/components/NeedsRadarChart";
import { NEEDS_GROUPS, NEED_DETAIL_ITEMS, NEED_GROUP_STYLE, NEED_LABELS, type NeedKey } from "@/lib/needs-survey";
import { NOT_DECIDED_LABEL } from "@/lib/michi-progress";
import {
  LEVEL_NOT_DECIDED,
  NEEDS_BINS,
  NEEDS_COMPARE_LIMIT_MESSAGE,
  NEEDS_COMPARE_MAX,
  NEEDS_COMPARE_MIN,
  NEEDS_COMPARE_STORAGE_KEY,
  NEEDS_EMPTY_LABEL,
  columnValue,
  filterNeedsRows,
  hasNeedsResult,
  moveCompare,
  needsColumns,
  normalizeCompareSelection,
  rowExtremes,
  sortNeedsRows,
  teamTrends,
  toggleCompare,
  type NeedsColumn,
  type NeedsPersonRow,
  type NeedsSort,
} from "@/lib/needs-overview";
import { NeedsPersonDetail } from "./NeedsPersonDetail";

type ListResp = {
  people: NeedsPersonRow[];
  roles: { id: string; label: string }[];
  levels: { id: string; name: string }[];
};

type Tab = "list" | "compare" | "trend";
const TABS: { key: Tab; label: string }[] = [
  { key: "list", label: "📋 一覧" },
  { key: "compare", label: "⚖ 比べる" },
  { key: "trend", label: "📊 チーム全体の傾向" },
];

const itemLabel = (key: string) => NEED_DETAIL_ITEMS.find((i) => i.key === key)?.label ?? key;
const itemNeed = (key: string): NeedKey => NEED_DETAIL_ITEMS.find((i) => i.key === key)?.need ?? "survival";
const colNeed = (c: NeedsColumn): NeedKey => (c.kind === "need" ? c.key : itemNeed(c.key));
const colLabel = (c: NeedsColumn) => (c.kind === "need" ? NEED_LABELS[c.key] : itemLabel(c.key));
const colId = (c: NeedsColumn) => `${c.kind}:${c.key}`;
const sameCol = (a: NeedsSort["col"], b: NeedsColumn) => typeof a === "object" && a.kind === b.kind && a.key === b.key;

function readSelection(): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(NEEDS_COMPARE_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeSelection(ids: string[]) {
  try {
    window.localStorage.setItem(NEEDS_COMPARE_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* 覚えられなくても使える */
  }
}

/** 高い欲求（上位3）・低い欲求（下位3）の印 */
export function NeedMark({ kind }: { kind: "strong" | "weak" }) {
  return kind === "strong" ? (
    <span className="ml-0.5 text-[10px] font-bold text-rose-600" title="高い欲求（上位3）" data-mark="strong">▲</span>
  ) : (
    <span className="ml-0.5 text-[10px] font-bold text-sky-700" title="低い欲求（下位3）" data-mark="weak">▼</span>
  );
}

function Legend() {
  return (
    <p className="text-[11px] text-gray-600">
      <span className="font-bold text-rose-600">▲</span> 高い欲求（上位3）　<span className="font-bold text-sky-700">▼</span> 低い欲求（下位3）
    </p>
  );
}

export function NeedsOverview() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const tab: Tab = sp.get("tab") === "compare" ? "compare" : sp.get("tab") === "trend" ? "trend" : "list";
  const detailUser = sp.get("user") ?? "";

  const [data, setData] = useState<ListResp | null>(null);
  const [error, setError] = useState("");
  const [withItems, setWithItems] = useState(false);
  const [sort, setSort] = useState<NeedsSort>({ col: "name", dir: "asc" });
  const [role, setRole] = useState("");
  const [level, setLevel] = useState("");
  const [showTest, setShowTest] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/needs-overview", { cache: "no-store", credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "読み込みに失敗しました");
        return (await r.json()) as ListResp;
      })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setSelected(normalizeCompareSelection(readSelection(), new Set(d.people.map((p) => p.userId))));
      })
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "読み込みに失敗しました"));
    return () => {
      alive = false;
    };
  }, []);

  const go = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const q = next.toString();
      router.push(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [sp, router, pathname]
  );

  const updateSelection = (ids: string[]) => {
    setSelected(ids);
    writeSelection(ids);
  };
  const toggle = (userId: string) => {
    const r = toggleCompare(selected, userId);
    if (r.limited) {
      setNotice(NEEDS_COMPARE_LIMIT_MESSAGE);
      window.setTimeout(() => setNotice(""), 4000);
      return;
    }
    setNotice("");
    updateSelection(r.next);
  };

  const levelOrder = useMemo(() => (data?.levels ?? []).map((l) => l.id), [data]);
  const filtered = useMemo(
    () => (data ? filterNeedsRows(data.people, { role, level, showTest }) : []),
    [data, role, level, showTest]
  );
  const rows = useMemo(() => sortNeedsRows(filtered, sort, levelOrder), [filtered, sort, levelOrder]);
  const byId = useMemo(() => new Map((data?.people ?? []).map((p) => [p.userId, p])), [data]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-gray-500">読み込み中…</p>;

  const detailPerson = detailUser ? byId.get(detailUser) : undefined;

  const filters = (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-needs-filters>
      <label className="inline-flex items-center gap-1">
        職種
        <select value={role} onChange={(e) => setRole(e.target.value)} className="min-h-[36px] rounded border border-gray-300 bg-white px-2" data-filter="role">
          <option value="">すべて</option>
          {data.roles.map((r) => (
            <option key={r.id} value={r.id}>{r.label}</option>
          ))}
        </select>
      </label>
      <label className="inline-flex items-center gap-1">
        今いる段
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="min-h-[36px] rounded border border-gray-300 bg-white px-2" data-filter="level">
          <option value="">すべて</option>
          {data.levels.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
          <option value={LEVEL_NOT_DECIDED}>{NOT_DECIDED_LABEL}</option>
        </select>
      </label>
      <button
        type="button"
        onClick={() => setShowTest((v) => !v)}
        aria-pressed={showTest}
        className={`min-h-[36px] rounded-full border px-3 ${showTest ? "border-amber-500 bg-amber-50 text-amber-900" : "border-gray-300 bg-white text-gray-700"}`}
        data-show-test
      >
        🧪 検証用も表示
      </button>
    </div>
  );

  return (
    <div className="space-y-3" data-needs-overview>
      <div className="space-y-1">
        <h1 className="text-lg font-bold text-gray-900">🧭 欲求の一覧</h1>
        <p className="text-[12px] leading-relaxed text-gray-600">
          院長だけが見られる画面です（委任はできません）。育成の面談や方針の相談で、5つの基本的欲求に配慮するために使います。
          本人の公開設定どおりの値だけを出しています（非公開の人・まだ入れていない人は「{NEEDS_EMPTY_LABEL}」）。15項目は「詳細（詳細15項目の欲求値）も公開」の人だけです。
        </p>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => go({ tab: t.key === "list" ? null : t.key })}
            className={`min-h-[40px] rounded-full border px-3 text-sm ${tab === t.key ? "border-teal-700 bg-teal-700 text-white" : "border-gray-300 bg-white text-gray-800"}`}
            data-tab={t.key}
          >
            {t.label}
            {t.key === "compare" && selected.length > 0 ? `（${selected.length}）` : ""}
          </button>
        ))}
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-950" data-compare-limit>
          {notice}
        </p>
      )}

      {tab === "list" && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {filters}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="inline-flex overflow-hidden rounded-full border border-gray-300" role="group" aria-label="列の出し方">
                <button type="button" onClick={() => setWithItems(false)} aria-pressed={!withItems} className={`min-h-[36px] px-3 ${!withItems ? "bg-teal-700 text-white" : "bg-white text-gray-700"}`} data-cols="5">
                  5つ
                </button>
                <button type="button" onClick={() => setWithItems(true)} aria-pressed={withItems} className={`min-h-[36px] px-3 ${withItems ? "bg-teal-700 text-white" : "bg-white text-gray-700"}`} data-cols="15">
                  15項目
                </button>
              </div>
              <button
                type="button"
                disabled={selected.length < NEEDS_COMPARE_MIN}
                onClick={() => go({ tab: "compare", user: null })}
                className="min-h-[36px] rounded-full bg-teal-700 px-3 text-white disabled:opacity-40"
                data-open-compare
              >
                ⚖ 比べる（{selected.length}/{NEEDS_COMPARE_MAX}）
              </button>
            </div>
          </div>
          <Legend />
          <NeedsTable rows={rows} withItems={withItems} sort={sort} setSort={setSort} selected={selected} onToggle={toggle} onOpen={(id) => go({ user: id })} />
          <p className="text-[11px] text-gray-500">{rows.length}人（並べ替えは見出しを押す。比べる人は左の □ で2〜{NEEDS_COMPARE_MAX}人選ぶ）</p>
        </section>
      )}

      {tab === "compare" && (
        <NeedsCompare
          people={selected.map((id) => byId.get(id)).filter((p): p is NeedsPersonRow => !!p)}
          onMove={(id, dir) => updateSelection(moveCompare(selected, id, dir))}
          onRemove={(id) => updateSelection(selected.filter((x) => x !== id))}
          onOpen={(id) => go({ user: id })}
          onBack={() => go({ tab: null })}
        />
      )}

      {tab === "trend" && (
        <section className="space-y-2">
          {filters}
          <NeedsTrend rows={filtered} />
        </section>
      )}

      {detailUser && (
        <NeedsPersonDetail
          key={detailUser}
          userId={detailUser}
          person={detailPerson}
          onClose={() => go({ user: null })}
        />
      )}
    </div>
  );
}

// ─── 一覧の表 ───

function SortHead({ label, active, dir, onClick, className = "" }: { label: React.ReactNode; active: boolean; dir: "asc" | "desc"; onClick: () => void; className?: string }) {
  return (
    <th className={`px-1.5 py-1.5 font-medium ${className}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={onClick} className="inline-flex min-h-[32px] items-center gap-0.5 whitespace-nowrap underline-offset-2 hover:underline">
        {label}
        <span className="text-[10px] text-gray-400">{active ? (dir === "asc" ? "▲" : "▼") : "⇅"}</span>
      </button>
    </th>
  );
}

function NeedsTable({
  rows,
  withItems,
  sort,
  setSort,
  selected,
  onToggle,
  onOpen,
}: {
  rows: NeedsPersonRow[];
  withItems: boolean;
  sort: NeedsSort;
  setSort: (s: NeedsSort) => void;
  selected: string[];
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const cols = needsColumns(withItems);
  const click = (col: NeedsSort["col"]) => {
    const active = typeof col === "string" ? sort.col === col : sameCol(sort.col, col);
    // 値の列は高い順から・名前などは五十音の順から
    const first: "asc" | "desc" = typeof col === "string" && col !== "answeredOn" ? "asc" : "desc";
    setSort({ col, dir: active ? (sort.dir === "asc" ? "desc" : "asc") : first });
  };
  const isActive = (col: NeedsSort["col"]) => (typeof col === "string" ? sort.col === col : sameCol(sort.col, col));
  const extra = 4; // 名前（選ぶを含む）・職種・段・入れた日の後に値の列

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white" data-needs-table>
      <table className="min-w-full border-collapse text-xs">
        <thead className="bg-gray-50 text-gray-700">
          <tr>
            <SortHead label={<span className="pl-7">名前</span>} active={isActive("name")} dir={sort.dir} onClick={() => click("name")} className="sticky left-0 z-20 bg-gray-50 text-left shadow-[1px_0_0_#e5e7eb]" />
            <SortHead label="職種" active={isActive("role")} dir={sort.dir} onClick={() => click("role")} className="text-left" />
            <SortHead label="今いる段" active={isActive("level")} dir={sort.dir} onClick={() => click("level")} className="text-left" />
            <SortHead label="入れた日" active={isActive("answeredOn")} dir={sort.dir} onClick={() => click("answeredOn")} className="text-left" />
            {cols.map((c) => {
              const s = NEED_GROUP_STYLE[colNeed(c)];
              return (
                <SortHead
                  key={colId(c)}
                  label={<span className={c.kind === "need" ? `font-bold ${s.text}` : "text-gray-700"}>{colLabel(c)}</span>}
                  active={isActive(c)}
                  dir={sort.dir}
                  onClick={() => click(c)}
                  className={`text-right ${c.kind === "need" ? s.headerBg : ""} ${c.kind === "need" ? "border-l border-gray-200" : ""}`}
                />
              );
            })}
            {!withItems && <th className="px-1.5 py-1.5 text-left font-medium">高い欲求（上位3）／低い欲求（下位3）</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const on = selected.includes(p.userId);
            const has = hasNeedsResult(p);
            return (
              <tr key={p.userId} className="border-t border-gray-100" data-row={p.userId} data-test-row={p.testSeed ? "1" : undefined}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-1.5 py-1 text-left shadow-[1px_0_0_#e5e7eb]">
                  <span className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggle(p.userId)}
                      aria-label={`${p.name}を比べる`}
                      className="h-5 w-5 shrink-0 accent-teal-700"
                      data-compare-check={p.userId}
                    />
                    <button type="button" onClick={() => onOpen(p.userId)} className="min-h-[32px] whitespace-nowrap text-left font-medium text-teal-800 underline underline-offset-2" data-open-person={p.userId}>
                      {p.name}
                    </button>
                  </span>
                  {p.testSeed && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-900" data-test-mark>🧪 検証用</span>}
                </td>
                <td className="whitespace-nowrap px-1.5 py-1 text-gray-700">{p.roleLabel || "—"}</td>
                <td className="whitespace-nowrap px-1.5 py-1 text-gray-700">{p.level ? p.levelName : <span className="text-gray-400">{NOT_DECIDED_LABEL}</span>}</td>
                <td className="whitespace-nowrap px-1.5 py-1 tabular-nums text-gray-700">{p.answeredOn || "—"}</td>
                {has ? (
                  <>
                    {cols.map((c) => {
                      const v = columnValue(p, c);
                      const s = NEED_GROUP_STYLE[colNeed(c)];
                      const mark = c.kind === "item" ? (p.strong.includes(c.key) ? "strong" : p.weak.includes(c.key) ? "weak" : null) : null;
                      return (
                        <td
                          key={colId(c)}
                          className={`whitespace-nowrap px-1.5 py-1 text-right tabular-nums ${c.kind === "need" ? `${s.headerBg} border-l border-gray-200 font-bold ${s.text}` : "text-gray-800"}`}
                          data-cell={colId(c)}
                        >
                          {v ?? <span className="text-gray-300">—</span>}
                          {mark && <NeedMark kind={mark} />}
                        </td>
                      );
                    })}
                    {!withItems && (
                      <td className="min-w-[12rem] px-1.5 py-1 text-[11px] text-gray-700">
                        {p.strong.length > 0 ? (
                          <>
                            <span className="font-bold text-rose-600">▲</span> {p.strong.map(itemLabel).join("・")}
                            <br />
                            <span className="font-bold text-sky-700">▼</span> {p.weak.map(itemLabel).join("・")}
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    )}
                  </>
                ) : (
                  <td colSpan={cols.length + (withItems ? 0 : 1)} className="px-2 py-1 text-[11px] text-gray-500" data-empty>
                    {NEEDS_EMPTY_LABEL}
                  </td>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={extra + cols.length + (withItems ? 0 : 1)} className="px-3 py-4 text-center text-gray-500">当てはまる人がいません</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── 比べる（1人1列・最大6列） ───

function NeedsCompare({
  people,
  onMove,
  onRemove,
  onOpen,
  onBack,
}: {
  people: NeedsPersonRow[];
  onMove: (id: string, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
  onBack: () => void;
}) {
  if (people.length < NEEDS_COMPARE_MIN) {
    return (
      <section className="space-y-2 rounded-xl border border-gray-200 bg-white p-4" data-compare-empty>
        <p className="text-sm text-gray-700">一覧で2〜{NEEDS_COMPARE_MAX}人を選んでから「⚖ 比べる」を押してください。</p>
        <button type="button" onClick={onBack} className="min-h-[36px] rounded-full border border-gray-300 px-3 text-xs">← 一覧へ</button>
      </section>
    );
  }
  const cell = (p: NeedsPersonRow, c: NeedsColumn, ex: { max: number; min: number } | null) => {
    const v = columnValue(p, c);
    const mark = c.kind === "item" ? (p.strong.includes(c.key) ? "strong" : p.weak.includes(c.key) ? "weak" : null) : null;
    const isMax = ex && v === ex.max;
    const isMin = ex && v === ex.min;
    return (
      <td
        key={p.userId}
        className={`px-1 py-1 text-center tabular-nums ${isMax ? "font-bold" : ""}`}
        data-compare-cell={`${p.userId}:${colId(c)}`}
        data-extreme={isMax ? "max" : isMin ? "min" : undefined}
      >
        <span
          className={`inline-flex min-w-[2.6rem] items-center justify-center rounded px-1 ${
            isMax ? "bg-rose-100 text-rose-900 ring-1 ring-rose-400" : isMin ? "bg-sky-100 text-sky-900 ring-1 ring-sky-400" : ""
          }`}
        >
          {v ?? <span className="text-gray-300">—</span>}
          {mark && <NeedMark kind={mark} />}
        </span>
      </td>
    );
  };
  return (
    <section className="space-y-2" data-compare>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend />
        <p className="text-[11px] text-gray-600">
          <span className="rounded bg-rose-100 px-1 ring-1 ring-rose-400">いちばん高い</span>
          {"　"}
          <span className="rounded bg-sky-100 px-1 ring-1 ring-sky-400">いちばん低い</span>（選んだ人の中で・行ごと）
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[40rem] table-fixed border-collapse text-xs" data-compare-table>
          <colgroup>
            <col className="w-[7.5rem]" />
            {people.map((p) => (
              <col key={p.userId} />
            ))}
          </colgroup>
          <thead>
            <tr className="align-top">
              <th className="sticky left-0 z-20 bg-white px-1.5 py-2 text-left text-[11px] font-medium text-gray-500">15項目</th>
              {people.map((p, i) => (
                <th key={p.userId} className="border-l border-gray-100 px-1 py-2 font-normal" data-compare-col={p.userId}>
                  <button type="button" onClick={() => onOpen(p.userId)} className="mx-auto block" aria-label={`${p.name}の詳しい画面`} data-compare-radar={p.userId}>
                    <NeedsRadarChart values={p.values} size={84} compact />
                  </button>
                  <button type="button" onClick={() => onOpen(p.userId)} className="block w-full truncate text-[12px] font-bold text-teal-800 underline underline-offset-2">
                    {p.name}
                  </button>
                  {p.testSeed && <span className="text-[10px] text-amber-900">🧪 検証用</span>}
                  <p className="truncate text-[10px] text-gray-600">{p.roleLabel || "—"}</p>
                  <p className="truncate text-[10px] text-gray-600">{p.level ? p.levelName : NOT_DECIDED_LABEL}</p>
                  <p className="text-[10px] tabular-nums text-gray-500">{p.answeredOn || NEEDS_EMPTY_LABEL}</p>
                  <div className="mt-1 flex justify-center gap-0.5">
                    <button type="button" disabled={i === 0} onClick={() => onMove(p.userId, -1)} className="h-7 w-7 rounded border border-gray-300 disabled:opacity-30" aria-label={`${p.name}を左へ`} data-move-left={p.userId}>◀</button>
                    <button type="button" disabled={i === people.length - 1} onClick={() => onMove(p.userId, 1)} className="h-7 w-7 rounded border border-gray-300 disabled:opacity-30" aria-label={`${p.name}を右へ`} data-move-right={p.userId}>▶</button>
                    <button type="button" onClick={() => onRemove(p.userId)} className="h-7 w-7 rounded border border-gray-300 text-gray-500" aria-label={`${p.name}を外す`} data-remove={p.userId}>✕</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NEEDS_GROUPS.map((g) => {
              const s = NEED_GROUP_STYLE[g.key];
              const needCol: NeedsColumn = { kind: "need", key: g.key };
              const exNeed = rowExtremes(people.map((p) => columnValue(p, needCol)));
              return (
                <Fragment key={g.key}>
                  <tr className={`${s.headerBg} border-t-2 border-gray-200`} data-compare-group={g.key}>
                    <th className={`sticky left-0 z-10 ${s.headerBg} px-1.5 py-1 text-left`}>
                      <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${s.dot}`} />
                      <span className={`font-bold ${s.text}`}>{g.label}</span>
                    </th>
                    {people.map((p) => cell(p, needCol, exNeed))}
                  </tr>
                  {g.items.map((it) => {
                    const c: NeedsColumn = { kind: "item", key: it.key };
                    const ex = rowExtremes(people.map((p) => columnValue(p, c)));
                    return (
                      <tr key={it.key} className={`border-b border-gray-50 border-l-4 ${s.rowBorder}`}>
                        <th className="sticky left-0 z-10 bg-white px-1.5 py-1 text-left font-normal text-gray-800">{it.label}</th>
                        {people.map((p) => cell(p, c, ex))}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500">— は値がない所（15項目は「詳細（詳細15項目の欲求値）も公開」の人だけ）。</p>
    </section>
  );
}

// ─── チーム全体の傾向 ───

function NeedsTrend({ rows }: { rows: NeedsPersonRow[] }) {
  const trends = teamTrends(rows);
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-trend>
      {trends.map((t) => {
        const s = NEED_GROUP_STYLE[t.key];
        const peak = Math.max(1, ...t.bins);
        return (
          <section key={t.key} className="rounded-xl border border-gray-200 bg-white p-3" data-trend-need={t.key}>
            <div className="flex items-baseline justify-between gap-2">
              <h3 className={`text-sm font-bold ${s.text}`}>
                <span className={`mr-1 inline-block h-2 w-2 rounded-full align-middle ${s.dot}`} />
                {NEED_LABELS[t.key]}
              </h3>
              <p className="text-[11px] text-gray-600">
                平均 <span className="font-bold tabular-nums text-gray-900" data-trend-avg>{t.average ?? "—"}</span>（{t.count}人）
              </p>
            </div>
            <ul className="mt-2 space-y-1">
              {NEEDS_BINS.map((b, i) => (
                <li key={b.label} className="flex items-center gap-2 text-[11px]">
                  <span className="w-14 shrink-0 tabular-nums text-gray-600">{b.label}</span>
                  <span className="h-3 flex-1 rounded bg-gray-100">
                    <span className={`block h-3 rounded ${s.dot}`} style={{ width: `${(t.bins[i] / peak) * 100}%` }} />
                  </span>
                  <span className="w-8 shrink-0 text-right tabular-nums text-gray-800">{t.bins[i]}人</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-[11px] text-gray-500 sm:col-span-2 lg:col-span-3">
        数えているのは、見られる結果がある人だけです（{rows.filter(hasNeedsResult).length}人／{rows.length}人）。
      </p>
    </div>
  );
}

