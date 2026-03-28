import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const modules = [
  { title: "疾患", description: "皮膚科の主要疾患を学ぶ", href: "/diseases", emoji: "🩺" },
  { title: "薬剤", description: "処方薬・外用薬の基礎知識", href: "/drugs", emoji: "💊" },
  { title: "禁忌・注意", description: "投薬・施術の禁忌事項", href: "/contraindications", emoji: "⚠️" },
  { title: "美容メニュー", description: "当院の美容施術一覧", href: "/cosmetic", emoji: "✨" },
  { title: "スキンケア", description: "スキンケア製品の知識", href: "/skincare", emoji: "🧴" },
  { title: "受付", description: "受付業務の基本フロー", href: "/reception", emoji: "🏥" },
  { title: "事務", description: "事務・会計の手順", href: "/clerk", emoji: "📋" },
  { title: "カウンセラー", description: "カウンセリング技術", href: "/counselor", emoji: "💬" },
];

const stats = [
  { label: "疾患数", value: "30" },
  { label: "薬剤数", value: "38" },
  { label: "美容施術", value: "16" },
  { label: "クイズ問題", value: "100" },
];

export default function Home() {
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-teal">スタッフ研修ポータル</h1>
        <p className="text-muted-foreground mt-1">
          肌すこやかに、心かろやかに ── 南草津皮フ科の理念に基づいた研修教材です
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="text-center">
            <CardHeader className="pb-2 pt-4 px-4">
              <p className="text-3xl font-bold text-teal">{s.value}</p>
              <CardDescription>{s.label}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      {/* Module Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">学習モジュール</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {modules.map((m) => (
            <Link key={m.href} href={m.href}>
              <Card className="h-full hover:shadow-md transition-shadow cursor-pointer hover:border-teal/40">
                <CardHeader>
                  <div className="text-2xl mb-1">{m.emoji}</div>
                  <CardTitle className="text-base">{m.title}</CardTitle>
                  <CardDescription className="text-xs">{m.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Quiz CTA */}
      <Link href="/quiz">
        <Card className="mt-2 border-teal/30 bg-teal-light hover:shadow-md transition-shadow cursor-pointer">
          <CardHeader className="flex-row items-center gap-4">
            <Badge className="bg-teal text-teal-foreground text-sm px-3 py-1">テスト</Badge>
            <div>
              <CardTitle className="text-base">確認テストに挑戦</CardTitle>
              <CardDescription className="text-xs">学んだ知識をクイズで確認しましょう</CardDescription>
            </div>
          </CardHeader>
        </Card>
      </Link>
    </div>
  );
}
