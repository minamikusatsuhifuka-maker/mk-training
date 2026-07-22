"use client";

// ホーム「📈 クリニックの歩み」セクション（指示書80で新設、81で拡張）
// - 月別の売上を保険（下段teal）＋自費（上段amber）の積み上げ棒で表示（棒の高さ＝合算）。
//   旧80データ（内訳なし）は単色グレー棒（合算のみ）で表示。
// - カウンセリング数は右軸の折れ線（80のまま維持）。
// - 期間指定（開始月〜終了月）＋プリセット「直近12か月」「全期間」。
// - 施策: 単日は縦線＋番号、期間つき（endDate）は薄い帯＋番号。下に番号つきリスト（ホバー非依存）。
// - 純SVG（新規依存なし）。データ0件はセクション非表示。スマホは横スクロール。
// - グラフ下に理念の一文（経営計画書 第三章「数字は鏡」）を必ず表示。

import { useEffect, useMemo, useState } from "react";
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

// 軸の最大値を 1/2/5×10^k の「きり」の良い値に切り上げ
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  const f = v / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * base;
}

// 配色
const INSURANCE = "#14b8a6"; // teal-500（保険・下段）
const SELFPAY = "#f59e0b"; // amber-500（自費・上段）
const LEGACY = "#94a3b8"; // slate-400（旧データ・内訳未入力）
const COUNSEL = "#0ea5e9"; // sky-500（カウンセリング折れ線）

type PlottedInitiative = { init: Initiative; no: number };

