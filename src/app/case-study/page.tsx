"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Difficulty = "easy" | "medium" | "hard";
type Category = "biologics" | "age" | "receipt" | "safety" | "cosmetic";
type Step = "settings" | "case" | "result";

interface CaseData {
  title: string;
  patient: string;
  situation: string;
  question: string;
  hint: string;
  difficulty: string;
  category: string;
}

interface EvalResult {
  score: number;
  grade: string;
  goodPoints: string[];
  missingPoints: string[];
  explanation: string;
  keyLearning: string;
  relatedInfo: string;
}

const difficulties: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "易（新人）" },
  { value: "medium", label: "中（中堅）" },
  { value: "hard", label: "難（ベテラン）" },
];

const categories: { value: Category; label: string; emoji: string }[] = [
  { value: "biologics", label: "生物学的製剤", emoji: "🔬" },
  { value: "age", label: "年齢注意薬", emoji: "👶" },
  { value: "receipt", label: "算定・レセプト", emoji: "💰" },
  { value: "safety", label: "薬の安全性", emoji: "💊" },
  { value: "cosmetic", label: "美容施術", emoji: "🌸" },
];

export default function CaseStudyPage() {
  const [step, setStep] = useState<Step>("settings");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>(["biologics"]);
  const [caseData, setCaseData] = useState<CaseData | null>(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const [showHint, setShowHint] = useState(false);

  function toggleCategory(cat: Category) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function generateCase() {
    setLoading(true);
    try {
      const cat =
        selectedCategories[Math.floor(Math.random() * selectedCategories.length)] ||
        "biologics";
      const res = await fetch("/api/case-study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", difficulty, category: cat }),
      });
      const data = await res.json();
      if (data.error) {
        alert("症例生成に失敗しました: " + data.error);
      } else {
        setCaseData(data);
        setAnswer("");
        setHintUsed(false);
        setShowHint(false);
        setResult(null);
        setStep("case");
      }
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function submitAnswer() {
    if (!answer.trim() || !caseData) return;
    setLoading(true);
    try {
      const caseContent = `タイトル: ${caseData.title}\n患者: ${caseData.patient}\n状況: ${caseData.situation}\n質問: ${caseData.question}`;
      const res = await fetch("/api/case-study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "evaluate",
          userAnswer: answer,
          caseContent,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert("採点に失敗しました: " + data.error);
      } else {
        setResult(data);
        setStep("result");
      }
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  // ── Step 1: 設定画面 ──
  if (step === "settings") {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-teal">
            🏥 症例ベース学習
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AIが症例を提示 → あなたが回答 → AIが採点・解説
          </p>
        </div>

        {/* 難易度 */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">難易度</p>
          <div className="flex gap-2">
            {difficulties.map((d) => (
              <button
                key={d.value}
                onClick={() => setDifficulty(d.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  difficulty === d.value
                    ? "bg-teal text-white border-teal"
                    : "border-border text-foreground/70 hover:border-teal/40"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* カテゴリ */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">カテゴリ（複数選択可）</p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c.value}
                onClick={() => toggleCategory(c.value)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  selectedCategories.includes(c.value)
                    ? "bg-teal text-white border-teal"
                    : "border-border text-foreground/70 hover:border-teal/40"
                }`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </div>

        <Button
          onClick={generateCase}
          disabled={loading || selectedCategories.length === 0}
          className="w-full bg-teal hover:bg-teal/90 text-white"
        >
          {loading ? "症例を生成中..." : "症例を開始"}
        </Button>
      </div>
    );
  }

  // ── Step 2: 症例表示 ──
  if (step === "case" && caseData) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-teal">
            🏥 症例ベース学習
          </h1>
        </div>

        <Card className="p-5 space-y-3">
          <h2 className="text-lg font-bold">{caseData.title}</h2>
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-semibold text-teal">患者情報:</span>
              <p className="mt-0.5 whitespace-pre-wrap">{caseData.patient}</p>
            </div>
            <div>
              <span className="font-semibold text-teal">状況:</span>
              <p className="mt-0.5 whitespace-pre-wrap">{caseData.situation}</p>
            </div>
            <div className="bg-teal-light rounded-lg p-3">
              <span className="font-semibold text-teal">質問:</span>
              <p className="mt-0.5 whitespace-pre-wrap">{caseData.question}</p>
            </div>
          </div>
        </Card>

        {/* ヒント */}
        {!showHint ? (
          <button
            onClick={() => {
              setShowHint(true);
              setHintUsed(true);
            }}
            disabled={hintUsed && !showHint}
            className="text-sm text-teal hover:underline"
          >
            💡 ヒントを見る（1回のみ）
          </button>
        ) : (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            💡 ヒント: {caseData.hint}
          </div>
        )}

        {/* 回答入力 */}
        <div className="space-y-2">
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="あなたの回答を入力してください"
            rows={5}
            disabled={loading}
          />
          <Button
            onClick={submitAnswer}
            disabled={!answer.trim() || loading}
            className="w-full bg-teal hover:bg-teal/90 text-white"
          >
            {loading ? "採点中..." : "回答を送信"}
          </Button>
        </div>

        <button
          onClick={() => setStep("settings")}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← 設定に戻る
        </button>
      </div>
    );
  }

  // ── Step 3: 採点・解説 ──
  if (step === "result" && result) {
    const gradeColor =
      result.score >= 80
        ? "text-green-600"
        : result.score >= 60
          ? "text-amber-600"
          : "text-red-600";

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-teal">
            🏥 採点結果
          </h1>
        </div>

        {/* スコア */}
        <Card className="text-center p-6">
          <p className={`text-5xl font-bold ${gradeColor}`}>{result.score}</p>
          <p className="text-lg font-semibold mt-1">/ 100点（{result.grade}）</p>
          {result.keyLearning && (
            <p className="text-sm text-muted-foreground mt-2">
              📌 {result.keyLearning}
            </p>
          )}
        </Card>

        {/* 良かった点 */}
        {result.goodPoints?.length > 0 && (
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-green-700">✅ 良かった点</h3>
            <ul className="space-y-1 text-sm">
              {result.goodPoints.map((p, i) => (
                <li key={i}>・{p}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* 不足点 */}
        {result.missingPoints?.length > 0 && (
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-red-700">❌ 不足していた点</h3>
            <ul className="space-y-1 text-sm">
              {result.missingPoints.map((p, i) => (
                <li key={i}>・{p}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* 解説 */}
        <Card className="p-4 space-y-2">
          <h3 className="font-semibold text-teal">📚 解説</h3>
          <p className="text-sm whitespace-pre-wrap">{result.explanation}</p>
          {result.relatedInfo && (
            <div className="mt-2 pt-2 border-t text-sm text-muted-foreground">
              <span className="font-medium">関連情報:</span> {result.relatedInfo}
            </div>
          )}
        </Card>

        {/* ボタン */}
        <div className="flex gap-3">
          <Button
            onClick={generateCase}
            disabled={loading}
            className="flex-1 bg-teal hover:bg-teal/90 text-white"
          >
            {loading ? "生成中..." : "次の症例へ"}
          </Button>
          <Button
            onClick={() => {
              setAnswer("");
              setResult(null);
              setStep("case");
            }}
            variant="outline"
            className="flex-1"
          >
            もう一度
          </Button>
        </div>

        <button
          onClick={() => setStep("settings")}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← 設定に戻る
        </button>
      </div>
    );
  }

  return null;
}
