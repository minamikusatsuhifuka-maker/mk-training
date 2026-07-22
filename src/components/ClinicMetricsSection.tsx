"use client";

// ホーム「📈 クリニックの歩み」セクション（指示書80）
// - 月別の売上（万円・棒）× カウンセリング数（件・折れ線）の2軸グラフ（純SVG・新規依存なし）
// - 施策を該当月に縦線＋番号（①②…）で重ね、グラフ下に番号つきリスト（日付・ラベル）
// - 直近12か月／全期間の切替。欠測（null）はスキップ。データ0件はセクション非表示。
// - 閲覧のみ（入力は /admin/portal「⚙ 機能」タブ）。ホームでは編集UIを出さない。
// - 経営計画書・第三章「数字は鏡」の実装。グラフ下に理念の一文を必ず表示する。

import { useEffect, useMemo, useState } from "react";
import {
  loadClinicMetrics,
  buildAxisYms,
  initiativeYm,
  shortYm,
  type ClinicMetrics,
  type Initiative,
} from "@/lib/clinic-metrics";

const CIRCLED = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
  "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳",
];
function circled(n: number): string {
  return CIRCLED[n - 1] ?? `(${n})`;
}

// 軸の最大値を 1/2/5×10^k の「きり」の良い値に切り上げ
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

// グラフ配色
const SALES_FROM = "#14b8a6"; // teal-500
const SALES_TO = "#5eead4"; // teal-300
const COUNSEL = "#f59e0b"; // amber-500

