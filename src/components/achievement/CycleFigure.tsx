// 成功のサイクル／失敗のサイクルの円の図とリスト（指示書 mk_training_success_cycle.md）
// - サーバーで描く（"use client" にしない＝文言をクライアントの JS に入れない）
// - 円：viewBox 680×560・楕円リング（中心 340,290・rx240・ry210）・8つのノードを真上から時計回りに45°刻み
// - 矢印：ノードの間（22.5°＋45°刻み）にリングに沿った短い矢印を時計回りに
// - スタート：二重枠＋「スタート」のピル

import type { Cycle, CycleNode } from "@/lib/achievement-teachings-server";
import { nodesFromStart } from "@/lib/achievement-teachings-server";

type Palette = {
  fill: string;
  stroke: string;
  text: string;
  sub: string;
  pill: string;
};

// 成功＝パステルのティール／失敗＝パステルのコーラル（グラデーション・影なし）
const PALETTE: Record<Cycle["id"], Palette> = {
  success: { fill: "#E8F5F2", stroke: "#4A9E95", text: "#1F4E4A", sub: "#3D6F6A", pill: "#4A9E95" },
  failure: { fill: "#FDEEE9", stroke: "#E0866C", text: "#7A2E1E", sub: "#9A4F3C", pill: "#E0866C" },
};

const CX = 340;
const CY = 290;
const RX = 240;
const RY = 210;
const NODE_W = 160;

/** 真上を0°として時計回りの角度 → 楕円上の点 */
function onRing(deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [CX + RX * Math.sin(r), CY - RY * Math.cos(r)];
}

/** 指示書の座標（0°から45°刻み） */
const NODE_CENTERS: [number, number][] = [
  [340, 80],
  [510, 142],
  [580, 290],
  [510, 438],
  [340, 500],
  [170, 438],
  [100, 290],
  [170, 142],
];

function nodeHeight(n: CycleNode): number {
  return n.title.length + n.sub.length >= 3 ? 72 : 56;
}

function NodeBox({ n, cx, cy, p }: { n: CycleNode; cx: number; cy: number; p: Palette }) {
  const h = nodeHeight(n);
  const x = cx - NODE_W / 2;
  const y = cy - h / 2;
  // 行：タイトル14px（行の高さ18）・サブ12px（行の高さ16）
  const lines = [
    ...n.title.map((t) => ({ t, size: 14, lh: 18, sub: false })),
    ...n.sub.map((t) => ({ t, size: 12, lh: 16, sub: true })),
  ];
  const total = lines.reduce((s, l) => s + l.lh, 0);
  let ty = cy - total / 2;
  return (
    <g data-cycle-node={n.title.join("")} data-start={n.start ? "1" : undefined}>
      {n.start && (
        <rect x={x - 6} y={y - 6} width={NODE_W + 12} height={h + 12} rx={12} fill="none" stroke={p.stroke} strokeWidth={2.5} />
      )}
      <rect
        x={x}
        y={y}
        width={NODE_W}
        height={h}
        rx={8}
        fill={p.fill}
        stroke={p.stroke}
        strokeWidth={n.start ? 2.5 : n.bold ? 2 : 1}
      />
      {lines.map((l, i) => {
        const baseline = ty + l.lh / 2;
        ty += l.lh;
        return (
          <text
            key={i}
            x={cx}
            y={baseline}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={l.size}
            fontWeight={l.sub ? 400 : 700}
            fill={l.sub ? p.sub : p.text}
          >
            {l.t}
          </text>
        );
      })}
      {n.start && (
        <g data-start-pill>
          <rect x={cx - 34} y={y - 6 - 11} width={68} height={22} rx={11} fill={p.pill} />
          <text x={cx} y={y - 6} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="#FFFFFF">
            スタート
          </text>
        </g>
      )}
    </g>
  );
}

/** ノードの間の短い矢印（リングに沿って時計回り） */
function RingArrow({ deg, p }: { deg: number; p: Palette }) {
  const span = 3.2;
  const pts: string[] = [];
  for (let d = deg - span; d <= deg + span + 0.001; d += span / 4) {
    const [x, y] = onRing(d);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return <polyline points={pts.join(" ")} fill="none" stroke={p.stroke} strokeWidth={2} markerEnd={`url(#arrow-${p.pill.slice(1)})`} />;
}

export function CycleCircle({ cycle }: { cycle: Cycle }) {
  const p = PALETTE[cycle.id];
  const markerId = `arrow-${p.pill.slice(1)}`;
  return (
    <svg
      viewBox="0 0 680 560"
      width="100%"
      role="img"
      aria-label={cycle.name}
      data-cycle-circle={cycle.id}
      style={{ display: "block", maxWidth: 680, margin: "0 auto" }}
    >
      <defs>
        <marker id={markerId} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={p.stroke} />
        </marker>
      </defs>
      <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke={p.stroke} strokeOpacity={0.35} strokeWidth={1} />
      {[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((d) => (
        <RingArrow key={d} deg={d} p={p} />
      ))}
      {cycle.nodes.map((n, i) => (
        <NodeBox key={i} n={n} cx={NODE_CENTERS[i][0]} cy={NODE_CENTERS[i][1]} p={p} />
      ))}
      <text x={CX} y={cycle.caption ? CY - 10 : CY} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={700} fill={p.text}>
        {cycle.name}
      </text>
      {cycle.caption && (
        <text x={CX} y={CY + 12} textAnchor="middle" dominantBaseline="central" fontSize={11} fill={p.sub}>
          {cycle.caption}
        </text>
      )}
    </svg>
  );
}

/** スマホ向け：スタートから時計回りに縦に並べ、最後に「↻ 最初に戻る」 */
export function CycleList({ cycle }: { cycle: Cycle }) {
  const p = PALETTE[cycle.id];
  const nodes = nodesFromStart(cycle);
  return (
    <div data-cycle-list={cycle.id} className="mx-auto flex max-w-xs flex-col items-center">
      <p className="mb-3 text-sm font-bold" style={{ color: p.text }}>
        {cycle.name}
      </p>
      {nodes.map((n, i) => (
        <div key={i} className="flex w-full flex-col items-center">
          {i > 0 && (
            <span aria-hidden="true" className="py-1 text-lg leading-none" style={{ color: p.stroke }}>
              ↓
            </span>
          )}
          <div
            className={`relative w-full ${n.start ? "mt-3 rounded-xl p-[4px]" : ""}`}
            style={n.start ? { border: `2.5px solid ${p.stroke}` } : undefined}
            data-cycle-node={n.title.join("")}
            data-start={n.start ? "1" : undefined}
          >
            {n.start && (
              <span
                className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full px-3 py-0.5 text-xs font-bold text-white"
                style={{ background: p.pill }}
                data-start-pill
              >
                スタート
              </span>
            )}
            <div
              className="rounded-lg px-3 py-2 text-center"
              style={{
                background: p.fill,
                border: `${n.start ? 2.5 : n.bold ? 2 : 1}px solid ${p.stroke}`,
              }}
            >
              <p className="text-[14px] font-bold" style={{ color: p.text }}>
                {n.title.join("")}
              </p>
              {n.sub.length > 0 && (
                <p className="text-[12px]" style={{ color: p.sub }}>
                  {n.sub.join("")}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
      <p className="mt-2 text-sm font-medium" style={{ color: p.stroke }} data-cycle-loop>
        ↻ 最初に戻る
      </p>
    </div>
  );
}
