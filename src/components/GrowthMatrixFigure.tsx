// 成長マトリクスの概念図（指示書190 A・193 A）— SVG。横軸スキル・ナレッジ、縦軸マインド。
//   193 A-1: 等級の点は確定版の目標位置どおり Gn ＝ Sn × Mn のマス目の中心。
//            物語（技能の時代は主に横へ／G2→G3で上へ／在り方の時代は主に上へ）は、枠の外の凡例（帯の見出し）と「質的転換点」の注記で表す。
//   193 A-2: 本人の点（合意・自己評価）が同じマスなら印を1つにしてラベルをまとめる。別のマスならラベルを点の下に置き、
//            他のラベル・注記・軸の文字と重ならない位置へ自動でずらす（下→上→右→左→…の順に空いている場所）。
//   viewBox で描き、幅100%＝スマートフォンでも読める。

import { GRADE_POINTS, M_LEVELS, S_LEVELS, type MLevel, type SLevel } from "@/lib/growth-matrix";

export const FIG_W = 680;
export const FIG_H = 542;
const L = 64; // 左余白
const R = 40;
const T = 98; // 上余白（凡例3行: 技能の時代／在り方の時代／質的転換点）
const B = 70;
const PW = FIG_W - L - R;
const PH = FIG_H - T - B;
const MAX = 25;
const px = (x: number) => L + (x / MAX) * PW;
const py = (y: number) => T + PH - (y / MAX) * PH;
/** S1〜S5／M1〜M5 → 目盛りの中心（1→2.5, 2→7.5 …） */
const levelCenter = (i: number) => i * 5 - 2.5;

export type MatrixMarker = { s: SLevel; m: MLevel; label: string; color: string; hollow?: boolean };

// ─── 文字の箱（重なりの判定。実描画より少し大きめに見積もる）───

type Box = { x1: number; y1: number; x2: number; y2: number };
type Anchor = "start" | "middle" | "end";

function textWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += /[\x20-\x7e]/.test(ch) ? 0.7 : 1.08;
  return w * fontSize;
}
/** 文字の箱は実描画より少し大きめ（左右 3px・上下 2px の余白）に見積もる＝重なりを厳しめに判定 */
export function textBox(text: string, x: number, baseline: number, fontSize: number, anchor: Anchor): Box {
  const w = textWidth(text, fontSize);
  const x1 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  return { x1: x1 - 3, y1: baseline - fontSize * 0.95 - 2, x2: x1 + w + 3, y2: baseline + fontSize * 0.22 + 2 };
}
function intersects(a: Box, b: Box): boolean {
  return !(a.x2 <= b.x1 || b.x2 <= a.x1 || a.y2 <= b.y1 || b.y2 <= a.y1);
}
function inside(b: Box): boolean {
  return b.x1 >= 2 && b.x2 <= FIG_W - 2 && b.y1 >= 2 && b.y2 <= FIG_H - 2;
}

type Placed = { text: string; x: number; y: number; fontSize: number; anchor: Anchor; box: Box };

/** 194 C: 記号（等級の点・質的転換点の印・本人の印）の箱。文字はこれらとも重ならない場所へ置く */
function circleBox(cx: number, cy: number, r: number): Box {
  return { x1: cx - r, y1: cy - r, x2: cx + r, y2: cy + r };
}
export function fixedShapeBoxes(): Box[] {
  const out: Box[] = [];
  for (const p of GRADE_POINTS) out.push(circleBox(px(p.x), py(p.y), p.grade === "G3" ? 9 : 7));
  const mx = (px(GRADE_POINTS[1].x) + px(GRADE_POINTS[2].x)) / 2;
  const my = (py(GRADE_POINTS[1].y) + py(GRADE_POINTS[2].y)) / 2;
  out.push(circleBox(mx, my, 10)); // 質的転換点の印（◆）
  return out;
}

