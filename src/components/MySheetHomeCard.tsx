"use client";

// スタッフ個人シート §1: ホームの入口「私の個人シート」
// 出すのは次の1on1の日時と相手、事前アンケートが未回答なら締切だけ。
// シートを開けない人（機能フラグ growth_record がOFF）には出さない（院長・検証用はプレビューで開けるので出る）。

import Link from "next/link";
import { useFeatureFlags } from "@/lib/use-feature-flags";
import { useMySchedules } from "@/lib/one-on-one-schedule-client";
import { formatMonthDay, formatMonthDayW, presurveyDeadline } from "@/lib/one-on-one-schedule";

export function MySheetHomeCard() {
  const { flags, loaded } = useFeatureFlags();
  const data = useMySchedules();
  if (!loaded || !flags.growth_record) return null;
  const next = data?.mine[0];
  return (
    <Link
      href="/my-growth"
      className="flex flex-col gap-2 rounded-xl border border-teal-200 bg-white p-3 hover:bg-teal-50/40"
      data-home-my-sheet
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-gray-900">📄 私の個人シート</span>
        <span className="text-xs text-teal-800 underline underline-offset-2">開く →</span>
      </span>
      <span className="text-xs text-gray-700">
        {next ? (
          <>
            次の1on1：{formatMonthDayW(next.date)}
            {next.time && ` ${next.time}`}
            {"　"}
            {next.partnerIsDirector ? "院長" : next.partnerName}
          </>
        ) : (
          "今月の目標と、前回の面談で決めたことを確かめられます。"
        )}
      </span>
      {next && data?.alertsEnabled && !next.answered && (
        <span className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
          事前アンケートは{formatMonthDay(presurveyDeadline(next))}までです
        </span>
      )}
    </Link>
  );
}
