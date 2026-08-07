"use client";

// 7つの実チェック（指示書152）— 1on1ノートで使う140項目
// 実行／実績／実力／実現／充実／誠実／結実 の7グループをアコーディオンで開閉。
// 保存は項目のid（例 "jikko-01"）で行い、文言は表示のたびに引く。
//
// 【評価原則】合計スコア・ランク・他メンバーとの比較は出さない（指示書152-6）。
// 出す数字はグループごとの個数バッジまで。総合点に見えるものを足さないこと。

import { useMemo, useState } from "react";
import {
  JITSU_GROUPS,
  JITSU_ITEM_BY_ID,
  JITSU_NOTICE,
  countByGroup,
  type JitsuGroupKey,
} from "@/lib/jitsu-checklist";

export function JitsuChecklist({
  checked,
  onChange,
  /** 前回の1on1でのチェック（今回新しく付いた実に ✨new を出すため。無ければ比較しない） */
  previousChecked,
  disabled = false,
}: {
  checked: string[];
  onChange: (next: string[]) => void;
  previousChecked?: string[] | null;
  disabled?: boolean;
}) {
  const [openGroup, setOpenGroup] = useState<JitsuGroupKey | null>(null);
  const [q, setQ] = useState("");
  const [readOnlyMode, setReadOnlyMode] = useState(false);

  const counts = useMemo(() => countByGroup(checked), [checked]);
  const checkedSet = useMemo(() => new Set(checked), [checked]);
  const prevSet = useMemo(
    () => new Set(previousChecked ?? []),
    [previousChecked]
  );
  const hasPrev = (previousChecked?.length ?? 0) > 0;
  const newlyChecked = useMemo(
    () => (hasPrev ? checked.filter((id) => !prevSet.has(id)) : []),
    [checked, prevSet, hasPrev]
  );

  const query = q.trim();
  const toggle = (id: string) => {
    if (disabled || readOnlyMode) return;
    onChange(
      checkedSet.has(id) ? checked.filter((x) => x !== id) : [...checked, id]
    );
  };

  return (
    <div className="space-y-3">
      {/* 評価原則の明示（常時表示・文言固定） */}
      <p className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg p-2 leading-relaxed">
        {JITSU_NOTICE}
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setReadOnlyMode((v) => !v)}
          className={`text-xs px-3 py-1.5 rounded-full border min-h-[36px] ${
            readOnlyMode
              ? "bg-slate-700 text-white border-slate-700"
              : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
          }`}
        >
          {readOnlyMode ? "✓ 読むだけモード中" : "📖 読むだけモード"}
        </button>
        <span className="text-xs text-gray-600">
          {readOnlyMode
            ? "チェックは付けられません。対話の観点として眺める用です。"
            : "当てはまる実を一緒に選んでください（数は評価ではありません）"}
        </span>
      </div>

      {/* 今回チェックした実の一覧（✨new は前回との比較） */}
      {checked.length > 0 && !readOnlyMode && (
        <div className="p-3 bg-teal-50 border border-teal-200 rounded-xl">
          {/* 7分類は色数を増やすと判別しづらくなるため、色は1トーンに抑えて
              「どの実か」は小見出しラベルで示す（指示 2026-08-07） */}
          <div className="space-y-2">
            {JITSU_GROUPS.map((g) => {
              const ids = checked.filter(
                (id) => JITSU_ITEM_BY_ID.get(id)?.group === g.key
              );
              if (ids.length === 0) return null;
              return (
                <div
                  key={g.key}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5"
                >
                  <span className="text-xs font-semibold text-gray-800 shrink-0">
                    {g.short}
                  </span>
                  {ids.map((id) => {
                    const it = JITSU_ITEM_BY_ID.get(id);
                    if (!it) return null;
                    const isNew = hasPrev && !prevSet.has(id);
                    return (
                      <button
                        type="button"
                        key={id}
                        onClick={() => toggle(id)}
                        disabled={disabled}
                        title="クリックで外す"
                        className={`text-xs px-2 py-1 border rounded-full disabled:opacity-50 ${
                          isNew
                            ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
                            : "bg-white border-teal-300 text-teal-800 hover:bg-teal-100"
                        }`}
                      >
                        {isNew && <span className="mr-1">✨new</span>}
                        {it.label} ×
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          {hasPrev && newlyChecked.length > 0 && (
            <p className="text-[11px] text-gray-600 mt-2">
              ✨new は前回の1on1では付いていなかった実です。
            </p>
          )}
        </div>
      )}

      {/* キーワード絞り込み（140項目対策） */}
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="キーワードで絞り込む（例: 継続）"
          className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="text-xs px-3 py-2 border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50"
          >
            クリア
          </button>
        )}
      </div>

      {/* 7グループのアコーディオン */}
      <div className="space-y-1.5">
        {JITSU_GROUPS.map((g) => {
          const items = query
            ? g.items.filter((it) => it.label.includes(query))
            : g.items;
          // 絞り込み中はヒットしたグループを自動で開く
          const open = query ? items.length > 0 : openGroup === g.key;
          if (query && items.length === 0) return null;
          return (
            <div
              key={g.key}
              className="border border-gray-200 rounded-xl bg-white overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenGroup(open && !query ? null : g.key)}
                className="w-full flex items-center justify-between gap-2 p-3 text-left min-h-[48px] hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-gray-900">
                  {g.short}
                  {counts[g.key] > 0 && (
                    <span className="ml-2 text-xs px-2 py-0.5 bg-teal-100 text-teal-800 rounded-full">
                      {counts[g.key]}
                    </span>
                  )}
                  <span className="ml-2 text-xs font-normal text-gray-600">
                    {g.title.replace(g.short, "")}
                  </span>
                </span>
                <span className="text-xs text-gray-500 shrink-0">
                  {open ? "▲" : "▼"}
                </span>
              </button>
              {open && (
                <div className="p-2 pt-0 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {items.map((it) => {
                    const on = checkedSet.has(it.id);
                    const isNew = hasPrev && on && !prevSet.has(it.id);
                    return (
                      <label
                        key={it.id}
                        className={`flex items-start gap-2 p-3 rounded-xl border min-h-[48px] transition-colors ${
                          readOnlyMode
                            ? "bg-white border-gray-200 cursor-default"
                            : on
                              ? "bg-teal-50 border-teal-300 cursor-pointer"
                              : "bg-white border-gray-200 hover:bg-gray-50 cursor-pointer"
                        } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
                      >
                        {!readOnlyMode && (
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(it.id)}
                            disabled={disabled}
                            className="mt-0.5 shrink-0"
                          />
                        )}
                        <span
                          className={`text-sm leading-snug ${
                            on && !readOnlyMode
                              ? "text-teal-900 font-medium"
                              : "text-gray-800"
                          }`}
                        >
                          {isNew && !readOnlyMode && (
                            <span className="mr-1 text-xs text-amber-600">
                              ✨new
                            </span>
                          )}
                          {it.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 保存済み記録の表示用: チェックされた実をチップで並べる（読み取り専用） */
export function JitsuCheckSummary({ checks }: { checks: string[] }) {
  if (checks.length === 0) return null;
  const counts = countByGroup(checks);
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
        <span className="font-medium">🌾 7つの実</span>
        {JITSU_GROUPS.filter((g) => counts[g.key] > 0).map((g) => (
          <span key={g.key} className="text-gray-600">
            {g.short} {counts[g.key]}
          </span>
        ))}
      </div>
      <div className="mt-1.5 space-y-1.5">
        {JITSU_GROUPS.map((g) => {
          const ids = checks.filter(
            (id) => JITSU_ITEM_BY_ID.get(id)?.group === g.key
          );
          if (ids.length === 0) return null;
          return (
            <div
              key={g.key}
              className="flex flex-wrap items-baseline gap-x-2 gap-y-1.5"
            >
              <span className="text-xs font-semibold text-gray-700 shrink-0">
                {g.short}
              </span>
              {ids.map((id) => {
                const it = JITSU_ITEM_BY_ID.get(id);
                if (!it) return null;
                return (
                  <span
                    key={id}
                    className="text-xs px-2 py-1 bg-teal-50 border border-teal-200 text-teal-800 rounded-full"
                  >
                    {it.label}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
