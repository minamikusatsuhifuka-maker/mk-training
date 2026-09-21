// スタッフ向けAI機能の共通呼び出しヘルパー。
// 管理トグル（content_store キー ai_provider_setting）に応じて Claude / Gemini を切替える。
// 既定は 'gemini'（DEFAULT_GEMINI_MODEL）。保存値があればそれを優先（トグルで claude に戻せる）。
// プロンプト本文・理念注入・出力整形は各 route 側に残す。
//
// 【175: モデル名の集約】
//   Gemini のモデル名は lib/gemini-models.ts（DEFAULT_GEMINI_MODEL / getSelectedGeminiModel）だけ。
//   Claude のモデル名はこのファイルの CLAUDE_TEXT_MODEL だけ。各 route での直書きはしない。
//   失敗時に別モデルへ黙って切り替えない（ok:false + error を返し、利用者が再実行する）。
//
// 【175: 画像・PDF入力】
//   画像や PDF を渡す機能（extract-image / extract-pdf）は Gemini の inline_data を使う callGeminiParts を使う。
//   管理トグルの対象外（Claude 側の document 入力は使わない＝モデルを1つに寄せるため）。
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabase-admin";
import {
  getSelectedGeminiModel,
  GEMINI_THINKING_CONFIG,
} from "./gemini-models";

// content_store の id（プロバイダ設定の保存先）
export const AI_PROVIDER_SETTING_KEY = "ai_provider_setting";

export type AiProvider = "claude" | "gemini";

// 既定は gemini（新規/未設定では DEFAULT_GEMINI_MODEL で動く。トグルで claude に戻せる）
export const DEFAULT_AI_PROVIDER: AiProvider = "gemini";

// Claude のモデル名（トグルで Claude を選んだときに全機能で使う・1か所）
export const CLAUDE_TEXT_MODEL = "claude-sonnet-4-6";

// 145: content_store は RLS 有効のため anon では読めない。service-role で読む（サーバー専用）。
function serverSupabase(): SupabaseClient | null {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

// 現在のプロバイダ設定を content_store から取得（未設定・失敗時は既定 gemini）。
// 保存値がある場合はそれを優先（明示的に claude を選べば claude）。
export async function getAiProvider(): Promise<AiProvider> {
  try {
    const supabase = serverSupabase();
    if (!supabase) return DEFAULT_AI_PROVIDER;
    const { data } = await supabase
      .from("content_store")
      .select("data")
      .eq("id", AI_PROVIDER_SETTING_KEY)
      .single();
    const provider = (data?.data as { provider?: string } | null)?.provider;
    return provider === "claude" ? "claude" : DEFAULT_AI_PROVIDER;
  } catch {
    return DEFAULT_AI_PROVIDER;
  }
}

/** いま使うモデル名（画面表示・記録用）。175: 174の生成結果に記録して表示する */
export async function getCurrentAiModel(): Promise<{ provider: AiProvider; model: string }> {
  const provider = await getAiProvider();
  if (provider === "gemini") return { provider, model: await getSelectedGeminiModel() };
  return { provider, model: CLAUDE_TEXT_MODEL };
}

export interface CallAIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CallAIOptions {
  system?: string;
  messages: CallAIMessage[];
  maxTokens: number;
  // Claude 専用（Gemini はカスタム temperature を無視するため送らない）
  temperature?: number;
  // JSON を期待する機能向け。Gemini 時に「JSONのみ出力」を明示する。
  // 実際のパースは呼び出し側の既存処理（3段階パース等）を流用する。
  json?: boolean;
}

export interface CallAIResult {
  ok: boolean;
  text: string;
  // 失敗時の上流エラー本文（呼び出し側が従来どおり整形・フォールバックできる）
  error?: string;
  provider: AiProvider;
  /** 実際に使ったモデル名（175: 記録・表示用） */
  model: string;
}

// プロバイダに応じて分岐し、統一インターフェースで { text } を返す。
// 失敗時は例外を投げず ok:false + error を返す（上位が従来どおりハンドリングできる）。
export async function callAI(opts: CallAIOptions): Promise<CallAIResult> {
  const provider = await getAiProvider();
  if (provider === "gemini") return callGemini(opts);
  return callClaude(opts);
}

async function callClaude(opts: CallAIOptions): Promise<CallAIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = CLAUDE_TEXT_MODEL;
  if (!apiKey)
    return {
      ok: false,
      text: "",
      error: "ANTHROPIC_API_KEY が設定されていません",
      provider: "claude",
      model,
    };

  try {
    const body: Record<string, unknown> = {
      model,
      max_tokens: opts.maxTokens,
      messages: opts.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };
    if (opts.system) body.system = opts.system;
    if (typeof opts.temperature === "number") body.temperature = opts.temperature;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      return { ok: false, text: "", error: err, provider: "claude", model };
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "";
    return { ok: true, text, provider: "claude", model };
  } catch (e) {
    return {
      ok: false,
      text: "",
      error: e instanceof Error ? e.message : String(e),
      provider: "claude",
      model,
    };
  }
}

