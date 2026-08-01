// ヒヤリハット報告の構造化バッジ行（指示書122）
// - 上段: レベル・場所・時間帯・発生日のバッジ／下段: 要因タグ。
// - スタッフ一覧（/hiyari-report）と管理個票（管理タブ）で共用（重複実装禁止）。
// - 旧形式の投稿（構造化フィールドなし）は null を返し、従来どおりの見た目を保つ。

import {
  HIYARI_TIME_SLOTS,
  HIYARI_PLACES,
  HIYARI_FACTORS,
  HIYARI_LEVELS,
  hiyariOptionLabel,
  type HiyariReport,
} from "@/lib/hiyari-reports";

// 発生日 "YYYY-MM-DD" → 「8/1」
function formatOccurredOn(ymd: string): string {
  const m = ymd.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  return `${Number(m[1])}/${Number(m[2])}`;
}

const CHIP_CLASS =
  "text-[10px] font-medium bg-gray-100 text-gray-700 rounded-full px-2 py-0.5";

export default function HiyariBadges({ report }: { report: HiyariReport }) {
  const level = HIYARI_LEVELS.find((l) => l.value === report.level);
  const placeLabel =
    report.place === "other"
      ? report.placeOther || "その他"
      : hiyariOptionLabel(HIYARI_PLACES, report.place);
  const timeSlotLabel = hiyariOptionLabel(HIYARI_TIME_SLOTS, report.timeSlot);
  const factors = report.factors ?? [];
  const hasBadges =
    !!level || !!placeLabel || !!timeSlotLabel || !!report.occurredOn;
  if (!hasBadges && factors.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {hasBadges && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {level && (
            <span
              className={`text-[10px] font-medium rounded-full px-2 py-0.5 ${level.badgeClass}`}
            >
              {level.badge}
            </span>
          )}
          {placeLabel && <span className={CHIP_CLASS}>📍 {placeLabel}</span>}
          {timeSlotLabel && <span className={CHIP_CLASS}>🕐 {timeSlotLabel}</span>}
          {report.occurredOn && (
            <span className={CHIP_CLASS}>
              発生 {formatOccurredOn(report.occurredOn)}
            </span>
          )}
        </div>
      )}
      {factors.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {factors.map((f) => {
            const label = hiyariOptionLabel(HIYARI_FACTORS, f);
            if (!label) return null;
            const text =
              f === "other" && report.factorOther
                ? `${label}: ${report.factorOther}`
                : label;
            return (
              <span
                key={f}
                className="text-[10px] bg-amber-50 text-amber-800 border border-amber-100 rounded px-1.5 py-0.5"
              >
                {text}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