/** 固定の文字（等級のラベル・注記・軸・凡例）。本人の点のラベルはこれらを避けて置く */
function fixedTexts(): Placed[] {
  const out: Placed[] = [];
  const put = (text: string, x: number, y: number, fontSize: number, anchor: Anchor) => out.push({ text, x, y, fontSize, anchor, box: textBox(text, x, y, fontSize, anchor) });
  for (const p of GRADE_POINTS) {
    const cx = px(p.x);
    const cy = py(p.y);
    // G2 は右上に置くと G2→G3 の線上の「質的転換点」の印と重なるため左上へ。G4・G5 は右端に近いので左上
    const left = p.grade === "G2" || p.grade === "G4" || p.grade === "G5";
    // 隣のマスの本人の印（半径18）と重ならないよう、ラベルは点の上 26px に置く。
    // G1 だけは点の右下（左下の角で、上に置くと S1×M2 の本人の印のラベルの置き場が無くなる）
    const below = p.grade === "G1";
    put(`${p.grade === "G3" ? "★" : ""}${p.grade} ${p.label}`, cx + (left ? -20 : 20), below ? cy + 30 : cy - 26, 18, left ? "end" : "start");
  }
  // 軸
  S_LEVELS.forEach((s, i) => put(s, px(levelCenter(i + 1)), py(0) + 22, 19, "middle"));
  M_LEVELS.forEach((m, i) => put(m, L - 10, py(levelCenter(i + 1)) + 5, 19, "end"));
  put("スキル・ナレッジ（技能）→", L + PW / 2, FIG_H - 14, 20, "middle");
  // 凡例（枠の外・上側）: 帯の見出し2つと「質的転換点」の注記（本人の点と重ならない場所）
  put("技能の時代（主に横へ）", L + 22, T - 58, 17, "start");
  put("在り方の時代（主に上へ）", L + 22, T - 36, 17, "start");
  put("G2 → G3 は質的転換点（最も大きな一歩）", L + 22, T - 14, 17, "start");
  return out;
}

type MarkerGroup = { s: SLevel; m: MLevel; labels: string[]; colors: string[]; hollow: boolean };

/** 同じマスの点はまとめる（193 A-2） */
export function groupMarkers(markers: MatrixMarker[]): MarkerGroup[] {
  const map = new Map<string, MarkerGroup>();
  for (const mk of markers) {
    const key = `${mk.s}${mk.m}`;
    const g = map.get(key);
    if (g) {
      g.labels.push(mk.label);
      g.colors.push(mk.color);
      g.hollow = g.hollow && !!mk.hollow;
    } else map.set(key, { s: mk.s, m: mk.m, labels: [mk.label], colors: [mk.color], hollow: !!mk.hollow });
  }
  return Array.from(map.values());
}

export type MarkerLayout = { group: MarkerGroup; cx: number; cy: number; label: string; lx: number; ly: number; anchor: Anchor; fontSize: number; color: string };

