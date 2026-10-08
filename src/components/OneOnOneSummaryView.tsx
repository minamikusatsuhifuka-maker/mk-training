"use client";

// 書き起こしから作った「まとめ」の表示（指示書221 §4・224）
//
// 見られる人は記録そのものと同じ（本人・ペア相手・院長）。ここは**表示だけ**で、保存はしない。
// 224: 「本人の言葉」は長い引用が入るので、切らずに折り返して全文を出す。

import {
  SUMMARY_LABELS,
  TRANSCRIPT_SUMMARY_NOTE,
  isEmptySummary,
  type TranscriptSummary,
} from "@/lib/one-on-one-transcript";

export function OneOnOneSummaryView({ summary }: { summary: TranscriptSummary }) {
  if (isEmptySummary(summary)) return null;
  return (
    <div
      className="rounded-lg border border-violet-200 bg-violet-50/40 p-2 space-y-1"
      data-one-on-one-summary
    >
      <p className="text-[11px] font-medium text-violet-900">📝 まとめ</p>
      {summary.flow && (
        <p className="text-[12px] text-gray-900 whitespace-pre-wrap">{summary.flow}</p>
      )}
      {summary.quotes.length > 0 && (
        <ul className="space-y-0.5">
          {summary.quotes.map((q, i) => (
            // 224: 長い引用も切らずに全文を出す
            <li
              key={i}
              className="text-[12px] text-gray-800 whitespace-pre-wrap break-words leading-relaxed"
              data-summary-quote
            >
              「{q}」
            </li>
          ))}
        </ul>
      )}
      {summary.decided && (
        <p className="text-[12px] text-gray-900 whitespace-pre-wrap break-words">
          <span className="text-[11px] text-gray-500 mr-1">{SUMMARY_LABELS.decided}:</span>
          {summary.decided}
        </p>
      )}
      {summary.support && (
        <p className="text-[12px] text-gray-900 whitespace-pre-wrap break-words">
          <span className="text-[11px] text-gray-500 mr-1">{SUMMARY_LABELS.support}:</span>
          {summary.support}
        </p>
      )}
      <p className="text-[10px] text-gray-500">{TRANSCRIPT_SUMMARY_NOTE}</p>
    </div>
  );
}
