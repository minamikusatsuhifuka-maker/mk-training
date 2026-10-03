"use client";

// 1on1画面に出す「事前アンケートの回答」（指示書197-補 2.）
//
// 願望（3・4・5）→ 行動（6）→ 自己評価（7）→ 計画（8）→ 支援（9）の順に、
// RWDEPの各欄の隣へ置く。1・2（最初の話題・承認の材料）は画面の上部に置く。
// 置き場所は質問定義の slot（院長が変えられる）。回答に保存された slot を優先する
//（回答したあとに置き場所を変えても、その回の見え方は変わらない）。
//
// 【原則】評価の材料ではなく、対話の材料。読み取り専用で出す（1on1画面から書き換えない）。

import {
  answerSummary,
  type PresurveyAnswer,
} from "@/lib/one-on-one-presurvey";

export function PresurveyAnswerList({
  answers,
  title,
  respondentName,
  heldOn,
  dateMismatch,
}: {
  answers: PresurveyAnswer[];
  title: string;
  respondentName: string;
  /** 回答された1on1の予定日 */
  heldOn?: string;
  /** 予定日が1on1の実施日と違うとき（前の回の回答を出している） */
  dateMismatch?: boolean;
}) {
  if (answers.length === 0) return null;
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 space-y-2">
      <p className="text-[11px] font-medium text-sky-900">
        {title}
        <span className="ml-1 font-normal text-gray-600">
          {respondentName}さんの事前の回答
        </span>
      </p>
      {dateMismatch && heldOn && (
        <p className="text-[11px] text-amber-800">
          ⚠ {heldOn.replaceAll("-", "/")} の回の回答です（この回の予定日とは違います）
        </p>
      )}
      <ul className="space-y-2">
        {answers.map((a) => (
          <li key={a.questionId}>
            <p className="text-[11px] text-gray-600 leading-snug">{a.question}</p>
            <p className="text-xs text-gray-900 whitespace-pre-wrap leading-relaxed">
              {answerSummary(a)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