/** 本人の点のラベルを、固定の文字と互いに重ならない場所へ置く（純関数・テスト可能） */
export function layoutMarkers(markers: MatrixMarker[]): MarkerLayout[] {
  const fixed = fixedTexts();
  const placedBoxes: Box[] = [...fixed.map((f) => f.box), ...fixedShapeBoxes()];
  const groups = groupMarkers(markers);
  // 本人の印（円）も避ける対象（自分の印は候補の距離で避ける）
  const markerBoxes = groups.map((g) => circleBox(px(levelCenter(S_LEVELS.indexOf(g.s) + 1)), py(levelCenter(M_LEVELS.indexOf(g.m) + 1)), g.colors.length > 1 ? 18 : 13));
  const out: MarkerLayout[] = [];
  const fs = 17;
  groups.forEach((g, gi) => {
    const cx = px(levelCenter(S_LEVELS.indexOf(g.s) + 1));
    const cy = py(levelCenter(M_LEVELS.indexOf(g.m) + 1));
    const label = g.labels.join("・");
    const r = g.colors.length > 1 ? 18 : 13;
    const dy = r + 4;
    const candidates: { x: number; y: number; anchor: Anchor }[] = [
      { x: cx, y: cy + dy + 16, anchor: "middle" }, // 下
      { x: cx, y: cy - dy - 3, anchor: "middle" }, // 上
      { x: cx + r + 6, y: cy + 6, anchor: "start" }, // 右
      { x: cx - r - 6, y: cy + 6, anchor: "end" }, // 左
      { x: cx + 8, y: cy + dy + 16, anchor: "start" }, // 右下
      { x: cx - 8, y: cy + dy + 16, anchor: "end" }, // 左下
      { x: cx + 8, y: cy - dy - 3, anchor: "start" }, // 右上
      { x: cx - 8, y: cy - dy - 3, anchor: "end" }, // 左上
      { x: cx, y: cy + dy + 36, anchor: "middle" }, // さらに下
      { x: cx, y: cy - dy - 22, anchor: "middle" }, // さらに上
      { x: cx + r + 6, y: cy - 8, anchor: "start" }, // 右やや上
      { x: cx + r + 6, y: cy + 22, anchor: "start" }, // 右やや下
      { x: cx - r - 6, y: cy - 8, anchor: "end" }, // 左やや上
      { x: cx - r - 6, y: cy + 22, anchor: "end" }, // 左やや下
      { x: cx, y: cy - dy - 40, anchor: "middle" }, // もっと上
      { x: cx, y: cy + dy + 54, anchor: "middle" }, // もっと下
      { x: cx + r + 30, y: cy + 6, anchor: "start" }, // 右へ離す
      { x: cx - r - 30, y: cy + 6, anchor: "end" }, // 左へ離す
    ];
    const others = markerBoxes.filter((_, i) => i !== gi);
    let chosen = candidates[0];
    for (const c of candidates) {
      const box = textBox(label, c.x, c.y, fs, c.anchor);
      if (inside(box) && !placedBoxes.some((b) => intersects(b, box)) && !others.some((b) => intersects(b, box))) {
        chosen = c;
        break;
      }
    }
    placedBoxes.push(textBox(label, chosen.x, chosen.y, fs, chosen.anchor));
    out.push({ group: g, cx, cy, label, lx: chosen.x, ly: chosen.y, anchor: chosen.anchor, fontSize: fs, color: g.colors[0] });
  });
  return out;
}

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
  const fixed = fixedTexts();
  const laid = layoutMarkers(markers);
  const mx = (px(GRADE_POINTS[1].x) + px(GRADE_POINTS[2].x)) / 2;
  const my = (py(GRADE_POINTS[1].y) + py(GRADE_POINTS[2].y)) / 2;
  return (
    <figure className="w-full" data-growth-matrix-figure>
      <svg viewBox={`0 0 ${FIG_W} ${FIG_H}`} role="img" aria-label="成長マトリクス（横軸スキル・ナレッジ、縦軸マインド）G1からG5の点" className="w-full h-auto block bg-white rounded-xl border border-gray-200" style={{ maxHeight: compact ? 380 : undefined }}>
        {/* 帯（下=技能の時代 M1〜M2、上=在り方の時代 M3〜M5）。見出しは枠の外の凡例 */}
        <rect x={L} y={py(10)} width={PW} height={py(0) - py(10)} fill="#ecfeff" />
        <rect x={L} y={T} width={PW} height={py(10) - T} fill="#fef3c7" opacity={0.55} />
        <rect x={L} y={T - 70} width={14} height={14} fill="#ecfeff" stroke="#0e7490" />
        <rect x={L} y={T - 48} width={14} height={14} fill="#fef3c7" stroke="#92400e" />
        <polygon points={`${L + 7},${T - 27} ${L + 14},${T - 20} ${L + 7},${T - 13} ${L},${T - 20}`} fill="#b45309" />
        <text x={L + 22} y={T - 58} fontSize={17} fill="#0e7490">技能の時代（主に横へ）</text>
        <text x={L + 22} y={T - 36} fontSize={17} fill="#92400e">在り方の時代（主に上へ）</text>
        <text x={L + 22} y={T - 14} fontSize={17} fill="#b45309" fontWeight={700}>G2 → G3 は質的転換点（最も大きな一歩）</text>
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
        <text x={L + PW / 2} y={FIG_H - 14} fontSize={20} textAnchor="middle" fill="#111827">スキル・ナレッジ（技能）→</text>
        <text x={18} y={T + PH / 2} fontSize={20} textAnchor="middle" fill="#111827" transform={`rotate(-90 18 ${T + PH / 2})`}>マインド（在り方）↑</text>
        {S_LEVELS.map((s, i) => (
          <text key={s} x={px(levelCenter(i + 1))} y={py(0) + 22} fontSize={19} textAnchor="middle" fill="#374151">{s}</text>
        ))}
        {M_LEVELS.map((m, i) => (
          <text key={m} x={L - 10} y={py(levelCenter(i + 1)) + 5} fontSize={19} textAnchor="end" fill="#374151">{m}</text>
        ))}
        {/* 折れ線と等級の点（マス目の中心） */}
        {/* 線・点・文字は pointer-events を切り、クリックがマス目に届くようにする（自己評価シートの選択） */}
        <path d={path} fill="none" stroke="#0f766e" strokeWidth={3} strokeLinejoin="round" pointerEvents="none" />
        {GRADE_POINTS.map((p) => (
          <circle key={p.grade} cx={px(p.x)} cy={py(p.y)} r={p.grade === "G3" ? 9 : 7} fill={p.grade === "G3" ? "#f59e0b" : "#0f766e"} stroke="#fff" strokeWidth={2} pointerEvents="none" data-grade-point={p.grade} data-cell-center={`${p.s}${p.m}`} />
        ))}
        {fixed
          .filter((f) => /^★?G\d (?!→)/.test(f.text))
          .map((f) => (
            <text key={f.text} x={f.x} y={f.y} fontSize={f.fontSize} fontWeight={700} textAnchor={f.anchor} fill="#111827" pointerEvents="none" data-grade-label>
              {f.text}
            </text>
          ))}
        {/* 質的転換点（G2→G3 の線の中点に印。説明は上の凡例） */}
        <polygon points={`${mx},${my - 9} ${mx + 9},${my} ${mx},${my + 9} ${mx - 9},${my}`} fill="#b45309" stroke="#fff" strokeWidth={2} pointerEvents="none" data-turning-point />
        {/* 本人の点（同じマスは1つにまとめる。ラベルは空いている場所へ） */}
        {laid.map((m) => (
          <g key={`${m.group.s}${m.group.m}`} data-marker={m.label} data-marker-cell={`${m.group.s}${m.group.m}`} pointerEvents="none">
            <circle cx={m.cx} cy={m.cy} r={12} fill={m.group.hollow ? "#fff" : m.group.colors[0]} stroke={m.group.colors[m.group.colors.length - 1]} strokeWidth={3} />
            {m.group.colors.length > 1 && <circle cx={m.cx} cy={m.cy} r={17} fill="none" stroke={m.group.colors[1]} strokeWidth={2} strokeDasharray="4 3" />}
            <text x={m.lx} y={m.ly} fontSize={m.fontSize} textAnchor={m.anchor} fill={m.color} fontWeight={700} data-marker-label>
              {m.label}
            </text>
          </g>
        ))}
      </svg>
      {markers.length > 0 && (
        <figcaption className="text-[11px] text-gray-600 mt-1">
          {markers.map((m) => `${m.label}: ${m.s} × ${m.m}`).join(" ／ ")}
        </figcaption>
      )}
    </figure>
  );
}
