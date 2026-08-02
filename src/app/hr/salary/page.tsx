"use client";

// 給与テーブルページ（指示書116・[PAGE:salary] の転記のみ）
// 全号俸表は金額をハードコードせず、パラメータ（1号俸・差額・号俸数・上限）から
// salaryAt() で算出して描画する（転記ミス防止・指示書116 3-3）。

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import FeatureGate from "@/components/FeatureGate";
import {
  HrSectionView,
  HrTableView,
  HrPortalFooter,
  HrBackLink,
  useScrollToHash,
} from "@/components/HrPortalParts";
import {
  HR_SALARY_SECTIONS,
  HR_SALARY_PARAMS_NURSE,
  HR_SALARY_PARAMS_CLERK,
  salaryAt,
  type HrSalaryParams,
} from "@/data/hr-portal";

type Line = "nurse" | "clerk";

const LINE_TABS: { value: Line; label: string; params: HrSalaryParams[] }[] = [
  { value: "nurse", label: "看護師ライン", params: HR_SALARY_PARAMS_NURSE },
  { value: "clerk", label: "マルチタスク医療事務ライン", params: HR_SALARY_PARAMS_CLERK },
];

function yen(n: number): string {
  return n.toLocaleString("ja-JP");
}

// パラメータ表（別添4-2の転記。最終号俸はパラメータから算出＝検算値と一致する）
function ParamsTable({ params }: { params: HrSalaryParams[] }) {
  return (
    <HrTableView
      headers={[
        "等級",
        "1号俸（下限）",
        "号俸間差額",
        "号俸数",
        "レンジ上限 ※G5は目安上限",
        "最終号俸（検算値）",
      ]}
      rows={params.map((p) => [
        p.grade,
        yen(p.base),
        yen(p.step),
        String(p.count),
        yen(p.cap),
        yen(salaryAt(p, p.count)),
      ])}
    />
  );
}

// 全号俸表（号俸×等級のマトリクス。金額はすべて算出）
function FullStepTable({ params }: { params: HrSalaryParams[] }) {
  const maxCount = Math.max(...params.map((p) => p.count));
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border border-gray-100 rounded-lg">
        <thead>
          <tr className="bg-teal-50/60">
            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-gray-100 whitespace-nowrap sticky left-0 bg-teal-50/90">
              号俸
            </th>
            {params.map((p) => (
              <th
                key={p.grade}
                className="px-3 py-2 text-right text-xs font-semibold text-gray-600 border-b border-gray-100 whitespace-nowrap"
              >
                {p.grade}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxCount }, (_, i) => i + 1).map((n) => (
            <tr key={n} className="odd:bg-white even:bg-gray-50/50">
              <td className="px-3 py-1.5 text-xs text-gray-500 tabular-nums border-b border-gray-50 sticky left-0 bg-inherit whitespace-nowrap">
                {n}号俸
              </td>
              {params.map((p) => (
                <td
                  key={p.grade}
                  className="px-3 py-1.5 text-sm text-gray-700 tabular-nums text-right border-b border-gray-50 whitespace-nowrap"
                >
                  {n <= p.count ? yen(salaryAt(p, n)) : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SalaryBody() {
  useScrollToHash();
  const [line, setLine] = useState<Line>("nurse");
  const active = LINE_TABS.find((t) => t.value === line)!;

  // セクションの表示順は別添どおり:
  // 昇号数 → 設計思想 → レンジ表（看護・事務）→ 全号俸（パラメータ＋算出表）→ 号俸数の考え方
  const [rankSec, designSec, rangeNurseSec, rangeClerkSec, policySec] =
    HR_SALARY_SECTIONS;

  return (
    <div className="space-y-4">
      <HrBackLink />
      <HrSectionView section={rankSec} />
      <HrSectionView section={designSec} />
      <HrSectionView section={rangeNurseSec} />
      <HrSectionView section={rangeClerkSec} />

      {/* 全号俸表（パラメータから算出して描画） */}
      <section
        id="full-steps"
        className="bg-white border border-gray-200 rounded-xl p-4 md:p-5 space-y-3 scroll-mt-4"
      >
        <h2 className="text-sm font-bold text-gray-800">
          全号俸表のパラメータ（画面はここから算出して描画する。金額＝1号俸＋（号俸−1）×差額）
        </h2>
        <div className="flex rounded-full border border-gray-200 overflow-hidden text-sm w-fit bg-white">
          {LINE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setLine(t.value)}
              className={
                line === t.value
                  ? "px-4 py-2 bg-teal-600 text-white font-medium"
                  : "px-4 py-2 text-gray-600 hover:bg-gray-50"
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <ParamsTable params={active.params} />
        <h3 className="text-xs font-bold text-gray-700 pt-1">
          全号俸表（単位：円）— {active.label}
        </h3>
        <FullStepTable params={active.params} />
      </section>

      <HrSectionView section={policySec} />
      <HrPortalFooter />
    </div>
  );
}

export default function HrSalaryPage() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader title="💴 給与テーブル" description="月給レンジ・全号俸表" />
      <FeatureGate feature="hr_portal">
        <SalaryBody />
      </FeatureGate>
    </div>
  );
}
