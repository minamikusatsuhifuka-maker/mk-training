"use client";

// 本人ページ「わたしの可能性ノート」（指示書179 C）
// 機能フラグ growth_record（既定OFF）。OFFの間はメニューに出ず、直URLは「準備中」。
// API側（authorizeGrowth）も非管理者にはフラグONのときだけ応答する＝画面だけの制御ではない。

import NavPageHeader from "@/components/NavPageHeader";
import FeatureGate from "@/components/FeatureGate";
import { MyGrowthRecord } from "@/components/MyGrowthRecord";
import { POSSIBILITY_NOTE_MESSAGE } from "@/lib/staff-growth";

export default function MyGrowthPage() {
  return (
    <FeatureGate feature="growth_record">
      <div className="max-w-3xl mx-auto">
        <NavPageHeader
          navKey="/my-growth"
          title="🌱 わたしの可能性ノート"
          description="自分の学びの記録・目標・1on1の約束"
        />
        {/* 225 §2: 見出しのすぐ下に、コーポレートブック 院長メッセージの一文を1行で出す。
            院長・幹部が見る「可能性ノート」には出さない（この画面＝本人だけ） */}
        <p
          className="-mt-1 mb-3 text-[13px] leading-relaxed text-emerald-800"
          data-possibility-message
        >
          {POSSIBILITY_NOTE_MESSAGE}
        </p>
        <MyGrowthRecord />
      </div>
    </FeatureGate>
  );
}
