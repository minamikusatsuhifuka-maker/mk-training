"use client";

// 院長の振り返り記録の見える化（指示書173-3）— 純SVG（ClinicMetricsSection と同じ流儀・recharts不使用）
//
// 3-1 四象限の推移: 期を横軸に、第1〜第4象限の配分を積み上げ棒で。
//     「振り返って記入」の期は薄い色＋破線枠で、当時の記録と区別する。
// 3-2 権限委譲の推移: 期ごとに「抱えている／一部委譲／完全委譲」の件数を積み上げ棒で。
// 3-3 施策の状態一覧: 期×状態の件数表。
//
// 整形（並び・集計）は lib/director-retrospective.ts の build*Rows に任せ、ここは描画だけ。

import {
  DELEGATION_STATUSES,
  INITIATIVE_STATUSES,
  QUADRANT_LABELS,
  type DelegationChartRow,
  type DelegationStatus,
  type InitiativeStatus,
  type InitiativeStatusRow,
  type QuadrantChartRow,
} from "@/lib/director-retrospective";

const QUADRANT_COLORS: Record<1 | 2 | 3 | 4, string> = {
  1: "#ef4444", // 緊急かつ重要
  2: "#14b8a6", // 緊急でないが重要（アプリの基調色＝ここを増やしたい）
  3: "#f59e0b", // 緊急だが重要でない
  4: "#94a3b8", // どちらでもない
};

const DELEGATION_COLORS: Record<DelegationStatus, string> = {
  held: "#ef4444",
  partial: "#f59e0b",
  full: "#14b8a6",
};

const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 46;
const COL_W = 76;
const BAR_W = 46;
const PLOT_H = 210;

function shortLabel(s: string, max = 7): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-[11px] text-gray-500 py-4 text-center">{text}</p>;
}

// ─── 3-1 四象限の推移 ───