function Chart({
  yms,
  metricMap,
  plotted,
  hasLegacy,
}: {
  yms: string[];
  metricMap: Map<string, MonthMetric>;
  plotted: PlottedInitiative[];
  hasLegacy: boolean;
}) {
  const colW = 56;
  const plotH = 190;
  const padL = 46;
  const padR = 46;
  const padT = 22;
  const padB = 54;
  const n = yms.length;
  const width = padL + colW * n + padR;
  const height = padT + plotH + padB;
  const baseline = padT + plotH;
  const xCenter = (i: number) => padL + colW * (i + 0.5);
  const xLeft = (i: number) => padL + colW * i;

  const idxByYm = new Map<string, number>();
  yms.forEach((ym, i) => idxByYm.set(ym, i));

  const totals = yms
    .map((ym) => {
      const m = metricMap.get(ym);
      return m ? monthTotal(m) : null;
    })
    .filter((v): v is number => typeof v === "number");
  const countVals = yms
    .map((ym) => metricMap.get(ym)?.counseling)
    .filter((v): v is number => typeof v === "number");
  const salesMax = niceCeil(Math.max(1, ...totals));
  const countMax = niceCeil(Math.max(1, ...countVals));

  const barW = colW * 0.5;
  const h = (v: number) => (v / salesMax) * plotH;

  // カウンセリング折れ線: 連続する非null点を線分でつなぐ
  const linePts = yms.map((ym, i) => {
    const c = metricMap.get(ym)?.counseling;
    if (typeof c !== "number") return null;
    return { x: xCenter(i), y: baseline - (c / countMax) * plotH };
  });
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < linePts.length - 1; i++) {
    const a = linePts[i];
    const b = linePts[i + 1];
    if (a && b) segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  const gridYs = [0, 0.5, 1].map((t) => baseline - t * plotH);

  // 施策の描画情報（単日=縦線 / 期間=帯）。番号は date 順（plotted の no）。
  const marks = plotted
    .map(({ init, no }, order) => {
      const startYm = initiativeYm(init.date);
      const endYm = init.endDate ? initiativeYm(init.endDate) : startYm;
      // 表示範囲内に収まる列インデックスへクランプ
      let startIdx = yms.findIndex((ym) => ym >= startYm);
      if (startIdx < 0) startIdx = yms.length - 1;
      let endIdx = -1;
      for (let i = 0; i < yms.length; i++) if (yms[i] <= endYm) endIdx = i;
      if (endIdx < 0) endIdx = 0;
      if (endIdx < startIdx) endIdx = startIdx;
      const isPeriod = !!init.endDate && endYm !== startYm;
      const labelY = padT + 2 + (order % 3) * 12; // 重なり回避に縦オフセット
      return { no, startIdx, endIdx, isPeriod, labelY };
    })
    .filter((m) => m.startIdx >= 0);

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
        <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize={9} fill="#0d9488">
          {salesMax}
        </text>
        <text x={padL - 6} y={baseline + 3} textAnchor="end" fontSize={9} fill="#94a3b8">
          0
        </text>
        {/* 右軸（カウンセリング・件） */}
        <text x={width - padR + 6} y={padT + 4} textAnchor="start" fontSize={9} fill="#0284c7">
          {countMax}
        </text>
        <text x={width - padR + 6} y={baseline + 3} textAnchor="start" fontSize={9} fill="#94a3b8">
          0
        </text>

        {/* 期間施策の帯（棒の背面） */}
        {marks
          .filter((m) => m.isPeriod)
          .map((m) => {
            const x = xLeft(m.startIdx);
            const w = xLeft(m.endIdx + 1) - x;
            return (
              <rect
                key={`band-${m.no}`}
                x={x}
                y={padT}
                width={w}
                height={plotH}
                fill="#f59e0b"
                opacity={0.08}
              />
            );
          })}

        {/* 単日施策の縦線 */}
        {marks
          .filter((m) => !m.isPeriod)
          .map((m) => {
            const x = xCenter(m.startIdx);
            return (
              <line
                key={`vl-${m.no}`}
                x1={x}
                y1={padT}
                x2={x}
                y2={baseline}
                stroke="#cbd5e1"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            );
          })}

        {/* 積み上げ棒（保険＝下段 / 自費＝上段 / 旧データ＝グレー単色） */}
        {yms.map((ym, i) => {
          const m = metricMap.get(ym);
          if (!m) return null;
          const cx = xCenter(i);
          const x = cx - barW / 2;
          if (hasBreakdown(m)) {
            const ins = m.insurance ?? 0;
            const self = m.selfPay ?? 0;
            const insH = h(ins);
            const selfH = h(self);
            return (
              <g key={`bar-${ym}`}>
                {ins > 0 && (
                  <rect
                    x={x}
                    y={baseline - insH}
                    width={barW}
                    height={insH}
                    fill={INSURANCE}
                  />
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
          // 旧データ（内訳未入力）＝グレー単色
          const total = monthTotal(m);
          if (total == null) return null;
          const th = h(total);
          return (
            <rect
              key={`bar-${ym}`}
              x={x}
              y={baseline - th}
              width={barW}
              height={th}
              rx={2}
              fill={LEGACY}
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
          p ? <circle key={`pt-${i}`} cx={p.x} cy={p.y} r={3} fill={COUNSEL} /> : null
        )}

        {/* 施策番号（帯・縦線の上部） */}
        {marks.map((m) => {
          const x = m.isPeriod
            ? (xLeft(m.startIdx) + xLeft(m.endIdx + 1)) / 2
            : xCenter(m.startIdx);
          return (
            <text
              key={`no-${m.no}`}
              x={x}
              y={m.labelY}
              textAnchor="middle"
              fontSize={11}
              fill="#64748b"
            >
              {circled(m.no)}
            </text>
          );
        })}

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
      {hasLegacy && (
        <p className="text-[10px] text-gray-400 mt-1 px-1">
          ※ グレーの棒は内訳（保険/自費）未入力の合算のみの月です。
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

  useEffect(() => {
    loadClinicMetrics()
      .then(setData)
      .catch(() => setData({ months: [], initiatives: [], updatedAt: "" }));
  }, []);

  const axisYms = useMemo(() => (data ? buildAxisYms(data) : []), [data]);

  // 既定範囲＝直近12か月（初回のみ）
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
    const lo = rangeStart <= rangeEnd ? rangeStart : rangeEnd; // 開始>終了は自動入替
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

  // 表示範囲に重なる施策を日付順に採番（縦線/帯と下のリストで同じ番号）
  const plotted = useMemo<PlottedInitiative[]>(() => {
    if (!data || displayedYms.length === 0) return [];
    const first = displayedYms[0];
    const last = displayedYms[displayedYms.length - 1];
    return data.initiatives
      .filter((i) => {
        const s = initiativeYm(i.date);
        const e = i.endDate ? initiativeYm(i.endDate) : s;
        return s <= last && e >= first; // 範囲と交差
      })
      .map((init, idx) => ({ init, no: idx + 1 }));
  }, [data, displayedYms]);

  // 読込中・データ0件は非表示
  if (!data || axisYms.length === 0) return null;

  return (
    <section className="px-4 py-5 border-b border-gray-100">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-xs font-medium text-gray-800 uppercase tracking-wider">
          📈 クリニックの歩み
        </h2>
        <div className="flex items-center gap-1.5 flex-wrap">
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
          <span className="text-[11px] text-gray-600">
            自費売上（施術＋物販）
          </span>
        </div>
        <span className="text-[11px] text-gray-500">合算＝棒の高さ</span>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 bg-sky-500 relative">
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-sky-500" />
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
          plotted={plotted}
          hasLegacy={hasLegacy}
        />
      </div>

      {/* 施策の番号つきリスト（縦線/帯と対応・ホバー非依存） */}
      {plotted.length > 0 && (
        <ul className="mt-3 space-y-1">
          {plotted.map(({ init, no }) => (
            <li
              key={init.id}
              className="flex items-start gap-2 text-xs text-gray-600"
            >
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
