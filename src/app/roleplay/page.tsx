"use client";

import { useState, useRef, useEffect } from "react";
import { usePageTitle } from "@/lib/use-nav";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Step = "select" | "chat" | "feedback";

interface ChatMessage {
  role: "patient" | "staff";
  content: string;
}

interface FeedbackData {
  score: number;
  scoreMax: number;
  goodPoints: string[];
  improvements: string[];
  nextQuestions: string[];
  overallComment: string;
}

const scenarios = [
  {
    id: "biologics",
    emoji: "💉",
    title: "生物学的製剤の導入説明",
    desc: "デュピクセント等を初めて提案する場面",
  },
  {
    id: "shimmi",
    emoji: "✨",
    title: "シミ治療カウンセリング",
    desc: "IPL・レーザー治療の説明",
  },
  {
    id: "acne_red",
    emoji: "🔵",
    title: "ニキビ跡（赤み）カウンセリング",
    desc: "IPL・ブルーレーザーの説明",
  },
  {
    id: "acne_scar",
    emoji: "🌀",
    title: "ニキビ跡（凹み）カウンセリング",
    desc: "ポテンツァ・トライフィルの説明",
  },
  {
    id: "datsumou",
    emoji: "🪒",
    title: "脱毛カウンセリング",
    desc: "レーザー脱毛の説明",
  },
  {
    id: "skincare",
    emoji: "🧴",
    title: "スキンケア製品の提案",
    desc: "院内スキンケア商品の説明",
  },
  {
    id: "insurance",
    emoji: "🏥",
    title: "保険診療の説明",
    desc: "保険と自由診療の違いの説明",
  },
];