function Chart({
  yms,
  metricMap,
  plottedInitiatives,
}: {
  yms: string[];
  metricMap: Map<string, { sales: number | null; counseling: number | null }>;
  plottedInitiatives: { init: Initiative; ym: string; no: number }[];
}) {
  const colW = 56;
  const plotH = 180;
  const padL = 46;
  const padR = 46;
  const padT = 20;
  const padB = 54;
  const n = yms.length;
  const width = padL + colW * n + padR;
  const height = padT + plotH + padB;
  const baseline = padT + plotH;
  const xCenter = (i: number) => padL + colW * (i + 0.5);

  const salesVals = yms
    .map((ym) => metricMap.get(ym)?.sales)
    .filter((v): v is number => typeof v === "number");
  const countVals = yms
    .map((ym) => metricMap.get(ym)?.counseling)
    .filter((v): v is number => typeof v === "number");
  const salesMax = niceCeil(Math.max(1, ...salesVals));
  const countMax = niceCeil(Math.max(1, ...countVals));

  const barW = colW * 0.46;

  // カウンセリング折れ線: 連続する非null点を線分でつなぐ
  const linePts = yms.map((ym, i) => {
    const c = metricMap.get(ym)?.counseling;
    if (typeof c !== "number") return null;
    return { x: xCenter(i), y: baseline - (c / countMax) * plotH, v: c };
  });
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < linePts.length - 1; i++) {
    const a = linePts[i];
    const b = linePts[i + 1];
    if (a && b) segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  // 施策マーカーを列ごとにまとめ（同月複数は縦に積む）
  const markersByYm = new Map<string, number[]>();
  for (const p of plottedInitiatives) {
    if (!markersByYm.has(p.ym)) markersByYm.set(p.ym, []);
    markersByYm.get(p.ym)!.push(p.no);
  }

  // 中間グリッド線（0・50%・100%）
  const gridYs = [0, 0.5, 1].map((t) => baseline - t * plotH);

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="月別の売上とカウンセリング数の推移"
        className="block"
      >
        <defs>
          <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SALES_FROM} />
            <stop offset="100%" stopColor={SALES_TO} />
          </linearGradient>
        </defs>

        {/* グリッド線＋左右軸目盛 */}
        {gridYs.map((y, i) => (
          <line
            key={i}
            x1={padL}
            y1={y}
            x2={width - padR}
            y2={y}
            stroke="#f1f5f9"
            strokeWidth={1}
          />
        ))}
        {/* 左軸（売上・万円） */}
        <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize={9} fill="#14b8a6">
          {salesMax}
        </text>
        <text x={padL - 6} y={baseline + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
          0
        </text>
        {/* 右軸（カウンセリング・件） */}
        <text x={width - padR + 6} y={padT + 4} textAnchor="start" fontSize={9} fill="#f59e0b">
          {countMax}
        </text>
        <text x={width - padR + 6} y={baseline + 3} textAnchor="start" fontSize={9} fill="#94a3b8">
          0
        </text>

        {/* 施策の縦線（マーカー） */}
        {yms.map((ym, i) => {
          const nos = markersByYm.get(ym);
          if (!nos) return null;
          const x = xCenter(i);
          return (
            <g key={`mk-${ym}`}>
              <line
                x1={x}
                y1={padT}
                x2={x}
                y2={baseline}
                stroke="#cbd5e1"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {nos.map((no, j) => (
                <text
                  key={no}
                  x={x}
                  y={padT + 2 + j * 12}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#64748b"
                >
                  {circled(no)}
                </text>
              ))}
            </g>
          );
        })}

        {/* 売上バー */}
        {yms.map((ym, i) => {
          const s = metricMap.get(ym)?.sales;
          if (typeof s !== "number") return null;
          const h = (s / salesMax) * plotH;
          return (
            <rect
              key={`bar-${ym}`}
              x={xCenter(i) - barW / 2}
              y={baseline - h}
              width={barW}
              height={h}
              rx={3}
              fill="url(#salesGrad)"
            />
          );
        })}

        {/* カウンセリング折れ線＋点 */}
        {segments.map((s, i) => (
          <line
            key={`seg-${i}`}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke={COUNSEL}
            strokeWidth={2}
          />
        ))}
        {linePts.map((p, i) =>
          p ? (
            <circle key={`pt-${i}`} cx={p.x} cy={p.y} r={3} fill={COUNSEL} />
          ) : null
        )}

        {/* 月ラベル（年が変わる列と先頭に年を表示） */}
        {yms.map((ym, i) => {
          const { year, month } = shortYm(ym);
          const prev = i > 0 ? shortYm(yms[i - 1]).year : "";
          const showYear = i === 0 || year !== prev;
          return (
            <g key={`lbl-${ym}`}>
              <text
                x={xCenter(i)}
                y={baseline + 14}
                textAnchor="middle"
                fontSize={9}
                fill="#64748b"
              >
                {month}月
              </text>
              {showYear && (
                <text
                  x={xCenter(i)}
                  y={baseline + 26}
                  textAnchor="middle"
                  fontSize={8}
                  fill="#94a3b8"
                >
                  &apos;{year}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ClinicMetricsSection() {
  const [data, setData] = useState<ClinicMetrics | null>(null); // null=読込中
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    loadClinicMetrics()
      .then(setData)
      .catch(() => setData({ months: [], initiatives: [], updatedAt: "" }));
  }, []);

  const axisYms = useMemo(() => (data ? buildAxisYms(data) : []), [data]);

  const displayedYms = useMemo(() => {
    if (showAll || axisYms.length <= 12) return axisYms;
    return axisYms.slice(axisYms.length - 12);
  }, [axisYms, showAll]);

  const metricMap = useMemo(() => {
    const m = new Map<
      string,
      { sales: number | null; counseling: number | null }
    >();
    for (const row of data?.months ?? [])
      m.set(row.ym, { sales: row.sales, counseling: row.counseling });
    return m;
  }, [data]);

  // 表示範囲に入る施策を日付順に採番（縦線と下のリストで同じ番号を使う）
  const plotted = useMemo(() => {
    if (!data) return [];
    const shown = new Set(displayedYms);
    return data.initiatives
      .filter((i) => shown.has(initiativeYm(i.date)))
      .map((init, idx) => ({ init, ym: initiativeYm(init.date), no: idx + 1 }));
  }, [data, displayedYms]);

  // 読込中・データ0件は非表示
  if (!data || axisYms.length === 0) return null;

  return (
    <section className="px-4 py-5 border-b border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
          📈 クリニックの歩み
        </h2>
        {axisYms.length > 12 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="text-xs px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {showAll ? "直近12か月" : "全期間"}
          </button>
        )}
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 rounded-sm bg-teal-500" />
          <span className="text-[11px] text-gray-600">売上（万円）</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 bg-amber-500 relative">
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-amber-500" />
          </span>
          <span className="text-[11px] text-gray-600">
            カウンセリング数（件）
          </span>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-xl p-2">
        <Chart
          yms={displayedYms}
          metricMap={metricMap}
          plottedInitiatives={plotted}
        />
      </div>

      {/* 施策の番号つきリスト（縦線と対応・ホバー非依存） */}
      {plotted.length > 0 && (
        <ul className="mt-3 space-y-1">
          {plotted.map(({ init, no }) => (
            <li
              key={init.id}
              className="flex items-start gap-2 text-xs text-gray-600"
            >
              <span className="text-gray-500 shrink-0">{circled(no)}</span>
              <span className="text-gray-400 shrink-0 tabular-nums">
                {init.date}
              </span>
              <span className="text-gray-700">{init.label}</span>
            </li>
          ))}
        </ul>
      )}

      {/* 理念の一文（必須・経営計画書 第三章「数字は鏡」） */}
      <p className="mt-3 text-[11px] text-gray-500 leading-relaxed">
        数字は目的ではありません。みなさんが質を尽くした結果を映す、鏡です。
      </p>
    </section>
  );
}
