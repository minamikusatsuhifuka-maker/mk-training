"use client";

// 「📈 クリニックの歩み」— 年度で比べる（指示書198）
// - 年度は始まりの年で呼ぶ（既定: 2022年度 = 2022年6月〜2023年5月）。始まりの月は院長が変更できる。
// - ① 年度の合計（積み上げ棒・上に合計）② 月ごとに年度を重ねる（折れ線・6月→翌5月）
//   ③ 月ごとの比較表（198-補・前年との差。上回る=緑▲／下回る=赤▼／同じ=灰±0）④ 年度の表
// - 12か月に満たない年度は薄く・月数を添える。前年度比は**前年度の同じ月どうし**。
// - 色は「月の推移」と同じ（METRIC_COLOR）。純SVG・コンテナ幅に収める（横スクロールさせない）。
//
// 集計は lib/clinic-metrics-core.ts の buildFiscalYears（純関数）。ここは描画だけを持つ。

import { useMemo, useRef, useState } from "react";
import {
  METRICS_SOURCE_NOTE,
  METRIC_COLOR,
  buildFiscalDiff,
  buildFiscalYears,
  fiscalMonthSequence,
  fiscalStartMonthOf,
  fiscalYearColor,
  niceCeil,
  type ClinicMetrics,
  type FiscalMetric,
  type FiscalYearSummary,
} from "@/lib/clinic-metrics";

/** 折れ線・比較表で見る値（グラフと表で同じ切り替えを使う＝198-補 1-1） */
type LineMetric = FiscalMetric;
const LINE_METRICS: { key: LineMetric; label: string; color: string }[] = [
  { key: "total", label: "合計", color: METRIC_COLOR.total },
  { key: "insurance", label: "保険", color: METRIC_COLOR.insurance },
  { key: "selfPay", label: "自費", color: METRIC_COLOR.selfPay },
];

const man = (v: number) => `${Math.round(v).toLocaleString("ja-JP")}`;

/** 199: 年度ごとに色を変える（色は年度に固定）。最新の年度は太く・各月に点、過去の年度は細い線 */
function yearStyle(isLatest: boolean): { width: number; points: boolean } {
  return isLatest ? { width: 3, points: true } : { width: 1.6, points: false };
}

/** 年度の色の小さな丸（凡例・比較表の見出し・ツールチップ） */
export function YearDot({ year, size = 8 }: { year: number; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block rounded-full shrink-0 align-middle"
      style={{ width: size, height: size, backgroundColor: fiscalYearColor(year) }}
      data-year-dot={year}
    />
  );
}

/**
 * 199: 線の右端の年度名が重ならないよう、縦に押し分ける。
 * 横に重なるラベルどうしだけを比べ、上から順に最小間隔 gap を空ける（下端を超えたら上へ戻す）。
 */
function placeLabels(
  labels: { key: number; x: number; y: number; w: number }[],
  top: number,
  bottom: number,
  gap: number
): Map<number, number> {
  const out = new Map<number, number>();
  const sorted = [...labels].sort((a, b) => a.y - b.y);
  const placed: { x: number; w: number; y: number }[] = [];
  for (const l of sorted) {
    let y = Math.max(top, l.y);
    for (const p of placed) {
      const overlapX = l.x < p.x + p.w && p.x < l.x + l.w;
      if (overlapX && y < p.y + gap) y = p.y + gap;
    }
    placed.push({ x: l.x, w: l.w, y });
  }
  // 下端を超えた分は、横に重なる組ごと上へ詰め直す
  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i];
    const limit =
      i === placed.length - 1
        ? bottom
        : Math.min(bottom, ...placed.slice(i + 1).filter((q) => p.x < q.x + q.w && q.x < p.x + p.w).map((q) => q.y - gap));
    if (p.y > limit) p.y = limit;
  }
  sorted.forEach((l, i) => out.set(l.key, placed[i].y));
  return out;
}

// ─── ① 年度の合計（積み上げ棒） ───

