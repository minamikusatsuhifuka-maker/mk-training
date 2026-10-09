/**
 * ディープリサーチ実行 API（SSEストリーミング・Google検索Grounding付き）
 *
 * 院長、または「🔬 ディープリサーチ」を委任された幹部だけ（226 §1・requireAdminItem）。
 * 226 §3: 任された幹部は1人あたり月◯回まで（初期値30・院長が変えられる）。
 *   院長は上限なし。判定は**ここ（サーバー）**で行い、画面だけで止めない。
 *   上限に達していたら 429 と「今月の上限（◯回）に達しました。」を返す。
 *
 * 226への返答（院長の決定）: 回数を数えるのは**このリサーチの実行だけ**。
 *   まとめ・クイズなどの生成（配下のサブルート）では減らさない。
 *   ＝ここが、回数を1つ増やす**唯一の場所**。
 */
import { NextRequest } from "next/server";
import {
  streamGeminiApiWithSearch,
  getResearchModel,
} from "@/lib/deep-research/gemini-research";
import { buildResearchPrompt } from "@/lib/deep-research/prompts";
import type { ResearchRequest } from "@/lib/deep-research/types";
import { requireAdminItem } from "@/lib/admin-delegation-server";
import { consumeDeepResearchQuota } from "@/lib/deep-research/quota-server";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 分

export async function POST(req: NextRequest) {
  const auth = await requireAdminItem("deep-research");
  if (auth.response) return auth.response;
  // 226 §3: 回数の上限（院長は上限なし）。AIを呼ぶ前に数える
  const quota = await consumeDeepResearchQuota(auth.user);
  if (!quota.ok) {
    return new Response(JSON.stringify({ error: quota.message, code: "quota" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    const body = (await req.json()) as ResearchRequest;
    const { topic, mode, perspective, additionalContext } = body;

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
      perspective: perspective || "general",
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
            // 226 §3: 実行後の残り回数（院長は null）
            remaining: quota.state.remaining,
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
