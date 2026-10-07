"use client";

// 事前アンケートをシンプルに見る・時期ごとに横並びで比べる（指示書214 §1・§2）
//
// 置き場所は2つ。中身は同じ（この部品1つだけ）
//   ・育成カルテの「アンケート」タブ（214 §1）
//   ・📝 1on1の事前アンケートの回答の一覧の「比べる」（214 §3）
//
// 出すもの
//   1. 最新の回答だけを読みやすく（問いと答えだけ・入力欄やボタンは出さない）。1on1の日・締切・提出日を添える
//   2. これまでの回答の一覧（1on1の日・提出日）。最大3つ選ぶと横に並べて比べる（4つ目は選べない）
//   3. 左の列から変わった答えには色と「変更」の印（空白だけの違いは無視）
//
// 出さないもの: ほかのスタッフとの比較・並べ替え・集計・点数（214 §0-4）。
// 見られるかどうかの判定はサーバー側（/api/admin/presurvey-answers/compare）。

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COMPARE_LEGACY_NOTE,
  COMPARE_PART_ORDER,
  COMPARE_PART_TITLE,
  PRESURVEY_COMPARE_MAX,
  buildPresurveyComparison,
  defaultCompareKeys,
  isCompareFull,
  isEmptyCell,
  toggleCompareKey,
  type CompareAnswerLike,
  type CompareCell,
} from "@/lib/presurvey-compare";
import { formatJpDate } from "@/lib/presurvey-periods";

type Entry = {
  recordKey: string;
  heldOn: string;
  deadline: string;
  submittedAt: string;
  updatedAt: string;
  twoParts: boolean;
  answers: CompareAnswerLike[];
};

type Loaded = {
  isAdmin: boolean;
  staffName: string;
  entries: Entry[];
  currentQuestionIds: string[];
};

