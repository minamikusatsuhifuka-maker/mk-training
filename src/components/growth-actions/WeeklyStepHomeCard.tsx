"use client";

// 🌱 今週の一歩（ホーム）— 期間中の本人の一歩だけを出す。本人の権限で読む（RLS）。表が無い・一歩が無い・期間外は何も出さない
// 通知・催促はしない（期間の終わりのふり返りは「🌱 成長の行動例」の中で行う）

import { useEffect, useState } from "react";
import Link from "next/link";
import { jstTodayYmd } from "@/lib/library";
import { isActiveStep, stepPeriodLabel, type WeeklyStep } from "@/lib/success-principles";
import { loadMySteps } from "@/lib/weekly-steps-client";

export function WeeklyStepHomeCard() {
  const [step, setStep] = useState<WeeklyStep | null>(null);
  useEffect(() => {
    let alive = true;
    const today = jstTodayYmd();
    loadMySteps()
      .then((r) => {
        if (alive && r.ready) setStep(r.steps.find((s) => isActiveStep(s, today)) ?? null);
      })
      .catch(() => {
        /* 読めなければ出さない */
      });
    return () => {
      alive = false;
    };
  }, []);
  if (!step) return null;
  return (
    <Link href="/growth-actions?tab=step" className="flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50/60 p-3 hover:bg-teal-50" data-home-weekly-step>
      <span className="text-xl" aria-hidden="true">👣</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-teal-800">今週の一歩</span>
        <span className="block whitespace-pre-wrap text-sm text-gray-900">{step.text}</span>
        <span className="block text-[11px] text-gray-600">{stepPeriodLabel(step)}</span>
      </span>
    </Link>
  );
}
