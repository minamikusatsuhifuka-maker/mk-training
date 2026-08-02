"use client";

import { useState, useRef, useEffect } from "react";
import { usePageTitle } from "@/lib/use-nav";
import { useFeatureFlags } from "@/lib/use-feature-flags";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const quickQuestions = [
  "当院のミッションと四方よしを教えてください",
  "リードマネジメントとはどういう考え方ですか？",
  "7つの実について教えてください",
  "ティール組織とはどんな組織ですか？",
  "プロトピックを2歳の子に使えますか？",
  "デュピクセントのレセプト摘要欄は何を書く？",
  "妊婦にステロイド外用は使える？",
  "コセンティクスの小児の用量は？",
  "イブグリースは何歳から使える？",
];

// 人事制度のクイック質問（指示書129・hr_portal ON時のみ表示＝OFF時は知識未注入のため出さない）
const hrQuickQuestions = [
  "G2からG3に上がるには何が必要？",
  "給与はどう上がりますか？",
  "この制度はいつできましたか？",
];

export default function AiChatPage() {
  const pageTitle = usePageTitle("/ai-chat", "🤖 医療AIアシスタント");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 人事制度クイック質問の表示判定（指示書129・OFF時は非表示）
  const { flags } = useFeatureFlags();
  const visibleQuickQuestions = flags.hr_portal
    ? [...quickQuestions, ...hrQuickQuestions]
    : quickQuestions;

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages([
          ...newMessages,
          { role: "assistant", content: `エラーが発生しました: ${data.error}` },
        ]);
      } else {
        setMessages([
          ...newMessages,
          { role: "assistant", content: data.message },
        ]);
      }
    } catch {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "通信エラーが発生しました。もう一度お試しください。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* ヘッダー */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-teal">
          {pageTitle}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          薬・レセプト・生物学的製剤・カウンセリングについて何でも聞けます
        </p>
      </div>

      {/* 免責バナー */}
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ⚠️
        本AIは研修・学習目的です。実際の処方・診療判断は必ず医師・薬剤師の指示に従ってください。
      </div>

      {/* チャットエリア（モバイル：画面いっぱい / PC：60vh） */}
      <Card className="flex flex-col h-[calc(100vh-280px)] md:h-[60vh] min-h-[400px]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="text-center text-muted-foreground text-sm py-12">
              質問を入力するか、下のクイック質問をタップしてください
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-2.5 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-teal text-white"
                    : "bg-white border border-border"
                }`}
              >
                {msg.role === "assistant" && (
                  <span className="mr-1.5">🤖</span>
                )}
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-border rounded-lg px-4 py-2.5 text-sm text-muted-foreground animate-pulse">
                🤖 考え中...
              </div>
            </div>
          )}
        </div>

        {/* 入力欄 */}
        <div className="border-t p-3 space-y-2">
          <div className="text-xs text-teal flex items-center gap-1">
            <span>🌱</span>
            <span>クリニックの理念・哲学を参照中</span>
          </div>
          <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="質問を入力（Shift+Enterで改行）"
            className="resize-none min-h-[48px] max-h-[120px] text-base"
            rows={1}
            disabled={loading}
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="bg-teal hover:bg-teal/90 text-white shrink-0 min-h-[48px] px-5"
          >
            送信
          </Button>
          </div>
        </div>
      </Card>

      {/* クイック質問（モバイル横スクロール） */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          よくある質問
        </p>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-hide">
          {visibleQuickQuestions.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              disabled={loading}
              className="whitespace-nowrap flex-shrink-0 text-sm border border-teal/30 text-teal rounded-full px-3.5 py-2 hover:bg-teal-light transition-colors disabled:opacity-50 min-h-[36px]"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
