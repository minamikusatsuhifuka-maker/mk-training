"use client";

// クリニック目標のガントチャート本体（指示書77。task-matrix の GanttChart.tsx を忠実に移植）
// - 年度タブ／期間バー／マイルストーン◇／今日の縦線／目標名 sticky 固定／全目標一覧モーダル
// - データは content_store（portal_gantt）。task-matrix の Supabase 取得は content_store に置換。
// - 編集UI（計画を追加・行クリック編集・編集アイコン）は管理者のみレンダリング。
//   非管理者は閲覧専用（バー・一覧の閲覧のみ）。保存も lib 境界で管理者チェック（gantt-goals.ts）。

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { isAdminUser } from "@/lib/admin-role";
import {
  GanttGoal,
  MONTH_LABELS,
  GANTT_COLOR_OPTIONS,
  GANTT_CATEGORIES,
  getGanttGradient,
  ganttYears,
  monthPosInYear,
  genGanttId,
  loadGanttGoals,
  saveGanttGoals,
} from "@/lib/gantt-goals";

type GanttModalMode = { type: "add" } | { type: "edit"; goal: GanttGoal };

// ログイン中の管理者判定（AdminOnly と同じ流儀）
function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth
      .getUser()
      .then(({ data }) => setIsAdmin(isAdminUser(data.user)))
      .catch(() => {});
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setIsAdmin(isAdminUser(session?.user ?? null));
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return isAdmin;
}

