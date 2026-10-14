"use client";

// 時刻を「時」と「分（5分刻み）」で選ぶ部品（239で作り、242で共通にした）。
// ブラウザの時刻の部品（type="time"）は、Mac の Chrome では step を付けても分が1分ごとに出るため使わない。
// ・今の値の分が5分刻みでないとき（古いデータ・例 13:07）は、その値も選択肢に残して、そのまま表示・保存できる
// ・allowEmpty：空でもよい欄（「開始の時刻（任意）」など）。時を「--」にすると空に戻る。空から時を選ぶと「:00」

import { MINUTE_OPTIONS } from "@/lib/one-on-one-slots";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const HM_RE = /^\d{2}:\d{2}$/;

export function TimeSelect({
  value,
  onChange,
  testId,
  allowEmpty = false,
  ariaLabel,
  className = "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm",
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
  allowEmpty?: boolean;
  /** 読み上げ用の名前（例「1on1の開始時刻」）。「時」「分」の前に付く */
  ariaLabel?: string;
  className?: string;
}) {
  const empty = !HM_RE.test(value);
  const [h, m] = empty ? (allowEmpty ? ["", ""] : ["13", "00"]) : value.split(":");
  const minutes = !m || MINUTE_OPTIONS.includes(m) ? MINUTE_OPTIONS : [...MINUTE_OPTIONS, m].sort();
  return (
    <span className="mt-0.5 flex items-center gap-1" data-time-select={testId}>
      <select
        value={h}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}:${m || "00"}` : "")}
        className={className}
        aria-label={`${ariaLabel ?? ""}時`}
        data-time-hour={testId}
      >
        {allowEmpty && <option value="">--</option>}
        {HOURS.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
      :
      <select
        value={m}
        onChange={(e) => onChange(`${h}:${e.target.value}`)}
        disabled={!h}
        className={className}
        aria-label={`${ariaLabel ?? ""}分`}
        data-time-minute={testId}
      >
        {!h && <option value="">--</option>}
        {minutes.map((x) => (
          <option key={x} value={x}>
            {x}
          </option>
        ))}
      </select>
    </span>
  );
}