/** 日時 "2026-10-01T09:30:00.000Z" → "2026年10月1日" */
function dayOf(iso: string): string {
  const d = (iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? formatJpDate(d) : "";
}

export function PresurveyCompare({
  userId,
  staffName,
}: {
  userId: string;
  /** 画面に出す名前（APIの名前が取れなかったときの控え） */
  staffName?: string;
}) {
  const [state, setState] = useState<Loaded | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setLoaded(false);
    try {
      const res = await fetch(
        `/api/admin/presurvey-answers/compare?userId=${encodeURIComponent(userId)}`,
        { cache: "no-store", credentials: "same-origin" }
      );
      const j = (await res.json().catch(() => ({}))) as Loaded & { error?: string };
      if (!res.ok) throw new Error(j.error || `読み込めませんでした (${res.status})`);
      const entries = j.entries ?? [];
      setState({
        isAdmin: j.isAdmin === true,
        staffName: j.staffName || staffName || "",
        entries,
        currentQuestionIds: j.currentQuestionIds ?? [],
      });
      // 214 §2: 最初は「最新」と「その前」を選んだ状態
      setSelected(defaultCompareKeys(entries));
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込めませんでした");
      setState(null);
    } finally {
      setLoaded(true);
    }
  }, [userId, staffName]);

  // 同じ人ぶんの読み込みは1回だけ。開発中の二重マウント（React の Strict Mode）や
  // 画面の作り替えで**閲覧の記録（214 §3）が二重に残らない**ようにする
  const startedFor = useRef("");
  useEffect(() => {
    if (startedFor.current === userId) return;
    startedFor.current = userId;
    void load();
  }, [userId, load]);

  // useMemo の依存を安定させるため、ここで1つの値にまとめる
  const entries = useMemo(() => state?.entries ?? [], [state]);
  const latest = entries[0];
  const comparison = useMemo(() => {
    const picked = entries.filter((e) => selected.includes(e.recordKey));
    if (picked.length < 2) return null;
    return buildPresurveyComparison(picked, state?.currentQuestionIds ?? []);
  }, [entries, selected, state?.currentQuestionIds]);

  if (!loaded) {
    return <p className="text-xs text-gray-500">読み込み中…</p>;
  }
  if (error) {
    return (
      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2" role="alert">
        {error}
      </p>
    );
  }
  if (entries.length === 0) {
    return (
      <p className="text-xs text-gray-500" data-presurvey-empty>
        提出された事前アンケートの回答はまだありません。
      </p>
    );
  }

  return (
    <div className="space-y-3" data-presurvey-compare>
      {/* ── 1. 最新の回答（読みやすく） ── */}
      {latest && (
        <section className="rounded-xl border border-sky-200 bg-white p-3 space-y-2" data-presurvey-latest>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h3 className="text-sm font-medium text-gray-900">📝 最新の回答</h3>
            <p className="text-[11px] text-gray-600">
              1on1 {formatJpDate(latest.heldOn) || "日付なし"}
              {latest.deadline && ` ・ 締切 ${formatJpDate(latest.deadline)}`}
              {dayOf(latest.submittedAt) && ` ・ 提出 ${dayOf(latest.submittedAt)}`}
            </p>
          </div>
          {!latest.twoParts && (
            <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1">
              2部構成より前（197の9問）の回答です。そのままの形で出しています。
            </p>
          )}
          <AnswerReadView answers={latest.answers} />
        </section>
      )}

      {/* ── 2. これまでの回答の一覧（最大3つ選ぶ） ── */}
      <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
        <h3 className="text-sm font-medium text-gray-900">🗂 これまでの回答</h3>
        <p className="text-[11px] text-gray-500">
          {`最大${PRESURVEY_COMPARE_MAX}つまで選ぶと、下に横に並べて比べられます（同じ人の、時期ごとの回答どうしだけ）。`}
        </p>
        <ul className="space-y-1" data-presurvey-history>
          {entries.map((e) => {
            const checked = selected.includes(e.recordKey);
            const disabled = !checked && isCompareFull(selected);
            return (
              <li key={e.recordKey}>
                <label
                  className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border px-2 py-1.5 text-[12px] ${
                    checked ? "border-teal-300 bg-teal-50/60" : "border-gray-200 bg-white"
                  } ${disabled ? "opacity-50" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => setSelected((prev) => toggleCompareKey(prev, e.recordKey))}
                    data-presurvey-pick={e.recordKey}
                    className="accent-teal-600"
                  />
                  <span className="text-gray-900">1on1 {formatJpDate(e.heldOn) || "日付なし"}</span>
                  <span className="text-[11px] text-gray-500">
                    提出 {dayOf(e.submittedAt) || "記録なし"}
                  </span>
                  {!e.twoParts && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      旧形式
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
        {entries.length === 1 && (
          <p className="text-[11px] text-gray-500">回答が1件だけなので、まだ並べて比べられません。</p>
        )}
        {entries.length > 1 && selected.length < 2 && (
          <p className="text-[11px] text-gray-500">2つ以上選ぶと、横に並べて比べられます。</p>
        )}
      </section>

      {/* ── 3. 横並びの比較 ── */}
      {comparison && <CompareTable comparison={comparison} />}
    </div>
  );
}

/** 最新の回答を「問いと答えだけ」で読む（入力欄・ボタンは出さない） */
function AnswerReadView({ answers }: { answers: CompareAnswerLike[] }) {
  const parts = COMPARE_PART_ORDER.map((p) => ({
    part: p,
    list: answers.filter((a) => (a.part === 1 ? 1 : a.part === 2 ? 2 : 0) === p),
  })).filter((g) => g.list.length > 0);
  if (parts.length === 0) {
    return <p className="text-[11px] text-gray-500">回答の中身がありません。</p>;
  }
  return (
    <div className="space-y-2">
      {parts.map((g) => (
        <section key={g.part} className="space-y-1.5" data-presurvey-read-part={g.part}>
          <h4 className="text-[12px] font-medium text-gray-700 border-l-4 border-sky-300 pl-2">
            {COMPARE_PART_TITLE[g.part]}
          </h4>
          <ul className="space-y-1.5">
            {g.list.map((a) => (
              <li key={a.questionId}>
                <p className="text-[11px] text-gray-500 leading-snug">{a.question}</p>
                <CellBody
                  cell={{
                    present: true,
                    choice: a.choice,
                    text: a.text,
                    unchanged: a.unchanged,
                    changed: false,
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** 欄の中身（選んだ言葉と書いた文の両方を出す・214 §2） */
function CellBody({ cell }: { cell: CompareCell }) {
  if (!cell.present) return <p className="text-[12px] text-gray-400">—</p>;
  if (isEmptyCell(cell)) return <p className="text-[12px] text-gray-400">（未回答）</p>;
  return (
    <div className="space-y-0.5">
      {(cell.choice || cell.unchanged) && (
        <p>
          <span className="inline-block text-[11px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-900">
            {cell.choice || "変わりない"}
          </span>
        </p>
      )}
      {cell.text.trim() && (
        <p className="text-[12px] text-gray-900 whitespace-pre-wrap leading-relaxed">{cell.text}</p>
      )}
    </div>
  );
}

/**
 * 横並びの表（214 §2）。
 * ・列は左が古い回答、右が新しい回答。行は問いごとにそろえる
 * ・スマートフォンでは横にスクロールでき、問いの列は左に固定する（sticky）
 */
function CompareTable({
  comparison,
}: {
  comparison: ReturnType<typeof buildPresurveyComparison>;
}) {
  const { columns, rows } = comparison;
  const groups = COMPARE_PART_ORDER.map((p) => ({
    part: p,
    list: rows.filter((r) => r.part === p),
  })).filter((g) => g.list.length > 0);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-3 space-y-2" data-presurvey-compare-table>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-sm font-medium text-gray-900">↔ 横に並べて比べる</h3>
        <p className="text-[11px] text-gray-500">
          左が古い回答、右が新しい回答です。左の列から変わった答えに
          <span className="mx-1 text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-900">変更</span>
          が付きます（空白だけの違いは無視）。
        </p>
      </div>
      {/* 横スクロール。問いの列は sticky で左に残す */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white border-b border-gray-200 px-2 py-1.5 align-bottom w-[9rem] min-w-[9rem]">
                <span className="text-[11px] font-medium text-gray-600">問い</span>
              </th>
              {columns.map((c) => (
                <th
                  key={c.recordKey}
                  className="border-b border-gray-200 px-2 py-1.5 align-bottom min-w-[11rem]"
                  data-presurvey-col={c.recordKey}
                >
                  <span className="block text-[12px] font-medium text-gray-900">
                    {formatJpDate(c.heldOn) || "日付なし"}
                  </span>
                  <span className="block text-[10px] font-normal text-gray-500">
                    提出 {dayOf(c.submittedAt) || "記録なし"}
                    {!c.twoParts && " ・旧形式"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.part}>
                <tr>
                  <th
                    colSpan={columns.length + 1}
                    className="sticky left-0 bg-gray-50 border-y border-gray-200 px-2 py-1 text-left"
                  >
                    <span className="text-[11px] font-medium text-gray-700">
                      {COMPARE_PART_TITLE[g.part]}
                    </span>
                  </th>
                </tr>
                {g.list.map((r) => (
                  <tr key={r.questionId} data-presurvey-compare-row={r.questionId} className="align-top">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-white border-b border-gray-100 px-2 py-2 text-left font-normal w-[9rem] min-w-[9rem]"
                    >
                      <span className="block text-[11px] text-gray-700 leading-snug">{r.question}</span>
                      {r.legacyOnly && (
                        <span
                          className="mt-0.5 inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"
                          data-presurvey-legacy-note
                        >
                          {COMPARE_LEGACY_NOTE}
                        </span>
                      )}
                    </th>
                    {r.cells.map((cell, i) => (
                      <td
                        key={columns[i]?.recordKey ?? i}
                        data-presurvey-cell={`${r.questionId}:${columns[i]?.recordKey ?? i}`}
                        data-changed={cell.changed ? "1" : "0"}
                        className={`border-b border-gray-100 px-2 py-2 min-w-[11rem] ${
                          cell.changed ? "bg-amber-50" : ""
                        }`}
                      >
                        {cell.changed && (
                          <span className="mb-0.5 inline-block text-[10px] px-1 py-0.5 rounded bg-amber-100 text-amber-900">
                            変更
                          </span>
                        )}
                        <CellBody cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-gray-500">
        同じ人の、時期ごとの回答どうしを並べています。ほかのスタッフとの比較・順位付け・集計はしません。
        回答は評価には使いません。
      </p>
    </section>
  );
}
