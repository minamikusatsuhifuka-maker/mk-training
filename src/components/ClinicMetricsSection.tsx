"use client";

// ホーム「📈 クリニックの歩み」セクション（80新設 / 81保険・自費・期間つき施策 / 82タイプ切替＋小修正）
// - グラフタイプ3種を切替（①積み上げ棒＝既定 ②折れ線 ③積み上げ面）。選択は localStorage で維持。
// - 売上=保険（teal）＋自費（amber）。合算＝保険＋自費（表示時計算）。旧80データ（内訳なし）はグレー。
// - カウンセリング数は右軸の折れ線（全タイプ共通）。1件も無ければ右軸・凡例・線を出さない（82小修正1）。
// - 施策: 単日=縦線＋番号 / 期間つき=薄い帯＋番号。下に番号つきリスト（ホバー非依存）。
// - 期間指定（開始月〜終了月）＋プリセット。純SVG。グラフはコンテナ幅に追随（82小修正2）、スマホは横スクロール。
// - グラフ下に理念の一文（経営計画書 第三章「数字は鏡」）を必ず表示。
//
// 【整形と描画の分離】期間フィルタ・欠測処理・合算計算は section 側（useMemo）で1度だけ行い、
// 整形済みの metricMap / plotted / フラグを Chart に渡す。3タイプは同じ整形結果を共有し重複実装しない。

import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadClinicMetrics,
  buildAxisYms,
  initiativeYm,
  shortYm,
  monthTotal,
  hasBreakdown,
  isLegacyOnly,
  formatInitiative,
  type ClinicMetrics,
  type MonthMetric,
  type Initiative,
} from "@/lib/clinic-metrics";