export default function RoleplayPage() {
  const pageTitle = usePageTitle("/roleplay", "🎭 カウンセリングロールプレイ");
  const [step, setStep] = useState<Step>("select");
  const [scenario, setScenario] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [staffResponses, setStaffResponses] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const turnCount = staffResponses.length;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages, loading]);

  async function startRoleplay(scenarioId: string) {
    setScenario(scenarioId);
    setChatMessages([]);
    setStaffResponses([]);
    setFeedback(null);
    setLoading(true);

    try {
      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", scenario: scenarioId }),
      });
      const data = await res.json();
      setChatMessages([{ role: "patient", content: data.message }]);
      setStep("chat");
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function sendStaffResponse() {
    if (!input.trim() || loading) return;
    const staffMsg = input.trim();
    setInput("");

    const newChatMessages: ChatMessage[] = [
      ...chatMessages,
      { role: "staff", content: staffMsg },
    ];
    const newStaffResponses = [...staffResponses, staffMsg];
    setChatMessages(newChatMessages);
    setStaffResponses(newStaffResponses);
    setLoading(true);

    try {
      // APIのmessages形式に変換
      const apiMessages = newChatMessages.map((m) => ({
        role: m.role === "patient" ? "assistant" : "user",
        content: m.content,
      }));

      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "continue",
          scenario,
          messages: apiMessages,
        }),
      });
      const data = await res.json();
      setChatMessages([
        ...newChatMessages,
        { role: "patient", content: data.message },
      ]);
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  async function requestFeedback() {
    setLoading(true);
    try {
      const res = await fetch("/api/roleplay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "feedback",
          scenario,
          staffResponses,
        }),
      });
      const data = await res.json();
      if (data.error) {
        alert("フィードバック取得に失敗しました");
      } else {
        setFeedback(data);
        setStep("feedback");
      }
    } catch {
      alert("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendStaffResponse();
    }
  }

  // ── シナリオ選択 ──
  if (step === "select") {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-teal">
            {pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AIが患者役 → あなたがスタッフとして対応 → AIがフィードバック
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {scenarios.map((s) => (
            <Card
              key={s.id}
              className="cursor-pointer hover:shadow-md hover:border-teal/40 transition-shadow"
              onClick={() => startRoleplay(s.id)}
            >
              <CardHeader>
                <div className="text-2xl mb-1">{s.emoji}</div>
                <CardTitle className="text-base">{s.title}</CardTitle>
                <CardDescription className="text-xs">{s.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── チャット画面 ──
  if (step === "chat") {
    const scenarioInfo = scenarios.find((s) => s.id === scenario);
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-teal">
              🎭 {scenarioInfo?.title}
            </h1>
            <p className="text-xs text-muted-foreground">
              {turnCount}/5 やり取り完了
            </p>
          </div>
          {/* 進行バー */}
          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-teal rounded-full transition-all"
              style={{ width: `${Math.min((turnCount / 5) * 100, 100)}%` }}
            />
          </div>
        </div>

        <Card className="flex flex-col" style={{ height: "55vh" }}>
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "staff" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                    msg.role === "staff"
                      ? "bg-teal text-white"
                      : "bg-pink-50 border border-pink-200"
                  }`}
                >
                  {msg.role === "patient" && (
                    <span className="mr-1.5">👩</span>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-pink-50 border border-pink-200 rounded-lg px-4 py-2.5 text-sm text-muted-foreground animate-pulse">
                  👩 患者が考え中...
                </div>
              </div>
            )}
          </div>

          {/* 入力欄 */}
          <div className="border-t p-3 flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="スタッフとして返答（Shift+Enterで改行）"
              className="resize-none min-h-[44px] max-h-[100px]"
              rows={1}
              disabled={loading}
            />
            <Button
              onClick={sendStaffResponse}
              disabled={!input.trim() || loading}
              className="bg-teal hover:bg-teal/90 text-white shrink-0"
            >
              送信
            </Button>
          </div>
        </Card>

        {/* 終了ボタン */}
        {turnCount >= 3 && (
          <Button
            onClick={requestFeedback}
            disabled={loading}
            variant="outline"
            className="w-full border-teal text-teal hover:bg-teal-light"
          >
            {loading ? "フィードバック取得中..." : "カウンセリングを終了する"}
          </Button>
        )}

        <button
          onClick={() => setStep("select")}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← シナリオ選択に戻る
        </button>
      </div>
    );
  }

  // ── フィードバック画面 ──
  if (step === "feedback" && feedback) {
    const stars = Array.from({ length: feedback.scoreMax }, (_, i) =>
      i < feedback.score ? "★" : "☆"
    ).join("");

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-teal">
            🎭 フィードバック
          </h1>
        </div>

        {/* スコア */}
        <Card className="text-center p-6">
          <p className="text-4xl text-amber-500">{stars}</p>
          <p className="text-lg font-semibold mt-1">
            {feedback.score} / {feedback.scoreMax}
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {feedback.overallComment}
          </p>
        </Card>

        {/* うまくできた点 */}
        {feedback.goodPoints?.length > 0 && (
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-green-700">✅ うまくできた点</h3>
            <ul className="space-y-1 text-sm">
              {feedback.goodPoints.map((p, i) => (
                <li key={i}>・{p}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* 改善点 */}
        {feedback.improvements?.length > 0 && (
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-amber-700">
              💡 追加できた説明
            </h3>
            <ul className="space-y-1 text-sm">
              {feedback.improvements.map((p, i) => (
                <li key={i}>・{p}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* 次の質問 */}
        {feedback.nextQuestions?.length > 0 && (
          <Card className="p-4 space-y-2">
            <h3 className="font-semibold text-teal">
              ⚠️ 患者が次に聞きそうな質問
            </h3>
            <ul className="space-y-1 text-sm">
              {feedback.nextQuestions.map((p, i) => (
                <li key={i}>・{p}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* ボタン */}
        <div className="flex gap-3">
          <Button
            onClick={() => startRoleplay(scenario)}
            disabled={loading}
            variant="outline"
            className="flex-1"
          >
            もう一度
          </Button>
          <Button
            onClick={() => setStep("select")}
            className="flex-1 bg-teal hover:bg-teal/90 text-white"
          >
            別のシナリオ
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
