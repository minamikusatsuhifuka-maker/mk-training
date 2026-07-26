"use client";

// ホーム「📈 クリニックの歩み」セクション（80新設 / 81保険・自費・期間つき施策 / 82タイプ切替＋小修正 / 84縦幅3段階＋数値ポップ）
// - グラフタイプ3種を切替（①積み上げ棒＝既定 ②折れ線 ③積み上げ面）。選択は localStorage で維持。
// - 売上=保険（teal）＋自費（amber）。合算＝保険＋自費（表示時計算）。旧80データ（内訳なし）はグレー。
// - カウンセリング数は右軸の折れ線（全タイプ共通）。1件も無ければ右軸・凡例・線を出さない（82小修正1）。
// - 施策: 単日=縦線＋番号 / 期間つき=薄い帯＋番号。下に番号つきリスト（ホバー非依存）。
// - 期間指定（開始月〜終了月）＋プリセット。純SVG。グラフはコンテナ幅に追随（82小修正2）、スマホは横スクロール。
// - グラフ下に理念の一文（経営計画書 第三章「数字は鏡」）を必ず表示。
//
// 【整形と描画の分離】期間フィルタ・欠測処理・合算計算は section 側（useMemo）で1度だけ行い、
// 整形済みの metricMap / plotted / フラグを Chart に渡す。3タイプは同じ整形結果を共有し重複実装しない。

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  loadClinicMetrics,
  buildAxisYms,
  computeMovingAvg12,
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

// 12か月移動平均線の色（gray-400・薄い破線。視認できるが主張しない・指示書94）
const MOVING_AVG_COLOR = "#9ca3af";

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
const SELFPAY = "#c026d3"; // fuchsia-600（自費・指示書94で amber から変更）
const LEGACY = "#94a3b8"; // slate-400（旧データ・内訳未入力）
const TOTAL = "#475569"; // slate-600（合算の線）
const COUNSEL = "#0ea5e9"; // sky-500（カウンセリング折れ線）

type ChartType = "bar" | "line" | "area";
const CHART_TYPE_KEY = "mk_metrics_chart_type";
const AVG_VISIBLE_KEY = "mk_metrics_avg_visible"; // 12か月平均線の表示ON/OFF（指示書94）
const CHART_TYPES: { key: ChartType; icon: string; label: string }[] = [
  { key: "bar", icon: "📊", label: "棒" },
  { key: "line", icon: "📈", label: "線" },
  { key: "area", icon: "⛰", label: "面" },
];

// 縦幅は「たっぷり」360px 固定（指示書91・切替UIと localStorage は廃止）。
const PLOT_H = 360;