// ─── Gemini（REST）共通 ───

/** Gemini の contents.parts の1要素（テキスト or 添付） */
export type GeminiPart =
  | { text: string }
  | { inline_data: { mime_type: string; data: string } };

const JSON_ONLY_NOTE =
  "出力はJSONのみとし、マークダウンのコードフェンス（```）や前後の説明文は一切付けないこと。";

function geminiApiKey(): string {
  // 環境変数の前後に混ざった改行・空白で失敗しないようにする
  return (process.env.GEMINI_API_KEY ?? "").replace(/[^\x20-\x7E]/g, "");
}

/**
 * Gemini generateContent を1回呼ぶ（全機能共通の呼び出し口）。
 * モデルは getSelectedGeminiModel()（＝175で gemini-3.8-flash）。失敗しても別モデルへ切り替えない。
 */
export async function callGeminiRaw(input: {
  contents: { role?: "user" | "model"; parts: GeminiPart[] }[];
  system?: string;
  maxTokens: number;
  json?: boolean;
}): Promise<CallAIResult> {
  const apiKey = geminiApiKey();
  const model = await getSelectedGeminiModel();
  if (!apiKey)
    return {
      ok: false,
      text: "",
      error: "GEMINI_API_KEY が設定されていません",
      provider: "gemini",
      model,
    };

  let systemText = (input.system || "").trim();
  if (input.json) {
    systemText = systemText ? `${systemText}\n\n${JSON_ONLY_NOTE}` : JSON_ONLY_NOTE;
  }

  const body: Record<string, unknown> = {
    contents: input.contents,
    generationConfig: {
      maxOutputTokens: input.maxTokens,
      // 3.x は思考が既定ON。枠固定JSON抽出が切れるため抑える（3.8 は "low" が最小）。
      thinkingConfig: GEMINI_THINKING_CONFIG,
    },
  };
  if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const err = await response.text().catch(() => "");
      return { ok: false, text: "", error: err, provider: "gemini", model };
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts as
      | Array<{ text?: string }>
      | undefined;
    const text = (parts || [])
      .map((p) => p?.text)
      .filter(Boolean)
      .join("");
    return { ok: true, text, provider: "gemini", model };
  } catch (e) {
    return {
      ok: false,
      text: "",
      error: e instanceof Error ? e.message : String(e),
      provider: "gemini",
      model,
    };
  }
}

async function callGemini(opts: CallAIOptions): Promise<CallAIResult> {
  // messages を Gemini の contents にマッピング（assistant → model）
  const contents = opts.messages.map((m) => ({
    role: (m.role === "assistant" ? "model" : "user") as "user" | "model",
    parts: [{ text: m.content }] as GeminiPart[],
  }));
  // temperature は転送しない（Gemini はカスタム値を無視。Claude 側でのみ使用）
  return callGeminiRaw({
    contents,
    system: opts.system,
    maxTokens: opts.maxTokens,
    json: opts.json,
  });
}

/**
 * 画像・PDF などの添付つきで Gemini を呼ぶ（175: 旧 Claude 専用の抽出系を寄せた口）。
 * 管理トグルの対象外（常に Gemini）。
 */
export async function callGeminiParts(input: {
  parts: GeminiPart[];
  system?: string;
  maxTokens: number;
  json?: boolean;
}): Promise<CallAIResult> {
  return callGeminiRaw({
    contents: [{ parts: input.parts }],
    system: input.system,
    maxTokens: input.maxTokens,
    json: input.json,
  });
}
