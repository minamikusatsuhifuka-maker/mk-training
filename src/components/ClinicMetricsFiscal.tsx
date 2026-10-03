"use client";

// 「📈 クリニックの歩み」— 年度で比べる（指示書198）
// - 年度は始まりの年で呼ぶ（既定: 2022年度 = 2022年6月〜2023年5月）。始まりの月は院長が変更できる。
// - ① 年度の合計（積み上げ棒・上に合計）② 月ごとに年度を重ねる（折れ線・6月→翌5月）③ 年度の表
// - 12か月に満たない年度は薄く・月数を添える。前年度比は**前年度の同じ月どうし**。
// - 色は「月の推移」と同じ（METRIC_COLOR）。純SVG・コンテナ幅に収める（横スクロールさせない）。
//
// 集計は lib/clinic-metrics-core.ts の buildFiscalYears（純関数）。ここは描画だけを持つ。

import { useMemo, useRef, useState } from "react";
import {
  METRICS_SOURCE_NOTE,
  METRIC_COLOR,
  buildFiscalYears,
  fiscalMonthSequence,
  fiscalStartMonthOf,
  niceCeil,
  type ClinicMetrics,
  type FiscalYearSummary,
} from "@/lib/clinic-metrics";

/** 折れ線で見る値 */
type LineMetric = "total" | "insurance" | "selfPay";
const LINE_METRICS: { key: LineMetric; label: string; color: string }[] = [
  { key: "total", label: "合計", color: METRIC_COLOR.total },
  { key: "insurance", label: "保険", color: METRIC_COLOR.insurance },
  { key: "selfPay", label: "自費", color: METRIC_COLOR.selfPay },
];

const man = (v: number) => `${Math.round(v).toLocaleString("ja-JP")}`;

/** 新しい年度ほど濃く・太く（最新=1本目） */
function yearStyle(indexFromLatest: number): { opacity: number; width: number } {
  if (indexFromLatest === 0) return { opacity: 1, width: 2.6 };
  const o = Math.max(0.25, 0.7 - (indexFromLatest - 1) * 0.13);
  return { opacity: o, width: 1.4 };
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
  const padR = 26;
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
  const color = LINE_METRICS.find((m) => m.key === metric)!.color;

  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const ordered = [...years].reverse(); // 新しい年度が先（濃い）

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

        {ordered.map((y, idx) => {
          const st = yearStyle(idx);
          const pts: { x: number; y: number }[] = [];
          const runs: { x: number; y: number }[][] = [];
          for (let i = 0; i < 12; i++) {
            const v = valueOf(y, i);
            if (v == null) {
              if (pts.length) runs.push(pts.splice(0));
              continue;
            }
            pts.push({ x: xCenter(i), y: yOf(v) });
          }
          if (pts.length) runs.push(pts);
          const lastPoint = runs.length ? runs[runs.length - 1][runs[runs.length - 1].length - 1] : null;
          return (
            <g key={y.year} opacity={st.opacity}>
              {runs.map((run, ri) => (
                <polyline
                  key={ri}
                  points={run.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={st.width}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
              {runs.flat().map((p, pi) => (
                <circle key={pi} cx={p.x} cy={p.y} r={idx === 0 ? 2.8 : 2} fill={color} />
              ))}
              {lastPoint && (
                <text
                  x={Math.min(lastPoint.x + 5, width - 2)}
                  y={lastPoint.y - 5}
                  fontSize={9}
                  fill={color}
                  fontWeight={idx === 0 ? 700 : 400}
                >
                  {y.year}
                </text>
              )}
            </g>
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
            onClick={() => setHover((prev) => (prev === i ? null : i))}
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
              <p key={y.year} className="text-[11px] text-gray-600 whitespace-nowrap">
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

// ─── ③ 年度の表 ───

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
        <FiscalLines years={years} startMonth={startMonth} metric={metric} width={width} />
        <p className="text-[10px] text-gray-400 px-1">
          線に触れる（タップする）と、その月の保険・自費・合計が出ます。最新の年度が濃い線です。
        </p>
      </div>

      {/* ③ 年度の表 */}
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
