/**
 * ディープリサーチ専用 Gemini 呼び出し（REST + SSE + Google検索Grounding）
 *
 * ※ ai-incho から移植。mk-training の既存 Gemini ルート（gemini-2.5-pro をハードコード）には
 *    一切影響しない独立実装。モデルは GEMINI_MODEL || "gemini-3.5-flash"、キーは既存 GEMINI_API_KEY。
 * ※ 検索Grounding（リサーチ実行）も通常生成（学習資料）も、すべてこのファイル経由＝全経路 Gemini 3.5 Flash。
 */

import { GEMINI_THINKING_CONFIG } from "@/lib/gemini-models";

/** リサーチで使用するモデル名を解決する */
export function getResearchModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash";
}

/**
 * 非ストリーミングのテキスト生成（Google検索Groundingなし）。
 * 派生資料（研修資料・知識シート・クイズ・要約等）の生成に流用する。
 * @param prompt 送信するプロンプト
 * @param options temperature 等
 * @param model 使用するモデル（省略時は getResearchModel()）
 * @returns 生成テキスト全文
 */
export async function generateText(
  prompt: string,
  options: { temperature?: number } = {},
  model: string = getResearchModel()
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY?.replace(/[^\x20-\x7E]/g, "") || "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が設定されていません");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature ?? 0.4,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 12000,
        // Gemini 3.x は思考が既定ON。枠固定のJSON抽出が途中で切れるため最小化する。
        thinkingConfig: GEMINI_THINKING_CONFIG,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Gemini API エラー (${response.status}): ${errorBody}`);
  }

  const result = await response.json();
  const parts: { text?: string }[] = result?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => typeof p.text === "string" && p.text.length > 0)
    .map((p) => p.text as string)
    .join("");

  if (!text) {
    throw new Error("Gemini APIからの応答が空です");
  }

  return text;
}

/** 生成テキストから ```md / ```json などのコードフェンスを除去する */
export function stripCodeFence(s: string): string {
  return s
    .replace(/^```(?:markdown|md|json|html)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

/**
 * 生成テキストから JSON オブジェクトを堅牢に取り出す（3段階フォールバック）。
 *   1) コードフェンス除去して素直に JSON.parse
 *   2) brace matching（最初の { 〜 最後の } を抽出して parse）
 *   3) 開き括弧カウントで不足分の } を補完して parse
 * いずれも失敗したら null。
 */
export function parseJsonLoose<T = Record<string, unknown>>(raw: string): T | null {
  const cleaned = stripCodeFence(raw);

  // 1) そのまま
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // フォールスルー
  }

  // 2) brace matching
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // フォールスルー
    }
  }

  // 3) 開き括弧カウントで閉じ括弧を補完
  if (start >= 0) {
    const tail = cleaned.slice(start);
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (const ch of tail) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    if (depth > 0) {
      const completed = tail + "}".repeat(depth);
      try {
        return JSON.parse(completed) as T;
      } catch {
        // フォールスルー
      }
    }
  }

  return null;
}

/**
 * Google検索Grounding付きリサーチを「非ストリーミングで一括取得」する。
 * streamGeminiApiWithSearch を内部で消費し、本文全文と情報源をまとめて返す。
 * 疾患リサーチAPIなど、SSE不要でサーバ側で全文を扱いたい用途に使う。
 * @param prompt 送信するプロンプト
 * @param model 使用するモデル（省略時は getResearchModel()）
 * @returns 本文全文と収集した情報源
 */
export async function researchWithSearch(
  prompt: string,
  model: string = getResearchModel()
): Promise<{ content: string; sources: { title: string; url: string }[] }> {
  let content = "";
  let sources: { title: string; url: string }[] = [];
  for await (const evt of streamGeminiApiWithSearch(prompt, model)) {
    if (evt.type === "text") content += evt.content;
    else if (evt.type === "sources") sources = evt.sources;
  }
  if (!content.trim()) {
    throw new Error("Gemini リサーチの応答が空でした");
  }
  return { content, sources };
}

/** ストリーミングが返すイベント型 */
export type GeminiStreamEvent =
  | { type: "text"; content: string }
  | { type: "sources"; sources: { title: string; url: string }[] };

// Gemini ストリーミングレスポンスの最小型定義
type GeminiPart = { text?: string };
type GeminiGroundingChunk = { web?: { uri?: string; title?: string } };
type GeminiCandidate = {
  content?: { parts?: GeminiPart[] };
  groundingMetadata?: { groundingChunks?: GeminiGroundingChunk[] };
};
type GeminiStreamChunk = { candidates?: GeminiCandidate[] };

/**
 * Google Search Grounding 付きでストリーミング生成する。
 * REST の streamGenerateContent?alt=sse を使用。
 * @param prompt 送信するプロンプト
 * @param model 使用するモデル（省略時は getResearchModel()）
 * @yields テキスト断片 / 収集した情報源
 */
export async function* streamGeminiApiWithSearch(
  prompt: string,
  model: string = getResearchModel()
): AsyncGenerator<GeminiStreamEvent> {
  const apiKey = process.env.GEMINI_API_KEY?.replace(/[^\x20-\x7E]/g, "") || "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が設定されていません");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 12000,
    },
    tools: [{ google_search: {} }],
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Gemini API エラー (${response.status}): ${errorBody}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const seenUrls = new Set<string>();
  const collectedSources: { title: string; url: string }[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE イベントは空行（\n\n または \r\n\r\n）区切り
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || ""; // 未完成イベントを残す

    for (const evt of events) {
      const jsonStr = evt
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("");

      if (!jsonStr || jsonStr.trim() === "[DONE]") continue;

      let parsed: GeminiStreamChunk;
      try {
        parsed = JSON.parse(jsonStr) as GeminiStreamChunk;
      } catch {
        continue; // 不完全な JSON は無視
      }

      const candidate = parsed.candidates?.[0];

      // テキスト断片
      for (const part of candidate?.content?.parts ?? []) {
        if (part.text) {
          yield { type: "text", content: part.text };
        }
      }

      // grounding metadata（途中または最終チャンクに含まれる）
      for (const chunk of candidate?.groundingMetadata?.groundingChunks ?? []) {
        const uri = chunk.web?.uri;
        if (uri && !seenUrls.has(uri)) {
          seenUrls.add(uri);
          collectedSources.push({
            title: chunk.web?.title || uri,
            url: uri,
          });
        }
      }
    }
  }

  if (collectedSources.length > 0) {
    yield { type: "sources", sources: collectedSources };
  }
}