// ツールチップ1か月分の内容（84）。整形済み metricMap から作り、3タイプで共通。
type TipRow = { label: string; value: string; bold?: boolean };
type TipData = { heading: string; rows: TipRow[] };
function buildTipData(
  ym: string,
  m: MonthMetric | undefined,
  movingAvg?: number
): TipData | null {
  if (!m) return null;
  const man = (v: number) => `${v.toLocaleString("ja-JP")}万円`;
  const rows: TipRow[] = [];
  if (hasBreakdown(m)) {
    if (m.insurance != null) rows.push({ label: "保険売上", value: man(m.insurance) });
    if (m.selfPay != null) rows.push({ label: "自費売上", value: man(m.selfPay) });
    rows.push({ label: "合算", value: man(monthTotal(m) ?? 0), bold: true });
  } else if (isLegacyOnly(m)) {
    rows.push({ label: "合算", value: `${man(m.sales ?? 0)}（内訳未入力）`, bold: true });
  }
  if (typeof m.counseling === "number") {
    rows.push({ label: "カウンセリング", value: `${m.counseling.toLocaleString("ja-JP")}件` });
  }
  if (typeof movingAvg === "number") {
    rows.push({ label: "12か月平均", value: man(Math.round(movingAvg)) });
  }
  if (rows.length === 0) return null;
  const [y, mo] = ym.split("-");
  return { heading: `${y}年${Number(mo)}月`, rows };
}

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
  movingAvg,
  avgVisible,
  plotted,
  hasLegacy,
  hasCounseling,
  chartType,
  containerWidth,
  plotH,
}: {
  yms: string[];
  metricMap: Map<string, MonthMetric>;
  movingAvg: Map<string, number>;
  avgVisible: boolean;
  plotted: PlottedInitiative[];
  hasLegacy: boolean;
  hasCounseling: boolean;
  chartType: ChartType;
  containerWidth: number;
  plotH: number;
}) {
  const padL = 46;
  const padR = hasCounseling ? 46 : 16; // カウンセリング無しなら右余白を詰める
  const padT = 22;
  const padB = 54;
  const n = yms.length;
  const MIN_COL = 44;
  // コンテナ幅に追随（広い画面は幅いっぱい／狭い画面は MIN_COL で横スクロール）。
  // 指示書91-3: 外枠の padding(p-2=16px)＋border(2px) を差し引き、fit時に右端がはみ出さないようにする。
  const CONTENT_INSET = 18;
  const avail = Math.max(0, containerWidth - CONTENT_INSET);
  const colW =
    n > 0 ? Math.max(MIN_COL, (avail - padL - padR) / n) : MIN_COL;
  // 指示書91-3: コンテンツ幅は必ず「月数×最小列幅」を満たす（全期間でも末尾まで到達できる）
  const width = Math.max(avail, padL + colW * n + padR);
  const height = padT + plotH + padB;
  const baseline = padT + plotH;
  const xCenter = (i: number) => padL + colW * (i + 0.5);
  const xLeft = (i: number) => padL + colW * i;

  // ── 数値ポップ（84）: 月列単位のヒットエリア。ホバー（PC）＋タップ（スマホ）両対応・3タイプ共通 ──
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null); // タップで固定表示
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const activeIdx =
    pinnedIdx != null && pinnedIdx < yms.length
      ? pinnedIdx
      : hoverIdx != null && hoverIdx < yms.length
        ? hoverIdx
        : null;

  const posFromEvent = (e: React.MouseEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? { x: e.clientX - r.left, y: e.clientY - r.top } : { x: 0, y: 0 };
  };

  // 期間変更などで月配列が変わったら閉じる
  useEffect(() => {
    setHoverIdx(null);
    setPinnedIdx(null);
  }, [yms]);

  // タップ固定中はグラフ外タップで閉じる（スマホ）
  useEffect(() => {
    if (pinnedIdx == null) return;
    const onDown = (ev: PointerEvent) => {
      if (
        wrapRef.current &&
        ev.target instanceof Node &&
        !wrapRef.current.contains(ev.target)
      ) {
        setPinnedIdx(null);
        setHoverIdx(null);
      }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [pinnedIdx]);

  const tipData = useMemo(
    () =>
      yms.map((ym) =>
        buildTipData(
          ym,
          metricMap.get(ym),
          avgVisible ? movingAvg.get(ym) : undefined
        )
      ),
    [yms, metricMap, movingAvg, avgVisible]
  );
  const tip = activeIdx != null ? tipData[activeIdx] : null;
  // 端で見切れないよう左右反転（ツールチップ幅の見積もり）
  const TIP_W = 190;
  const tipFlip = tipPos.x + 12 + TIP_W > width;

  const totals = yms.map((ym) => {
    const m = metricMap.get(ym);
    return m ? monthTotal(m) : null;
  });
  // 12か月移動平均の表示範囲ぶんの点（値は全データ基準・期間で変わらない）
  const avgVals = yms.map((ym) => movingAvg.get(ym) ?? null);
  // y軸スケールは合算・移動平均の両方を収める（平均線が上端で切れないように）
  const salesMax = niceCeil(
    Math.max(
      1,
      ...totals.filter((v): v is number => typeof v === "number"),
      ...avgVals.filter((v): v is number => typeof v === "number")
    )
  );
  const ySales = (v: number) => baseline - (v / salesMax) * plotH;
  const avgPts = yms.map((ym, i) => {
    const v = movingAvg.get(ym);
    return typeof v === "number" ? { x: xCenter(i), y: ySales(v) } : null;
  });
  const avgRuns = runsOf(avgPts);
  // 年区切り: 表示範囲内の各1月の左端（＝年の境目）。先頭列は軸と重なるため除外。
  const yearDividerX = yms
    .map((ym, i) => (i > 0 && shortYm(ym).month === "1" ? xLeft(i) : null))
    .filter((x): x is number => x != null);

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
      <div ref={wrapRef} className="relative" style={{ width }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="月別の売上（保険・自費）とカウンセリング数の推移"
        className="block"
        onMouseLeave={() => setHoverIdx(null)}
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

        {/* 年区切り（93）: 各1月の左端に控えめな縦線。グリッドよりわずかに濃く、施策の破線とは別（実線） */}
        {yearDividerX.map((x, i) => (
          <line
            key={`ydiv-${i}`}
            x1={x}
            y1={padT}
            x2={x}
            y2={baseline}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        ))}

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

        {/* 対象月の列ハイライト（84・薄い背景） */}
        {activeIdx != null && (
          <rect
            x={xLeft(activeIdx)}
            y={padT}
            width={colW}
            height={plotH}
            fill="#64748b"
            opacity={0.08}
          />
        )}

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

        {/* 12か月移動平均線（93・全タイプ共通・破線・ヒットエリアより下・94でON/OFF） */}
        {avgVisible &&
          avgRuns.map((run, ri) => (
          <polyline
            key={`avg-${ri}`}
            points={run.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke={MOVING_AVG_COLOR}
            strokeWidth={1.5}
            strokeDasharray="5 3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

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

        {/* 月列の透明ヒットエリア（84・最前面）: 細い棒や点を狙わなくても列全体で反応 */}
        {yms.map((ym, i) => (
          <rect
            key={`hit-${ym}`}
            x={xLeft(i)}
            y={padT}
            width={colW}
            height={plotH + 28}
            fill="transparent"
            onMouseEnter={(e) => {
              setHoverIdx(i);
              setTipPos(posFromEvent(e));
            }}
            onMouseMove={(e) => setTipPos(posFromEvent(e))}
            onClick={(e) => {
              setPinnedIdx(i);
              setTipPos(posFromEvent(e));
            }}
          />
        ))}
      </svg>

      {/* 数値ポップ（84）: カーソル/タップ位置の近くに表示・端では左右反転 */}
      {tip && (
        <div
          className="absolute z-10 pointer-events-none rounded-lg border border-gray-200 bg-white/95 shadow-md px-3 py-2 whitespace-nowrap"
          style={{
            left: tipFlip ? undefined : tipPos.x + 12,
            right: tipFlip ? width - tipPos.x + 12 : undefined,
            top: Math.max(4, Math.min(tipPos.y + 14, height - 110)),
          }}
        >
          <p className="text-[11px] font-semibold text-gray-800 mb-0.5">{tip.heading}</p>
          {tip.rows.map((r, ri) => (
            <p
              key={ri}
              className={`text-[11px] flex items-center justify-between gap-3 ${
                r.bold ? "font-bold text-gray-800" : "text-gray-600"
              }`}
            >
              <span>{r.label}</span>
              <span className="tabular-nums">{r.value}</span>
            </p>
          ))}
        </div>
      )}
      </div>
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
  const [avgVisible, setAvgVisible] = useState(true); // 12か月平均線の表示（指示書94・既定ON）

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

  // 12か月平均線の表示ON/OFF復元（指示書94・既定ON。"0"のみOFF）
  useEffect(() => {
    try {
      if (localStorage.getItem(AVG_VISIBLE_KEY) === "0") setAvgVisible(false);
    } catch {
      /* localStorage 不可環境 */
    }
  }, []);

  const toggleAvg = () => {
    setAvgVisible((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(AVG_VISIBLE_KEY, next ? "1" : "0");
      } catch {
        /* 保存できなくても表示は切替 */
      }
      return next;
    });
  };

  // コンテナ幅に追随。指示書91-2: 初回は useLayoutEffect で同期測定し、
  // 幅が取れるまでSVGを描画しない（boxWidth=0→実測 の二段描画による初回アニメを防ぐ）。
  useLayoutEffect(() => {
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

  // 12か月移動平均は全データ基準で1度だけ計算（表示期間を絞っても値は不変・指示書93）
  const movingAvgMap = useMemo(
    () => (data ? computeMovingAvg12(data) : new Map<string, number>()),
    [data]
  );

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
          {/* 12か月平均線 ON/OFF トグル（指示書94） */}
          <button
            type="button"
            onClick={toggleAvg}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
              avgVisible
                ? "bg-gray-100 text-gray-700 border-gray-300"
                : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"
            }`}
            aria-pressed={avgVisible}
            title="12か月平均線の表示"
          >
            <span
              className="inline-block w-4 border-t-2 border-dashed align-middle mr-1"
              style={{ borderColor: avgVisible ? MOVING_AVG_COLOR : "#d1d5db" }}
            />
            平均
          </button>
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
          <span
            className="inline-block w-4 h-2.5 rounded-sm"
            style={{ backgroundColor: SELFPAY }}
          />
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
        {/* 12か月移動平均（93）: 破線サンプル・OFF時は凡例からも消す（94） */}
        {avgVisible && (
          <div className="flex items-center gap-1.5">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke={MOVING_AVG_COLOR} strokeWidth="1.5" strokeDasharray="5 3" />
            </svg>
            <span className="text-[11px] text-gray-600">12か月平均</span>
          </div>
        )}
      </div>

      <div ref={boxRef} className="bg-white border border-gray-100 rounded-xl p-2">
        {/* 指示書91-2: 幅が確定してから描画（二段描画の初回アニメを防ぐ）。
            未測定時は同じ高さのプレースホルダでレイアウトシフトも防ぐ。 */}
        {boxWidth > 0 ? (
          <Chart
            yms={displayedYms}
            metricMap={metricMap}
            movingAvg={movingAvgMap}
            avgVisible={avgVisible}
            plotted={plotted}
            hasLegacy={hasLegacy}
            hasCounseling={hasCounseling}
            chartType={chartType}
            containerWidth={boxWidth}
            plotH={PLOT_H}
          />
        ) : (
          <div style={{ height: PLOT_H + 22 + 54 }} aria-hidden />
        )}
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
