/**
 * ディープリサーチ実行 API（SSEストリーミング・Google検索Grounding付き）
 * ※ mk-training は admin 認証なし（流儀準拠）。保護は無し。
 */
import { NextRequest } from "next/server";
import {
  streamGeminiApiWithSearch,
  getResearchModel,
} from "@/lib/deep-research/gemini-research";
import { buildResearchPrompt } from "@/lib/deep-research/prompts";
import type { ResearchRequest } from "@/lib/deep-research/types";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 分

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ResearchRequest;
    const { topic, mode, additionalContext } = body;

    if (!topic || topic.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "トピックが入力されていません" }),
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY が設定されていません" }),
        { status: 500 }
      );
    }

    const selectedModel = getResearchModel();
    const prompt = buildResearchPrompt({
      topic,
      mode: mode || "standard",
      additionalContext,
    });
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );
        };
        try {
          send({ type: "stage", stage: "preparing" });
          await new Promise((r) => setTimeout(r, 100));
          send({ type: "stage", stage: "searching" });

          let totalLen = 0;
          let sawFirstChunk = false;
          for await (const event of streamGeminiApiWithSearch(
            prompt,
            selectedModel
          )) {
            if (event.type === "text") {
              if (!sawFirstChunk) {
                sawFirstChunk = true;
                send({ type: "stage", stage: "writing" });
              }
              totalLen += event.content.length;
              send({ type: "text", content: event.content });
            } else if (event.type === "sources") {
              send({ type: "sources", sources: event.sources });
            }
          }

          send({ type: "stage", stage: "finalizing" });
          send({
            type: "done",
            model_used: selectedModel,
            total_chars: totalLen,
          });
          controller.close();
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "リサーチ中にエラーが発生しました";
          send({ type: "error", message });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "予期せぬエラー";
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
}
