"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { diseases } from "@/data/diseases";
import { drugs } from "@/data/drugs";
import { quizQuestions } from "@/data/quiz";
import { getContent, CONTENT_KEYS } from "@/lib/content-store";

const modules = [
  { title: "疾患", description: "皮膚科の主要疾患を学ぶ", href: "/diseases", emoji: "🩺" },
  { title: "薬剤", description: "処方薬・外用薬の基礎知識", href: "/drugs", emoji: "💊" },
  { title: "禁忌・注意", description: "投薬・施術の禁忌事項", href: "/contraindications", emoji: "⚠️" },
  { title: "美容メニュー", description: "当院の美容施術一覧", href: "/cosmetic", emoji: "✨" },
  { title: "スキンケア", description: "スキンケア製品の知識", href: "/skincare", emoji: "🧴" },
  { title: "受付", description: "受付業務の基本フロー", href: "/reception", emoji: "🏥" },
  { title: "事務", description: "事務・会計の手順", href: "/clerk", emoji: "📋" },
  { title: "カウンセラー", description: "カウンセリング技術", href: "/counselor", emoji: "💬" },
  { title: "妊娠・授乳と薬剤", description: "使用可能・禁忌薬剤の一覧", href: "/pregnancy", emoji: "🤰" },
  { title: "相互作用チェック", description: "薬剤間の相互作用を確認", href: "/interactions", emoji: "⚡" },
  { title: "カウンセリングガイド", description: "トークスクリプト・クリアチェック", href: "/counseling", emoji: "💬" },
  { title: "算定・点数表", description: "保険診療の算定項目と点数", href: "/medical-fees", emoji: "💴" },
  { title: "生物学的製剤", description: "投与スケジュール・レセプト記載事項", href: "/biologics", emoji: "💉" },
  { title: "年齢注意薬剤", description: "疑義照会・レセプト審査で問題になる年齢制限薬一覧", href: "/age-restrictions", emoji: "👶" },
];

export default function Home() {
  const [stats, setStats] = useState({
    diseases: diseases.length,
    drugs: drugs.length,
    quiz: quizQuestions.length,
    cosmetic: 16,
  });

  useEffect(() => {
    Promise.all([
      getContent(CONTENT_KEYS.diseases, diseases),
      getContent(CONTENT_KEYS.drugs, drugs),
      getContent(CONTENT_KEYS.quiz, quizQuestions),
    ]).then(([d, dr, q]) => {
      setStats((prev) => ({
        ...prev,
        diseases: d.length || diseases.length,
        drugs: dr.length || drugs.length,
        quiz: q.length || quizQuestions.length,
      }));
    }).catch(() => {});
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-6 md:space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-teal">スタッフ研修ポータル</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">
          肌すこやかに、心かろやかに ── 南草津皮フ科の理念に基づいた研修教材です
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { label: "疾患数", value: String(stats.diseases) },
          { label: "薬剤数", value: String(stats.drugs) },
          { label: "美容施術", value: String(stats.cosmetic) },
          { label: "クイズ問題", value: String(stats.quiz) },
        ]).map((s) => (
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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

      {/* AI機能 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">AI機能</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link href="/ai-chat">
            <Card className="h-full hover:shadow-md transition-shadow cursor-pointer hover:border-teal/40">
              <CardHeader>
                <div className="text-2xl mb-1">🤖</div>
                <CardTitle className="text-base">AIアシスタント</CardTitle>
                <CardDescription className="text-xs">薬・レセプト・施術について何でも質問</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/case-study">
            <Card className="h-full hover:shadow-md transition-shadow cursor-pointer hover:border-teal/40">
              <CardHeader>
                <div className="text-2xl mb-1">🏥</div>
                <CardTitle className="text-base">症例ベース学習</CardTitle>
                <CardDescription className="text-xs">AIが症例を提示 → 回答 → 採点</CardDescription>
              </CardHeader>
            </Card>
          </Link>
          <Link href="/roleplay">
            <Card className="h-full hover:shadow-md transition-shadow cursor-pointer hover:border-teal/40">
              <CardHeader>
                <div className="text-2xl mb-1">🎭</div>
                <CardTitle className="text-base">ロールプレイ</CardTitle>
                <CardDescription className="text-xs">AIが患者役 → カウンセリング練習</CardDescription>
              </CardHeader>
            </Card>
          </Link>
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