// 目標 追加・編集モーダル（管理者のみ開かれる）
function GanttEditModal({
  mode,
  years,
  onSave,
  onDelete,
  onClose,
}: {
  mode: GanttModalMode;
  years: number[];
  onSave: (g: GanttGoal) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const isEdit = mode.type === "edit";
  const initial = isEdit ? mode.goal : null;
  const now = useMemo(() => new Date(), []);
  const thisYear = now.getFullYear();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState(
    initial?.category ?? GANTT_CATEGORIES[0]
  );
  const [startYear, setStartYear] = useState(initial?.startYear ?? thisYear);
  const [startMonth, setStartMonth] = useState(
    initial?.startMonth ?? now.getMonth()
  );
  const [endYear, setEndYear] = useState(initial?.endYear ?? thisYear);
  const [endMonth, setEndMonth] = useState(
    initial?.endMonth ?? Math.min(11, now.getMonth() + 3)
  );
  const [color, setColor] = useState(initial?.color ?? "gantt-teal");
  const [progress, setProgress] = useState(initial?.progress ?? 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const startTotal = startYear * 12 + startMonth;
  const endTotal = endYear * 12 + endMonth;
  const valid = title.trim() !== "" && endTotal >= startTotal;

  const handleSave = () => {
    if (!valid) return;
    onSave({
      id: initial?.id ?? genGanttId(),
      title: title.trim(),
      category,
      startYear,
      startMonth,
      endYear,
      endMonth,
      progress,
      color,
      milestones: initial?.milestones ?? [],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 px-6 py-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-700">
            {isEdit ? "目標を編集" : "新しい目標を追加"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/40 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              目標タイトル
            </label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid) handleSave();
              }}
              placeholder="例: 電子カルテ完全移行"
              className="w-full rounded-lg border border-gray-100 px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-teal-200 focus:border-gray-300"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              カテゴリ
            </label>
            <div className="flex flex-wrap gap-1.5">
              {GANTT_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    category === c
                      ? "bg-teal-500 text-white shadow-sm"
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                開始
              </label>
              <div className="flex gap-1.5">
                <select
                  value={startYear}
                  onChange={(e) => setStartYear(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-gray-100 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}年
                    </option>
                  ))}
                </select>
                <select
                  value={startMonth}
                  onChange={(e) => setStartMonth(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-gray-100 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"
                >
                  {MONTH_LABELS.map((m, i) => (
                    <option key={i} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                終了
              </label>
              <div className="flex gap-1.5">
                <select
                  value={endYear}
                  onChange={(e) => setEndYear(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-gray-100 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}年
                    </option>
                  ))}
                </select>
                <select
                  value={endMonth}
                  onChange={(e) => setEndMonth(Number(e.target.value))}
                  className="flex-1 rounded-lg border border-gray-100 px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"
                >
                  {MONTH_LABELS.map((m, i) => (
                    <option key={i} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              {!valid && title.trim() !== "" && (
                <p className="text-[11px] text-red-500 mt-1">
                  終了は開始以降にしてください
                </p>
              )}
            </div>
          </div>
          {isEdit && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">
                進捗 ({progress}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">
              カラー
            </label>
            <div className="flex flex-wrap gap-2">
              {GANTT_COLOR_OPTIONS.map((c) => {
                const g = getGanttGradient(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    className={`w-8 h-8 rounded-full bg-gradient-to-r ${g.from} ${g.to} transition-all ${
                      color === c.value
                        ? "ring-2 ring-offset-2 ring-teal-400 scale-110"
                        : "hover:scale-110 opacity-70 hover:opacity-100"
                    }`}
                    aria-label={c.label}
                  />
                );
              })}
            </div>
          </div>
        </div>
        <div className="px-6 pb-5 flex items-center justify-between">
          {isEdit && onDelete ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-500 font-medium">
                  本当に削除しますか？
                </span>
                <button
                  type="button"
                  onClick={() => onDelete(initial!.id)}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                >
                  削除する
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                  />
                </svg>
                削除
              </button>
            )
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!valid}
              className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-400 hover:to-emerald-500 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all duration-150"
            >
              {isEdit ? "更新" : "追加"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GanttChart() {
  const isAdmin = useIsAdmin();
  const [goals, setGoals] = useState<GanttGoal[]>([]);
  const now = useMemo(() => new Date(), []);
  const years = useMemo(() => ganttYears(now), [now]);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [ganttModal, setGanttModal] = useState<GanttModalMode | null>(null);
  const [showGoalsList, setShowGoalsList] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    loadGanttGoals()
      .then(setGoals)
      .catch(() => {});
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  // 今日の正確な位置（選択年内の割合 0〜1）
  const todayPosition = useMemo(() => {
    if (currentYear !== selectedYear) return null;
    return monthPosInYear(currentYear, currentMonth, now.getDate());
  }, [selectedYear, currentYear, currentMonth, now]);

  // 選択年に表示すべき goal をフィルタ
  const visibleGoals = useMemo(() => {
    return goals.filter((g) => {
      const gStartTotal = g.startYear * 12 + g.startMonth;
      const gEndTotal = g.endYear * 12 + g.endMonth;
      const yearStart = selectedYear * 12;
      const yearEnd = selectedYear * 12 + 11;
      return gStartTotal <= yearEnd && gEndTotal >= yearStart;
    });
  }, [goals, selectedYear]);

  const persist = useCallback(
    async (next: GanttGoal[]) => {
      const ok = await saveGanttGoals(next);
      showToast(ok ? "保存しました" : "保存に失敗しました");
    },
    [showToast]
  );

  const handleSaveGoal = useCallback(
    (g: GanttGoal) => {
      setGoals((prev) => {
        const exists = prev.find((e) => e.id === g.id);
        const next = exists
          ? prev.map((e) => (e.id === g.id ? g : e))
          : [...prev, g];
        void persist(next);
        return next;
      });
      setGanttModal(null);
    },
    [persist]
  );

  const handleDeleteGoal = useCallback(
    (id: string) => {
      setGoals((prev) => {
        const next = prev.filter((g) => g.id !== id);
        void persist(next);
        return next;
      });
      setGanttModal(null);
    },
    [persist]
  );

  // goal のバー位置（選択年に対する割合）
  const getBarStyle = (goal: GanttGoal) => {
    const yearStart = selectedYear * 12;
    const yearEnd = selectedYear * 12 + 12;
    const gStart = goal.startYear * 12 + goal.startMonth;
    const gEnd = goal.endYear * 12 + goal.endMonth + 1;
    const clampStart = Math.max(gStart, yearStart);
    const clampEnd = Math.min(gEnd, yearEnd);
    const leftPct = ((clampStart - yearStart) / 12) * 100;
    const widthPct = ((clampEnd - clampStart) / 12) * 100;
    return { left: `${leftPct}%`, width: `${widthPct}%` };
  };

  const getMilestonePos = (ms: { year: number; month: number }) => {
    if (ms.year !== selectedYear) return null;
    return ((ms.month + 0.5) / 12) * 100;
  };

  // 行クリック（管理者のみ編集モーダル）
  const openEdit = (goal: GanttGoal) => {
    if (!isAdmin) return;
    setGanttModal({ type: "edit", goal });
  };

  return (
    <div className="space-y-4">
      {/* 年度タブ + 追加ボタン */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center bg-white/80 backdrop-blur rounded-xl border border-gray-100 p-1 shadow-sm">
          {years.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => setSelectedYear(year)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                selectedYear === year
                  ? "bg-teal-500 text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {year}年
            </button>
          ))}
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setGanttModal({ type: "add" })}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-teal-500 to-teal-600 text-white hover:from-teal-400 hover:to-emerald-500 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm transition-all duration-150"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            目標を追加
          </button>
        )}
      </div>

      {/* ガントチャート本体 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        {/* ヘッダー */}
        <div className="flex border-b border-gray-100 min-w-fit">
          <div
            className="w-[33vw] sm:w-48 shrink-0 sticky left-0 z-10 bg-white/40 backdrop-blur-sm px-2 sm:px-4 py-3 text-[10px] font-semibold text-gray-500 flex items-center justify-between border-r border-gray-100 cursor-pointer hover:bg-gray-50/40 transition-colors"
            onClick={() => setShowGoalsList(true)}
          >
            <span className="truncate">目標・計画</span>
            <span className="text-[10px] text-gray-400 ml-1">
              {visibleGoals.length}件
            </span>
          </div>
          <div className="grid grid-cols-12 min-w-[720px] flex-1">
            {MONTH_LABELS.map((m, i) => (
              <div
                key={m}
                className={`px-1 py-3 text-center text-[10px] sm:text-[11px] font-medium border-l border-gray-50 min-w-[60px] ${
                  selectedYear === currentYear && i === currentMonth
                    ? "bg-gray-50 text-gray-700 font-bold"
                    : "text-gray-400"
                }`}
              >
                {m}
              </div>
            ))}
          </div>
        </div>

        {/* 行 */}
        {visibleGoals.length === 0 && (
          <div className="px-6 py-10 text-center text-sm text-gray-400">
            {selectedYear}年の目標はまだありません。
            {isAdmin
              ? "「目標を追加」から作成しましょう。"
              : ""}
          </div>
        )}
        {visibleGoals.map((goal) => {
          const barStyle = getBarStyle(goal);
          const isMultiYear = goal.startYear !== goal.endYear;
          const yearLabel = isMultiYear
            ? `${goal.startYear}/${goal.startMonth + 1}〜${goal.endYear}/${goal.endMonth + 1}`
            : "";

          return (
            <div
              key={goal.id}
              className={`flex border-b border-gray-50 group hover:bg-gray-50/30 transition-colors min-w-fit ${
                isAdmin ? "cursor-pointer" : ""
              }`}
              onClick={() => openEdit(goal)}
            >
              {/* 目標名（sticky固定） */}
              <div
                className="w-[33vw] sm:w-48 shrink-0 sticky left-0 z-10 bg-white/40 backdrop-blur-sm group-hover:bg-gray-50/40 px-2 sm:px-4 py-3 flex items-center justify-between border-r border-gray-100 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowGoalsList(true);
                }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-sm font-semibold text-gray-700 truncate">
                    {goal.title}
                  </p>
                  <div className="flex items-center gap-1 sm:gap-1.5 mt-0.5">
                    <span className="text-[9px] sm:text-[10px] text-gray-400">
                      {goal.category}
                    </span>
                    <span className="text-[9px] sm:text-[10px] font-medium text-gray-500">
                      {goal.progress}%
                    </span>
                    {yearLabel && (
                      <span className="hidden sm:inline text-[9px] text-gray-300">
                        {yearLabel}
                      </span>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setGanttModal({ type: "edit", goal });
                    }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 ml-1 sm:ml-2 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-teal-500 hover:bg-gray-50 transition-all"
                    aria-label="編集"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {/* バーエリア（横スクロール対象） */}
              <div className="relative grid grid-cols-12 py-3 min-w-[720px] flex-1">
                {todayPosition !== null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-gray-500 z-30"
                    style={{ left: `${todayPosition * 100}%` }}
                  />
                )}

                {/* 月グリッド線 */}
                {MONTH_LABELS.map((_, i) => (
                  <div key={i} className="border-l border-gray-50 min-w-[60px]" />
                ))}

                {/* 期間バー */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 z-10"
                  style={barStyle}
                >
                  {(() => {
                    const g = getGanttGradient(goal.color);
                    return (
                      <div className="relative w-full h-8 flex items-center">
                        <div
                          className={`bg-gradient-to-r ${g.from} ${g.to} h-8 rounded-2xl flex-1 relative overflow-hidden shadow-sm`}
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-white/20 rounded-2xl"
                            style={{ width: `${goal.progress}%` }}
                          />
                          <div className="relative z-10 flex items-center h-full px-3">
                            <span className="text-[10px] font-bold text-white truncate drop-shadow-sm">
                              {goal.title}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* マイルストーン */}
                {goal.milestones.map((ms, idx) => {
                  const pos = getMilestonePos(ms);
                  if (pos === null) return null;
                  const g = getGanttGradient(goal.color);
                  return (
                    <div
                      key={idx}
                      className="absolute top-0 bottom-0 flex flex-col items-center justify-end z-20"
                      style={{ left: `${pos}%`, transform: "translateX(-50%)" }}
                    >
                      <div className="absolute top-1/2 -translate-y-1/2">
                        <div
                          className={`w-3.5 h-3.5 ${g.dot} rotate-45 rounded-sm shadow-sm border-2 border-white`}
                        />
                      </div>
                      <div
                        className={`absolute ${idx % 2 === 0 ? "-top-1" : "-bottom-1"} whitespace-nowrap`}
                      >
                        <span className="text-[9px] font-medium text-gray-500 bg-white/90 px-1 py-0.5 rounded shadow-sm border border-gray-100">
                          {ms.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-4 px-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-2.5 bg-gray-400 rounded-full" />
          <span className="text-[11px] text-gray-500">期間バー</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-gray-400 rotate-45 rounded-sm" />
          <span className="text-[11px] text-gray-500">マイルストーン</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-2.5 bg-gray-400/30 rounded-full" />
          <span className="text-[11px] text-gray-500">進捗</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-5 bg-gray-500" />
          <span className="text-[11px] text-gray-500">今日</span>
        </div>
      </div>

      {/* 全目標一覧モーダル */}
      {showGoalsList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowGoalsList(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="bg-gradient-to-r from-teal-50 to-emerald-50 px-6 py-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-lg font-bold text-gray-700">
                  全目標・計画一覧
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {goals.length}件の目標
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGoalsList(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/40 transition-colors"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {goals.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">
                  目標はまだありません
                </p>
              )}
              {goals.map((goal) => {
                const g = getGanttGradient(goal.color);
                return (
                  <div
                    key={goal.id}
                    onClick={() => {
                      setShowGoalsList(false);
                      if (isAdmin) setGanttModal({ type: "edit", goal });
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl bg-gray-50/50 transition-colors ${
                      isAdmin ? "hover:bg-gray-100/60 cursor-pointer" : ""
                    }`}
                  >
                    <div
                      className={`w-2 h-10 rounded-full bg-gradient-to-b ${g.from} ${g.to} shrink-0`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-700 truncate">
                        {goal.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-400">
                          {goal.category}
                        </span>
                        <span className="text-[10px] font-medium text-gray-500">
                          {goal.progress}%
                        </span>
                        <span className="text-[10px] text-gray-300">
                          {goal.startYear}/{goal.startMonth + 1}〜{goal.endYear}/
                          {goal.endMonth + 1}
                        </span>
                      </div>
                    </div>
                    {isAdmin && (
                      <svg
                        className="w-4 h-4 text-gray-300 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m8.25 4.5 7.5 7.5-7.5 7.5"
                        />
                      </svg>
                    )}
                  </div>
                );
              })}
            </div>
            {isAdmin && (
              <div className="px-4 pb-4 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setShowGoalsList(false);
                    setGanttModal({ type: "add" });
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:text-teal-600 bg-gray-50 hover:bg-teal-50 border border-gray-100 hover:border-teal-200 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                  新しい目標を追加
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 追加・編集モーダル（管理者のみ） */}
      {isAdmin && ganttModal && (
        <GanttEditModal
          mode={ganttModal}
          years={years}
          onSave={handleSaveGoal}
          onDelete={
            ganttModal.type === "edit" ? handleDeleteGoal : undefined
          }
          onClose={() => setGanttModal(null)}
        />
      )}

      {/* 保存トースト */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-gray-800 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
