"use client";

import { useState, useCallback } from "react";
import { quizQuestions, type QuizCategory } from "@/data/quiz";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/PageHeader";

const categoryLabels: Record<string, { label: string; filter: QuizCategory | null }> = {
  all: { label: "すべて", filter: null },
  disease: { label: "疾患", filter: "disease" },
  drug: { label: "薬剤", filter: "drug" },
  cosmetic: { label: "当院の美容", filter: "cosmetic" },
  ops: { label: "業務", filter: "ops" },
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const OPTION_LABELS = ["A", "B", "C", "D"];

export default function QuizPage() {
  const [tab, setTab] = useState("all");
  const [questions, setQuestions] = useState(() => shuffle(quizQuestions).slice(0, 10));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [isFinished, setIsFinished] = useState(false);

  const startQuiz = useCallback((catKey: string) => {
    const cat = categoryLabels[catKey].filter;
    const pool = cat ? quizQuestions.filter((q) => q.category === cat) : quizQuestions;
    setQuestions(shuffle(pool).slice(0, 10));
    setCurrentIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setIsFinished(false);
  }, []);

  const handleTabChange = (value: string) => {
    setTab(value);
    startQuiz(value);
  };

  const handleAnswer = (idx: number) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(idx);
    setShowExplanation(true);
    if (idx === questions[currentIndex].answerIndex) {
      setScore((s) => s + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 >= questions.length) {
      setIsFinished(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    }
  };

  const q = questions[currentIndex];
  const total = questions.length;
  const pct = total > 0 ? Math.round(((currentIndex + (isFinished ? 1 : 0)) / total) * 100) : 0;

  const scorePct = total > 0 ? Math.round((score / total) * 100) : 0;
  const resultMessage =
    scorePct >= 80 ? "素晴らしい！" : scorePct >= 60 ? "もう少し！" : "復習しましょう";

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <PageHeader
        title="確認テスト"
        description="学んだ知識をクイズで確認しましょう"
        badge={`全${quizQuestions.length}問`}
      />

      {/* Category tabs */}
      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
          {Object.entries(categoryLabels).map(([key, { label }]) => (
            <TabsTrigger key={key} value={key} className="text-xs">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Quiz area */}
      {!isFinished && q ? (
        <div className="space-y-5">
          {/* Progress */}
          <div className="flex items-center gap-4">
            <Progress value={pct} className="flex-1 h-2" />
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              問題{currentIndex + 1} / {total}
            </span>
            <Badge variant="outline" className="bg-teal-light text-teal border-teal/20">
              {score}点
            </Badge>
          </div>

          {/* Question */}
          <Card className="p-6">
            <p className="text-base font-semibold leading-relaxed">{q.question}</p>
          </Card>

          {/* Options */}
          <div className="space-y-2">
            {q.options.map((opt, idx) => {
              let btnClass = "w-full text-left rounded-md border px-4 py-3 text-sm transition-colors ";
              if (selectedAnswer !== null) {
                if (idx === q.answerIndex) {
                  btnClass += "bg-teal-light border-teal text-teal font-medium";
                } else if (idx === selectedAnswer) {
                  btnClass += "bg-red-50 border-red-300 text-red-700";
                } else {
                  btnClass += "border-border text-muted-foreground opacity-60";
                }
              } else {
                btnClass += "border-border hover:bg-accent hover:border-teal/30 cursor-pointer";
              }
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={selectedAnswer !== null}
                  onClick={() => handleAnswer(idx)}
                  className={btnClass}
                >
                  <span className="font-medium mr-2">{OPTION_LABELS[idx]}.</span>
                  {opt}
                </button>
              );
            })}
          </div>

          {/* Explanation */}
          {showExplanation && (
            <Card className="bg-muted/50 p-5 space-y-2">
              <p className="font-semibold text-sm">
                {selectedAnswer === q.answerIndex ? (
                  <span className="text-teal">正解！</span>
                ) : (
                  <span className="text-red-600">不正解。</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">{q.explanation}</p>
            </Card>
          )}

          {/* Next button */}
          {showExplanation && (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-md bg-teal px-6 py-2.5 text-sm font-medium text-teal-foreground hover:opacity-90 transition-opacity"
            >
              {currentIndex + 1 >= total ? "結果を見る" : "次の問題 →"}
            </button>
          )}
        </div>
      ) : isFinished ? (
        /* Result screen */
        <Card className="p-8 text-center space-y-4">
          <p className="text-4xl font-bold text-teal">{resultMessage}</p>
          <p className="text-lg">
            {total}問中{score}問正解（{scorePct}%）
          </p>
          <Progress value={scorePct} className="h-3 max-w-xs mx-auto" />
          <button
            type="button"
            onClick={() => startQuiz(tab)}
            className="mt-4 rounded-md bg-teal px-6 py-2.5 text-sm font-medium text-teal-foreground hover:opacity-90 transition-opacity"
          >
            もう一度挑戦する
          </button>
        </Card>
      ) : (
        <p className="text-center text-muted-foreground py-12">
          このカテゴリには問題がありません
        </p>
      )}
    </div>
  );
}
