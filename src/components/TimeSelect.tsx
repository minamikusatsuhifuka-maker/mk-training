"use client";

// 時刻を「時」と「分（5分刻み）」で選ぶ部品（239で作り、242で共通にした）。
// ブラウザの時刻の部品（type="time"）は、Mac の Chrome では step を付けても分が1分ごとに出るため使わない。
// ・今の値の分が5分刻みでないとき（古いデータ・例 13:07）は、その値も選択肢に残して、そのまま表示・保存できる
// ・allowEmpty：空でもよい欄（「開始の時刻（任意）」など）。時を「--」にすると空に戻る。空から時を選ぶと「:00」

import { useState } from "react";
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

// ─── 日付と時刻が1つの欄（244）──────────────────────────────────────────
// 値の形は今までの datetime-local と同じ "YYYY-MM-DDTHH:mm"（空は ""）。保存する側の変換はそのまま使える。
// 日付はブラウザの日付の部品（今までどおりの選び方）、時刻だけ上の「時」「分（5分刻み）」で選ぶ。
// ・日付と時刻がそろったときだけ値を渡す。片方だけのあいだは ""（datetime-local と同じふるまい）。
//   途中まで選んだものは、この部品の中に残しておく（親の値が "" のままでも消えない）
// ・5分刻みでない古い値（例 17:07）は TimeSelect がそのまま表示・保存する

const DT_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/;

function splitDateTime(v: string): { d: string; t: string } {
  const m = v.match(DT_RE);
  return m ? { d: m[1], t: m[2] } : { d: "", t: "" };
}
const joinDateTime = (p: { d: string; t: string }) => (p.d && p.t ? `${p.d}T${p.t}` : "");

export function DateTimeSelect({
  value,
  onChange,
  testId,
  id,
  dateRef,
  ariaLabel,
  dateClassName = "h-9 rounded-md border border-slate-200 bg-white px-2 text-sm",
  timeClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
  /** 日付の欄の id（ラベルの htmlFor 用） */
  id?: string;
  dateRef?: React.Ref<HTMLInputElement>;
  ariaLabel?: string;
  dateClassName?: string;
  timeClassName?: string;
}) {
  const [draft, setDraft] = useState(() => splitDateTime(value));
  const [prevValue, setPrevValue] = useState(value);
  // 親の値が外から変わったとき（「クリア」・別の行に切り替え・保存のあと）は、それに合わせる
  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== joinDateTime(draft)) setDraft(splitDateTime(value));
  }
  const update = (next: { d: string; t: string }) => {
    setDraft(next);
    onChange(joinDateTime(next));
  };
  return (
    <span className="flex items-center gap-2 flex-wrap" data-datetime-select={testId}>
      <input
        ref={dateRef}
        id={id}
        type="date"
        value={draft.d}
        onChange={(e) => update({ ...draft, d: e.target.value })}
        className={dateClassName}
        aria-label={`${ariaLabel ?? ""}日付`}
        data-datetime-date={testId}
      />
      <TimeSelect
        value={draft.t}
        onChange={(t) => update({ ...draft, t })}
        allowEmpty
        testId={testId}
        ariaLabel={ariaLabel}
        className={timeClassName}
      />
    </span>
  );
}