function FiscalBars({
  years,
  width,
}: {
  years: FiscalYearSummary[];
  width: number;
}) {
  const padL = 44;
  const padR = 10;
  const padT = 26;
  const padB = 46;
  const plotH = 200;
  const height = padT + plotH + padB;
  const baseline = padT + plotH;
  const n = years.length;
  const colW = n > 0 ? (width - padL - padR) / n : 0;
  const barW = Math.min(colW * 0.62, 72);
  const max = niceCeil(Math.max(1, ...years.map((y) => y.total)));
  const yOf = (v: number) => baseline - (v / max) * plotH;
  const xCenter = (i: number) => padL + colW * (i + 0.5);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(max * r));

  return (
    <svg width={width} height={height} role="img" aria-label="年度ごとの売上の合計">
      {ticks.map((t) => (
        <g key={`t-${t}`}>
          <line
            x1={padL}
            y1={yOf(t)}
            x2={width - padR}
            y2={yOf(t)}
            stroke="#f1f5f9"
            strokeWidth={1}
          />
          <text x={padL - 6} y={yOf(t) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
            {t.toLocaleString("ja-JP")}
          </text>
        </g>
      ))}
      <line x1={padL} y1={baseline} x2={width - padR} y2={baseline} stroke="#cbd5e1" strokeWidth={1} />

      {years.map((y, i) => {
        const last = i === years.length - 1;
        // 12か月に満たない年度は薄く（進行中の年度が主な対象・198-B-2）
        const opacity = y.complete ? 1 : 0.45;
        const x = xCenter(i) - barW / 2;
        const insH = baseline - yOf(y.insurance);
        const selfH = baseline - yOf(y.selfPay);
        const legacyH = baseline - yOf(y.legacy);
        let cursor = baseline;
        const insY = cursor - insH;
        cursor = insY;
        const selfY = cursor - selfH;
        cursor = selfY;
        const legacyY = cursor - legacyH;
        return (
          <g key={y.year} opacity={opacity}>
            {y.insurance > 0 && (
              <rect x={x} y={insY} width={barW} height={insH} fill={METRIC_COLOR.insurance} />
            )}
            {y.selfPay > 0 && (
              <rect x={x} y={selfY} width={barW} height={selfH} fill={METRIC_COLOR.selfPay} />
            )}
            {y.legacy > 0 && (
              <rect x={x} y={legacyY} width={barW} height={legacyH} fill={METRIC_COLOR.legacy} />
            )}
            <text
              x={xCenter(i)}
              y={yOf(y.total) - 6}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill="#334155"
            >
              {man(y.total)}
            </text>
            <text x={xCenter(i)} y={baseline + 15} textAnchor="middle" fontSize={10} fill="#475569">
              {y.year}年度
            </text>
            {!y.complete && (
              <text x={xCenter(i)} y={baseline + 28} textAnchor="middle" fontSize={9} fill="#94a3b8">
                {y.monthCount}か月分{last ? "（進行中）" : ""}
              </text>
            )}
          </g>
        );
      })}
      <text x={padL - 38} y={padT - 12} fontSize={9} fill="#94a3b8">
        万円
      </text>
    </svg>
  );
}

// ─── ② 月ごとに年度を重ねる（折れ線） ───

