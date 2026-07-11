"use client";

import { useState, useEffect } from "react";
import {
  receptionSections,
  clerkSections,
  counselorSections,
  clerkMedicalItems,
  nurseItems,
  type CheckSection,
} from "@/data/operations";
import { getContent, CONTENT_KEYS } from "@/lib/content-store";
import { ChecklistSection } from "@/components/ChecklistSection";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailedChecklist } from "@/components/DetailedChecklist";

type TabKey = "reception" | "clerk" | "clerk-medical" | "nurse" | "counselor";

export default function OperationsPage() {
  const [tab, setTab] = useState<TabKey>("reception");

  // 既存のSupabase連動データ
  const [reception, setReception] = useState<CheckSection[]>(receptionSections);
  const [clerk, setClerk] = useState<CheckSection[]>(clerkSections);
  const [counselor, setCounselor] = useState<CheckSection[]>(counselorSections);

  useEffect(() => {
    getContent<CheckSection>(CONTENT_KEYS.operationsReception, receptionSections).then(setReception).catch(() => {});
    getContent<CheckSection>(CONTENT_KEYS.operationsClerk, clerkSections).then(setClerk).catch(() => {});
    getContent<CheckSection>(CONTENT_KEYS.operationsCounselor, counselorSections).then(setCounselor).catch(() => {});
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-[1536px] mx-auto space-y-6">
      <PageHeader
        title="業務チェックリスト"
        description="各役職ごとの業務内容・接遇チェックリストです"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="w-full grid grid-cols-2 sm:grid-cols-5 h-auto gap-1">
          <TabsTrigger value="reception" className="data-[state=active]:bg-blue-100 data-[state=active]:text-blue-800">
            🏢 受付
          </TabsTrigger>
          <TabsTrigger value="clerk" className="data-[state=active]:bg-purple-100 data-[state=active]:text-purple-800">
            💻 クラーク
          </TabsTrigger>
          <TabsTrigger value="clerk-medical" className="data-[state=active]:bg-teal-light data-[state=active]:text-teal">
            💊 医療クラーク
          </TabsTrigger>
          <TabsTrigger value="nurse" className="data-[state=active]:bg-pink-100 data-[state=active]:text-pink-800">
            👩‍⚕️ 看護師
          </TabsTrigger>
          <TabsTrigger value="counselor" className="data-[state=active]:bg-orange-100 data-[state=active]:text-orange-800">
            💬 カウンセラー
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reception" className="mt-6 space-y-4">
          <RoleHeader
            color="blue"
            title="受付"
            description="来院から会計までの流れと接遇のポイントです。明るく丁寧な対応を心がけましょう。"
          />
          <ChecklistSection sections={reception} storageKey="reception" />
        </TabsContent>

        <TabsContent value="clerk" className="mt-6 space-y-4">
          <RoleHeader
            color="purple"
            title="クラーク"
            description="医師の診療補助・電子カルテ入力を行います。正確かつスピーディーな対応を心がけましょう。"
          />
          <ChecklistSection sections={clerk} storageKey="clerk" />
        </TabsContent>

        <TabsContent value="clerk-medical" className="mt-6 space-y-4">
          <RoleHeader
            color="teal"
            title="医療クラーク"
            description="医療クラークは保険診療補助と美容診療補助（カウンセラー兼務）の両方を担います。医師の指示のもと診療を補助し、患者さんに寄り添った対応を心がけましょう。"
          />
          <DetailedChecklist items={clerkMedicalItems} storageKey="operations_clerk_medical" />
        </TabsContent>

        <TabsContent value="nurse" className="mt-6 space-y-4">
          <RoleHeader
            color="pink"
            title="看護師"
            description="看護師は医療処置・患者管理・緊急対応の要です。生物学的製剤の投与管理・自己注射指導・アナフィラキシー対応など、専門知識を活かした安全な医療を提供します。"
          />
          <DetailedChecklist items={nurseItems} storageKey="operations_nurse" />
        </TabsContent>

        <TabsContent value="counselor" className="mt-6 space-y-4">
          <RoleHeader
            color="orange"
            title="カウンセラー"
            description="美容施術のカウンセリングを担当します。患者様の悩みに寄り添い、最適な提案を行いましょう。"
          />
          <ChecklistSection sections={counselor} storageKey="counselor" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RoleHeader({
  color,
  title,
  description,
}: {
  color: "blue" | "purple" | "teal" | "pink" | "orange";
  title: string;
  description: string;
}) {
  const colorMap: Record<typeof color, string> = {
    blue: "bg-blue-50 border-blue-200 text-blue-900",
    purple: "bg-purple-50 border-purple-200 text-purple-900",
    teal: "bg-teal-50 border-teal-200 text-teal-900",
    pink: "bg-pink-50 border-pink-200 text-pink-900",
    orange: "bg-orange-50 border-orange-200 text-orange-900",
  };
  return (
    <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
      <h2 className="text-base font-bold mb-1">{title}</h2>
      <p className="text-sm leading-relaxed">{description}</p>
    </div>
  );
}