export function QuadrantTrendChart({ rows }: { rows: QuadrantChartRow[] }) {
  if (rows.length === 0) {
    return <EmptyNote text="期を登録し、時間管理スナップショットに四象限の配分を入力すると表示されます。" />;
  }
  const width = PAD_L + rows.length * COL_W + PAD_R;
  const height = PAD_T + PLOT_H + PAD_B;
  const y = (pct: number) => PAD_T + PLOT_H - (PLOT_H * pct) / 100;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ minWidth: Math.min(width, 320), maxWidth: width, display: "block" }}
          role="img"
          aria-label="四象限の配分の推移"
        >
          {/* 目盛り */}
          {[0, 25, 50, 75, 100].map((p) => (
            <g key={p}>
              <line
                x1={PAD_L}
                x2={width - PAD_R}
                y1={y(p)}
                y2={y(p)}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 6}
                y={y(p) + 4}
                fontSize={10}
                textAnchor="end"
                fill="#6b7280"
              >
                {p}%
              </text>
            </g>
          ))}

          {rows.map((r, i) => {
            const cx = PAD_L + i * COL_W + COL_W / 2;
            const x0 = cx - BAR_W / 2;
            const retro = r.recordedMode === "retrospective";
            const segments: { q: 1 | 2 | 3 | 4; v: number }[] = r.shares
              ? [
                  { q: 1, v: r.shares.q1 },
                  { q: 2, v: r.shares.q2 },
                  { q: 3, v: r.shares.q3 },
                  { q: 4, v: r.shares.q4 },
                ]
              : [];
            let acc = 0;
            return (
              <g key={r.periodId}>
                {!r.shares && (
                  <>
                    <rect
                      x={x0}
                      y={y(100)}
                      width={BAR_W}
                      height={PLOT_H}
                      fill="#f9fafb"
                      stroke="#d1d5db"
                      strokeDasharray="4 3"
                      rx={3}
                    />
                    <text
                      x={cx}
                      y={y(50) + 4}
                      fontSize={10}
                      textAnchor="middle"
                      fill="#9ca3af"
                    >
                      未入力
                    </text>
                  </>
                )}
                {segments.map((s) => {
                  const top = y(acc + s.v);
                  const h = y(acc) - top;
                  acc += s.v;
                  if (s.v <= 0) return null;
                  return (
                    <g key={s.q}>
                      <rect
                        x={x0}
                        y={top}
                        width={BAR_W}
                        height={h}
                        fill={QUADRANT_COLORS[s.q]}
                        fillOpacity={retro ? 0.38 : 0.95}
                        stroke={QUADRANT_COLORS[s.q]}
                        strokeWidth={retro ? 1.2 : 0}
                        strokeDasharray={retro ? "3 2" : undefined}
                      >
                        <title>
                          {r.label} ／ {QUADRANT_LABELS[s.q]}: {s.v}%
                        </title>
                      </rect>
                      {s.v >= 9 && (
                        <text
                          x={cx}
                          y={top + h / 2 + 4}
                          fontSize={10}
                          textAnchor="middle"
                          fill={retro ? "#374151" : "#ffffff"}
                          fontWeight={600}
                        >
                          {s.v}%
                        </text>
                      )}
                    </g>
                  );
                })}
                <text
                  x={cx}
                  y={PAD_T + PLOT_H + 16}
                  fontSize={10.5}
                  textAnchor="middle"
                  fill="#111827"
                >
                  {shortLabel(r.label)}
                  <title>{r.label}</title>
                </text>
                <text
                  x={cx}
                  y={PAD_T + PLOT_H + 30}
                  fontSize={9}
                  textAnchor="middle"
                  fill={retro ? "#9ca3af" : "#0f766e"}
                >
                  {r.recordedMode
                    ? retro
                      ? "振り返り"
                      : "当時"
                    : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-700">
        {([1, 2, 3, 4] as const).map((q) => (
          <span key={q} className="inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: QUADRANT_COLORS[q] }}
            />
            {QUADRANT_LABELS[q]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-sm border border-dashed"
            style={{ background: "rgba(20,184,166,0.38)", borderColor: "#14b8a6" }}
          />
          薄い色・破線＝振り返って記入（当時の記録と区別）
        </span>
      </div>
    </div>
  );
}

// ─── 3-2 権限委譲の推移 ───

export function DelegationTrendChart({ rows }: { rows: DelegationChartRow[] }) {
  if (rows.length === 0) {
    return <EmptyNote text="期を登録し、権限委譲を記録すると表示されます。" />;
  }
  const maxTotal = Math.max(
    1,
    ...rows.map((r) => r.counts.held + r.counts.partial + r.counts.full)
  );
  const width = PAD_L + rows.length * COL_W + PAD_R;
  const plotH = 160;
  const height = PAD_T + plotH + PAD_B - 14;
  const y = (n: number) => PAD_T + plotH - (plotH * n) / maxTotal;
  const ticks = Array.from(
    new Set([0, Math.ceil(maxTotal / 2), maxTotal])
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          style={{ minWidth: Math.min(width, 320), maxWidth: width, display: "block" }}
          role="img"
          aria-label="権限委譲の推移"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_L}
                x2={width - PAD_R}
                y1={y(t)}
                y2={y(t)}
                stroke="#e5e7eb"
              />
              <text x={PAD_L - 6} y={y(t) + 4} fontSize={10} textAnchor="end" fill="#6b7280">
                {t}件
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const cx = PAD_L + i * COL_W + COL_W / 2;
            const x0 = cx - BAR_W / 2;
            let acc = 0;
            const total = r.counts.held + r.counts.partial + r.counts.full;
            return (
              <g key={r.periodId}>
                {total === 0 && (
                  <text x={cx} y={y(0) - 6} fontSize={10} textAnchor="middle" fill="#9ca3af">
                    記録なし
                  </text>
                )}
                {DELEGATION_STATUSES.map((s) => {
                  const v = r.counts[s.value];
                  const top = y(acc + v);
                  const h = y(acc) - top;
                  acc += v;
                  if (v <= 0) return null;
                  return (
                    <g key={s.value}>
                      <rect
                        x={x0}
                        y={top}
                        width={BAR_W}
                        height={h}
                        fill={DELEGATION_COLORS[s.value]}
                        fillOpacity={0.92}
                      >
                        <title>
                          {r.label} ／ {s.label}: {v}件
                        </title>
                      </rect>
                      {h >= 14 && (
                        <text
                          x={cx}
                          y={top + h / 2 + 4}
                          fontSize={10}
                          textAnchor="middle"
                          fill="#fff"
                          fontWeight={600}
                        >
                          {v}
                        </text>
                      )}
                    </g>
                  );
                })}
                <text
                  x={cx}
                  y={PAD_T + plotH + 16}
                  fontSize={10.5}
                  textAnchor="middle"
                  fill="#111827"
                >
                  {shortLabel(r.label)}
                  <title>{r.label}</title>
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-700">
        {DELEGATION_STATUSES.map((s) => (
          <span key={s.value} className="inline-flex items-center gap-1">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: DELEGATION_COLORS[s.value] }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── 3-3 施策の状態一覧 ───

const STATUS_TONE: Record<InitiativeStatus, string> = {
  planned: "text-slate-700",
  in_progress: "text-sky-700",
  done: "text-teal-700",
  incomplete: "text-amber-700",
  cancelled: "text-red-700",
};

export function InitiativeStatusTable({ rows }: { rows: InitiativeStatusRow[] }) {
  if (rows.length === 0) {
    return <EmptyNote text="期を登録し、施策を記録すると表示されます。" />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-[11px] border-collapse">
        <thead>
          <tr className="text-gray-600">
            <th className="text-left py-1 pr-2 font-medium">期</th>
            {INITIATIVE_STATUSES.map((s) => (
              <th key={s.value} className="text-right py-1 px-2 font-medium whitespace-nowrap">
                {s.label}
              </th>
            ))}
            <th className="text-right py-1 pl-2 font-medium">計</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = INITIATIVE_STATUSES.reduce((a, s) => a + r.counts[s.value], 0);
            return (
              <tr key={r.periodId} className="border-t border-gray-100">
                <td className="py-1 pr-2 text-gray-900">{r.label}</td>
                {INITIATIVE_STATUSES.map((s) => (
                  <td
                    key={s.value}
                    className={`py-1 px-2 text-right tabular-nums ${
                      r.counts[s.value] > 0 ? STATUS_TONE[s.value] : "text-gray-300"
                    }`}
                  >
                    {r.counts[s.value]}
                  </td>
                ))}
                <td className="py-1 pl-2 text-right tabular-nums text-gray-900 font-medium">
                  {total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