function FiscalLines({
  years,
  startMonth,
  metric,
  width,
}: {
  years: FiscalYearSummary[];
  startMonth: number;
  metric: LineMetric;
  width: number;
}) {
  const padL = 44;
  // 199: 右端に「2025年度」を直接書くための余白
  const padR = 50;
  const padT = 18;
  const padB = 34;
  const plotH = 210;
  const height = padT + plotH + padB;
  const baseline = padT + plotH;
  const months = fiscalMonthSequence(startMonth);
  const colW = (width - padL - padR) / 12;
  const xCenter = (i: number) => padL + colW * (i + 0.5);
  const valueOf = (y: FiscalYearSummary, offset: number): number | null => {
    const p = y.points[offset];
    if (!p) return null;
    const v = metric === "total" ? p.total : metric === "insurance" ? p.insurance : p.selfPay;
    return v ?? null;
  };
  let max = 1;
  for (const y of years)
    for (let i = 0; i < 12; i++) {
      const v = valueOf(y, i);
      if (v != null && v > max) max = v;
    }
  max = niceCeil(max);
  const yOf = (v: number) => baseline - (v / max) * plotH;
  const ticks = [0, 0.5, 1].map((r) => Math.round(max * r));

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const ordered = [...years].reverse(); // 新しい年度が先（ツールチップの並び）
  const latestYear = years.length ? years[years.length - 1].year : null;

  // 各年度の線（欠測で途切れる）と、右端の年度名の位置
  const LABEL_FONT = 9;
  const labelW = (text: string) => Array.from(text).reduce((w, ch) => w + (/[0-9]/.test(ch) ? LABEL_FONT * 0.6 : LABEL_FONT), 0);
  const series = years.map((y) => {
    const runs: { x: number; y: number }[][] = [];
    let pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const v = valueOf(y, i);
      if (v == null) {
        if (pts.length) runs.push(pts);
        pts = [];
        continue;
      }
      pts.push({ x: xCenter(i), y: yOf(v) });
    }
    if (pts.length) runs.push(pts);
    const last = runs.length ? runs[runs.length - 1][runs[runs.length - 1].length - 1] : null;
    const text = `${y.year}年度`;
    return { y, runs, last, text, w: labelW(text) };
  });
  const labelY = placeLabels(
    series
      .filter((s) => s.last)
      .map((s) => ({ key: s.y.year, x: Math.min(s.last!.x + 6, width - s.w - 2), y: s.last!.y + 3, w: s.w })),
    padT + 6,
    baseline - 2,
    // 文字（9px）＋白い縁取りの高さ。これより詰めると縁取りどうしが重なる
    LABEL_FONT + 4
  );

  return (
    <div ref={wrapRef} className="relative">
      <svg width={width} height={height} role="img" aria-label="年度ごとの月の推移">
        {ticks.map((t) => (
          <g key={`t-${t}`}>
            <line x1={padL} y1={yOf(t)} x2={width - padR} y2={yOf(t)} stroke="#f1f5f9" />
            <text x={padL - 6} y={yOf(t) + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
              {t.toLocaleString("ja-JP")}
            </text>
          </g>
        ))}
        <line x1={padL} y1={baseline} x2={width - padR} y2={baseline} stroke="#cbd5e1" />

        {hover !== null && (
          <line
            x1={xCenter(hover)}
            y1={padT}
            x2={xCenter(hover)}
            y2={baseline}
            stroke="#cbd5e1"
            strokeDasharray="3 3"
          />
        )}

        {/* 199: 過去の年度を先に描き、最新の年度を最前面に */}
        {series.map(({ y, runs }) => {
          const isLatest = y.year === latestYear;
          const st = yearStyle(isLatest);
          const color = fiscalYearColor(y.year);
          return (
            <g key={y.year} data-fiscal-line={y.year} data-latest={isLatest ? "1" : "0"}>
              {runs.map((run, ri) =>
                run.length === 1 ? (
                  // 1か月だけの線は点で見せる
                  <circle key={ri} cx={run[0].x} cy={run[0].y} r={st.width} fill={color} />
                ) : (
                  <polyline
                    key={ri}
                    points={run.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeWidth={st.width}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )
              )}
              {st.points &&
                runs.flat().map((p, pi) => (
                  <circle key={pi} cx={p.x} cy={p.y} r={3.4} fill={color} stroke="#ffffff" strokeWidth={1.2} data-fiscal-point />
                ))}
            </g>
          );
        })}
        {/* 199: 線の右端に年度名（凡例を見に行かなくても分かる）。重ならないよう縦に押し分け済み */}
        {series.map(({ y, last, text, w }) => {
          if (!last) return null;
          const isLatest = y.year === latestYear;
          const ly = labelY.get(y.year) ?? last.y;
          return (
            <text
              key={`label-${y.year}`}
              x={Math.min(last.x + 6, width - w - 2)}
              y={ly}
              fontSize={LABEL_FONT}
              fontWeight={isLatest ? 700 : 500}
              fill={fiscalYearColor(y.year)}
              stroke="#ffffff"
              strokeWidth={3}
              paintOrder="stroke"
              data-fiscal-label={y.year}
            >
              {text}
            </text>
          );
        })}

        {months.map((m, i) => (
          <text
            key={`m-${m}`}
            x={xCenter(i)}
            y={baseline + 14}
            textAnchor="middle"
            fontSize={9}
            fill="#64748b"
          >
            {m}
          </text>
        ))}
        <text x={xCenter(11)} y={baseline + 26} textAnchor="end" fontSize={8} fill="#94a3b8">
          月
        </text>

        {/* 月ごとの透明ヒットエリア（触れる・タップで値を表示） */}
        {months.map((m, i) => (
          <rect
            key={`hit-${m}`}
            x={padL + colW * i}
            y={padT}
            width={colW}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            // 199: タップではマウスの「乗った」と「クリック」が続けて起きるため、切り替えにすると
            // 開いた直後に閉じてしまう（スマートフォンで値が出なかった）。タップはその月を開くだけにする
            onClick={() => setHover(i)}
          />
        ))}
      </svg>

      {hover !== null && (
        <div
          className="absolute z-10 pointer-events-none rounded-lg border border-gray-200 bg-white/95 shadow-md px-3 py-2"
          style={{
            left: xCenter(hover) > width / 2 ? undefined : Math.min(xCenter(hover) + 10, width - 150),
            right: xCenter(hover) > width / 2 ? Math.min(width - xCenter(hover) + 10, width - 150) : undefined,
            top: padT + 4,
          }}
        >
          <p className="text-[11px] font-semibold text-gray-800 mb-0.5">{months[hover]}月</p>
          {ordered.map((y) => {
            const p = y.points[hover];
            if (!p) return null;
            return (
              <p key={y.year} className="text-[11px] text-gray-600 whitespace-nowrap flex items-center gap-1">
                <YearDot year={y.year} />
                <span className="font-medium text-gray-700">{y.year}年度</span>{" "}
                保険 {p.insurance == null ? "―" : man(p.insurance)}／自費{" "}
                {p.selfPay == null ? "―" : man(p.selfPay)}／
                <span className="font-semibold text-gray-800">合計 {man(p.total ?? 0)}</span>
              </p>
            );
          })}
          {ordered.every((y) => !y.points[hover!]) && (
            <p className="text-[11px] text-gray-500">この月の記録はありません</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ③ 月ごとの比較表（198-補）───
//
// 色だけに頼らず ▲▼ の記号も必ず付ける（色の見分けにくい方・白黒印刷でも分かるように）。
// 列は4つだけ（月・基準・比べる・差）。罫線は横線のみ・数字は右寄せ・桁区切り。

const UP_COLOR = "text-emerald-700";
const DOWN_COLOR = "text-red-600";
const FLAT_COLOR = "text-gray-400";

/** 差の表示（記号・符号・色をまとめて決める） */
function diffParts(diff: number | null, ratio: number | null) {
  if (diff == null) return null;
  const rounded = Math.round(diff);
  // 同じときは記号も符号も付けず、灰色の「±0」だけにする（198-補 1-2）
  if (rounded === 0) return { mark: "", color: FLAT_COLOR, amount: "±0", pct: "" };
  const mark = rounded > 0 ? "▲" : "▼";
  const color = rounded > 0 ? UP_COLOR : DOWN_COLOR;
  const amount = `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toLocaleString("ja-JP")}`;
  const pct =
    ratio == null
      ? ""
      : `（${ratio > 0 ? "+" : "−"}${Math.abs(Math.round(ratio * 100))}%）`;
  return { mark, color, amount, pct };
}

function DiffCell({ diff, ratio }: { diff: number | null; ratio: number | null }) {
  const p = diffParts(diff, ratio);
  if (!p) return <span className="text-gray-400">―</span>;
  return (
    <span className={`${p.color} tabular-nums`}>
      <span className="whitespace-nowrap">
        {p.mark ? `${p.mark} ` : ""}
        {p.amount}
      </span>
      {p.pct && (
        <span className="block text-[10px] leading-tight opacity-80">{p.pct}</span>
      )}
    </span>
  );
}

function MonthlyDiffTable({
  years,
  startMonth,
  metric,
}: {
  years: FiscalYearSummary[];
  startMonth: number;
  metric: LineMetric;
}) {
  // 既定: 最新の年度（比べる）と その前年度（基準）
  const latest = years[years.length - 1];
  const prev = years[years.length - 2];
  const [targetYear, setTargetYear] = useState<number>(latest.year);
  const [baseYear, setBaseYear] = useState<number>(prev ? prev.year : latest.year);

  const target = years.find((y) => y.year === targetYear) ?? latest;
  const base = years.find((y) => y.year === baseYear) ?? null;
  const metricLabel = LINE_METRICS.find((m) => m.key === metric)!.label;
  const table = useMemo(
    () => buildFiscalDiff(base, target, metric, startMonth),
    [base, target, metric, startMonth]
  );

  const cell = (v: number | null) =>
    v == null ? (
      <span className="text-gray-400 text-[11px]">未集計</span>
    ) : (
      <span className="tabular-nums">{man(v)}</span>
    );

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <p className="text-[11px] font-medium text-gray-600">
          月ごとの比較（{metricLabel}・万円）
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <label className="text-[11px] text-gray-500">
            基準
            <select
              value={baseYear}
              onChange={(e) => setBaseYear(Number(e.target.value))}
              aria-label="基準にする年度"
              className="ml-1 h-7 rounded border border-gray-200 px-1 text-xs bg-white"
            >
              {years.map((y) => (
                <option key={y.year} value={y.year}>
                  {y.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] text-gray-500">
            比べる
            <select
              value={targetYear}
              onChange={(e) => setTargetYear(Number(e.target.value))}
              aria-label="比べる年度"
              className="ml-1 h-7 rounded border border-gray-200 px-1 text-xs bg-white"
            >
              {years.map((y) => (
                <option key={y.year} value={y.year}>
                  {y.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <table className="w-full text-xs table-fixed">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200">
            <th className="text-left font-medium py-1.5 w-[15%]">月</th>
            <th className="text-right font-medium py-1.5 w-[26%]">
              <span className="inline-flex items-center justify-end gap-1">
                {base && <YearDot year={base.year} />}
                {base ? base.label : "―"}
              </span>
              <span className="block text-[10px] font-normal text-gray-400">基準</span>
            </th>
            <th className="text-right font-medium py-1.5 w-[26%]">
              <span className="inline-flex items-center justify-end gap-1">
                <YearDot year={target.year} />
                {target.label}
              </span>
              <span className="block text-[10px] font-normal text-gray-400">比べる</span>
            </th>
            <th className="text-right font-medium py-1.5 w-[33%]">差</th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.offset} className="border-b border-gray-100">
              <td className="py-1.5 text-gray-600">{r.month}月</td>
              <td className="py-1.5 text-right text-gray-700">{cell(r.base)}</td>
              <td className="py-1.5 text-right text-gray-700">{cell(r.target)}</td>
              <td className="py-1.5 text-right">
                <DiffCell diff={r.diff} ratio={r.ratio} />
              </td>
            </tr>
          ))}
          <tr className="border-b-2 border-gray-300 bg-gray-50/60">
            <td className="py-1.5 font-semibold text-gray-700">合計</td>
            <td className="py-1.5 text-right font-semibold text-gray-800 tabular-nums">
              {man(table.baseTotal)}
            </td>
            <td className="py-1.5 text-right font-semibold text-gray-800 tabular-nums">
              {man(table.targetTotal)}
            </td>
            <td className="py-1.5 text-right font-semibold">
              {table.commonMonths.length > 0 ? (
                <DiffCell diff={table.diff} ratio={table.ratio} />
              ) : (
                <span className="text-gray-400">―</span>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
        合計は両方の年度にそろっている月だけで比べています（{table.noteLabel}）。
        <br />
        ▲は上回っている月（緑）、▼は下回っている月（赤）、±0は同じです。
      </p>
    </div>
  );
}

// ─── ④ 年度の表 ───

function ratioText(r: number | null): string {
  return r == null ? "―" : `${(r * 100).toFixed(1)}%`;
}
function yoyText(y: FiscalYearSummary): string {
  return y.yoy == null ? "―" : `${Math.round(y.yoy * 100)}%`;
}

function FiscalTable({ years }: { years: FiscalYearSummary[] }) {
  const rows = [...years].reverse(); // 新しい年度から
  return (
    <>
      {/* 広い画面: 表 */}
      <table className="hidden md:table w-full text-xs">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200">
            <th className="text-left font-medium py-1.5">年度</th>
            <th className="text-right font-medium py-1.5">保険</th>
            <th className="text-right font-medium py-1.5">自費</th>
            <th className="text-right font-medium py-1.5">合計</th>
            <th className="text-right font-medium py-1.5">自費の割合</th>
            <th className="text-right font-medium py-1.5">前年度比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((y) => (
            <tr key={y.year} className="border-b border-gray-100">
              <td className="py-1.5 text-gray-700">
                {y.label}
                {!y.complete && (
                  <span className="ml-1 text-[10px] text-gray-400">{y.monthCount}か月分</span>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums text-gray-700">{man(y.insurance)}</td>
              <td className="py-1.5 text-right tabular-nums text-gray-700">{man(y.selfPay)}</td>
              <td className="py-1.5 text-right tabular-nums font-semibold text-gray-800">
                {man(y.total)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-gray-600">
                {ratioText(y.selfPayRatio)}
              </td>
              <td className="py-1.5 text-right tabular-nums text-gray-600">
                {yoyText(y)}
                {y.yoy != null && !y.complete && (
                  <span className="ml-1 text-[10px] text-gray-400">({y.yoyMonths}か月で比較)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* スマートフォン: 横スクロールさせず、年度ごとに縦に並べる（198-D） */}
      <ul className="md:hidden space-y-2">
        {rows.map((y) => (
          <li key={y.year} className="rounded-xl border border-gray-100 bg-white p-3">
            <p className="text-xs font-semibold text-gray-800">
              {y.label}
              {!y.complete && (
                <span className="ml-1 text-[10px] font-normal text-gray-400">
                  {y.monthCount}か月分
                </span>
              )}
              <span className="ml-1 text-[10px] font-normal text-gray-400">{y.rangeLabel}</span>
            </p>
            <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
              {(
                [
                  ["保険", `${man(y.insurance)}万円`, false],
                  ["自費", `${man(y.selfPay)}万円`, false],
                  ["合計", `${man(y.total)}万円`, false],
                  ["自費の割合", ratioText(y.selfPayRatio), false],
                  [
                    "前年度比",
                    y.yoy == null
                      ? "―"
                      : `${yoyText(y)}${!y.complete ? `（${y.yoyMonths}か月で比較）` : ""}`,
                    true,
                  ],
                ] as [string, string, boolean][]
              ).map(([k, v, wide]) => (
                <div
                  key={k}
                  className={`flex items-center justify-between gap-2 ${
                    wide ? "col-span-2" : ""
                  }`}
                >
                  <dt className="text-[11px] text-gray-500">{k}</dt>
                  <dd className="text-[11px] text-gray-800 tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

// ─── 本体 ───

export function ClinicMetricsFiscal({
  data,
  containerWidth,
}: {
  data: ClinicMetrics;
  containerWidth: number;
}) {
  const [metric, setMetric] = useState<LineMetric>("total");
  const startMonth = fiscalStartMonthOf(data);
  const years = useMemo(() => buildFiscalYears(data, startMonth), [data, startMonth]);

  // グラフは横幅に収める（横スクロールさせない・198-D）
  const width = Math.max(260, containerWidth - 18);

  if (years.length === 0) {
    return (
      <p className="text-xs text-gray-500 px-1 py-4">
        年度ごとに比べられる売上の記録がまだありません。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* ① 年度の合計 */}
      <div className="bg-white border border-gray-100 rounded-xl p-2">
        <div className="flex items-center gap-3 flex-wrap px-1 mb-1">
          <p className="text-[11px] font-medium text-gray-600">
            年度の合計（保険＋自費・万円）
          </p>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-2.5 rounded-sm"
              style={{ backgroundColor: METRIC_COLOR.insurance }}
            />
            <span className="text-[10px] text-gray-500">保険</span>
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-2.5 rounded-sm"
              style={{ backgroundColor: METRIC_COLOR.selfPay }}
            />
            <span className="text-[10px] text-gray-500">自費</span>
          </span>
        </div>
        <FiscalBars years={years} width={width} />
      </div>

      {/* ② 月ごとに年度を重ねる */}
      <div className="bg-white border border-gray-100 rounded-xl p-2">
        <div className="flex items-center justify-between gap-2 flex-wrap px-1 mb-1">
          <p className="text-[11px] font-medium text-gray-600">
            月ごとに年度を重ねる（{startMonth}月 → 翌{startMonth === 1 ? 12 : startMonth - 1}月）
          </p>
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            {LINE_METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                aria-pressed={metric === m.key}
                className={`text-xs px-2 py-1 transition-colors ${
                  metric === m.key ? "bg-teal-500 text-white" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {/* 199: 凡例（年度の色と同じ順＝古い年度から） */}
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap px-1 mb-1" data-fiscal-legend>
          {years.map((y, i) => (
            <span key={y.year} className="flex items-center gap-1 text-[10px] text-gray-600">
              <span
                aria-hidden="true"
                className="inline-block rounded-full"
                style={{
                  width: 14,
                  height: i === years.length - 1 ? 3 : 2,
                  backgroundColor: fiscalYearColor(y.year),
                }}
              />
              <span className={i === years.length - 1 ? "font-semibold text-gray-800" : ""}>
                {y.label}
              </span>
            </span>
          ))}
        </div>
        <FiscalLines years={years} startMonth={startMonth} metric={metric} width={width} />
        <p className="text-[10px] text-gray-400 px-1">
          線に触れる（タップする）と、その月の保険・自費・合計が出ます。年度ごとに色を分け、最新の年度は太い線と点です。
        </p>
      </div>

      {/* ③ 月ごとの比較表（198-補・グラフの下・指標は上の切り替えと連動） */}
      {years.length >= 2 ? (
        <MonthlyDiffTable years={years} startMonth={startMonth} metric={metric} />
      ) : (
        <p className="text-[11px] text-gray-500 px-1">
          年度が2つそろうと、月ごとの比較表が出ます。
        </p>
      )}

      {/* ④ 年度の表 */}
      <div className="bg-white border border-gray-100 rounded-xl p-3">
        <p className="text-[11px] font-medium text-gray-600 mb-1">年度の表（万円）</p>
        <FiscalTable years={years} />
        <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
          前年度比は、前年度の同じ月どうしで比べた値です（12か月に満たない年度も同じ期間で比較。
          そろわない年度は「―」）。
        </p>
      </div>

      <p className="text-[10px] text-gray-400 px-1 leading-relaxed">
        年度は始まりの年で呼びます（例: {years[0].label} ＝ {years[0].rangeLabel}）。
        <br />※ {METRICS_SOURCE_NOTE}
      </p>
    </div>
  );
}
