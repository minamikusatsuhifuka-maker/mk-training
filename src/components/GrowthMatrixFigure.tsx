// 成長マトリクスの概念図（指示書190 A）— SVG。横軸スキル・ナレッジ、縦軸マインド。
//   点は各等級の見る重心（知識＋スキル：マインド）の積み上げ: G1(8,2) → G2(14,6) → G3(19,11) → G4(23,17) → G5(25,25)
//   下の帯「技能の時代（主に横へ）」、上の帯「在り方の時代（主に上へ）」、G2→G3に「質的転換点」。
//   viewBox で描き、幅100%＝スマートフォンでも読める。本人の点（自己評価・合意）を重ねられる。

import { GRADE_POINTS, M_LEVELS, S_LEVELS, type MLevel, type SLevel } from "@/lib/growth-matrix";

const W = 640;
const H = 470;
const L = 64; // 左余白
const R = 36;
const T = 40;
const B = 70;
const PW = W - L - R;
const PH = H - T - B;
const MAX = 25;
const px = (x: number) => L + (x / MAX) * PW;
const py = (y: number) => T + PH - (y / MAX) * PH;
/** S1〜S5／M1〜M5 → 目盛りの中心（1→2.5, 2→7.5 …） */
const levelCenter = (i: number) => i * 5 - 2.5;

export type MatrixMarker = { s: SLevel; m: MLevel; label: string; color: string; hollow?: boolean };

export function GrowthMatrixFigure({
  markers = [],
  onPick,
  picked,
  compact = false,
}: {
  /** 本人の点（自己評価・合意した位置など） */
  markers?: MatrixMarker[];
  /** 図の上で位置を選ぶ（自己評価シート） */
  onPick?: (s: SLevel, m: MLevel) => void;
  picked?: { s: SLevel | ""; m: MLevel | "" };
  compact?: boolean;
}) {
  const path = GRADE_POINTS.map((p, i) => `${i === 0 ? "M" : "L"} ${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`).join(" ");
  return (
    <figure className="w-full" data-growth-matrix-figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="成長マトリクス（横軸スキル・ナレッジ、縦軸マインド）G1からG5の点" className="w-full h-auto block bg-white rounded-xl border border-gray-200" style={{ maxHeight: compact ? 360 : undefined }}>
        {/* 帯 */}
        <rect x={L} y={py(10)} width={PW} height={py(0) - py(10)} fill="#ecfeff" />
        <rect x={L} y={T} width={PW} height={py(10) - T} fill="#fef3c7" opacity={0.55} />
        <text x={L + 10} y={py(0) - 8} fontSize={19} fill="#0e7490">技能の時代（主に横へ）</text>
        <text x={L + 10} y={T + 22} fontSize={19} fill="#92400e">在り方の時代（主に上へ）</text>
        {/* 目盛り（セル。選択できる） */}
        {S_LEVELS.map((s, si) =>
          M_LEVELS.map((m, mi) => {
            const isPicked = picked && picked.s === s && picked.m === m;
            return (
              <rect
                key={`${s}${m}`}
                x={px(si * 5)}
                y={py((mi + 1) * 5)}
                width={PW / 5}
                height={PH / 5}
                fill={isPicked ? "#0f766e" : "transparent"}
                opacity={isPicked ? 0.25 : 1}
                stroke="#e5e7eb"
                strokeWidth={1}
                style={onPick ? { cursor: "pointer" } : undefined}
                onClick={onPick ? () => onPick(s, m) : undefined}
                data-cell={`${s}${m}`}
              >
                {onPick && <title>{`${s} × ${m} を選ぶ`}</title>}
              </rect>
            );
          })
        )}
        {/* 軸 */}
        <line x1={L} y1={py(0)} x2={L + PW} y2={py(0)} stroke="#374151" strokeWidth={2} />
        <line x1={L} y1={py(0)} x2={L} y2={T} stroke="#374151" strokeWidth={2} />
        <polygon points={`${L + PW},${py(0)} ${L + PW - 10},${py(0) - 5} ${L + PW - 10},${py(0) + 5}`} fill="#374151" />
        <polygon points={`${L},${T} ${L - 5},${T + 10} ${L + 5},${T + 10}`} fill="#374151" />
        <text x={L + PW / 2} y={H - 14} fontSize={20} textAnchor="middle" fill="#111827">スキル・ナレッジ（技能）→</text>
        <text x={18} y={T + PH / 2} fontSize={20} textAnchor="middle" fill="#111827" transform={`rotate(-90 18 ${T + PH / 2})`}>マインド（在り方）↑</text>
        {S_LEVELS.map((s, i) => (
          <text key={s} x={px(levelCenter(i + 1))} y={py(0) + 22} fontSize={19} textAnchor="middle" fill="#374151">{s}</text>
        ))}
        {M_LEVELS.map((m, i) => (
          <text key={m} x={L - 10} y={py(levelCenter(i + 1)) + 5} fontSize={19} textAnchor="end" fill="#374151">{m}</text>
        ))}
        {/* 折れ線と点 */}
        <path d={path} fill="none" stroke="#0f766e" strokeWidth={3} strokeLinejoin="round" />
        {GRADE_POINTS.map((p) => (
          <g key={p.grade}>
            <circle cx={px(p.x)} cy={py(p.y)} r={p.grade === "G3" ? 9 : 7} fill={p.grade === "G3" ? "#f59e0b" : "#0f766e"} stroke="#fff" strokeWidth={2} />
            {/* G4・G5 は右端に近いので点の左上に置く（右に伸ばすと枠から切れる） */}
            <text x={px(p.x) + (p.grade === "G5" || p.grade === "G4" ? -14 : 12)} y={py(p.y) - (p.grade === "G5" || p.grade === "G4" ? 14 : 10)} fontSize={18} fontWeight={700} textAnchor={p.grade === "G5" || p.grade === "G4" ? "end" : "start"} fill="#111827">
              {p.grade === "G3" ? "★" : ""}
              {p.grade} {p.label}
            </text>
          </g>
        ))}
        {/* 質的転換点（G2→G3） */}
        {(() => {
          const a = GRADE_POINTS[1];
          const b = GRADE_POINTS[2];
          const mx = (px(a.x) + px(b.x)) / 2;
          const my = (py(a.y) + py(b.y)) / 2;
          return (
            <g>
              <text x={mx + 40} y={my - 4} fontSize={18} fill="#b45309" fontWeight={700}>質的転換点</text>
              <text x={mx + 40} y={my + 14} fontSize={16} fill="#b45309">（最も大きな一歩）</text>
            </g>
          );
        })()}
        {/* 本人の点 */}
        {markers.map((mk, i) => {
          const cx = px(levelCenter(S_LEVELS.indexOf(mk.s) + 1));
          const cy = py(levelCenter(M_LEVELS.indexOf(mk.m) + 1));
          return (
            <g key={i} data-marker={mk.label}>
              <circle cx={cx} cy={cy} r={11} fill={mk.hollow ? "#fff" : mk.color} stroke={mk.color} strokeWidth={3} />
              {/* 本人の点のラベルは点の下（上に置くと G4 のラベルと重なりうる） */}
              <text x={cx} y={cy + 28} fontSize={17} textAnchor="middle" fill={mk.color} fontWeight={700}>{mk.label}</text>
            </g>
          );
        })}
      </svg>
      {markers.length > 0 && (
        <figcaption className="text-[11px] text-gray-600 mt-1">
          {markers.map((m) => `${m.label}: ${m.s} × ${m.m}`).join(" ／ ")}
        </figcaption>
      )}
    </figure>
  );
}
