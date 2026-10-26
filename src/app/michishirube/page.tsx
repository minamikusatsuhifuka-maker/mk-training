"use client";

// 🧭 成長の道しるべ（指示書270・機能ID michishirube）
// - 見る：ログインしたスタッフ全員（判定は /api/michishirube）。スイッチOFFの間は FeatureGate が「準備中」（院長と検証用アカウントはプレビューで開ける）
// - 中身を直すのは管理画面「🧭 成長の道しるべ（中身）」（院長と任された人）

import FeatureGate from "@/components/FeatureGate";
import NavPageHeader from "@/components/NavPageHeader";
import { MichishirubeBoard } from "@/components/michishirube/MichishirubeBoard";

export default function MichishirubePage() {
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4">
      <FeatureGate feature="michishirube">
        <NavPageHeader navKey="/michishirube" title="🧭 成長の道しるべ" />
        <MichishirubeBoard />
      </FeatureGate>
    </div>
  );
}