const CIRCLED = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
  "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳",
];
function circled(n: number): string {
  return CIRCLED[n - 1] ?? `(${n})`;
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

// 配色
const INSURANCE = "#14b8a6"; // teal-500（保険）
const SELFPAY = "#f59e0b"; // amber-500（自費）
const LEGACY = "#94a3b8"; // slate-400（旧データ・内訳未入力）
const TOTAL = "#475569"; // slate-600（合算の線）
const COUNSEL = "#0ea5e9"; // sky-500（カウンセリング折れ線）

type ChartType = "bar" | "line" | "area";
const CHART_TYPE_KEY = "mk_metrics_chart_type";
const CHART_TYPES: { key: ChartType; icon: string; label: string }[] = [
  { key: "bar", icon: "📊", label: "棒" },
  { key: "line", icon: "📈", label: "線" },
  { key: "area", icon: "⛰", label: "面" },
];

type PlottedInitiative = { init: Initiative; no: number };

// value 配列（null=欠測）を連続点の runs に分割
function runsOf(
  points: ({ x: number; y: number } | null)[]
): { x: number; y: number }[][] {
  const runs: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p) cur.push(p);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

function Chart({
  yms,
  metricMap,
  plotted,
  hasLegacy,
  hasCounseling,
  chartType,
  containerWidth,
}: {
  yms: string[];
  metricMap: Map<string, MonthMetric>;
  plotted: PlottedInitiative[];
  hasLegacy: boolean;
  hasCounseling: boolean;
  chartType: ChartType;
  containerWidth: number;
}) {
  const plotH = 190;
  const padL = 46;
  const padR = hasCounseling ? 46 : 16; // カウンセリング無しなら右余白を詰める
  const padT = 22;
  const padB = 54;
  const n = yms.length;
  const MIN_COL = 44;
  // コンテナ幅に追随（広い画面は幅いっぱい／狭い画面は MIN_COL で横スクロール）
  const avail = Math.max(0, containerWidth - 2);
  const colW =
    n > 0 ? Math.max(MIN_COL, (avail - padL - padR) / n) : MIN_COL;
  const width = padL + colW * n + padR;
  const height = padT + plotH + padB;
  const baseline = padT + plotH;
  const xCenter = (i: number) => padL + colW * (i + 0.5);
  const xLeft = (i: number) => padL + colW * i;

  const totals = yms.map((ym) => {
    const m = metricMap.get(ym);
    return m ? monthTotal(m) : null;
  });
  const salesMax = niceCeil(
    Math.max(1, ...totals.filter((v): v is number => typeof v === "number"))
  );
  const ySales = (v: number) => baseline - (v / salesMax) * plotH;

  const countVals = yms.map((ym) => metricMap.get(ym)?.counseling ?? null);
  const countMax = niceCeil(
    Math.max(1, ...countVals.filter((v): v is number => typeof v === "number"))
  );
  const yCount = (v: number) => baseline - (v / countMax) * plotH;

  const barW = colW * 0.5;
  const gridYs = [0, 0.5, 1].map((t) => baseline - t * plotH);

  // 系列値（棒・線・面で共有）: 内訳あり月のみ ins/self、旧データ月は total のみ
  const insArr = yms.map((ym) => {
    const m = metricMap.get(ym);
    return m && hasBreakdown(m) ? m.insurance ?? 0 : null;
  });
  const selfArr = yms.map((ym) => {
    const m = metricMap.get(ym);
    return m && hasBreakdown(m) ? m.selfPay ?? 0 : null;
  });

  // カウンセリング折れ線
  const countPts = yms.map((ym, i) => {
    const c = metricMap.get(ym)?.counseling;
    return typeof c === "number" ? { x: xCenter(i), y: yCount(c) } : null;
  });
  const countRuns = runsOf(countPts);

  // 施策の描画情報
  const marks = plotted
    .map(({ init, no }, order) => {
      const startYm = initiativeYm(init.date);
      const endYm = init.endDate ? initiativeYm(init.endDate) : startYm;
      let startIdx = yms.findIndex((ym) => ym >= startYm);
      if (startIdx < 0) startIdx = yms.length - 1;
      let endIdx = -1;
      for (let i = 0; i < yms.length; i++) if (yms[i] <= endYm) endIdx = i;
      if (endIdx < 0) endIdx = 0;
      if (endIdx < startIdx) endIdx = startIdx;
      const isPeriod = !!init.endDate && endYm !== startYm;
      const labelY = padT + 2 + (order % 3) * 12;
      return { no, startIdx, endIdx, isPeriod, labelY };
    })
    .filter((m) => m.startIdx >= 0);

  // ── 描画パーツ ──

  // ① 積み上げ棒
  const renderBars = () =>
    yms.map((ym, i) => {
      const m = metricMap.get(ym);
      if (!m) return null;
      const x = xCenter(i) - barW / 2;
      if (hasBreakdown(m)) {
        const ins = m.insurance ?? 0;
        const self = m.selfPay ?? 0;
        const insH = (ins / salesMax) * plotH;
        const selfH = (self / salesMax) * plotH;
        return (
          <g key={`bar-${ym}`}>
            {ins > 0 && (
              <rect x={x} y={baseline - insH} width={barW} height={insH} fill={INSURANCE} />
            )}
            {self > 0 && (
              <rect
                x={x}
                y={baseline - insH - selfH}
                width={barW}
                height={selfH}
                fill={SELFPAY}
                rx={2}
              />
            )}
          </g>
        );
      }
      const total = monthTotal(m);
      if (total == null) return null;
      const th = (total / salesMax) * plotH;
      return (
        <rect key={`bar-${ym}`} x={x} y={baseline - th} width={barW} height={th} rx={2} fill={LEGACY} />
      );
    });

  // ③ 積み上げ面（内訳あり月の連続 run ごとに面。旧データ月はグレー面）
  const renderArea = () => {
    // 内訳ありの連続 run
    const breakIdx = yms.map((ym, i) => {
      const m = metricMap.get(ym);
      return m && hasBreakdown(m) ? i : -1;
    });
    const runs: number[][] = [];
    let cur: number[] = [];
    for (const idx of breakIdx) {
      if (idx >= 0) cur.push(idx);
      else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);

    const polys: React.ReactNode[] = [];
    runs.forEach((run, ri) => {
      const ins = run.map((i) => {
        const m = metricMap.get(yms[i])!;
        return { x: xCenter(i), yTop: ySales(m.insurance ?? 0) };
      });
      const tot = run.map((i) => {
        const m = metricMap.get(yms[i])!;
        return { x: xCenter(i), yTop: ySales((m.insurance ?? 0) + (m.selfPay ?? 0)) };
      });
      const x0 = ins[0].x;
      const x1 = ins[ins.length - 1].x;
      // 保険面（baseline → insTop）
      const insTop = ins.map((p) => `${p.x},${p.yTop}`).join(" ");
      polys.push(
        <polygon
          key={`ain-${ri}`}
          points={`${x0},${baseline} ${insTop} ${x1},${baseline}`}
          fill={INSURANCE}
          opacity={0.35}
        />
      );
      // 自費面（insTop → totalTop）
      const totTop = tot.map((p) => `${p.x},${p.yTop}`).join(" ");
      const insBottomRev = [...ins].reverse().map((p) => `${p.x},${p.yTop}`).join(" ");
      polys.push(
        <polygon
          key={`asf-${ri}`}
          points={`${totTop} ${insBottomRev}`}
          fill={SELFPAY}
          opacity={0.35}
        />
      );
      // 境界線（合算の上端）
      polys.push(
        <polyline
          key={`aline-${ri}`}
          points={totTop}
          fill="none"
          stroke={TOTAL}
          strokeWidth={1.5}
        />
      );
    });

    // 旧データ（内訳なし）の連続 run → グレー面
    const legIdx = yms.map((ym, i) => {
      const m = metricMap.get(ym);
      return m && isLegacyOnly(m) ? i : -1;
    });
    const legRuns: number[][] = [];
    let lc: number[] = [];
    for (const idx of legIdx) {
      if (idx >= 0) lc.push(idx);
      else if (lc.length) {
        legRuns.push(lc);
        lc = [];
      }
    }
    if (lc.length) legRuns.push(lc);
    legRuns.forEach((run, ri) => {
      const pts = run.map((i) => {
        const t = monthTotal(metricMap.get(yms[i])!) ?? 0;
        return { x: xCenter(i), y: ySales(t) };
      });
      const top = pts.map((p) => `${p.x},${p.y}`).join(" ");
      polys.push(
        <polygon
          key={`aleg-${ri}`}
          points={`${pts[0].x},${baseline} ${top} ${pts[pts.length - 1].x},${baseline}`}
          fill={LEGACY}
          opacity={0.35}
        />
      );
    });
    return polys;
  };

  // ② 折れ線（保険・自費・合算の3本）
  const renderLines = () => {
    const insPts = yms.map((ym, i) =>
      insArr[i] != null ? { x: xCenter(i), y: ySales(insArr[i]!) } : null
    );
    const selfPts = yms.map((ym, i) =>
      selfArr[i] != null ? { x: xCenter(i), y: ySales(selfArr[i]!) } : null
    );
    const totPts = yms.map((ym, i) =>
      totals[i] != null ? { x: xCenter(i), y: ySales(totals[i]!) } : null
    );
    const series: [string, string, number, ({ x: number; y: number } | null)[]][] = [
      ["ins", INSURANCE, 1.5, insPts],
      ["self", SELFPAY, 1.5, selfPts],
      ["tot", TOTAL, 2.5, totPts],
    ];
    return series.map(([key, color, sw, pts]) => {
      const runs = runsOf(pts);
      return (
        <g key={`line-${key}`}>
          {runs.map((run, ri) => (
            <polyline
              key={`${key}-${ri}`}
              points={run.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={color}
              strokeWidth={sw}
            />
          ))}
          {pts.map((p, i) =>
            p ? <circle key={`${key}-pt-${i}`} cx={p.x} cy={p.y} r={2.5} fill={color} /> : null
          )}
        </g>
      );
    });
  };

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="月別の売上（保険・自費）とカウンセリング数の推移"
        className="block"
      >
        {/* グリッド線 */}
        {gridYs.map((y, i) => (
          <line key={i} x1={padL} y1={y} x2={width - padR} y2={y} stroke="#f1f5f9" strokeWidth={1} />
        ))}
        {/* 左軸（売上・万円） */}
        <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize={9} fill="#0d9488">
          {salesMax}
        </text>
        <text x={padL - 6} y={baseline + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
          0
        </text>
        {/* 右軸（カウンセリング・件）— データが1件でもある時のみ */}
        {hasCounseling && (
          <>
            <text x={width - padR + 6} y={padT + 4} textAnchor="start" fontSize={9} fill="#0284c7">
              {countMax}
            </text>
            <text x={width - padR + 6} y={baseline + 3} textAnchor="start" fontSize={9} fill="#94a3b8">
              0
            </text>
          </>
        )}

        {/* 期間施策の帯（背面） */}
        {marks
          .filter((m) => m.isPeriod)
          .map((m) => {
            const x = xLeft(m.startIdx);
            const w = xLeft(m.endIdx + 1) - x;
            return <rect key={`band-${m.no}`} x={x} y={padT} width={w} height={plotH} fill="#f59e0b" opacity={0.08} />;
          })}
        {/* 単日施策の縦線 */}
        {marks
          .filter((m) => !m.isPeriod)
          .map((m) => {
            const x = xCenter(m.startIdx);
            return (
              <line key={`vl-${m.no}`} x1={x} y1={padT} x2={x} y2={baseline} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 3" />
            );
          })}

        {/* 売上（タイプ別） */}
        {chartType === "bar" && renderBars()}
        {chartType === "area" && renderArea()}
        {chartType === "line" && renderLines()}

        {/* カウンセリング折れ線（全タイプ共通・データがある時のみ） */}
        {hasCounseling && (
          <>
            {countRuns.map((run, ri) => (
              <polyline
                key={`cseg-${ri}`}
                points={run.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke={COUNSEL}
                strokeWidth={2}
              />
            ))}
            {countPts.map((p, i) =>
              p ? <circle key={`cpt-${i}`} cx={p.x} cy={p.y} r={3} fill={COUNSEL} /> : null
            )}
          </>
        )}

        {/* 施策番号 */}
        {marks.map((m) => {
          const x = m.isPeriod ? (xLeft(m.startIdx) + xLeft(m.endIdx + 1)) / 2 : xCenter(m.startIdx);
          return (
            <text key={`no-${m.no}`} x={x} y={m.labelY} textAnchor="middle" fontSize={11} fill="#64748b">
              {circled(m.no)}
            </text>
          );
        })}

        {/* 月ラベル */}
        {yms.map((ym, i) => {
          const { year, month } = shortYm(ym);
          const prev = i > 0 ? shortYm(yms[i - 1]).year : "";
          const showYear = i === 0 || year !== prev;
          return (
            <g key={`lbl-${ym}`}>
              <text x={xCenter(i)} y={baseline + 14} textAnchor="middle" fontSize={9} fill="#64748b">
                {month}月
              </text>
              {showYear && (
                <text x={xCenter(i)} y={baseline + 26} textAnchor="middle" fontSize={8} fill="#94a3b8">
                  &apos;{year}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hasLegacy && (
        <p className="text-[10px] text-gray-400 mt-1 px-1">
          ※ グレーは内訳（保険/自費）未入力の合算のみの月です。
        </p>
      )}
    </div>
  );
}

export function ClinicMetricsSection() {
  const [data, setData] = useState<ClinicMetrics | null>(null); // null=読込中
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [rangeInit, setRangeInit] = useState(false);
  const [chartType, setChartType] = useState<ChartType>("bar");

  const boxRef = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);

  useEffect(() => {
    loadClinicMetrics()
      .then(setData)
      .catch(() => setData({ months: [], initiatives: [], updatedAt: "" }));
  }, []);

  // localStorage からタイプ復元（不正/未保存は "bar"）
  useEffect(() => {
    try {
      const v = localStorage.getItem(CHART_TYPE_KEY);
      if (v === "bar" || v === "line" || v === "area") setChartType(v);
    } catch {
      /* localStorage 不可環境 */
    }
  }, []);

  const changeType = (t: ChartType) => {
    setChartType(t);
    try {
      localStorage.setItem(CHART_TYPE_KEY, t);
    } catch {
      /* 保存できなくても表示は切替 */
    }
  };

  // コンテナ幅に追随（82小修正2）
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setBoxWidth(e.contentRect.width);
    });
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [data]);

  const axisYms = useMemo(() => (data ? buildAxisYms(data) : []), [data]);

  useEffect(() => {
    if (!data || rangeInit || axisYms.length === 0) return;
    setRangeStart(axisYms[Math.max(0, axisYms.length - 12)]);
    setRangeEnd(axisYms[axisYms.length - 1]);
    setRangeInit(true);
  }, [data, axisYms, rangeInit]);

  const presetRecent12 = () => {
    if (axisYms.length === 0) return;
    setRangeStart(axisYms[Math.max(0, axisYms.length - 12)]);
    setRangeEnd(axisYms[axisYms.length - 1]);
  };
  const presetAll = () => {
    if (axisYms.length === 0) return;
    setRangeStart(axisYms[0]);
    setRangeEnd(axisYms[axisYms.length - 1]);
  };

  const displayedYms = useMemo(() => {
    if (!rangeStart || !rangeEnd) return axisYms;
    const lo = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
    const hi = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
    return axisYms.filter((ym) => ym >= lo && ym <= hi);
  }, [axisYms, rangeStart, rangeEnd]);

  const metricMap = useMemo(() => {
    const m = new Map<string, MonthMetric>();
    for (const row of data?.months ?? []) m.set(row.ym, row);
    return m;
  }, [data]);

  const hasLegacy = useMemo(
    () =>
      displayedYms.some((ym) => {
        const m = metricMap.get(ym);
        return m ? isLegacyOnly(m) : false;
      }),
    [displayedYms, metricMap]
  );

  // カウンセリングが表示範囲に1件でもあるか（82小修正1: 無ければ右軸・凡例・線を出さない）
  const hasCounseling = useMemo(
    () =>
      displayedYms.some(
        (ym) => typeof metricMap.get(ym)?.counseling === "number"
      ),
    [displayedYms, metricMap]
  );

  const plotted = useMemo<PlottedInitiative[]>(() => {
    if (!data || displayedYms.length === 0) return [];
    const first = displayedYms[0];
    const last = displayedYms[displayedYms.length - 1];
    return data.initiatives
      .filter((i) => {
        const s = initiativeYm(i.date);
        const e = i.endDate ? initiativeYm(i.endDate) : s;
        return s <= last && e >= first;
      })
      .map((init, idx) => ({ init, no: idx + 1 }));
  }, [data, displayedYms]);

  if (!data || axisYms.length === 0) return null;

  return (
    <section className="px-4 py-5 border-b border-gray-100">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
          📈 クリニックの歩み
        </h2>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* グラフタイプ切替（セグメント） */}
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            {CHART_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => changeType(t.key)}
                className={`text-xs px-2 py-1 transition-colors ${
                  chartType === t.key
                    ? "bg-teal-500 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
                aria-pressed={chartType === t.key}
                title={`${t.label}グラフ`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
          <input
            type="month"
            value={rangeStart}
            min={axisYms[0]}
            max={axisYms[axisYms.length - 1]}
            onChange={(e) => setRangeStart(e.target.value)}
            className="h-7 rounded border border-gray-200 px-1.5 text-xs"
            aria-label="開始月"
          />
          <span className="text-xs text-gray-400">〜</span>
          <input
            type="month"
            value={rangeEnd}
            min={axisYms[0]}
            max={axisYms[axisYms.length - 1]}
            onChange={(e) => setRangeEnd(e.target.value)}
            className="h-7 rounded border border-gray-200 px-1.5 text-xs"
            aria-label="終了月"
          />
          <button
            type="button"
            onClick={presetRecent12}
            className="text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            直近12か月
          </button>
          <button
            type="button"
            onClick={presetAll}
            className="text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            全期間
          </button>
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 rounded-sm bg-teal-500" />
          <span className="text-[11px] text-gray-600">保険売上（万円）</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-2.5 rounded-sm bg-amber-500" />
          <span className="text-[11px] text-gray-600">自費売上（施術＋物販）</span>
        </div>
        <span className="text-[11px] text-gray-500">
          {chartType === "line" ? "合算＝濃い線" : "合算＝棒の高さ"}
        </span>
        {hasCounseling && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-sky-500 relative">
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-sky-500" />
            </span>
            <span className="text-[11px] text-gray-600">カウンセリング数（件）</span>
          </div>
        )}
      </div>

      <div ref={boxRef} className="bg-white border border-gray-100 rounded-xl p-2">
        <Chart
          yms={displayedYms}
          metricMap={metricMap}
          plotted={plotted}
          hasLegacy={hasLegacy}
          hasCounseling={hasCounseling}
          chartType={chartType}
          containerWidth={boxWidth}
        />
      </div>

      {/* 施策の番号つきリスト */}
      {plotted.length > 0 && (
        <ul className="mt-3 space-y-1">
          {plotted.map(({ init, no }) => (
            <li key={init.id} className="flex items-start gap-2 text-xs text-gray-600">
              <span className="text-gray-500 shrink-0">{circled(no)}</span>
              <span className="text-gray-400 shrink-0 tabular-nums">
                {formatInitiative(init)}
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
