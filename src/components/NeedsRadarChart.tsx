// 5つの基本的欲求のレーダーチャート（指示書58・軽量SVG自前描画、外部ライブラリ不使用）
// 5軸: 生存/愛・所属/力/自由/楽しみ。値は0-100。未入力の軸は0として描く。

import { NEED_KEYS, NEED_LABELS, type NeedKey } from "@/lib/needs-survey";

type Props = {
  values: Partial<Record<NeedKey, number>>;
  size?: number;
  /** 一覧カード用のコンパクト表示（指示書65）: 数値ラベル非表示・軸名は小さく表示 */
  compact?: boolean;
};

export function NeedsRadarChart({ values, size = 220, compact = false }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - (compact ? 18 : 34); // ラベル余白

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
      {/* ラベル（値付き・2行）。
          指示書63: 右側の軸（愛・所属）は1行の「愛・所属 58」がSVG境界を超えて
          クリップされ、末尾の桁が欠けて「5」に見えるバグがあった。
          → 名前と数値を2行に分けて幅を抑え、さらに中心xをSVG内にクランプして
          どの軸でも保存値がそのまま全桁表示されるようにする。 */}
      {NEED_KEYS.map((k, i) => {
        const p = pointAt(i, compact ? 1.14 : 1.16);
        const v = values[k];
        // 最長ラベル「愛・所属」の半幅ぶんの余白でクランプ（見切れ防止・指示書63）
        const margin = compact ? 18 : 26;
        const x = Math.max(margin, Math.min(size - margin, p.x));
        if (compact) {
          // コンパクト時は軸名のみ（数値ラベルなし・指示書65）
          return (
            <text
              key={k}
              x={x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={8}
              fill="#64748b"
            >
              {NEED_LABELS[k]}
            </text>
          );
        }
        // 小サイズ（一覧カードのミニ表示等）は軸名をやや小さく（数値は読みやすく維持。指示書66）
        const nameFont = size < 200 ? 10 : 11;
        return (
          <text
            key={k}
            x={x}
            y={p.y - 5}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={nameFont}
            fill="#475569"
          >
            <tspan x={x}>{NEED_LABELS[k]}</tspan>
            {typeof v === "number" && (
              <tspan x={x} dy={nameFont + 1} fontSize={11} fontWeight={600} fill="#0f766e">
                {v}
              </tspan>
            )}
          </text>
        );
      })}
    </svg>
  );
}
