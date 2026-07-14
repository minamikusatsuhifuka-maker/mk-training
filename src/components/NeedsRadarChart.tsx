// 5つの基本的欲求のレーダーチャート（指示書58・軽量SVG自前描画、外部ライブラリ不使用）
// 5軸: 生存/愛・所属/力/自由/楽しみ。値は0-100。未入力の軸は0として描く。

import { NEED_KEYS, NEED_LABELS, type NeedKey } from "@/lib/needs-survey";

type Props = {
  values: Partial<Record<NeedKey, number>>;
  size?: number;
};

export function NeedsRadarChart({ values, size = 220 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 34; // ラベル余白

  // 各軸の座標（上から時計回り・72°刻み）
  const pointAt = (i: number, ratio: number) => {
    const angle = (Math.PI * 2 * i) / NEED_KEYS.length - Math.PI / 2;
    return {
      x: cx + radius * ratio * Math.cos(angle),
      y: cy + radius * ratio * Math.sin(angle),
    };
  };

  const gridLevels = [0.25, 0.5, 0.75, 1];
  const gridPolygon = (ratio: number) =>
    NEED_KEYS.map((_, i) => {
      const p = pointAt(i, ratio);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(" ");

  const dataPolygon = NEED_KEYS.map((k, i) => {
    const v = Math.max(0, Math.min(100, values[k] ?? 0));
    const p = pointAt(i, v / 100);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(" ");

  const hasAny = NEED_KEYS.some((k) => (values[k] ?? 0) > 0);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="5つの基本的欲求のレーダーチャート"
    >
      {/* グリッド */}
      {gridLevels.map((r) => (
        <polygon
          key={r}
          points={gridPolygon(r)}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1}
        />
      ))}
      {/* 軸線 */}
      {NEED_KEYS.map((k, i) => {
        const p = pointAt(i, 1);
        return (
          <line
            key={k}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke="#e2e8f0"
            strokeWidth={1}
          />
        );
      })}
      {/* データ */}
      {hasAny && (
        <polygon
          points={dataPolygon}
          fill="rgba(13, 148, 136, 0.25)"
          stroke="#0d9488"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
      {hasAny &&
        NEED_KEYS.map((k, i) => {
          const v = Math.max(0, Math.min(100, values[k] ?? 0));
          const p = pointAt(i, v / 100);
          return <circle key={k} cx={p.x} cy={p.y} r={3} fill="#0d9488" />;
        })}
      {/* ラベル（値付き） */}
      {NEED_KEYS.map((k, i) => {
        const p = pointAt(i, 1.18);
        const v = values[k];
        return (
          <text
            key={k}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fill="#475569"
          >
            {NEED_LABELS[k]}
            {typeof v === "number" ? ` ${v}` : ""}
          </text>
        );
      })}
    </svg>
  );
}
